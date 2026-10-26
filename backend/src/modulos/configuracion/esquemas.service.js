import { Int32, ObjectId } from 'mongodb';
import pool from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { validarMotivoCambio, validarTituloSeccion } from '../../validaciones/campos.js';
import { ACCIONES, diferencias } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import { hoyGuatemala } from '../catalogos/periodos.service.js';
import { escribirConBitacora, escribirEnTransaccionConBitacora } from './mongoBitacora.js';

// Un usuario ve los esquemas nacionales y los de su DDRISS; los de otras DDRISS no existen para él (§5.10).

const NACIONAL = 'NACIONAL';
const ESTADOS_ACTUALES = ['VIGENTE', 'BORRADOR'];
const GRUPO_EDAD = 'grupo_edad';
const MODOS_PROCEDENCIA = ['MUNICIPIO_DETALLADO', 'PROPIO_Y_OTROS'];
const SECCION_SIN_EDAD = 'GENERAL';
// Largo de detalle_produccion.clave_combinacion en MySQL.
const LARGO_COMBINACION = 255;
const LARGO_ETIQUETA = 120;
const REGLAS_BASICAS = ['CAMPOS_COMPLETOS', 'DIMENSIONES_VALIDAS', 'NO_NEGATIVO'];
const ENTIDAD = 'esquemas_captura';

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  esquemaInvalido: (mensaje) => new ErrorApi(422, 'ESQUEMA_INVALIDO', mensaje),
  borradorExistente: (vacuna) =>
    new ErrorApi(409, 'BORRADOR_EXISTENTE', `Ya existe un borrador del esquema de ${vacuna} para su DDRISS.`),
  altaSimultanea: (vacuna) =>
    new ErrorApi(409, 'BORRADOR_EXISTENTE', `Se creó otra versión de ${vacuna} al mismo tiempo; intente de nuevo.`),
  baseDesactualizada: (vacuna) =>
    new ErrorApi(409, 'BASE_DESACTUALIZADA', `El esquema vigente de ${vacuna} cambió; vuelva a abrir la copia.`),
  sinDdriss: () => new ErrorApi(403, 'SIN_PERMISO', 'No tiene permiso para realizar esta acción.'),
  noEditable: () =>
    new ErrorApi(
      409,
      'ESQUEMA_NO_EDITABLE',
      'Solo se edita un borrador de su DDRISS; para cambiar un esquema publicado, cree un borrador nuevo.',
    ),
  noPublicable: () => new ErrorApi(409, 'ESQUEMA_NO_EDITABLE', 'Solo se publica un borrador de su DDRISS.'),
  vigenteCambio: (vacuna) =>
    new ErrorApi(409, 'BASE_DESACTUALIZADA', `El esquema vigente de ${vacuna} cambió; vuelva a intentarlo.`),
  vigenciaInvalida: (mensaje) => new ErrorApi(422, 'VIGENCIA_INVALIDA', mensaje),
};

// Los mismos textos están en frontend/src/paginas/configuracion/coherenciaEsquema.js: un cambio va en los dos.
export const MENSAJES_COHERENCIA = {
  vacunaInactiva: 'La vacuna está inactiva; no admite esquemas nuevos.',
  sinDosis: 'Indique al menos una dosis.',
  dosisInactiva: (dosis, vacuna) => `La dosis ${dosis} no es una dosis activa de ${vacuna}.`,
  dimensionInactiva: (dimension) => `La dimensión ${dimension} no existe o está inactiva.`,
  valorInactivo: (valor, dimension) => `El valor ${valor} de ${dimension} no existe o está inactivo.`,
  dosisSinEdad: (dosis) => `La dosis ${dosis} debe desagregarse por grupo de edad, como la vacuna.`,
  dosisConEdad: (dosis) => `La dosis ${dosis} no se desagrega por grupo de edad, porque la vacuna no lo hace.`,
  sinSecciones: 'Indique al menos una sección.',
  dosisAjena: (seccion, dosis) => `La sección ${seccion} usa la dosis ${dosis}, que no está en el esquema.`,
  dosisSinSeccion: (dosis) => `La dosis ${dosis} no aparece en ninguna sección.`,
  seccionSinGrupo: (seccion) => `La sección ${seccion} necesita un grupo de edad.`,
  grupoRepetido: (grupo) => `Dos secciones usan el grupo de edad ${grupo}.`,
  grupoNoPermitido: (dosis, grupo, seccion) =>
    `La dosis ${dosis} no admite el grupo de edad ${grupo} de la sección ${seccion}.`,
  unaSeccion: 'Sin desagregación por grupo de edad, el esquema lleva una sola sección.',
  seccionConGrupo: (seccion) =>
    `La sección ${seccion} no lleva grupo de edad, porque la vacuna no se desagrega por edad.`,
  combinacionLarga: (dosis) => `La combinación de la dosis ${dosis} supera los ${LARGO_COMBINACION} caracteres.`,
};

const coleccion = async () => (await obtenerDb()).collection('esquemas_captura');

const aCamel = (clave) => clave.replace(/_([a-z])/g, (_, letra) => letra.toUpperCase());
const clavesACamel = (objeto = {}) => Object.fromEntries(Object.entries(objeto).map(([k, v]) => [aCamel(k), v]));
const aFecha = (fecha) => (fecha ? fecha.toISOString().slice(0, 10) : null);

async function codigoDdriss(ddrissId) {
  if (ddrissId === null || ddrissId === undefined) return null;
  const [[fila]] = await pool.query('SELECT codigo FROM ddriss WHERE id = ?', [ddrissId]);
  return fila?.codigo ?? null;
}

