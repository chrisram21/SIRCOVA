import { Int32, ObjectId } from 'mongodb';
import pool from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import {
  validarDescripcionRegla,
  validarMensajeRegla,
  validarMotivoCambio,
  validarNombreRegla,
} from '../../validaciones/campos.js';
import { ACCIONES } from '../auditoria/auditoria.service.js';
import {
  entradaInvalida,
  revisarCampos,
  revisarParametros as revisarConsulta,
} from '../catalogos/catalogos.service.js';
import { codigoDdriss } from './esquemas.service.js';
import { escribirConBitacora, escribirEnTransaccionConBitacora } from './mongoBitacora.js';
import { TIPOS_CREABLES, TIPOS_REGLA, revisarMarcadores, revisarParametros } from './tiposRegla.js';

// Para una DDRISS aplica su VIGENTE de cada código o, si no tiene, el VIGENTE nacional (SPEC 32). Las reglas de otras
// DDRISS y los borradores no existen para el usuario (§5.10).

const NACIONAL = 'NACIONAL';
const PUBLICADAS = ['VIGENTE', 'HISTORICO'];
const ENTIDAD = 'reglas_validacion';
const FORMATO_CODIGO = /^[A-Z0-9_]{1,40}$/;

const SEVERIDADES = ['ERROR', 'ADVERTENCIA'];
const TODAS = '*';
const CAMPOS_CONTENIDO = ['nombre', 'descripcion', 'severidad', 'vacunas', 'parametros', 'mensaje', 'motivoCambio'];

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  sinDdriss: () => new ErrorApi(403, 'SIN_PERMISO', 'No tiene permiso para realizar esta acción.'),
  tipoNoCreable: () =>
    entradaInvalida('Solo se crean reglas de tipo RANGO, SECUENCIA_DOSIS, VARIACION_HISTORICA o TOTAL_CUADRA.'),
  severidad: () => entradaInvalida('La severidad debe ser ERROR o ADVERTENCIA.'),
  vacunas: () => entradaInvalida('Indique * para todas las vacunas, o una lista de códigos sin repetir y sin *.'),
  vacunaInvalida: (codigo) => new ErrorApi(422, 'REGLA_INVALIDA', `La vacuna ${codigo} no existe o está inactiva.`),
  altaSimultanea: () =>
    new ErrorApi(409, 'REGLA_DESACTUALIZADA', 'Se creó otra regla del mismo tipo al mismo tiempo; intente de nuevo.'),
  desactualizada: (codigo) =>
    new ErrorApi(409, 'REGLA_DESACTUALIZADA', `La regla ${codigo} cambió mientras la editaba; vuelva a abrirla.`),
  sinCambios: () => new ErrorApi(422, 'REGLA_SIN_CAMBIOS', 'La versión no cambia nada de la que aplica.'),
  nadaQueDesactivar: () =>
    new ErrorApi(
      409,
      'REGLA_SIN_VERSION_PROPIA',
      'Su DDRISS no tiene una versión activa de esta regla; las reglas nacionales no se desactivan.',
    ),
  nadaQueActivar: () =>
    new ErrorApi(409, 'REGLA_SIN_VERSION_PROPIA', 'Solo se activa una regla de su DDRISS que esté desactivada.'),
};

const coleccion = async () => (await obtenerDb()).collection(ENTIDAD);

const territoriosVisibles = (ddriss) => [
  { 'territorio.nivel': NACIONAL },
  ...(ddriss === null ? [] : [{ 'territorio.ddriss_codigo': ddriss }]),
];

const esNacional = (doc) => doc.territorio.nivel === NACIONAL;

// Los ids pueden llegar como Int32 (un documento recién armado) o como number (uno leído de la base).
const aNumero = (id) => (id === null || id === undefined ? null : Number(id));

