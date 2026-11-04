import { Int32, ObjectId } from 'mongodb';
import pool from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import {
  validarDescripcionIndicador,
  validarMotivoCambio,
  validarNombreIndicador,
} from '../../validaciones/campos.js';
import { ACCIONES } from '../auditoria/auditoria.service.js';
import {
  entradaInvalida,
  revisarCampos,
  revisarParametros as revisarConsulta,
} from '../catalogos/catalogos.service.js';
import { codigoDdriss } from './esquemas.service.js';
import { escribirConBitacora, escribirEnTransaccionConBitacora } from './mongoBitacora.js';
import {
  CAMPOS_DEL_TIPO,
  MENSAJES_TIPOS_INDICADOR,
  TIPOS_CREABLES,
  TIPOS_INDICADOR,
  aUmbrales,
  codigoIndicador,
  revisarCamposDelTipo,
  revisarOrdenDosis,
} from './tiposIndicador.js';

// Para una DDRISS aplica su VIGENTE de cada código o, si no tiene, el VIGENTE nacional (SPEC 43, como las reglas del
// SPEC 32). Los indicadores de otras DDRISS y los borradores no existen para el usuario (§5.10).

const NACIONAL = 'NACIONAL';
const PUBLICADAS = ['VIGENTE', 'HISTORICO'];
const ENTIDAD = 'configuracion_indicadores';
const FORMATO_CODIGO = /^[A-Z0-9_]{1,40}$/;
const ORDEN_TIPOS = Object.keys(TIPOS_INDICADOR);

const FORMATO_CODIGO_VACUNA = /^[A-Z0-9_]{1,20}$/;
const CAMPOS_COMUNES = ['nombre', 'descripcion', 'motivoCambio'];

const invalido = (mensaje) => new ErrorApi(422, 'INDICADOR_INVALIDO', mensaje);

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  sinDdriss: () => new ErrorApi(403, 'SIN_PERMISO', 'No tiene permiso para realizar esta acción.'),
  tipoNoCreable: () =>
    entradaInvalida('Solo se crean indicadores de tipo COBERTURA, AVANCE_META_MES, BRECHA o DESERCION.'),
  vacunaInvalida: (codigo) => invalido(`La vacuna ${codigo} no existe o está inactiva.`),
  dosisInvalida: (codigo, vacuna) => invalido(`La dosis ${codigo} no existe o está inactiva en ${vacuna}.`),
  poblacionInvalida: (codigo) => invalido(`El grupo de población ${codigo} no existe.`),
  grupoEdadInvalido: (codigo) => invalido(`El grupo de edad ${codigo} no existe o está inactivo.`),
  codigoLargo: () => invalido(MENSAJES_TIPOS_INDICADOR.codigoLargo),
  desactualizado: (codigo) =>
    new ErrorApi(
      409,
      'INDICADOR_DESACTUALIZADO',
      `El indicador ${codigo} cambió mientras lo editaba; vuelva a abrirlo.`,
    ),
  sinCambios: () => new ErrorApi(422, 'INDICADOR_SIN_CAMBIOS', 'La versión no cambia nada de la que aplica.'),
  nadaQueDesactivar: () =>
    new ErrorApi(
      409,
      'INDICADOR_SIN_VERSION_PROPIA',
      'Su DDRISS no tiene una versión activa de este indicador; los indicadores nacionales no se desactivan.',
    ),
  nadaQueActivar: () =>
    new ErrorApi(
      409,
      'INDICADOR_SIN_VERSION_PROPIA',
      'Solo se activa un indicador de su DDRISS que esté desactivado.',
    ),
  altaSimultanea: () =>
    new ErrorApi(
      409,
      'INDICADOR_DESACTUALIZADO',
      'Se creó otro indicador con el mismo código al mismo tiempo; intente de nuevo.',
    ),
};

export const mensajeDuplicado = (codigo) =>
  `Ya existe el indicador ${codigo} para la misma vacuna y dosis; publique una versión de ese.`;

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