const esVisible = (doc, ddriss) =>
  doc.territorio.nivel === NACIONAL || (ddriss !== null && doc.territorio.ddriss_codigo === ddriss);

const aTerritorio = (territorio) => ({ nivel: territorio.nivel, ddrissCodigo: territorio.ddriss_codigo ?? null });

const aDesagregacion = (lista) =>
  lista.map(({ dimension, valores, etiqueta }) => ({ dimension, valores: [...valores], etiqueta: etiqueta ?? null }));

// usuarios: id → nombre_usuario, para publicadoPor; sin él (bitácora) queda en null.
function aEsquema(doc, usuarios = new Map()) {
  const { dimensiones } = doc;
  return {
    id: doc._id.toString(),
    vacuna: { id: doc.vacuna.id, codigo: doc.vacuna.codigo, nombre: doc.vacuna.nombre ?? null },
    version: doc.version,
    territorio: aTerritorio(doc.territorio),
    estado: doc.estado,
    // La vigencia de un borrador es provisional (solo cumple el validador): la fija la publicación.
    vigencia: doc.estado === 'BORRADOR' ? null : { desde: aFecha(doc.vigencia.desde), hasta: aFecha(doc.vigencia.hasta) },
    versionAnteriorId: doc.version_anterior_id?.toString() ?? null,
    basadoEn: doc.basado_en ? { esquemaId: doc.basado_en.esquema_id.toString(), version: doc.basado_en.version } : null,
    procedencia: {
      modo: dimensiones.procedencia.modo,
      permiteNoEspecificado: dimensiones.procedencia.permite_no_especificado ?? true,
    },
    dosis: dimensiones.dosis.map((d) => ({
      codigo: d.codigo,
      etiqueta: d.etiqueta ?? null,
      desagregacion: d.desagregacion === undefined ? null : aDesagregacion(d.desagregacion),
    })),
    desagregacion: aDesagregacion(dimensiones.desagregacion),
    secciones: (doc.secciones ?? []).map((s) => ({
      codigo: s.codigo,
      titulo: s.titulo,
      orden: s.orden,
      grupoEdad: s.grupo_edad ?? null,
      dosis: [...s.dosis],
    })),
    camposAdicionales: (doc.campos_adicionales ?? []).map(clavesACamel),
    reglas: doc.reglas.map((r) => ({ codigo: r.codigo, version: r.version, severidadOverride: r.severidad_override ?? null })),
    presentacion: clavesACamel(doc.presentacion),
    creadoPor: doc.auditoria.creado_por,
    creadoEn: doc.auditoria.creado_en.toISOString(),
    ...aPublicacion(doc.auditoria, usuarios),
  };
}

function aPublicacion(auditoria, usuarios) {
  const id = auditoria.publicado_por ?? null;
  return {
    publicadoPor: id !== null && usuarios.has(id) ? { id, nombreUsuario: usuarios.get(id) } : null,
    publicadoEn: auditoria.publicado_en?.toISOString() ?? null,
    motivoCambio: auditoria.motivo_cambio ?? null,
  };
}

async function nombresDeUsuario(documentos) {
  const ids = [...new Set(documentos.map((d) => d.auditoria.publicado_por).filter((id) => id !== null && id !== undefined))];
  if (ids.length === 0) return new Map();
  const [filas] = await pool.query('SELECT id, nombre_usuario FROM usuario WHERE id IN (?)', [ids]);
  return new Map(filas.map((u) => [u.id, u.nombre_usuario]));
}

const aResumen = (doc) => ({
  id: doc._id.toString(),
  version: doc.version,
  territorio: aTerritorio(doc.territorio),
  vigenciaDesde: aFecha(doc.vigencia.desde),
});

// Una fila por vacuna activa, más las inactivas con borrador de la DDRISS. El vigente que aplica es el de la
// DDRISS o, si no hay, el nacional: el mismo que se usará para capturar.
export async function listarEsquemas(query, usuario) {
  revisarParametros(query, []);
  const ddriss = await codigoDdriss(usuario.ddrissId);
  const territorios = [{ 'territorio.nivel': NACIONAL }];
  if (ddriss !== null) territorios.push({ 'territorio.ddriss_codigo': ddriss });

  const [[vacunas], esquemas] = await Promise.all([
    pool.query('SELECT id, codigo, nombre, activa FROM vacuna'),
    (await coleccion())
      .find(
        { estado: { $in: ESTADOS_ACTUALES }, $or: territorios },
        { projection: { vacuna: 1, version: 1, territorio: 1, estado: 1, 'vigencia.desde': 1, 'auditoria.creado_en': 1 } },
      )
      .toArray(),
  ]);

  const porVacuna = new Map();
  for (const doc of esquemas) {
    const grupo = porVacuna.get(doc.vacuna.codigo) ?? {};
    const deLaDdriss = doc.territorio.nivel !== NACIONAL;
    if (doc.estado === 'VIGENTE') grupo[deLaDdriss ? 'vigenteDdriss' : 'vigenteNacional'] = doc;
    else if (deLaDdriss) grupo.borrador = doc;
    porVacuna.set(doc.vacuna.codigo, grupo);
  }

  return vacunas
    .map((v) => ({ v, grupo: porVacuna.get(v.codigo) ?? {} }))
    .filter(({ v, grupo }) => v.activa || grupo.borrador)
    .map(({ v, grupo }) => {
      const vigente = grupo.vigenteDdriss ?? grupo.vigenteNacional;
      return {
        vacuna: { id: v.id, codigo: v.codigo, nombre: v.nombre, activa: Boolean(v.activa) },
        vigente: vigente ? aResumen(vigente) : null,
        borrador: grupo.borrador
          ? {
            id: grupo.borrador._id.toString(),
            version: grupo.borrador.version,
            creadoEn: grupo.borrador.auditoria.creado_en.toISOString(),
          }
          : null,
      };
    })
    .sort((a, b) => a.vacuna.nombre.localeCompare(b.vacuna.nombre, 'es'));
}