async function nombresDeUsuario(ids) {
  const unicos = [...new Set(ids.map(aNumero).filter((id) => id !== null))];
  if (unicos.length === 0) return new Map();
  const [filas] = await pool.query('SELECT id, nombre_usuario FROM usuario WHERE id IN (?)', [unicos]);
  return new Map(filas.map((u) => [u.id, u.nombre_usuario]));
}

function aUsuario(id, usuarios) {
  const numero = aNumero(id);
  return numero !== null && usuarios.has(numero) ? { id: numero, nombreUsuario: usuarios.get(numero) } : null;
}

// usuarios: id → nombre_usuario, para publicadoPor.
export function aRegla(doc, usuarios = new Map()) {
  const { auditoria } = doc;
  return {
    id: doc._id.toString(),
    codigo: doc.codigo,
    version: doc.version,
    nombre: doc.nombre,
    descripcion: doc.descripcion ?? null,
    tipo: doc.tipo,
    ambito: doc.ambito,
    severidad: doc.severidad,
    // aplica_a no es obligatorio en el validador del 02: sin él, la regla aplica a todas las vacunas.
    vacunas: [...(doc.aplica_a?.vacunas ?? ['*'])],
    parametros: { ...(doc.parametros ?? {}) },
    mensaje: doc.mensaje,
    territorio: { nivel: doc.territorio.nivel, ddrissCodigo: doc.territorio.ddriss_codigo ?? null },
    estado: doc.estado,
    vigencia: { desde: doc.vigencia.desde.toISOString(), hasta: doc.vigencia.hasta?.toISOString() ?? null },
    publicadoPor: aUsuario(auditoria.publicado_por, usuarios),
    publicadoEn: (auditoria.publicado_en ?? auditoria.creado_en).toISOString(),
    motivoCambio: auditoria.motivo_cambio ?? null,
  };
}

// En la bitácora, publicadoPor es el id: el nombre puede cambiar y la fila no.
const aReglaBitacora = (doc) => ({ ...aRegla(doc), publicadoPor: aNumero(doc.auditoria.publicado_por) });

const masReciente = (documentos) => documentos.reduce((a, b) => (b.version > a.version ? b : a), documentos[0]) ?? null;

// Las versiones de un código que ve la DDRISS, separadas por territorio.
function resumirCodigo(documentos) {
  const deLaDdriss = documentos.filter((d) => !esNacional(d));
  const nacionales = documentos.filter(esNacional);
  const vigenteNacional = nacionales.find((d) => d.estado === 'VIGENTE') ?? null;
  const ultimaDdriss = masReciente(deLaDdriss);
  const ultimaNacional = masReciente(nacionales);
  return {
    aplica: deLaDdriss.find((d) => d.estado === 'VIGENTE') ?? vigenteNacional,
    ultimaDdriss,
    ultimaNacional,
    vigenteNacional,
  };
}

function aFila(codigo, documentos, usuarios) {
  const resumen = resumirCodigo(documentos);
  const referencia = resumen.aplica ?? resumen.ultimaDdriss ?? resumen.ultimaNacional;
  return {
    codigo,
    tipo: referencia.tipo,
    ambito: referencia.ambito,
    aplica: resumen.aplica ? aRegla(resumen.aplica, usuarios) : null,
    ultimaDdriss: resumen.ultimaDdriss ? aRegla(resumen.ultimaDdriss, usuarios) : null,
    vigenteNacional: resumen.vigenteNacional ? { version: resumen.vigenteNacional.version } : null,
    nombre: referencia.nombre,
  };
}

async function versionesVisibles(filtro, ddriss) {
  return (await coleccion())
    .find({ ...filtro, estado: { $in: PUBLICADAS }, $or: territoriosVisibles(ddriss) })
    .sort({ version: -1 })
    .toArray();
}