// Código → { nombre, activa } de MySQL.
async function vacunasPorCodigo(codigos) {
  const unicos = [...new Set(codigos.filter(Boolean))];
  if (unicos.length === 0) return new Map();
  const [filas] = await pool.query('SELECT codigo, nombre, activa FROM vacuna WHERE codigo IN (?)', [unicos]);
  return new Map(filas.map((v) => [v.codigo, { nombre: v.nombre, activa: Boolean(v.activa) }]));
}

const codigoVacuna = (doc) => doc.aplica_a?.[0]?.vacuna ?? null;

function aVacuna(codigo, vacunas) {
  const datos = vacunas.get(codigo);
  return { codigo, nombre: datos?.nombre ?? codigo, activa: datos?.activa ?? false };
}

// Quita las claves sin valor: numerador, denominador y alerta no tienen campos obligatorios en el validador del 02.
const sinIndefinidos = (objeto) => Object.fromEntries(Object.entries(objeto).filter(([, v]) => v !== undefined));

// referencias: { usuarios: id → nombre_usuario, vacunas: código → { nombre, activa } }.
export function aIndicador(doc, { usuarios = new Map(), vacunas = new Map() } = {}) {
  const { auditoria } = doc;
  const aplica = doc.aplica_a?.[0] ?? {};
  const grupos = aplica.filtros_dimension?.grupo_edad;
  return {
    id: doc._id.toString(),
    codigo: doc.codigo,
    version: doc.version,
    nombre: doc.nombre,
    descripcion: doc.descripcion ?? null,
    tipoCalculo: doc.tipo_calculo,
    vacuna: aVacuna(aplica.vacuna ?? null, vacunas),
    dosis: aplica.dosis ?? null,
    dosisInicial: aplica.dosis_inicial ?? null,
    dosisFinal: aplica.dosis_final ?? null,
    clasificacionPoblacion: aplica.clasificacion_poblacion ?? null,
    grupoEdad: Array.isArray(grupos) && grupos.length === 1 ? grupos[0] : null,
    numerador: sinIndefinidos({
      fuente: doc.numerador?.fuente,
      estadosReporte: doc.numerador?.estados_reporte ? [...doc.numerador.estados_reporte] : undefined,
      atribucion: doc.numerador?.atribucion,
      acumulado: doc.numerador?.acumulado,
    }),
    denominador: sinIndefinidos({ fuente: doc.denominador?.fuente, prorrateo: doc.denominador?.prorrateo }),
    meta: doc.meta ? { valor: doc.meta.valor, unidad: doc.meta.unidad, comparador: doc.meta.comparador } : null,
    umbrales: (doc.umbrales ?? []).map((u) => ({ color: u.color, desde: u.desde ?? null, hasta: u.hasta ?? null })),
    umbralesProvisionales: doc.umbrales_provisionales ?? false,
    esIndicadorMapa: doc.es_indicador_mapa ?? false,
    parametros: { ...(doc.parametros ?? {}) },
    alerta: sinIndefinidos({
      generar: doc.alerta?.generar,
      tipo: doc.alerta?.tipo,
      rolDestino: doc.alerta?.rol_destino ? [...doc.alerta.rol_destino] : undefined,
    }),
    esEstimacion: doc.es_estimacion ?? false,
    territorio: { nivel: doc.territorio.nivel, ddrissCodigo: doc.territorio.ddriss_codigo ?? null },
    estado: doc.estado,
    vigencia: { desde: doc.vigencia.desde.toISOString(), hasta: doc.vigencia.hasta?.toISOString() ?? null },
    publicadoPor: aUsuario(auditoria.publicado_por, usuarios),
    publicadoEn: (auditoria.publicado_en ?? auditoria.creado_en).toISOString(),
    motivoCambio: auditoria.motivo_cambio ?? null,
  };
}

async function referenciasDe(documentos, idsExtra = []) {
  const [usuarios, vacunas] = await Promise.all([
    nombresDeUsuario([...documentos.map((d) => d.auditoria.publicado_por), ...idsExtra]),
    vacunasPorCodigo(documentos.map(codigoVacuna)),
  ]);
  return { usuarios, vacunas };
}

const masReciente = (documentos) => documentos.reduce((a, b) => (b.version > a.version ? b : a), documentos[0]) ?? null;