// El esquema publicado que cubre la fecha (día 1 del mes, en UTC como las vigencias): el de la DDRISS o, si no hay,
// el nacional. Se elige por fecha y no por estado, porque un VIGENTE puede empezar en un mes futuro (SPEC 20).
// Las vacunas sin esquema para esa fecha no aparecen en el Map.
export async function esquemasDelPeriodo(codigosVacuna, ddrissCodigo, fecha) {
  if (codigosVacuna.length === 0) return new Map();
  const territorios = [{ 'territorio.nivel': NACIONAL }];
  if (ddrissCodigo) territorios.push({ 'territorio.ddriss_codigo': ddrissCodigo });
  const documentos = await (await coleccion())
    .find(
      {
        'vacuna.codigo': { $in: codigosVacuna },
        estado: { $in: ['VIGENTE', 'HISTORICO'] },
        'vigencia.desde': { $lte: fecha },
        $and: [{ $or: [{ 'vigencia.hasta': null }, { 'vigencia.hasta': { $gte: fecha } }] }, { $or: territorios }],
      },
      { projection: { vacuna: 1, version: 1, territorio: 1 } },
    )
    .toArray();
  const nacionales = new Map();
  const deLaDdriss = new Map();
  for (const doc of documentos) {
    (doc.territorio.nivel === NACIONAL ? nacionales : deLaDdriss).set(doc.vacuna.codigo, {
      id: doc._id.toString(),
      version: doc.version,
    });
  }
  return new Map([...nacionales, ...deLaDdriss]);
}

// Un id que no es un ObjectId, o un esquema de otra DDRISS, responde igual que uno inexistente.
async function buscarVisible(id, usuario) {
  if (!/^[0-9a-f]{24}$/i.test(String(id))) throw errores.noEncontrado();
  const [doc, ddriss] = await Promise.all([
    (await coleccion()).findOne({ _id: new ObjectId(String(id)) }),
    codigoDdriss(usuario.ddrissId),
  ]);
  if (!doc || !esVisible(doc, ddriss)) throw errores.noEncontrado();
  return doc;
}

export async function obtenerEsquema(id, usuario) {
  const doc = await buscarVisible(id, usuario);
  return aEsquema(doc, await nombresDeUsuario([doc]));
}

const CAMPOS_HISTORIAL = [
  'id', 'version', 'territorio', 'estado', 'vigencia', 'versionAnteriorId', 'basadoEn', 'creadoEn',
  'publicadoPor', 'publicadoEn', 'motivoCambio',
];

function leerVacunaIdDeConsulta(valor) {
  if (valor === undefined || !/^[1-9]\d*$/.test(valor)) throw entradaInvalida(MENSAJE_VACUNA_ID);
  return Number(valor);
}

// Las versiones nacionales y las de la DDRISS del usuario, con los reportes de su DDRISS que usa cada una.
export async function historialEsquemas(query, usuario) {
  revisarParametros(query, ['vacunaId']);
  const vacunaId = leerVacunaIdDeConsulta(query.vacunaId);
  const [[[vacuna]], ddriss] = await Promise.all([
    pool.query('SELECT id, codigo, nombre, activa FROM vacuna WHERE id = ?', [vacunaId]),
    codigoDdriss(usuario.ddrissId),
  ]);
  if (!vacuna) throw new ErrorApi(404, 'NO_ENCONTRADO', 'La vacuna no existe.');

  const territorios = [{ 'territorio.nivel': NACIONAL }];
  if (ddriss !== null) territorios.push({ 'territorio.ddriss_codigo': ddriss });
  const documentos = await (await coleccion())
    .find({ 'vacuna.codigo': vacuna.codigo, $or: territorios })
    .sort({ version: -1 })
    .toArray();

  const [usuarios, reportes] = await Promise.all([nombresDeUsuario(documentos), reportesPorEsquema(documentos, usuario)]);
  return {
    vacuna: { id: vacuna.id, codigo: vacuna.codigo, nombre: vacuna.nombre, activa: Boolean(vacuna.activa) },
    versiones: documentos.map((doc) => {
      const esquema = aEsquema(doc, usuarios);
      return {
        ...Object.fromEntries(CAMPOS_HISTORIAL.map((campo) => [campo, esquema[campo]])),
        reportes: reportes.get(esquema.id) ?? 0,
      };
    }),
  };
}

// Sin DDRISS (AUTORIDAD), el alcance es el país.
async function reportesPorEsquema(documentos, usuario) {
  if (documentos.length === 0) return new Map();
  const ddriss = usuario.ddrissId ?? null;
  const [filas] = await pool.query(
    `SELECT rv.esquema_mongo_id AS esquema, COUNT(*) AS reportes
       FROM reporte_vacuna rv
       JOIN reporte_produccion rp ON rp.id = rv.reporte_id
       JOIN establecimiento e ON e.id = rp.establecimiento_id
      WHERE rv.esquema_mongo_id IN (?) AND (? IS NULL OR e.ddriss_id = ?)
      GROUP BY rv.esquema_mongo_id`,
    [documentos.map((d) => d._id.toString()), ddriss, ddriss],
  );
  return new Map(filas.map((f) => [f.esquema, Number(f.reportes)]));
}

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);
const esTexto = (valor) => typeof valor === 'string' && valor.trim() !== '';

