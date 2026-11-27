import { obtenerDb } from '../../config/mongodb.js';
import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { ACCIONES, MODULOS, registrarBitacora } from '../auditoria/auditoria.service.js';
import { entradaInvalida, leerBooleano, revisarParametros } from '../catalogos/catalogos.service.js';
import { codigoDdriss, seccionesDelPeriodo } from '../configuracion/esquemas.service.js';
import { ddrissDeLaConsulta, leerRedDeLaDdriss } from '../indicadores/corridas.service.js';
import { seccionesDeducidas } from '../produccion/celdas.service.js';
import { PRODUCCION_DE_LA_DDRISS, municipiosDelUniverso } from '../indicadores/produccion.service.js';
import { libroDelInforme } from './informeExcel.service.js';
import { pdfDelInforme } from './informePdf.service.js';

const noEncontrado = (mensaje) => new ErrorApi(404, 'NO_ENCONTRADO', mensaje);

// El grupo de edad no se ofrece para agrupar: las secciones del esquema ya lo separan (SPEC 63).
const GRUPO_EDAD = 'grupo_edad';
const dimensionesDelCatalogo = async () => (await obtenerDb()).collection('catalogo_dimensiones');

async function dimensionesDeAgrupacion() {
  const documentos = await (await dimensionesDelCatalogo())
    .find({ activo: true, codigo: { $ne: GRUPO_EDAD } }, { projection: { _id: 0, codigo: 1, nombre: 1 } })
    .toArray();
  return documentos
    .map(({ codigo, nombre }) => ({ codigo, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function opcionesDeInformes(usuario, query = {}) {
  revisarParametros(query, ['ddrissId']);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const [[meses], [producidas], [vacunas], municipios, dimensiones] = await Promise.all([
    pool.query(
      `SELECT p.anio, p.mes, cp.estado FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
        WHERE cp.ddriss_id = ? ORDER BY p.anio DESC, p.mes DESC`,
      [ddrissId],
    ),
    pool.query(`SELECT DISTINCT vacuna_id FROM (${PRODUCCION_DE_LA_DDRISS}) p`, [ddrissId]),
    pool.query('SELECT id, codigo, nombre, activa FROM vacuna ORDER BY activa DESC, orden_informe, nombre'),
    municipiosDelUniverso(ddrissId),
    dimensionesDeAgrupacion(),
  ]);
  const conProduccion = new Set(producidas.map((p) => p.vacuna_id));
  return {
    meses: meses.map(({ anio, mes, estado }) => ({ anio, mes, estado })),
    vacunas: vacunas
      .filter((v) => v.activa || conProduccion.has(v.id))
      .map((v) => ({ codigo: v.codigo, nombre: v.nombre, activa: Boolean(v.activa) })),
    municipios,
    dimensiones,
  };
}

// Una cantidad cae en la columna de su dosis y su grupo de edad (o su valor de la dimensión, al agrupar); sin grupo
// de edad, en la de grupoEdad null.
export const llave = (dosisId, grupoEdad) => `${dosisId}|${grupoEdad ?? ''}`;
export const llaveDeColumna = (columna) => llave(columna.dosis.id, columna.valor?.codigo ?? columna.seccion?.grupoEdad);

const aColumna = (vacuna, seccion, valor, d) => ({
  vacuna: { codigo: vacuna.codigo, nombre: vacuna.nombre },
  seccion,
  valor,
  dosis: { id: d.id, codigo: d.codigo },
});

const ORDEN_DEL_CATALOGO = 'ORDER BY activa DESC, orden_informe, nombre';

// Las vacunas del informe (con vacunaCodigos, solo esas; sin ellos, las activas y las inactivas con datos), en el
// orden del catálogo, sus dosis y el esquema de cada una que cubre el día 1 de `hasta` (las que no tienen esquema no
// están en el Map).
async function vacunasConSusEsquemas({ ddrissId, vacunaCodigos, hasta, conDatos }) {
  const [[todas], ddriss] = await Promise.all([
    vacunaCodigos
      ? pool.query(`SELECT id, codigo, nombre, activa FROM vacuna WHERE codigo IN (?) ${ORDEN_DEL_CATALOGO}`, [
        vacunaCodigos,
      ])
      : pool.query(`SELECT id, codigo, nombre, activa FROM vacuna ${ORDEN_DEL_CATALOGO}`),
    codigoDdriss(ddrissId),
  ]);
  const vacunasConDatos = new Set(conDatos.map((c) => c.vacunaId));
  const vacunas = vacunaCodigos ? todas : todas.filter((v) => v.activa || vacunasConDatos.has(v.id));
  if (vacunas.length === 0) return { vacunas, dosis: [], esquemas: new Map() };

  const fecha = new Date(Date.UTC(hasta.anio, hasta.mes - 1, 1));
  const [[dosis], esquemas] = await Promise.all([
    pool.query('SELECT id, vacuna_id, codigo, orden, activa FROM dosis WHERE vacuna_id IN (?) ORDER BY orden, id', [
      vacunas.map((v) => v.id),
    ]),
    seccionesDelPeriodo(vacunas.map((v) => v.codigo), ddriss, fecha),
  ]);
  return { vacunas, dosis, esquemas };
}

// Las columnas del informe (vacuna, sección y dosis), según el esquema que cubre el día 1 de `hasta`.
// conDatos: [{ vacunaId, dosisId, grupoEdad }], las combinaciones con producción en el rango; una que no está en el
// esquema va al final de su vacuna. Un esquema sin secciones (anterior a la v0.4) las deduce como la captura, y una
// vacuna sin esquema lleva sus dosis activas sin sección. vacunaCodigos: solo esas vacunas (su existencia se revisa
// antes).
export async function columnasDelInforme({ ddrissId, vacunaCodigos = null, hasta, conDatos = [] }) {
  const [{ vacunas, dosis, esquemas: secciones }, [catalogo]] = await Promise.all([
    vacunasConSusEsquemas({ ddrissId, vacunaCodigos, hasta, conDatos }),
    pool.query('SELECT codigo, descripcion FROM clasificacion_poblacion ORDER BY id'),
  ]);
  if (vacunas.length === 0) return [];
  const descripcion = new Map(catalogo.map((c) => [c.codigo, c.descripcion]));
  const posicion = new Map(catalogo.map((c, i) => [c.codigo, i]));
  // Sin grupo de edad primero, luego el orden del catálogo y al final los códigos que no están en él.
  const ordenDelGrupo = (grupo) => (grupo === null ? -1 : posicion.get(grupo) ?? catalogo.length);
  // Título de una sección sin el del esquema (deducida o fuera de él); sin grupo de edad no hay sección.
  const seccionDelGrupo = (grupo) => (grupo === null ? null : descripcion.get(grupo) ?? grupo);
  const gruposDeEdad = new Map([['grupo_edad', catalogo.map((c) => c.codigo)]]);

  return vacunas.flatMap((vacuna) => {
    const deLaVacuna = dosis.filter((d) => d.vacuna_id === vacuna.id);
    const porCodigo = new Map(deLaVacuna.map((d) => [d.codigo, d]));
    const porId = new Map(deLaVacuna.map((d) => [d.id, d]));
    const columnas = new Map();
    const agregar = (d, seccion) => {
      const clave = llave(d.id, seccion?.grupoEdad);
      if (!columnas.has(clave)) columnas.set(clave, aColumna(vacuna, seccion, null, d));
    };

    const esquema = secciones.get(vacuna.codigo);
    if (esquema) {
      const delEsquema = esquema.secciones.length > 0 ? esquema.secciones : seccionesDeducidas(esquema, gruposDeEdad);
      for (const seccion of delEsquema) {
        const dosisDeLaSeccion = seccion.dosis.map((codigo) => porCodigo.get(codigo)).filter(Boolean);
        const titulo = seccion.titulo ?? seccionDelGrupo(seccion.grupoEdad);
        for (const d of dosisDeLaSeccion.sort((a, b) => a.orden - b.orden || a.id - b.id)) {
          agregar(d, titulo === null ? null : { grupoEdad: seccion.grupoEdad, titulo });
        }
      }
    } else {
      for (const d of deLaVacuna.filter((x) => x.activa)) agregar(d, null);
    }

    const fuera = conDatos
      .filter((c) => c.vacunaId === vacuna.id && porId.has(c.dosisId) && !columnas.has(llave(c.dosisId, c.grupoEdad)))
      .sort(
        (a, b) =>
          ordenDelGrupo(a.grupoEdad) - ordenDelGrupo(b.grupoEdad) ||
          porId.get(a.dosisId).orden - porId.get(b.dosisId).orden,
      );
    for (const c of fuera) {
      const titulo = seccionDelGrupo(c.grupoEdad);
      agregar(porId.get(c.dosisId), titulo === null ? null : { grupoEdad: c.grupoEdad, titulo });
    }

    return [...columnas.values()];
  });
}

// La dimensión de `agrupacion`, con todos sus valores (también los inactivos, que pueden tener datos) por su orden.
export async function dimensionDeAgrupacion(codigo) {
  if (codigo === GRUPO_EDAD) throw entradaInvalida('El grupo de edad ya separa las columnas por sección.');
  const doc = await (await dimensionesDelCatalogo()).findOne({ codigo, activo: true });
  if (!doc) throw noEncontrado('La dimensión no existe o está inactiva.');
  return {
    codigo: doc.codigo,
    nombre: doc.nombre,
    valores: [...doc.valores]
      .sort((a, b) => a.orden - b.orden)
      .map((v) => ({ codigo: v.codigo, etiqueta: v.etiqueta })),
  };
}

// Las columnas al agrupar por una dimensión (SPEC 63): vacuna × valor × dosis, solo de las vacunas que la registran.
// Del esquema que cubre el día 1 de `hasta`, los valores que pide alguna dosis en su desagregación efectiva, en el
// orden del catálogo, y en cada valor las dosis que lo piden, en el orden del esquema. conDatos: [{ vacunaId, dosisId,
// valor }]; una combinación que el esquema no pide va al final de su vacuna. dimension: la de dimensionDeAgrupacion.
export async function columnasAgrupadas({ ddrissId, vacunaCodigos = null, hasta, dimension, conDatos = [] }) {
  const { vacunas, dosis, esquemas } = await vacunasConSusEsquemas({ ddrissId, vacunaCodigos, hasta, conDatos });
  const posicion = new Map(dimension.valores.map((v, i) => [v.codigo, i]));
  const etiqueta = new Map(dimension.valores.map((v) => [v.codigo, v.etiqueta]));
  const ordenDelValor = (valor) => posicion.get(valor) ?? dimension.valores.length;
  const aValor = (codigo) => ({ codigo, etiqueta: etiqueta.get(codigo) ?? codigo });

  return vacunas.flatMap((vacuna) => {
    const deLaVacuna = dosis.filter((d) => d.vacuna_id === vacuna.id);
    const porCodigo = new Map(deLaVacuna.map((d) => [d.codigo, d]));
    const porId = new Map(deLaVacuna.map((d) => [d.id, d]));
    const columnas = new Map();
    const agregar = (d, valor) => {
      const clave = llave(d.id, valor);
      if (!columnas.has(clave)) columnas.set(clave, aColumna(vacuna, null, aValor(valor), d));
    };

    const esquema = esquemas.get(vacuna.codigo);
    if (esquema) {
      const valoresDe = (desagregacion) => desagregacion.find((x) => x.dimension === dimension.codigo)?.valores ?? [];
      const pedidos = esquema.dosis
        .filter((d) => porCodigo.has(d.codigo))
        .map((d) => ({ dosis: porCodigo.get(d.codigo), valores: valoresDe(d.desagregacion ?? esquema.desagregacion) }));
      const valores = [...new Set(pedidos.flatMap((p) => p.valores))];
      valores.sort((a, b) => ordenDelValor(a) - ordenDelValor(b));
      for (const valor of valores) {
        for (const p of pedidos.filter((x) => x.valores.includes(valor))) agregar(p.dosis, valor);
      }
    }

    const fuera = conDatos
      .filter((c) => c.vacunaId === vacuna.id && porId.has(c.dosisId) && !columnas.has(llave(c.dosisId, c.valor)))
      .sort(
        (a, b) =>
          ordenDelValor(a.valor) - ordenDelValor(b.valor) ||
          String(a.valor).localeCompare(String(b.valor)) ||
          porId.get(a.dosisId).orden - porId.get(b.dosisId).orden,
      );
    for (const c of fuera) agregar(porId.get(c.dosisId), c.valor);

    return [...columnas.values()];
  });
}

// ---------------------------------------------------------------- Informe de producción

const INFORMES = ['poblacion-propia', 'total', 'residencia'];
const NIVELES = ['departamento', 'municipio', 'distrito', 'establecimiento'];

function leerMesDelRango(valor, nombre) {
  if (valor === undefined) throw entradaInvalida(`${nombre} es obligatorio.`);
  const partes = /^(20\d{2}|2100)-(0[1-9]|1[0-2])$/.exec(valor);
  if (!partes) throw entradaInvalida(`${nombre} debe tener la forma AAAA-MM, entre 2000 y 2100.`);
  return { anio: Number(partes[1]), mes: Number(partes[2]) };
}

const numeroDeMes = ({ anio, mes }) => anio * 100 + mes;

function mesesEntre(desde, hasta) {
  const lista = [];
  for (let { anio, mes } = desde; numeroDeMes({ anio, mes }) <= numeroDeMes(hasta); mes = (mes % 12) + 1) {
    lista.push({ anio, mes });
    if (mes === 12) anio += 1;
  }
  return lista;
}

export function leerIds(valor, nombre) {
  if (valor === undefined) return null;
  if (!/^[1-9]\d*(,[1-9]\d*)*$/.test(valor)) {
    throw entradaInvalida(`${nombre} debe ser una lista de ids separados por comas.`);
  }
  const lista = valor.split(',').map(Number);
  if (new Set(lista).size !== lista.length) throw entradaInvalida(`${nombre} no puede repetir un id.`);
  return lista;
}

// Los códigos de `vacuna` (separados por comas), o null para todas (SPEC 73).
export function leerVacunas(query) {
  if (query.vacuna === undefined) return null;
  if (!/^[A-Z0-9_]{1,20}(,[A-Z0-9_]{1,20})*$/.test(query.vacuna)) {
    throw entradaInvalida(
      'La vacuna debe ser una lista de códigos de 1 a 20 letras mayúsculas, números o guiones bajos, '
        + 'separados por comas.',
    );
  }
  const codigos = query.vacuna.split(',');
  if (new Set(codigos).size !== codigos.length) throw entradaInvalida('vacuna no puede repetir un código.');
  return codigos;
}

// Las vacunas elegidas, en el orden del catálogo; [] con todas. 404 si falta alguna.
export async function vacunasElegidas(codigos) {
  if (codigos === null) return [];
  const [filas] = await pool.query(`SELECT id, codigo, nombre FROM vacuna WHERE codigo IN (?) ${ORDEN_DEL_CATALOGO}`, [
    codigos,
  ]);
  if (filas.length !== codigos.length) throw noEncontrado('La vacuna no existe.');
  return filas;
}

export function leerRedId(query) {
  if (query.redId === undefined) return null;
  if (!/^[1-9]\d*$/.test(query.redId)) throw entradaInvalida('redId debe ser un número entero positivo.');
  return Number(query.redId);
}

function leerConsulta(query) {
  revisarParametros(query, [
    'informe', 'desde', 'hasta', 'nivel', 'vacuna', 'redId', 'municipioIds', 'incluirAprobados', 'agrupacion',
    'ddrissId',
  ]);
  if (query.informe === undefined) throw entradaInvalida('informe es obligatorio.');
  if (!INFORMES.includes(query.informe)) throw entradaInvalida(`informe debe ser ${INFORMES.join(', ')}.`);
  const nivel = query.nivel ?? 'municipio';
  if (!NIVELES.includes(nivel)) throw entradaInvalida(`nivel debe ser ${NIVELES.join(', ')}.`);
  if (nivel === 'establecimiento' && query.informe === 'residencia') {
    throw entradaInvalida('El informe por municipio de residencia no tiene nivel establecimiento.');
  }
  const vacunas = leerVacunas(query);
  const desde = leerMesDelRango(query.desde, 'desde');
  const hasta = leerMesDelRango(query.hasta, 'hasta');
  if (numeroDeMes(desde) > numeroDeMes(hasta)) {
    throw entradaInvalida('El mes inicial no puede ser posterior al mes final.');
  }
  const redId = leerRedId(query);
  if (query.agrupacion !== undefined && !/^[a-z][a-z0-9_]*$/.test(query.agrupacion)) {
    throw entradaInvalida('agrupacion debe ser el código de una dimensión.');
  }
  return {
    informe: query.informe,
    nivel,
    desde,
    hasta,
    vacunas,
    redId,
    municipioIds: leerIds(query.municipioIds, 'municipioIds'),
    incluirAprobados: leerBooleano(query, 'incluirAprobados') ?? false,
    agrupacion: query.agrupacion ?? null,
  };
}

// La DDRISS con su departamento sede: la fila del nivel departamento.
export async function departamentoDeLaDdriss(ddrissId) {
  const [[fila]] = await pool.query(
    `SELECT dep.id, dep.codigo_ine, dep.nombre FROM ddriss d JOIN departamento dep ON dep.id = d.departamento_id
      WHERE d.id = ?`,
    [ddrissId],
  );
  if (!fila) throw noEncontrado('La DDRISS no existe.');
  return { id: fila.id, codigo: fila.codigo_ine, nombre: fila.nombre };
}

async function mesesDelRango(ddrissId, desde, hasta) {
  const [meses] = await pool.query(
    `SELECT p.anio, p.mes, cp.estado FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
      WHERE cp.ddriss_id = ? AND p.anio * 100 + p.mes BETWEEN ? AND ? ORDER BY p.anio, p.mes`,
    [ddrissId, numeroDeMes(desde), numeroDeMes(hasta)],
  );
  const habilitado = (m) => meses.some((x) => x.anio === m.anio && x.mes === m.mes);
  if (!habilitado(desde)) throw noEncontrado('El mes inicial no está habilitado en la DDRISS.');
  if (!habilitado(hasta)) throw noEncontrado('El mes final no está habilitado en la DDRISS.');
  return meses;
}

// Los municipios del recorte: los actuales de la red y, dentro de ellos, los elegidos; null = sin recorte.
export async function municipiosDelRecorte({ redId, municipioIds }, ddrissId) {
  const recorte = redId === null ? null : (await leerRedDeLaDdriss(redId, ddrissId)).municipioIds;
  if (municipioIds === null) return recorte;
  return recorte === null ? municipioIds : municipioIds.filter((m) => recorte.includes(m));
}

// Una fila por establecimiento, municipio de la fila (de aplicación o de residencia), dosis y grupo de edad; con
// agrupacion, por valor de esa dimensión en lugar del grupo de edad (las cantidades sin ella no entran).
// residencia: solo procedencias del departamento de la DDRISS, como v_produccion_atribuida. vacunaIds: null = todas.
// porMes: también por mes, con anio y mes en cada fila (SPEC 78), en la misma consulta.
export async function leerProduccion({
  ddrissId, informe, desde, hasta, vacunaIds, incluirAprobados, agrupacion, porMes = false,
}) {
  const estados = incluirAprobados ? ['APROBADO', 'CERRADO', 'RECTIFICACION'] : ['CERRADO', 'RECTIFICACION'];
  const municipio = informe === 'residencia' ? 'vp.municipio_procedencia_id' : 'vp.municipio_aplicacion_id';
  const condiciones = {
    'poblacion-propia': 'AND vp.es_poblacion_propia',
    total: '',
    residencia: `AND vp.municipio_procedencia_id IN
      (SELECT m.id FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id WHERE d.id = ?)`,
  };
  const origen =
    agrupacion === null
      ? `v_produccion vp
       LEFT JOIN detalle_dimension dd ON dd.detalle_id = vp.detalle_id AND dd.dimension_codigo = 'grupo_edad'`
      : 'v_produccion_dimension vp';
  const subcolumna = agrupacion === null ? 'dd.valor_codigo' : 'vp.valor_codigo';
  const delMes = porMes ? ', vp.anio, vp.mes' : '';
  const [filas] = await pool.query(
    `SELECT vp.establecimiento_id, ${municipio} AS municipio_id, vp.solo_cobertura, vp.vacuna_id, vp.dosis_id,
            ${subcolumna} AS subcolumna${delMes}, SUM(vp.cantidad) AS cantidad
       FROM ${origen}
      WHERE vp.ddriss_id = ? AND vp.estado IN (?) AND vp.anio * 100 + vp.mes BETWEEN ? AND ?
        AND vp.periodo_id IN (SELECT periodo_id FROM cierre_periodo WHERE ddriss_id = ?)
        ${agrupacion === null ? '' : 'AND vp.dimension_codigo = ?'}
        ${vacunaIds === null ? '' : 'AND vp.vacuna_id IN (?)'}
        ${condiciones[informe]}
      GROUP BY vp.establecimiento_id, municipio_id, vp.solo_cobertura, vp.vacuna_id, vp.dosis_id, subcolumna${delMes}`,
    [
      ddrissId, estados, numeroDeMes(desde), numeroDeMes(hasta), ddrissId,
      ...(agrupacion === null ? [] : [agrupacion]),
      ...(vacunaIds === null ? [] : [vacunaIds]),
      ...(informe === 'residencia' ? [ddrissId] : []),
    ],
  );
  return filas.map((f) => ({
    establecimientoId: f.establecimiento_id,
    municipioId: f.municipio_id,
    // En residencia, el hospital solo_cobertura suma como cualquiera (Excel 3).
    fueraDelConsolidado: informe !== 'residencia' && Boolean(f.solo_cobertura),
    vacunaId: f.vacuna_id,
    dosisId: f.dosis_id,
    ...(agrupacion === null ? { grupoEdad: f.subcolumna ?? null } : { valor: f.subcolumna }),
    ...(porMes ? { anio: f.anio, mes: f.mes } : {}),
    cantidad: Number(f.cantidad),
  }));
}

// Los activos del departamento sede sin el 9999, más los que tienen datos en el rango.
export async function universoDeMunicipios(ddrissId, conDatos) {
  const [filas] = await pool.query(
    `SELECT m.id, m.codigo_ine, m.nombre FROM municipio m
      WHERE (m.activo = TRUE AND m.codigo_ine <> '9999'
             AND m.departamento_id = (SELECT departamento_id FROM ddriss WHERE id = ?))
         OR m.id IN (?)
      ORDER BY m.nombre`,
    [ddrissId, conDatos.length > 0 ? conDatos : [0]],
  );
  return filas.map((m) => ({ id: m.id, codigo: m.codigo_ine, nombre: m.nombre }));
}

// Los activos de la DDRISS con 5C o solo_cobertura, más los que tienen datos en el rango (inactivos o externos).
async function universoDeEstablecimientos(ddrissId, conDatos) {
  const [filas] = await pool.query(
    `SELECT e.id, e.codigo, e.nombre, e.solo_cobertura, m.id AS municipio_id, m.nombre AS municipio
       FROM establecimiento e JOIN municipio m ON m.id = e.municipio_id
      WHERE e.ddriss_id = ?
        AND ((e.activo = TRUE AND (e.reporta_5c = TRUE OR e.solo_cobertura = TRUE)) OR e.id IN (?))
      ORDER BY m.nombre, e.nombre`,
    [ddrissId, conDatos.length > 0 ? conDatos : [0]],
  );
  return filas.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    nombre: e.nombre,
    municipio: { id: e.municipio_id, nombre: e.municipio },
    fueraDelConsolidado: Boolean(e.solo_cobertura),
  }));
}

async function distritosActivos(ddrissId) {
  const [filas] = await pool.query(
    `SELECT ds.id, ds.codigo, ds.nombre, m.id AS municipio_id, m.nombre AS municipio
       FROM distrito_salud ds JOIN municipio m ON m.id = ds.municipio_id
      WHERE ds.ddriss_id = ? AND ds.activo = TRUE
      ORDER BY ds.nombre`,
    [ddrissId],
  );
  return filas.map((d) => ({
    id: d.id, codigo: d.codigo, nombre: d.nombre, municipio: { id: d.municipio_id, nombre: d.municipio },
  }));
}

// Las filas del nivel dentro del recorte, y a qué filas va cada cantidad (por distrito, un municipio con dos
// distritos va a los dos; el total se suma aparte para no contarlo dos veces).
export async function filasDelNivel(nivel, { ddrissId, departamento, produccion, enRecorte, ceros }) {
  const fila = (unidad, extra = {}) => ({
    ...unidad, municipio: null, fueraDelConsolidado: false, ...extra, cantidades: ceros(),
  });
  if (nivel === 'departamento') {
    const unica = fila(departamento);
    return { filas: [unica], destinos: () => [unica] };
  }
  if (nivel === 'establecimiento') {
    const establecimientos = await universoDeEstablecimientos(ddrissId, [
      ...new Set(produccion.map((p) => p.establecimientoId)),
    ]);
    const filas = establecimientos
      .filter((e) => enRecorte(e.municipio.id))
      .map(({ municipio, fueraDelConsolidado, ...unidad }) => fila(unidad, { municipio, fueraDelConsolidado }));
    const porId = new Map(filas.map((f) => [f.id, f]));
    return { filas, destinos: (p) => (porId.has(p.establecimientoId) ? [porId.get(p.establecimientoId)] : []) };
  }

  const [municipios, distritos] = await Promise.all([
    universoDeMunicipios(ddrissId, [...new Set(produccion.map((p) => p.municipioId))]),
    nivel === 'distrito' ? distritosActivos(ddrissId) : [],
  ]);
  const delRecorte = municipios.filter((m) => enRecorte(m.id));
  if (nivel === 'municipio') {
    const filas = delRecorte.map((m) => fila(m));
    const porId = new Map(filas.map((f) => [f.id, f]));
    return { filas, destinos: (p) => (porId.has(p.municipioId) ? [porId.get(p.municipioId)] : []) };
  }

  const filas = distritos
    .filter((d) => enRecorte(d.municipio.id))
    .map(({ municipio, ...unidad }) => fila(unidad, { municipio }));
  const porMunicipio = new Map();
  for (const f of filas) porMunicipio.set(f.municipio.id, [...(porMunicipio.get(f.municipio.id) ?? []), f]);
  const sinDistrito = delRecorte.filter((m) => !porMunicipio.has(m.id));
  if (sinDistrito.length > 0) {
    const resto = fila({ id: null, codigo: null, nombre: 'Sin distrito' });
    filas.push(resto);
    for (const m of sinDistrito) porMunicipio.set(m.id, [resto]);
  }
  return { filas, destinos: (p) => porMunicipio.get(p.municipioId) ?? [] };
}

// Suma la producción en las filas que da destinos y en el total. Devuelve el total y las dosis fuera del consolidado.
function repartir(produccion, { indice, enRecorte, destinos, nivel, ceros }) {
  const total = { cantidades: ceros() };
  let dosisFueraDelConsolidado = 0;
  for (const p of produccion) {
    if (!enRecorte(p.municipioId)) continue;
    const posicion = indice.get(llave(p.dosisId, p.valor ?? p.grupoEdad));
    if (p.fueraDelConsolidado) dosisFueraDelConsolidado += p.cantidad;
    else total.cantidades[posicion] += p.cantidad;
    // Un solo_cobertura solo tiene fila propia por establecimiento: en los demás niveles inflaría su municipio.
    if (p.fueraDelConsolidado && nivel !== 'establecimiento') continue;
    for (const destino of destinos(p)) destino.cantidades[posicion] += p.cantidad;
  }
  return { total, dosisFueraDelConsolidado };
}

// Cada mes de desde a hasta, también sin cierre_periodo (estado null, sin producción), con copias de las filas del
// rango: así la suma de los meses es el acumulado, celda por celda.
function repartirPorMes(produccion, { desde, hasta, meses, filas, destinos, ...reparto }) {
  return mesesEntre(desde, hasta).map(({ anio, mes }) => {
    const copias = filas.map((f) => ({ ...f, cantidades: reparto.ceros() }));
    const copiaDe = new Map(filas.map((f, i) => [f, copias[i]]));
    const delMes = produccion.filter((p) => p.anio === anio && p.mes === mes);
    const { total, dosisFueraDelConsolidado } = repartir(delMes, {
      ...reparto, destinos: (p) => destinos(p).map((f) => copiaDe.get(f)),
    });
    const estado = meses.find((m) => m.anio === anio && m.mes === mes)?.estado ?? null;
    return { anio, mes, estado, filas: copias, total, dosisFueraDelConsolidado };
  });
}

// porMes: agrega `meses`, un elemento por mes del rango con sus filas y su total (solo el Excel, SPEC 78).
export async function informePorFila(usuario, query = {}, { porMes = false } = {}) {
  const consulta = leerConsulta(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const { informe, nivel, desde, hasta, incluirAprobados } = consulta;

  const departamento = await departamentoDeLaDdriss(ddrissId);
  const [meses, vacunas, recorte, dimension] = await Promise.all([
    mesesDelRango(ddrissId, desde, hasta),
    vacunasElegidas(consulta.vacunas),
    municipiosDelRecorte(consulta, ddrissId),
    consulta.agrupacion === null ? null : dimensionDeAgrupacion(consulta.agrupacion),
  ]);

  const produccion = await leerProduccion({
    ddrissId, informe, desde, hasta, incluirAprobados,
    vacunaIds: consulta.vacunas === null ? null : vacunas.map((v) => v.id),
    agrupacion: consulta.agrupacion,
    porMes,
  });
  const deColumnas = { ddrissId, vacunaCodigos: consulta.vacunas, hasta, conDatos: produccion };
  const columnas = dimension
    ? await columnasAgrupadas({ ...deColumnas, dimension })
    : await columnasDelInforme(deColumnas);
  const indice = new Map(columnas.map((c, i) => [llaveDeColumna(c), i]));
  const enRecorte = (municipioId) => recorte === null || recorte.includes(municipioId);
  const ceros = () => columnas.map(() => 0);
  const { filas, destinos } = await filasDelNivel(nivel, { ddrissId, departamento, produccion, enRecorte, ceros });
  const reparto = { indice, enRecorte, nivel, ceros };
  const porMesDelRango = porMes && repartirPorMes(produccion, { ...reparto, desde, hasta, meses, filas, destinos });
  const { total, dosisFueraDelConsolidado } = repartir(produccion, { ...reparto, destinos });

  const mesesSinCerrar = meses
    .filter((m) => m.estado !== 'CERRADO')
    .map(({ anio, mes, estado }) => ({ anio, mes, estado }));
  return {
    informe,
    nivel,
    desde,
    hasta,
    incluirAprobados,
    agrupacion: dimension && { codigo: dimension.codigo, nombre: dimension.nombre },
    columnas,
    filas,
    total,
    dosisFueraDelConsolidado,
    mesesSinCerrar,
    preliminar: incluirAprobados && mesesSinCerrar.length > 0,
    ...(porMes ? { meses: porMesDelRango } : {}),
  };
}

// ---------------------------------------------------------------- Exportación a Excel y PDF (SPEC 64 y 65)

// Los nombres del encabezado del libro: DDRISS, quien exporta, vacunas, red y municipios elegidos. codigosDeVacunas:
// los de la bitácora, en el orden del catálogo (null con todas).
export async function datosDelEncabezado(usuario, consulta, ddrissId) {
  const [[[ddriss]], [[empleado]], vacunas, red, [municipios]] = await Promise.all([
    pool.query('SELECT codigo, nombre FROM ddriss WHERE id = ?', [ddrissId]),
    pool.query(
      `SELECT CONCAT(e.nombres, ' ', e.apellidos) AS nombre FROM usuario u JOIN empleado e ON e.id = u.empleado_id
        WHERE u.id = ?`,
      [usuario.id],
    ),
    vacunasElegidas(consulta.vacunas),
    consulta.redId === null ? null : leerRedDeLaDdriss(consulta.redId, ddrissId),
    consulta.municipioIds === null
      ? [[]]
      : pool.query('SELECT nombre FROM municipio WHERE id IN (?) ORDER BY nombre', [consulta.municipioIds]),
  ]);
  return {
    ddriss: ddriss.nombre,
    ddrissCodigo: ddriss.codigo,
    generadoPor: empleado.nombre,
    vacunas: vacunas.map((v) => v.nombre),
    codigosDeVacunas: vacunas.length === 0 ? null : vacunas.map((v) => v.codigo),
    red: red && { nombre: red.nombre },
    municipios: municipios.map((m) => m.nombre),
  };
}

const aTextoDeMes = ({ anio, mes }) => `${anio}-${String(mes).padStart(2, '0')}`;

// Cómo se arma cada formato a partir del informe y los datos del encabezado; la clave es la extensión del archivo.
const ARCHIVOS = {
  xlsx: async (informe, datos) => Buffer.from(await libroDelInforme(informe, datos).xlsx.writeBuffer()),
  pdf: (informe, datos) => pdfDelInforme(informe, datos),
};

// La fila EXPORTAR de un informe (entidadId: su código), con los parámetros y el formato, sin cantidades.
export function registrarExportacion(contexto, entidadId, valoresNuevos) {
  return enTransaccion((conexion) => registrarBitacora(conexion, {
    ...contexto,
    modulo: MODULOS.REPORTES,
    accion: ACCIONES.EXPORTAR,
    entidad: 'informe',
    entidadId,
    valoresNuevos,
  }));
}

// El mismo informe de informePorFila como archivo (formato: xlsx o pdf). Deja la fila EXPORTAR después de armarlo:
// si la bitácora falla, no se entrega el archivo. contexto: contextoAuditoria(req).
export async function exportarInforme(usuario, query, contexto, formato, ahora = new Date()) {
  const informe = await informePorFila(usuario, query, { porMes: formato === 'xlsx' });
  const consulta = leerConsulta(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const datos = await datosDelEncabezado(usuario, consulta, ddrissId);
  const bytes = await ARCHIVOS[formato](informe, { ...datos, generadoEn: ahora });

  const desde = aTextoDeMes(consulta.desde);
  const hasta = aTextoDeMes(consulta.hasta);
  await registrarExportacion(contexto, consulta.informe, {
    formato,
    desde,
    hasta,
    nivel: consulta.nivel,
    vacuna: datos.codigosDeVacunas,
    redId: consulta.redId,
    municipioIds: consulta.municipioIds ?? [],
    agrupacion: consulta.agrupacion,
    incluirAprobados: consulta.incluirAprobados,
    ddrissId,
  });

  const agrupacion = consulta.agrupacion ? `-por-${consulta.agrupacion}` : '';
  return { bytes, nombre: `informe-${consulta.informe}-${desde}-a-${hasta}${agrupacion}.${formato}` };
}