// Las versiones de un código que ve la DDRISS, separadas por territorio.
function resumirCodigo(documentos) {
  const deLaDdriss = documentos.filter((d) => !esNacional(d));
  const nacionales = documentos.filter(esNacional);
  const vigenteNacional = nacionales.find((d) => d.estado === 'VIGENTE') ?? null;
  return {
    aplica: deLaDdriss.find((d) => d.estado === 'VIGENTE') ?? vigenteNacional,
    ultimaDdriss: masReciente(deLaDdriss),
    ultimaNacional: masReciente(nacionales),
    vigenteNacional,
  };
}

function aFila(codigo, documentos, referencias) {
  const resumen = resumirCodigo(documentos);
  const referencia = resumen.aplica ?? resumen.ultimaDdriss ?? resumen.ultimaNacional;
  return {
    codigo,
    tipoCalculo: referencia.tipo_calculo,
    vacuna: aVacuna(codigoVacuna(referencia), referencias.vacunas),
    aplica: resumen.aplica ? aIndicador(resumen.aplica, referencias) : null,
    ultimaDdriss: resumen.ultimaDdriss ? aIndicador(resumen.ultimaDdriss, referencias) : null,
    vigenteNacional: resumen.vigenteNacional ? { version: resumen.vigenteNacional.version } : null,
  };
}

const ordenFilas = (a, b) => a.vacuna.nombre.localeCompare(b.vacuna.nombre, 'es')
  || ORDEN_TIPOS.indexOf(a.tipoCalculo) - ORDEN_TIPOS.indexOf(b.tipoCalculo)
  || a.codigo.localeCompare(b.codigo);

async function versionesVisibles(filtro, ddriss) {
  return (await coleccion())
    .find({ ...filtro, estado: { $in: PUBLICADAS }, $or: territoriosVisibles(ddriss) })
    .sort({ version: -1 })
    .toArray();
}

// Para el motor (SPEC 44): la versión que aplica de cada código a la DDRISS, la misma de la columna «Aplica».
export async function indicadoresQueAplican(ddriss) {
  const documentos = await versionesVisibles({}, ddriss);
  return [...Map.groupBy(documentos, (d) => d.codigo).values()]
    .map((versiones) => resumirCodigo(versiones).aplica)
    .filter(Boolean)
    .sort((a, b) => a.codigo.localeCompare(b.codigo));
}

export async function listarConfigIndicadores(query, usuario) {
  revisarConsulta(query, []);
  const ddriss = await codigoDdriss(usuario.ddrissId);
  const documentos = await versionesVisibles({}, ddriss);
  const referencias = await referenciasDe(documentos);
  return [...Map.groupBy(documentos, (d) => d.codigo)]
    .map(([codigo, versiones]) => aFila(codigo, versiones, referencias))
    .sort(ordenFilas);
}