function leerLista(valor, campo) {
  if (!Array.isArray(valor)) throw entradaInvalida(`${campo} debe ser una lista.`);
  return valor;
}

function leerObjeto(valor, campo) {
  if (!esObjeto(valor)) throw entradaInvalida(`${campo} debe ser un objeto JSON.`);
  return valor;
}

function leerCodigos(valor, campo, repetido) {
  const codigos = leerLista(valor, campo);
  if (!codigos.every(esTexto)) throw entradaInvalida(`${campo} debe traer solo códigos.`);
  const limpios = codigos.map((c) => c.trim());
  const vistos = new Set();
  for (const codigo of limpios) {
    if (vistos.has(codigo)) throw entradaInvalida(repetido(codigo));
    vistos.add(codigo);
  }
  return limpios;
}

function leerDesagregacion(valor, campo) {
  const vistas = new Set();
  return leerLista(valor, campo).map((item) => {
    leerObjeto(item, `Cada elemento de ${campo}`);
    revisarCampos(item, ['dimension', 'valores', 'etiqueta']);
    if (!esTexto(item.dimension)) throw entradaInvalida(`Cada elemento de ${campo} necesita su dimensión.`);
    const dimension = item.dimension.trim();
    if (vistas.has(dimension)) throw entradaInvalida(`La dimensión ${dimension} está repetida.`);
    vistas.add(dimension);
    const valores = leerCodigos(
      item.valores,
      `valores de ${dimension}`,
      (v) => `El valor ${v} de ${dimension} está repetido.`,
    );
    if (valores.length === 0) throw entradaInvalida(`Indique al menos un valor de ${dimension}.`);
    const etiqueta = leerEtiqueta(item.etiqueta, dimension);
    return { dimension, valores, ...(etiqueta !== null && { etiqueta }) };
  });
}

// El editor no la cambia: solo la devuelve tal como la recibió, para que guardar no la pierda.
function leerEtiqueta(valor, dimension) {
  if (valor === undefined || valor === null) return null;
  const limpia = typeof valor === 'string' ? valor.trim().replace(/\s+/g, ' ') : null;
  if (limpia === null || limpia.length > LARGO_ETIQUETA) {
    throw entradaInvalida(`La etiqueta de ${dimension} debe ser un texto de hasta ${LARGO_ETIQUETA} caracteres.`);
  }
  return limpia === '' ? null : limpia;
}

function leerSeccion(item) {
  leerObjeto(item, 'Cada sección');
  revisarCampos(item, ['titulo', 'grupoEdad', 'dosis']);
  const resultado = validarTituloSeccion(item.titulo);
  if (resultado.error) throw entradaInvalida(resultado.error);
  const titulo = resultado.valor;
  const grupoEdad = item.grupoEdad ?? null;
  if (grupoEdad !== null && !esTexto(grupoEdad)) {
    throw entradaInvalida(`El grupo de edad de la sección ${titulo} debe ser un código.`);
  }
  const dosis = leerCodigos(
    item.dosis,
    `dosis de la sección ${titulo}`,
    (d) => `La dosis ${d} está repetida en la sección ${titulo}.`,
  );
  if (dosis.length === 0) throw entradaInvalida(`Indique al menos una dosis en la sección ${titulo}.`);
  return { titulo, grupoEdad: grupoEdad === null ? null : grupoEdad.trim(), dosis };
}

// La forma del cuerpo (400). Quien llama revisa antes los campos permitidos del cuerpo completo.
export function leerContenido(cuerpo) {
  const procedencia = leerObjeto(cuerpo.procedencia, 'procedencia');
  revisarCampos(procedencia, ['modo', 'permiteNoEspecificado']);
  if (!MODOS_PROCEDENCIA.includes(procedencia.modo)) {
    throw entradaInvalida('El modo de procedencia debe ser MUNICIPIO_DETALLADO o PROPIO_Y_OTROS.');
  }
  const permite = procedencia.permiteNoEspecificado ?? true;
  if (typeof permite !== 'boolean') throw entradaInvalida('permiteNoEspecificado debe ser true o false.');

  const vistas = new Set();
  const dosis = leerLista(cuerpo.dosis, 'dosis').map((item) => {
    leerObjeto(item, 'Cada dosis');
    revisarCampos(item, ['codigo', 'desagregacion']);
    if (!esTexto(item.codigo)) throw entradaInvalida('Cada dosis necesita su código.');
    const codigo = item.codigo.trim();
    if (vistas.has(codigo)) throw entradaInvalida(`La dosis ${codigo} está repetida.`);
    vistas.add(codigo);
    const propia = item.desagregacion ?? null;
    return { codigo, desagregacion: propia === null ? null : leerDesagregacion(propia, `desagregacion de ${codigo}`) };
  });

  return {
    procedencia: { modo: procedencia.modo, permiteNoEspecificado: permite },
    dosis,
    desagregacion: leerDesagregacion(cuerpo.desagregacion, 'desagregacion'),
    secciones: leerLista(cuerpo.secciones, 'secciones').map(leerSeccion),
  };
}