export async function listarReglas(query, usuario) {
  revisarConsulta(query, []);
  const ddriss = await codigoDdriss(usuario.ddrissId);
  const documentos = await versionesVisibles({}, ddriss);

  const porCodigo = Map.groupBy(documentos, (d) => d.codigo);
  const usuarios = await nombresDeUsuario(documentos.map((d) => d.auditoria.publicado_por));
  return [...porCodigo]
    .map(([codigo, versiones]) => aFila(codigo, versiones, usuarios))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.codigo.localeCompare(b.codigo))
    .map(({ nombre, ...fila }) => fila);
}

// Cuándo, quién y por qué se desactivó cada versión: está solo en la bitácora, porque una versión HISTORICO no
// cambia más que su estado y vigencia.hasta.
async function desactivaciones(documentos) {
  if (documentos.length === 0) return new Map();
  const [filas] = await pool.query(
    `SELECT entidad_id, usuario_id, UNIX_TIMESTAMP(fecha) AS fecha, valores_nuevos FROM bitacora
      WHERE entidad = ? AND accion = ? AND entidad_id IN (?)
      ORDER BY id`,
    [ENTIDAD, ACCIONES.DESACTIVAR, documentos.map((d) => d._id.toString())],
  );
  return new Map(filas.map((f) => [f.entidad_id, f]));
}

export async function historialRegla(codigo, query, usuario) {
  revisarConsulta(query, []);
  if (!FORMATO_CODIGO.test(String(codigo))) throw errores.noEncontrado();
  const ddriss = await codigoDdriss(usuario.ddrissId);
  const documentos = await versionesVisibles({ codigo }, ddriss);
  if (documentos.length === 0) throw errores.noEncontrado();

  const filas = await desactivaciones(documentos);
  const usuarios = await nombresDeUsuario([
    ...documentos.map((d) => d.auditoria.publicado_por),
    ...[...filas.values()].map((f) => f.usuario_id),
  ]);
  return documentos.map((doc) => {
    const fila = filas.get(doc._id.toString());
    return {
      ...aRegla(doc, usuarios),
      desactivacion: fila
        ? {
          en: new Date(Number(fila.fecha) * 1000).toISOString(),
          por: aUsuario(fila.usuario_id, usuarios),
          motivo: fila.valores_nuevos?.motivoCambio ?? null,
        }
        : null,
    };
  });
}