export async function opcionesIndicadores(query) {
  revisarConsulta(query, []);
  const [[vacunas], [dosis], [clasificaciones], grupoEdad] = await Promise.all([
    pool.query('SELECT id, codigo, nombre FROM vacuna WHERE activa = TRUE ORDER BY orden_informe, nombre'),
    pool.query(
      `SELECT d.vacuna_id, d.codigo, d.nombre, d.orden, d.completa_esquema FROM dosis d
         JOIN vacuna v ON v.id = d.vacuna_id
        WHERE d.activa = TRUE AND v.activa = TRUE
        ORDER BY d.orden`,
    ),
    pool.query('SELECT codigo, descripcion FROM clasificacion_poblacion ORDER BY id'),
    (await obtenerDb()).collection('catalogo_dimensiones').findOne({ codigo: 'grupo_edad' }),
  ]);
  const dosisPorVacuna = Map.groupBy(dosis, (d) => d.vacuna_id);
  return {
    vacunas: vacunas.map((v) => ({
      codigo: v.codigo,
      nombre: v.nombre,
      dosis: (dosisPorVacuna.get(v.id) ?? []).map((d) => ({
        codigo: d.codigo, nombre: d.nombre, orden: d.orden, completaEsquema: Boolean(d.completa_esquema),
      })),
    })),
    clasificaciones: clasificaciones.map((c) => ({ codigo: c.codigo, descripcion: c.descripcion })),
    gruposEdad: grupoEdad?.activo
      ? grupoEdad.valores
        .filter((v) => v.activo)
        .sort((a, b) => a.orden - b.orden)
        .map((v) => ({ codigo: v.codigo, etiqueta: v.etiqueta }))
      : [],
  };
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

export async function historialIndicador(codigo, query, usuario) {
  revisarConsulta(query, []);
  if (!FORMATO_CODIGO.test(String(codigo))) throw errores.noEncontrado();
  const ddriss = await codigoDdriss(usuario.ddrissId);
  const documentos = await versionesVisibles({ codigo }, ddriss);
  if (documentos.length === 0) throw errores.noEncontrado();

  const filas = await desactivaciones(documentos);
  const referencias = await referenciasDe(documentos, [...filas.values()].map((f) => f.usuario_id));
  return documentos.map((doc) => {
    const fila = filas.get(doc._id.toString());
    return {
      ...aIndicador(doc, referencias),
      desactivacion: fila
        ? {
          en: new Date(Number(fila.fecha) * 1000).toISOString(),
          por: aUsuario(fila.usuario_id, referencias.usuarios),
          motivo: fila.valores_nuevos?.motivoCambio ?? null,
        }
        : null,
    };
  });
}

// Un resultado { valor } | { error } de campos.js o de tiposIndicador.js: el valor limpio, o 400 con su mensaje.
function valorO400(resultado) {
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

// Lo que se elige al crear o publicar una versión, ya revisado en su formato: los campos comunes y los del tipo.
function leerContenido(cuerpo, tipo) {
  const nombre = valorO400(validarNombreIndicador(cuerpo.nombre));
  const descripcion = valorO400(validarDescripcionIndicador(cuerpo.descripcion));
  const campos = valorO400(revisarCamposDelTipo(tipo, cuerpo));
  const motivoCambio = valorO400(validarMotivoCambio(cuerpo.motivoCambio));
  return { nombre, descripcion, campos, motivoCambio };
}

// Que la vacuna, las dosis, el grupo de población y el grupo de edad existan y estén activos (422), y el orden de las
// dosis de una deserción (400).
async function revisarReferencias(vacuna, campos) {
  const [[filaVacuna]] = await pool.query('SELECT id, activa FROM vacuna WHERE codigo = ?', [vacuna]);
  if (!filaVacuna?.activa) throw errores.vacunaInvalida(vacuna);

  const codigosDosis = [campos.dosis, campos.dosisInicial, campos.dosisFinal].filter(Boolean);
  if (codigosDosis.length > 0) {
    const [filas] = await pool.query(
      'SELECT codigo, orden FROM dosis WHERE vacuna_id = ? AND activa = TRUE AND codigo IN (?)',
      [filaVacuna.id, codigosDosis],
    );
    const orden = new Map(filas.map((d) => [d.codigo, d.orden]));
    const faltante = codigosDosis.find((codigo) => !orden.has(codigo));
    if (faltante !== undefined) throw errores.dosisInvalida(faltante, vacuna);
    if (campos.dosisInicial) {
      valorO400(revisarOrdenDosis(orden.get(campos.dosisInicial), orden.get(campos.dosisFinal)));
    }
  }

  if (campos.clasificacionPoblacion) {
    const [[clasificacion]] = await pool.query(
      'SELECT id FROM clasificacion_poblacion WHERE codigo = ?',
      [campos.clasificacionPoblacion],
    );
    if (!clasificacion) throw errores.poblacionInvalida(campos.clasificacionPoblacion);
  }

  if (campos.grupoEdad) {
    const dimension = await (await obtenerDb()).collection('catalogo_dimensiones').findOne({ codigo: 'grupo_edad' });
    const activo = dimension?.activo && dimension.valores.some((v) => v.codigo === campos.grupoEdad && v.activo);
    if (!activo) throw errores.grupoEdadInvalido(campos.grupoEdad);
  }
}

// Qué mide un indicador: tipo, vacuna y dosis (o dosis inicial y final). La población y el grupo de edad no cuentan.
function llaveDeMedida(tipo, vacuna, dosis) {
  return JSON.stringify([tipo, vacuna, dosis.dosis ?? null, dosis.dosisInicial ?? null, dosis.dosisFinal ?? null]);
}

function llaveDeDocumento(doc) {
  const aplica = doc.aplica_a?.[0] ?? {};
  return llaveDeMedida(doc.tipo_calculo, aplica.vacuna, {
    dosis: aplica.dosis, dosisInicial: aplica.dosis_inicial, dosisFinal: aplica.dosis_final,
  });
}

// El código de otro indicador que aplica a la DDRISS y mide lo mismo, o null.
async function codigoQueMideLoMismo(llave, ddriss, excepto = null) {
  const documentos = await versionesVisibles({}, ddriss);
  for (const [codigo, versiones] of Map.groupBy(documentos, (d) => d.codigo)) {
    if (codigo === excepto) continue;
    const { aplica } = resumirCodigo(versiones);
    if (aplica && llaveDeDocumento(aplica) === llave) return codigo;
  }
  return null;
}

// aplica_a[0] con lo elegido; en PROYECCION, la dosis y la población se copian de la base.
function aAplicaA(tipo, vacuna, campos, base) {
  const definicion = TIPOS_INDICADOR[tipo];
  if (definicion.dosis === 'COPIA') return base.aplica_a.map((a) => ({ ...a }));
  return [{
    vacuna,
    ...(definicion.dosis === 'UNA' ? { dosis: campos.dosis } : {}),
    ...(definicion.dosis === 'DOS' ? { dosis_inicial: campos.dosisInicial, dosis_final: campos.dosisFinal } : {}),
    ...(definicion.poblacion ? { clasificacion_poblacion: campos.clasificacionPoblacion } : {}),
    ...(campos.grupoEdad ? { filtros_dimension: { grupo_edad: [campos.grupoEdad] } } : {}),
  }];
}

function aDenominador(tipo, campos, base) {
  const definicion = TIPOS_INDICADOR[tipo];
  if (tipo === 'DESERCION') return { fuente: 'PRODUCCION' };
  if (!definicion.prorrateo) return { ...base.denominador };
  return { fuente: 'POBLACION_OBJETIVO', prorrateo: campos.prorrateo ?? definicion.prorrateo.fijo };
}

function aMeta(tipo, campos, base) {
  const definicion = TIPOS_INDICADOR[tipo];
  const homogeneidad = base ? base.meta?.homogeneidad_municipal : (definicion.homogeneidadMunicipal || undefined);
  return {
    valor: campos.meta ?? definicion.meta.fijo,
    unidad: base?.meta?.unidad ?? 'PORCENTAJE',
    comparador: base?.meta?.comparador ?? definicion.meta.comparador,
    ...(homogeneidad === undefined ? {} : { homogeneidad_municipal: homogeneidad }),
  };
}

// Una versión VIGENTE de la DDRISS publicada ahora. Lo que no se edita sale de la versión base o, al crear, de los
// valores por defecto del tipo.
function nuevaVersion({ codigo, version, tipo, vacuna, contenido, base = null, ddriss, usuarioId }) {
  const definicion = TIPOS_INDICADOR[tipo];
  const { campos } = contenido;
  const ahora = new Date();
  const umbrales = definicion.semaforo ? aUmbrales(campos.cortes, definicion.semaforo) : base?.umbrales;
  const provisionales = definicion.semaforo ? campos.umbralesProvisionales : base?.umbrales_provisionales;
  const parametros = base ? base.parametros : definicion.parametros;
  return {
    _id: new ObjectId(),
    codigo,
    version: new Int32(version),
    nombre: contenido.nombre,
    ...(contenido.descripcion === null ? {} : { descripcion: contenido.descripcion }),
    tipo_calculo: tipo,
    aplica_a: aAplicaA(tipo, vacuna, campos, base),
    numerador: base?.numerador
      ? { ...base.numerador }
      : { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
    denominador: aDenominador(tipo, campos, base),
    meta: aMeta(tipo, campos, base),
    ...(umbrales ? { umbrales: umbrales.map((u) => ({ ...u })) } : {}),
    ...(provisionales === undefined ? {} : { umbrales_provisionales: provisionales }),
    es_indicador_mapa: definicion.mapa ? campos.esIndicadorMapa : false,
    ...(parametros ? { parametros: { ...parametros } } : {}),
    niveles: [...(base?.niveles ?? ['MUNICIPIO', 'DEPARTAMENTO'])],
    periodicidad: base?.periodicidad ?? 'MENSUAL',
    alerta: { ...(base?.alerta ?? { generar: false }) },
    es_estimacion: base?.es_estimacion ?? false,
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

// En la bitácora, publicadoPor es el id: el nombre puede cambiar y la fila no.
const aIndicadorBitacora = (doc) => ({ ...aIndicador(doc), publicadoPor: aNumero(doc.auditoria.publicado_por) });

const conReferencias = async (doc) => aIndicador(doc, await referenciasDe([doc]));

// Devuelve { indicador } o, si otro código que aplica mide lo mismo, { duplicado } (el controlador arma el 409).
export async function crearIndicador(cuerpo, contexto, usuario) {
  revisarCampos(cuerpo, ['tipoCalculo', 'vacuna', ...CAMPOS_COMUNES, ...CAMPOS_DEL_TIPO]);
  if (!TIPOS_CREABLES.includes(cuerpo.tipoCalculo)) throw errores.tipoNoCreable();
  const { tipoCalculo: tipo, vacuna } = cuerpo;
  if (typeof vacuna !== 'string' || !FORMATO_CODIGO_VACUNA.test(vacuna)) {
    throw entradaInvalida(MENSAJES_TIPOS_INDICADOR.codigo('vacuna'));
  }
  const contenido = leerContenido(cuerpo, tipo);
  const ddriss = await ddrissDelUsuario(usuario);
  await revisarReferencias(vacuna, contenido.campos);
  const duplicado = await codigoQueMideLoMismo(llaveDeMedida(tipo, vacuna, contenido.campos), ddriss);
  if (duplicado) return { duplicado };

  const existentes = await (await coleccion()).distinct('codigo');
  const dosis = TIPOS_INDICADOR[tipo].dosis === 'DOS'
    ? { inicial: contenido.campos.dosisInicial, final: contenido.campos.dosisFinal }
    : contenido.campos.dosis;
  const codigo = codigoIndicador(tipo, vacuna, dosis, existentes);
  if (codigo.error) throw errores.codigoLargo();

  const doc = nuevaVersion({
    codigo: codigo.valor, version: 1, tipo, vacuna, contenido, ddriss, usuarioId: contexto.usuarioId,
  });
  try {
    await escribirConBitacora(
      ENTIDAD,
      contexto,
      { accion: ACCIONES.CREAR, entidadId: doc._id.toString(), valoresNuevos: aIndicadorBitacora(doc) },
      (coleccionIndicadores) => coleccionIndicadores.insertOne(doc),
    );
  } catch (err) {
    // Dos altas a la vez calculan el mismo código: uq_indicador_version deja pasar solo una.
    if (err.code === 11000) throw errores.altaSimultanea();
    throw err;
  }
  return { indicador: await conReferencias(doc) };
}

// El código, si la DDRISS lo ve, con sus versiones publicadas; si no, 404.
async function buscarCodigo(codigo, usuario) {
  if (!FORMATO_CODIGO.test(String(codigo))) throw errores.noEncontrado();
  const ddriss = await ddrissDelUsuario(usuario);
  const documentos = await versionesVisibles({ codigo }, ddriss);
  if (documentos.length === 0) throw errores.noEncontrado();
  return { ddriss, resumen: resumirCodigo(documentos) };
}

// En todo el país, contando borradores y otras DDRISS: (codigo, version) es único en uq_indicador_version.
async function mayorVersion(codigo) {
  const [doc] = await (await coleccion()).find({ codigo }).sort({ version: -1 }).limit(1).toArray();
  return doc?.version ?? 0;
}

function leerVersion(valor, campo) {
  if (!Number.isInteger(valor) || valor < 1) throw entradaInvalida(`${campo} debe ser un número entero positivo.`);
  return valor;
}

// Lo que se elige al publicar, tal como lo devuelve la API: el motivo no cuenta.
function loQueSeElige(doc) {
  const i = aIndicador(doc);
  return JSON.stringify([
    i.nombre, i.descripcion, i.dosis, i.dosisInicial, i.dosisFinal, i.clasificacionPoblacion, i.grupoEdad,
    i.denominador, i.meta, i.umbrales, i.umbralesProvisionales, i.esIndicadorMapa,
  ]);
}

// La versión nueva de la DDRISS y, si la DDRISS tenía un VIGENTE del código, ese pasa a HISTORICO en la misma
// transacción de MongoDB. Si otra escritura ganó la carrera, responde 409 y no cambia nada.
async function publicarVersion({ doc, anterior, accion, contexto }) {
  const hasta = doc.vigencia.desde;
  const filas = [{ accion, entidadId: doc._id.toString(), valoresNuevos: aIndicadorBitacora(doc) }];
  if (anterior) {
    filas.push({
      accion: ACCIONES.ACTUALIZAR,
      entidadId: anterior._id.toString(),
      valoresAnteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
      valoresNuevos: { estado: 'HISTORICO', vigencia: { hasta: hasta.toISOString() } },
    });
  }
  try {
    await escribirEnTransaccionConBitacora(ENTIDAD, contexto, filas, async (coleccionIndicadores, sesion) => {
      // Primero la anterior: uq_indicador_vigente_territorio no admite dos VIGENTE del mismo territorio.
      if (anterior) {
        const { matchedCount } = await coleccionIndicadores.updateOne(
          { _id: anterior._id, estado: 'VIGENTE' },
          { $set: { estado: 'HISTORICO', 'vigencia.hasta': hasta } },
          { session: sesion },
        );
        if (matchedCount === 0) throw errores.desactualizado(doc.codigo);
      }
      await coleccionIndicadores.insertOne(doc, { session: sesion });
    });
  } catch (err) {
    // Un VIGENTE o una versión repetidos (11000), o un conflicto de escritura (112).
    if (err.code === 11000 || err.code === 112) throw errores.desactualizado(doc.codigo);
    throw err;
  }
  return conReferencias(doc);
}

// Devuelve { indicador } o { duplicado }, como crearIndicador.
export async function publicarVersionIndicador(codigo, cuerpo, contexto, usuario) {
  const { ddriss, resumen } = await buscarCodigo(codigo, usuario);
  revisarCampos(cuerpo, ['versionBase', ...CAMPOS_COMUNES, ...CAMPOS_DEL_TIPO]);
  const versionBase = leerVersion(cuerpo.versionBase, 'versionBase');
  const base = resumen.aplica ?? resumen.ultimaDdriss ?? resumen.ultimaNacional;
  const tipo = base.tipo_calculo;
  const vacuna = codigoVacuna(base);
  const contenido = leerContenido(cuerpo, tipo);
  if (versionBase !== base.version) throw errores.desactualizado(codigo);
  await revisarReferencias(vacuna, contenido.campos);
  if (TIPOS_INDICADOR[tipo].dosis !== 'COPIA') {
    const duplicado = await codigoQueMideLoMismo(llaveDeMedida(tipo, vacuna, contenido.campos), ddriss, codigo);
    if (duplicado) return { duplicado };
  }

  const doc = nuevaVersion({
    codigo,
    version: (await mayorVersion(codigo)) + 1,
    tipo,
    vacuna,
    contenido,
    base,
    ddriss,
    usuarioId: contexto.usuarioId,
  });
  if (resumen.aplica && loQueSeElige(doc) === loQueSeElige(resumen.aplica)) throw errores.sinCambios();
  const anterior = resumen.aplica && !esNacional(resumen.aplica) ? resumen.aplica : null;
  return { indicador: await publicarVersion({ doc, anterior, accion: ACCIONES.CREAR, contexto }) };
}

function leerCambioDeEstado(cuerpo) {
  revisarCampos(cuerpo, ['version', 'motivoCambio']);
  const version = leerVersion(cuerpo.version, 'version');
  return { version, motivoCambio: valorO400(validarMotivoCambio(cuerpo.motivoCambio)) };
}

async function filaDelCodigo(codigo, ddriss) {
  const documentos = await versionesVisibles({ codigo }, ddriss);
  return aFila(codigo, documentos, await referenciasDe(documentos));
}

// El VIGENTE de la DDRISS pasa a HISTORICO sin reemplazo; si hay un VIGENTE nacional del código, vuelve a aplicar
// ese. El motivo queda solo en la bitácora: la versión no cambia más que su estado y vigencia.hasta.
export async function desactivarIndicador(codigo, cuerpo, contexto, usuario) {
  const { ddriss, resumen } = await buscarCodigo(codigo, usuario);
  const { version, motivoCambio } = leerCambioDeEstado(cuerpo);
  const vigente = resumen.aplica && !esNacional(resumen.aplica) ? resumen.aplica : null;
  if (!vigente) throw errores.nadaQueDesactivar();
  if (version !== vigente.version) throw errores.desactualizado(codigo);

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
    async (coleccionIndicadores) => {
      const { matchedCount } = await coleccionIndicadores.updateOne(
        { _id: vigente._id, estado: 'VIGENTE' },
        { $set: { estado: 'HISTORICO', 'vigencia.hasta': hasta } },
      );
      if (matchedCount === 0) throw errores.desactualizado(codigo);
    },
  );
  return filaDelCodigo(codigo, ddriss);
}

// Los códigos que una versión guardada usa, con los nombres de los campos del cuerpo.
function camposGuardados(doc) {
  const aplica = doc.aplica_a?.[0] ?? {};
  const grupos = aplica.filtros_dimension?.grupo_edad ?? [];
  return {
    dosis: aplica.dosis ?? undefined,
    dosisInicial: aplica.dosis_inicial ?? undefined,
    dosisFinal: aplica.dosis_final ?? undefined,
    clasificacionPoblacion: aplica.clasificacion_poblacion ?? undefined,
    grupoEdad: grupos.length === 1 ? grupos[0] : undefined,
  };
}

// Una versión nueva de la DDRISS con el contenido de su última versión, que está en HISTORICO. Devuelve
// { indicador } o { duplicado }, como crearIndicador.
export async function activarIndicador(codigo, cuerpo, contexto, usuario) {
  const { ddriss, resumen } = await buscarCodigo(codigo, usuario);
  const { version, motivoCambio } = leerCambioDeEstado(cuerpo);
  const ultima = resumen.ultimaDdriss;
  if (!ultima || ultima.estado === 'VIGENTE') throw errores.nadaQueActivar();
  if (version !== ultima.version) throw errores.desactualizado(codigo);

  const vacuna = codigoVacuna(ultima);
  const campos = camposGuardados(ultima);
  await revisarReferencias(vacuna, campos);
  if (TIPOS_INDICADOR[ultima.tipo_calculo].dosis !== 'COPIA') {
    const duplicado = await codigoQueMideLoMismo(llaveDeDocumento(ultima), ddriss, codigo);
    if (duplicado) return { duplicado };
  }

  const ahora = new Date();
  const { _id, version: _version, estado, vigencia, auditoria, ...contenido } = ultima;
  const doc = {
    _id: new ObjectId(),
    ...contenido,
    version: new Int32((await mayorVersion(codigo)) + 1),
    estado: 'VIGENTE',
    vigencia: { desde: ahora, hasta: null },
    auditoria: {
      creado_por: new Int32(contexto.usuarioId),
      creado_en: ahora,
      publicado_por: new Int32(contexto.usuarioId),
      publicado_en: ahora,
      motivo_cambio: motivoCambio,
    },
  };
  // Sin anterior: la DDRISS no tiene VIGENTE. Si otra activación ganó la carrera, uq_indicador_vigente_territorio
  // da 409.
  return { indicador: await publicarVersion({ doc, anterior: null, accion: ACCIONES.REACTIVAR, contexto }) };
}