// La vacuna, sus dosis y el catálogo de dimensiones que necesitan las reglas de coherencia.
export async function cargarReferencias(vacunaId) {
  const id = Number.isInteger(vacunaId) && vacunaId > 0 ? vacunaId : 0;
  const [[[vacuna]], [dosis], dimensiones] = await Promise.all([
    pool.query('SELECT id, codigo, nombre, activa FROM vacuna WHERE id = ?', [id]),
    pool.query('SELECT codigo, nombre, orden, activa FROM dosis WHERE vacuna_id = ? ORDER BY orden', [id]),
    (await obtenerDb()).collection('catalogo_dimensiones').find().toArray(),
  ]);
  if (!vacuna) throw new ErrorApi(404, 'NO_ENCONTRADO', 'La vacuna no existe.');
  return {
    vacuna: { ...vacuna, activa: Boolean(vacuna.activa) },
    dosis: dosis.map((d) => ({ ...d, activa: Boolean(d.activa) })),
    dimensiones,
  };
}

const valoresDeEdad = (desagregacion) => desagregacion.find((d) => d.dimension === GRUPO_EDAD)?.valores ?? null;

// Las reglas de coherencia (422), en el orden del spec; responde con el primer problema. Devuelve las partes del
// documento de MongoDB: dosis en el orden de MySQL, valores en el orden del catálogo y secciones numeradas.
export function revisarCoherencia(contenido, { vacuna, dosis: dosisVacuna, dimensiones: catalogo }) {
  const M = MENSAJES_COHERENCIA;
  const invalido = errores.esquemaInvalido;

  if (!vacuna.activa) throw invalido(M.vacunaInactiva);

  if (contenido.dosis.length === 0) throw invalido(M.sinDosis);
  const dosisActivas = new Map(dosisVacuna.filter((d) => d.activa).map((d) => [d.codigo, d]));
  for (const { codigo } of contenido.dosis) {
    if (!dosisActivas.has(codigo)) throw invalido(M.dosisInactiva(codigo, vacuna.codigo));
  }

  const dimensionesActivas = new Map(catalogo.filter((d) => d.activo).map((d) => [d.codigo, d]));
  const revisarDesagregacion = (lista) => {
    for (const { dimension, valores } of lista) {
      const encontrada = dimensionesActivas.get(dimension);
      if (!encontrada) throw invalido(M.dimensionInactiva(dimension));
      const activos = new Set(encontrada.valores.filter((v) => v.activo).map((v) => v.codigo));
      for (const valor of valores) if (!activos.has(valor)) throw invalido(M.valorInactivo(valor, dimension));
    }
  };
  revisarDesagregacion(contenido.desagregacion);

  // Toda celda tiene grupo de edad o ninguna lo tiene: lo decide la desagregación general.
  const porEdad = valoresDeEdad(contenido.desagregacion) !== null;
  for (const { codigo, desagregacion } of contenido.dosis) {
    if (desagregacion === null) continue;
    revisarDesagregacion(desagregacion);
    const conEdad = valoresDeEdad(desagregacion) !== null;
    if (porEdad && !conEdad) throw invalido(M.dosisSinEdad(codigo));
    if (!porEdad && conEdad) throw invalido(M.dosisConEdad(codigo));
  }

  const { secciones } = contenido;
  if (secciones.length === 0) throw invalido(M.sinSecciones);
  const codigosEsquema = new Set(contenido.dosis.map((d) => d.codigo));
  for (const seccion of secciones) {
    for (const dosis of seccion.dosis) {
      if (!codigosEsquema.has(dosis)) throw invalido(M.dosisAjena(seccion.titulo, dosis));
    }
  }
  for (const { codigo } of contenido.dosis) {
    if (!secciones.some((s) => s.dosis.includes(codigo))) throw invalido(M.dosisSinSeccion(codigo));
  }
  const efectiva = (codigo) => contenido.dosis.find((d) => d.codigo === codigo).desagregacion ?? contenido.desagregacion;
  if (porEdad) {
    const grupos = new Set();
    for (const seccion of secciones) {
      if (seccion.grupoEdad === null) throw invalido(M.seccionSinGrupo(seccion.titulo));
      if (grupos.has(seccion.grupoEdad)) throw invalido(M.grupoRepetido(seccion.grupoEdad));
      grupos.add(seccion.grupoEdad);
      for (const dosis of seccion.dosis) {
        if (!valoresDeEdad(efectiva(dosis)).includes(seccion.grupoEdad)) {
          throw invalido(M.grupoNoPermitido(dosis, seccion.grupoEdad, seccion.titulo));
        }
      }
    }
  } else {
    if (secciones.length > 1) throw invalido(M.unaSeccion);
    if (secciones[0].grupoEdad !== null) throw invalido(M.seccionConGrupo(secciones[0].titulo));
  }

  // La clave de una celda en MySQL es dimension=VALOR|…, ordenada por código de dimensión; se mide la más larga.
  const masLargo = (valores) => valores.reduce((a, b) => (b.length > a.length ? b : a));
  for (const { codigo } of contenido.dosis) {
    const clave = [...efectiva(codigo)]
      .sort((a, b) => a.dimension.localeCompare(b.dimension))
      .map(({ dimension, valores }) => `${dimension}=${masLargo(valores)}`)
      .join('|');
    if (clave.length > LARGO_COMBINACION) throw invalido(M.combinacionLarga(codigo));
  }

  const porOrdenDeDosis = (a, b) => dosisActivas.get(a).orden - dosisActivas.get(b).orden;
  const ordenarValores = ({ dimension, valores, etiqueta }) => {
    const orden = new Map(dimensionesActivas.get(dimension).valores.map((v) => [v.codigo, v.orden]));
    return {
      dimension,
      valores: [...valores].sort((a, b) => orden.get(a) - orden.get(b)),
      ...(etiqueta !== undefined && { etiqueta }),
    };
  };

  return {
    dimensiones: {
      dosis: [...contenido.dosis]
        .sort((a, b) => porOrdenDeDosis(a.codigo, b.codigo))
        .map(({ codigo, desagregacion }) => ({
          codigo,
          etiqueta: dosisActivas.get(codigo).nombre,
          ...(desagregacion !== null && { desagregacion: desagregacion.map(ordenarValores) }),
        })),
      procedencia: {
        modo: contenido.procedencia.modo,
        permite_no_especificado: contenido.procedencia.permiteNoEspecificado,
      },
      desagregacion: contenido.desagregacion.map(ordenarValores),
    },
    secciones: secciones.map((s, i) => ({
      codigo: s.grupoEdad ?? SECCION_SIN_EDAD,
      titulo: s.titulo,
      orden: new Int32(i + 1),
      grupo_edad: s.grupoEdad,
      dosis: [...s.dosis].sort(porOrdenDeDosis),
    })),
  };
}