// Un resultado { valor } | { error } de campos.js o de tiposRegla.js: el valor limpio, o 400 con su mensaje.
function valorO400(resultado) {
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

function leerVacunas(valor) {
  const esLista = Array.isArray(valor) && valor.length > 0 && valor.every((c) => typeof c === 'string' && c !== '');
  if (!esLista || new Set(valor).size !== valor.length) throw errores.vacunas();
  if (valor.includes(TODAS) && valor.length > 1) throw errores.vacunas();
  return [...valor];
}

// El contenido de una versión, común a una regla nueva y a una versión nueva: todo menos el código y el tipo.
function leerContenido(cuerpo, tipo) {
  const nombre = valorO400(validarNombreRegla(cuerpo.nombre));
  const descripcion = valorO400(validarDescripcionRegla(cuerpo.descripcion));
  if (!SEVERIDADES.includes(cuerpo.severidad)) throw errores.severidad();
  const vacunas = leerVacunas(cuerpo.vacunas);
  const parametros = valorO400(revisarParametros(tipo, cuerpo.parametros));
  const mensaje = valorO400(revisarMarcadores(tipo, valorO400(validarMensajeRegla(cuerpo.mensaje))));
  const motivoCambio = valorO400(validarMotivoCambio(cuerpo.motivoCambio));
  return { nombre, descripcion, severidad: cuerpo.severidad, vacunas, parametros, mensaje, motivoCambio };
}

async function revisarVacunas(vacunas) {
  if (vacunas[0] === TODAS) return;
  const [filas] = await pool.query('SELECT codigo FROM vacuna WHERE activa = TRUE AND codigo IN (?)', [vacunas]);
  const activas = new Set(filas.map((f) => f.codigo));
  const faltante = vacunas.find((codigo) => !activas.has(codigo));
  if (faltante !== undefined) throw errores.vacunaInvalida(faltante);
}

// {TIPO}_{NN}: el siguiente consecutivo del tipo en todo el país, en cualquier territorio y estado. Los códigos que
// no siguen el formato (VARIACION_HISTORICA, RANGO_DOSIS_MES) no cuentan.
async function siguienteCodigo(tipo) {
  const codigos = await (await coleccion()).distinct('codigo', { codigo: { $regex: `^${tipo}_[0-9]{2,}$` } });
  const mayor = Math.max(0, ...codigos.map((c) => Number(c.slice(tipo.length + 1))));
  return `${tipo}_${String(mayor + 1).padStart(2, '0')}`;
}

// Una versión VIGENTE de la DDRISS publicada ahora: vigencia.desde y las fechas de la auditoría son el mismo
// instante.
function nuevaVersion({ codigo, version, tipo, ambito, contenido, ddriss, usuarioId }) {
  const ahora = new Date();
  return {
    _id: new ObjectId(),
    codigo,
    version: new Int32(version),
    nombre: contenido.nombre,
    ...(contenido.descripcion === null ? {} : { descripcion: contenido.descripcion }),
    tipo,
    ambito,
    severidad: contenido.severidad,
    aplica_a: { vacunas: contenido.vacunas },
    parametros: contenido.parametros,
    mensaje: contenido.mensaje,
    territorio: { nivel: 'DDRISS', ddriss_codigo: ddriss },
    estado: 'VIGENTE',
    vigencia: { desde: ahora, hasta: null },
    auditoria: {
      creado_por: new Int32(usuarioId),
      creado_en: ahora,
      publicado_por: new Int32(usuarioId),
      publicado_en: ahora,
      motivo_cambio: contenido.motivoCambio,
    },
  };
}

async function ddrissDelUsuario(usuario) {
  const ddriss = await codigoDdriss(usuario.ddrissId);
  if (ddriss === null) throw errores.sinDdriss();
  return ddriss;
}

const conPublicador = async (doc) => aRegla(doc, await nombresDeUsuario([doc.auditoria.publicado_por]));

export async function crearRegla(cuerpo, contexto, usuario) {
  revisarCampos(cuerpo, ['tipo', ...CAMPOS_CONTENIDO]);
  if (!TIPOS_CREABLES.includes(cuerpo.tipo)) throw errores.tipoNoCreable();
  const { tipo } = cuerpo;
  const contenido = leerContenido(cuerpo, tipo);
  const ddriss = await ddrissDelUsuario(usuario);
  await revisarVacunas(contenido.vacunas);

  const doc = nuevaVersion({
    codigo: await siguienteCodigo(tipo),
    version: 1,
    tipo,
    ambito: TIPOS_REGLA[tipo].ambito,
    contenido,
    ddriss,
    usuarioId: contexto.usuarioId,
  });
  try {
    await escribirConBitacora(
      ENTIDAD,
      contexto,
      { accion: ACCIONES.CREAR, entidadId: doc._id.toString(), valoresNuevos: aReglaBitacora(doc) },
      (coleccionReglas) => coleccionReglas.insertOne(doc),
    );
  } catch (err) {
    // Dos altas del mismo tipo a la vez calculan el mismo código: uq_regla_version deja pasar solo una.
    if (err.code === 11000) throw errores.altaSimultanea();
    throw err;
  }
  return conPublicador(doc);
}

// El código, si la DDRISS lo ve, con sus versiones publicadas; si no, 404.
async function buscarCodigo(codigo, usuario) {
  if (!FORMATO_CODIGO.test(String(codigo))) throw errores.noEncontrado();
  const ddriss = await ddrissDelUsuario(usuario);
  const documentos = await versionesVisibles({ codigo }, ddriss);
  if (documentos.length === 0) throw errores.noEncontrado();
  return { ddriss, resumen: resumirCodigo(documentos) };
}

// En todo el país, contando borradores y otras DDRISS: (codigo, version) es único en uq_regla_version.
async function mayorVersion(codigo) {
  const [doc] = await (await coleccion()).find({ codigo }).sort({ version: -1 }).limit(1).toArray();
  return doc?.version ?? 0;
}

function leerVersion(valor, campo) {
  if (!Number.isInteger(valor) || valor < 1) throw entradaInvalida(`${campo} debe ser un número entero positivo.`);
  return valor;
}

const lista = (valores) => [...valores].sort();

// Igual en lo que se elige al publicar; el motivo no cuenta y las vacunas no dependen del orden.
function mismoContenido(contenido, doc) {
  const parametros = doc.parametros ?? {};
  return contenido.nombre === doc.nombre
    && contenido.descripcion === (doc.descripcion ?? null)
    && contenido.severidad === doc.severidad
    && JSON.stringify(lista(contenido.vacunas)) === JSON.stringify(lista(doc.aplica_a?.vacunas ?? [TODAS]))
    && Object.keys(parametros).length === Object.keys(contenido.parametros).length
    && Object.entries(contenido.parametros).every(([clave, valor]) => parametros[clave] === valor)
    && contenido.mensaje === doc.mensaje;
}

// La versión nueva de la DDRISS y, si la DDRISS tenía un VIGENTE del código, ese pasa a HISTORICO en la misma
// transacción de MongoDB. Si otra escritura ganó la carrera, responde 409 y no cambia nada.
async function publicarVersion({ doc, anterior, accion, contexto }) {
  const hasta = doc.vigencia.desde;
  const filas = [{ accion, entidadId: doc._id.toString(), valoresNuevos: aReglaBitacora(doc) }];
  if (anterior) {
    filas.push({
      accion: ACCIONES.ACTUALIZAR,
      entidadId: anterior._id.toString(),
      valoresAnteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
      valoresNuevos: { estado: 'HISTORICO', vigencia: { hasta: hasta.toISOString() } },
    });
  }
  try {
    await escribirEnTransaccionConBitacora(ENTIDAD, contexto, filas, async (coleccionReglas, sesion) => {
      // Primero la anterior: uq_regla_vigente_territorio no admite dos VIGENTE del mismo territorio.
      if (anterior) {
        const { matchedCount } = await coleccionReglas.updateOne(
          { _id: anterior._id, estado: 'VIGENTE' },
          { $set: { estado: 'HISTORICO', 'vigencia.hasta': hasta } },
          { session: sesion },
        );
        if (matchedCount === 0) throw errores.desactualizada(doc.codigo);
      }
      await coleccionReglas.insertOne(doc, { session: sesion });
    });
  } catch (err) {
    // Un VIGENTE o una versión repetidos (11000), o un conflicto de escritura (112).
    if (err.code === 11000 || err.code === 112) throw errores.desactualizada(doc.codigo);
    throw err;
  }
  return conPublicador(doc);
}

export async function publicarVersionRegla(codigo, cuerpo, contexto, usuario) {
  const { ddriss, resumen } = await buscarCodigo(codigo, usuario);
  revisarCampos(cuerpo, ['versionBase', ...CAMPOS_CONTENIDO]);
  const versionBase = leerVersion(cuerpo.versionBase, 'versionBase');
  const base = resumen.aplica ?? resumen.ultimaDdriss ?? resumen.ultimaNacional;
  const contenido = leerContenido(cuerpo, base.tipo);
  if (versionBase !== base.version) throw errores.desactualizada(codigo);
  await revisarVacunas(contenido.vacunas);
  if (resumen.aplica && mismoContenido(contenido, resumen.aplica)) throw errores.sinCambios();

  const doc = nuevaVersion({
    codigo,
    version: (await mayorVersion(codigo)) + 1,
    tipo: base.tipo,
    ambito: base.ambito,
    contenido,
    ddriss,
    usuarioId: contexto.usuarioId,
  });
  const anterior = resumen.aplica && !esNacional(resumen.aplica) ? resumen.aplica : null;
  return publicarVersion({ doc, anterior, accion: ACCIONES.CREAR, contexto });
}

function leerCambioDeEstado(cuerpo) {
  revisarCampos(cuerpo, ['version', 'motivoCambio']);
  const version = leerVersion(cuerpo.version, 'version');
  return { version, motivoCambio: valorO400(validarMotivoCambio(cuerpo.motivoCambio)) };
}

async function filaDelCodigo(codigo, ddriss) {
  const documentos = await versionesVisibles({ codigo }, ddriss);
  const usuarios = await nombresDeUsuario(documentos.map((d) => d.auditoria.publicado_por));
  const { nombre, ...fila } = aFila(codigo, documentos, usuarios);
  return fila;
}

// El VIGENTE de la DDRISS pasa a HISTORICO sin reemplazo; si hay un VIGENTE nacional del código, vuelve a aplicar
// ese. El motivo queda solo en la bitácora: la versión no cambia más que su estado y vigencia.hasta.
export async function desactivarRegla(codigo, cuerpo, contexto, usuario) {
  const { ddriss, resumen } = await buscarCodigo(codigo, usuario);
  const { version, motivoCambio } = leerCambioDeEstado(cuerpo);
  const vigente = resumen.aplica && !esNacional(resumen.aplica) ? resumen.aplica : null;
  if (!vigente) throw errores.nadaQueDesactivar();
  if (version !== vigente.version) throw errores.desactualizada(codigo);

  const hasta = new Date();
  await escribirConBitacora(
    ENTIDAD,
    contexto,
    {
      accion: ACCIONES.DESACTIVAR,
      entidadId: vigente._id.toString(),
      valoresAnteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
      valoresNuevos: { estado: 'HISTORICO', vigencia: { hasta: hasta.toISOString() }, motivoCambio },
    },
    async (coleccionReglas) => {
      const { matchedCount } = await coleccionReglas.updateOne(
        { _id: vigente._id, estado: 'VIGENTE' },
        { $set: { estado: 'HISTORICO', 'vigencia.hasta': hasta } },
      );
      if (matchedCount === 0) throw errores.desactualizada(codigo);
    },
  );
  return filaDelCodigo(codigo, ddriss);
}

// Una versión nueva de la DDRISS con el contenido de su última versión, que está en HISTORICO.
export async function activarRegla(codigo, cuerpo, contexto, usuario) {
  const { ddriss, resumen } = await buscarCodigo(codigo, usuario);
  const { version, motivoCambio } = leerCambioDeEstado(cuerpo);
  const ultima = resumen.ultimaDdriss;
  if (!ultima || ultima.estado === 'VIGENTE') throw errores.nadaQueActivar();
  if (version !== ultima.version) throw errores.desactualizada(codigo);

  const contenido = {
    nombre: ultima.nombre,
    descripcion: ultima.descripcion ?? null,
    severidad: ultima.severidad,
    vacunas: [...(ultima.aplica_a?.vacunas ?? [TODAS])],
    parametros: { ...(ultima.parametros ?? {}) },
    mensaje: ultima.mensaje,
    motivoCambio,
  };
  await revisarVacunas(contenido.vacunas);
  const doc = nuevaVersion({
    codigo,
    version: (await mayorVersion(codigo)) + 1,
    tipo: ultima.tipo,
    ambito: ultima.ambito,
    contenido,
    ddriss,
    usuarioId: contexto.usuarioId,
  });
  // Sin anterior: la DDRISS no tiene VIGENTE. Si otra activación ganó la carrera, uq_regla_vigente_territorio da 409.
  return publicarVersion({ doc, anterior: null, accion: ACCIONES.REACTIVAR, contexto });
}