// filas y columnas salen del contenido; las demás claves (p. ej. subtabla_por) se conservan de la base.
function deducirPresentacion(partes, anterior = {}) {
  const dimensiones = partes.dimensiones.desagregacion.map((d) => d.dimension).filter((d) => d !== GRUPO_EDAD);
  return {
    ...anterior,
    filas: 'dosis',
    columnas: [...(partes.secciones.length > 1 ? ['seccion'] : []), ...dimensiones],
  };
}

// Solo cumple el validador: la vigencia la fija la publicación (HU-17) y la API no la devuelve en un borrador.
function vigenciaProvisional() {
  const [anio, mes] = hoyGuatemala().split('-').map(Number);
  return { desde: new Date(Date.UTC(anio, mes, 1)), hasta: null };
}

async function reglasBasicas() {
  const vigentes = await (await obtenerDb())
    .collection('reglas_validacion')
    .find({ codigo: { $in: REGLAS_BASICAS }, estado: 'VIGENTE', 'territorio.nivel': NACIONAL })
    .toArray();
  return REGLAS_BASICAS.map((codigo) => vigentes.find((r) => r.codigo === codigo))
    .filter(Boolean)
    .map((r) => ({ codigo: r.codigo, version: new Int32(r.version) }));
}

const MENSAJE_VACUNA_ID = 'vacunaId debe ser un número entero positivo.';

function leerVacunaId(valor) {
  if (!Number.isInteger(valor) || valor <= 0) throw entradaInvalida(MENSAJE_VACUNA_ID);
  return valor;
}

function leerCopiaDe(valor) {
  if (valor === undefined || valor === null) return null;
  if (typeof valor !== 'string' || !/^[0-9a-f]{24}$/i.test(valor)) throw entradaInvalida('copiaDe debe ser un ObjectId.');
  return valor.toLowerCase();
}

// Los esquemas actuales de la vacuna para la DDRISS, y la mayor versión de la vacuna en todo el país. Se leen sin
// promoteValues para que una copia conserve los int de la base.
async function estadoDeLaVacuna(codigoVacuna, ddriss) {
  const documentos = await (await coleccion())
    .find({ 'vacuna.codigo': codigoVacuna }, { promoteValues: false })
    .toArray();
  const deLaDdriss = (doc) => doc.territorio.nivel !== NACIONAL && doc.territorio.ddriss_codigo === ddriss;
  const vigenteDdriss = documentos.find((d) => d.estado === 'VIGENTE' && deLaDdriss(d)) ?? null;
  const vigenteNacional = documentos.find((d) => d.estado === 'VIGENTE' && d.territorio.nivel === NACIONAL) ?? null;
  return {
    mayorVersion: Math.max(0, ...documentos.map((d) => Number(d.version))),
    borrador: documentos.find((d) => d.estado === 'BORRADOR' && deLaDdriss(d)) ?? null,
    vigenteDdriss,
    vigenteAplica: vigenteDdriss ?? vigenteNacional,
  };
}

function basadoEnDeLaCopia(base) {
  if (!base) return null;
  if (base.territorio.nivel === NACIONAL) return { esquema_id: base._id, version: new Int32(Number(base.version)) };
  return base.basado_en ?? null;
}

// Siempre un BORRADOR de la DDRISS del usuario, vacío o como copia del vigente que aplica (copiaDe).
export async function crearEsquema(cuerpo, contexto, usuario) {
  revisarCampos(cuerpo, ['vacunaId', 'copiaDe', 'procedencia', 'dosis', 'desagregacion', 'secciones']);
  const vacunaId = leerVacunaId(cuerpo.vacunaId);
  const copiaDe = leerCopiaDe(cuerpo.copiaDe);
  const contenido = leerContenido(cuerpo);

  const [referencias, ddriss] = await Promise.all([cargarReferencias(vacunaId), codigoDdriss(usuario.ddrissId)]);
  if (ddriss === null) throw errores.sinDdriss();
  const { vacuna } = referencias;
  const actual = await estadoDeLaVacuna(vacuna.codigo, ddriss);
  if (actual.borrador) throw errores.borradorExistente(vacuna.nombre);
  const base = copiaDe === null ? null : actual.vigenteAplica;
  if (copiaDe !== null && base?._id.toString() !== copiaDe) throw errores.baseDesactualizada(vacuna.nombre);

  const partes = revisarCoherencia(contenido, referencias);
  const doc = {
    _id: new ObjectId(),
    vacuna: { id: new Int32(vacuna.id), codigo: vacuna.codigo, nombre: vacuna.nombre },
    version: new Int32(actual.mayorVersion + 1),
    territorio: { nivel: 'DDRISS', ddriss_codigo: ddriss },
    estado: 'BORRADOR',
    vigencia: vigenciaProvisional(),
    version_anterior_id: actual.vigenteDdriss?._id ?? null,
    basado_en: basadoEnDeLaCopia(base),
    dimensiones: partes.dimensiones,
    secciones: partes.secciones,
    campos_adicionales: base?.campos_adicionales ?? [],
    reglas: base ? base.reglas : await reglasBasicas(),
    presentacion: deducirPresentacion(partes, base?.presentacion),
    auditoria: {
      creado_por: new Int32(contexto.usuarioId),
      creado_en: new Date(),
      publicado_por: null,
      publicado_en: null,
      motivo_cambio: null,
    },
  };

  try {
    await escribirConBitacora(
      ENTIDAD,
      contexto,
      { accion: ACCIONES.CREAR, entidadId: doc._id.toString(), valoresNuevos: aEsquema(doc) },
      (esquemas) => esquemas.insertOne(doc),
    );
  } catch (err) {
    // Dos altas a la vez calculan la misma versión: uq_vacuna_version deja pasar solo una.
    if (err.code !== 11000) throw err;
    const despues = await estadoDeLaVacuna(vacuna.codigo, ddriss);
    throw despues.borrador ? errores.borradorExistente(vacuna.nombre) : errores.altaSimultanea(vacuna.nombre);
  }
  return obtenerEsquema(doc._id.toString(), usuario);
}

// buscarVisible ya descarta los de otras DDRISS (404); de los visibles, solo un borrador de la DDRISS se cambia.
async function buscarBorradorPropio(id, usuario, error = errores.noEditable) {
  const doc = await buscarVisible(id, usuario);
  if (doc.territorio.nivel === NACIONAL || doc.estado !== 'BORRADOR') throw error();
  return doc;
}

const CAMPOS_EDITABLES = ['procedencia', 'dosis', 'desagregacion', 'secciones', 'presentacion'];
const editables = (esquema) => Object.fromEntries(CAMPOS_EDITABLES.map((campo) => [campo, esquema[campo]]));

// basado_en, reglas, campos adicionales, vigencia y auditoria no cambian: solo el contenido que arma el editor.
export async function editarEsquema(id, cuerpo, contexto, usuario) {
  revisarCampos(cuerpo, ['procedencia', 'dosis', 'desagregacion', 'secciones']);
  const contenido = leerContenido(cuerpo);
  const doc = await buscarBorradorPropio(id, usuario);
  const partes = revisarCoherencia(contenido, await cargarReferencias(doc.vacuna.id));
  const cambio = {
    dimensiones: partes.dimensiones,
    secciones: partes.secciones,
    presentacion: deducirPresentacion(partes, doc.presentacion),
  };

  const cambios = diferencias(editables(aEsquema(doc)), editables(aEsquema({ ...doc, ...cambio })));
  if (cambios) {
    await escribirConBitacora(
      ENTIDAD,
      contexto,
      {
        accion: ACCIONES.ACTUALIZAR,
        entidadId: doc._id.toString(),
        valoresAnteriores: cambios.anteriores,
        valoresNuevos: cambios.nuevos,
      },
      async (esquemas) => {
        // Si lo publicaron mientras se editaba, ya no es un borrador.
        const { matchedCount } = await esquemas.updateOne({ _id: doc._id, estado: 'BORRADOR' }, { $set: cambio });
        if (matchedCount === 0) throw errores.noEditable();
      },
    );
  }
  return obtenerEsquema(doc._id.toString(), usuario);
}

// Un borrador nunca se publicó: se borra, y la bitácora guarda el documento completo.
export async function descartarEsquema(id, contexto, usuario) {
  const doc = await buscarBorradorPropio(id, usuario);
  await escribirConBitacora(
    ENTIDAD,
    contexto,
    { accion: ACCIONES.ELIMINAR, entidadId: doc._id.toString(), valoresAnteriores: aEsquema(doc) },
    async (esquemas) => {
      const { deletedCount } = await esquemas.deleteOne({ _id: doc._id, estado: 'BORRADOR' });
      if (deletedCount === 0) throw errores.noEditable();
    },
  );
}

const MENSAJES_VIGENCIA = {
  formato: 'La vigencia debe ser una fecha AAAA-MM-DD.',
  diaUno: 'La vigencia debe empezar el día 1 de un mes.',
  sinPeriodo: (mes) => `El mes ${mes} no está en el calendario de periodos.`,
  mesPasado: 'La vigencia no puede empezar antes del mes actual.',
  anteriorVigente: (desde, version) =>
    `La vigencia debe empezar después del ${desde}, cuando empezó la versión ${version} de su DDRISS.`,
};

const aDiaMesAnio = (fecha) => fecha.split('-').reverse().join('/');

// El contenido guardado en la forma del cuerpo de POST/PUT, para volver a pasarle las reglas de coherencia.
const aCuerpo = (esquema) => ({
  procedencia: esquema.procedencia,
  dosis: esquema.dosis.map(({ codigo, desagregacion }) => ({ codigo, desagregacion })),
  desagregacion: esquema.desagregacion,
  secciones: esquema.secciones.map(({ titulo, grupoEdad, dosis }) => ({ titulo, grupoEdad, dosis })),
});

function leerVigenciaDesde(valor) {
  const partes = typeof valor === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor) : null;
  const fecha = partes && new Date(Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])));
  if (!fecha || aFecha(fecha) !== valor) throw entradaInvalida(MENSAJES_VIGENCIA.formato);
  if (fecha.getUTCDate() !== 1) throw entradaInvalida(MENSAJES_VIGENCIA.diaUno);
  return fecha;
}

function leerPublicacion(cuerpo) {
  revisarCampos(cuerpo, ['vigenciaDesde', 'motivoCambio']);
  const desde = leerVigenciaDesde(cuerpo.vigenciaDesde);
  const motivo = validarMotivoCambio(cuerpo.motivoCambio);
  if (motivo.error) throw entradaInvalida(motivo.error);
  return { desde, motivoCambio: motivo.valor };
}

// La vigencia va por meses completos: desde un mes del calendario, no anterior al actual, y después del vigente de
// la DDRISS (que pasa a HISTORICO hasta el día anterior). El vigente nacional no la limita.
async function revisarVigencia(desde, anterior) {
  const [anio, mes] = [desde.getUTCFullYear(), desde.getUTCMonth() + 1];
  const [[periodo]] = await pool.query('SELECT id FROM periodo WHERE anio = ? AND mes = ?', [anio, mes]);
  if (!periodo) throw errores.vigenciaInvalida(MENSAJES_VIGENCIA.sinPeriodo(aFecha(desde).slice(0, 7)));
  if (aFecha(desde) < `${hoyGuatemala().slice(0, 7)}-01`) throw errores.vigenciaInvalida(MENSAJES_VIGENCIA.mesPasado);
  if (anterior && desde <= anterior.vigencia.desde) {
    throw errores.vigenciaInvalida(
      MENSAJES_VIGENCIA.anteriorVigente(aDiaMesAnio(aFecha(anterior.vigencia.desde)), Number(anterior.version)),
    );
  }
}

// El borrador pasa a VIGENTE y el vigente anterior de la DDRISS a HISTORICO (solo su estado y vigencia.hasta), en una
// transacción de MongoDB. El nacional no se toca. Las condiciones de cada updateOne detectan otra publicación o un
// descarte entre la lectura y la escritura.
export async function publicarEsquema(id, cuerpo, contexto, usuario) {
  const doc = await buscarBorradorPropio(id, usuario, errores.noPublicable);
  const { desde, motivoCambio } = leerPublicacion(cuerpo);
  revisarCoherencia(leerContenido(aCuerpo(aEsquema(doc))), await cargarReferencias(doc.vacuna.id));
  const { vigenteDdriss: anterior } = await estadoDeLaVacuna(doc.vacuna.codigo, doc.territorio.ddriss_codigo);
  await revisarVigencia(desde, anterior);

  const hasta = new Date(desde.getTime() - 24 * 60 * 60 * 1000);
  const vigencia = { desde, hasta: null };
  const versionAnteriorId = anterior?._id ?? null;
  const filas = [
    {
      accion: ACCIONES.PUBLICAR_ESQUEMA,
      entidadId: doc._id.toString(),
      valoresAnteriores: { estado: 'BORRADOR' },
      valoresNuevos: {
        estado: 'VIGENTE',
        vigencia: { desde: aFecha(desde), hasta: null },
        versionAnteriorId: versionAnteriorId?.toString() ?? null,
        motivoCambio,
      },
    },
  ];
  if (anterior) {
    filas.push({
      accion: ACCIONES.ACTUALIZAR,
      entidadId: anterior._id.toString(),
      valoresAnteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
      valoresNuevos: { estado: 'HISTORICO', vigencia: { hasta: aFecha(hasta) } },
    });
  }

  try {
    await escribirEnTransaccionConBitacora(ENTIDAD, contexto, filas, async (esquemas, sesion) => {
      // Primero el anterior: uq_esquema_vigente_territorio no admite dos VIGENTE del mismo territorio.
      if (anterior) {
        const { matchedCount } = await esquemas.updateOne(
          { _id: anterior._id, estado: 'VIGENTE' },
          { $set: { estado: 'HISTORICO', 'vigencia.hasta': hasta } },
          { session: sesion },
        );
        if (matchedCount === 0) throw errores.vigenteCambio(doc.vacuna.nombre);
      }
      const { matchedCount } = await esquemas.updateOne(
        { _id: doc._id, estado: 'BORRADOR' },
        {
          $set: {
            estado: 'VIGENTE',
            vigencia,
            version_anterior_id: versionAnteriorId,
            'auditoria.publicado_por': new Int32(contexto.usuarioId),
            'auditoria.publicado_en': new Date(),
            'auditoria.motivo_cambio': motivoCambio,
          },
        },
        { session: sesion },
      );
      if (matchedCount === 0) throw errores.noPublicable();
    });
  } catch (err) {
    // Otra publicación de la DDRISS ganó la carrera: un VIGENTE repetido (11000) o un conflicto de escritura (112).
    if (err.code === 11000 || err.code === 112) throw errores.vigenteCambio(doc.vacuna.nombre);
    throw err;
  }
  return obtenerEsquema(doc._id.toString(), usuario);
}
