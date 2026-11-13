import pool from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { entradaInvalida, leerBooleano, revisarParametros } from '../catalogos/catalogos.service.js';
import { codigoDdriss, seccionesDelPeriodo } from '../configuracion/esquemas.service.js';
import { ddrissDeLaConsulta, leerRedDeLaDdriss } from '../indicadores/corridas.service.js';
import { seccionesDeducidas } from '../produccion/celdas.service.js';
import { PRODUCCION_DE_LA_DDRISS, municipiosDelUniverso } from '../indicadores/produccion.service.js';

const noEncontrado = (mensaje) => new ErrorApi(404, 'NO_ENCONTRADO', mensaje);

export async function opcionesDeInformes(usuario, query = {}) {
  revisarParametros(query, ['ddrissId']);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const [[meses], [producidas], [vacunas], municipios] = await Promise.all([
    pool.query(
      `SELECT p.anio, p.mes, cp.estado FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
        WHERE cp.ddriss_id = ? ORDER BY p.anio DESC, p.mes DESC`,
      [ddrissId],
    ),
    pool.query(`SELECT DISTINCT vacuna_id FROM (${PRODUCCION_DE_LA_DDRISS}) p`, [ddrissId]),
    pool.query('SELECT id, codigo, nombre, activa FROM vacuna ORDER BY activa DESC, orden_informe, nombre'),
    municipiosDelUniverso(ddrissId),
  ]);
  const conProduccion = new Set(producidas.map((p) => p.vacuna_id));
  return {
    meses: meses.map(({ anio, mes, estado }) => ({ anio, mes, estado })),
    vacunas: vacunas
      .filter((v) => v.activa || conProduccion.has(v.id))
      .map((v) => ({ codigo: v.codigo, nombre: v.nombre, activa: Boolean(v.activa) })),
    municipios,
  };
}

// Una cantidad cae en la columna de su dosis y su grupo de edad; sin grupo de edad, en la de grupoEdad null.
const llave = (dosisId, grupoEdad) => `${dosisId}|${grupoEdad ?? ''}`;
export const llaveDeColumna = (columna) => llave(columna.dosis.id, columna.seccion?.grupoEdad);

// Las columnas del informe (vacuna, sección y dosis), según el esquema que cubre el día 1 de `hasta`.
// conDatos: [{ vacunaId, dosisId, grupoEdad }], las combinaciones con producción en el rango; una que no está en el
// esquema va al final de su vacuna. Un esquema sin secciones (anterior a la v0.4) las deduce como la captura, y una
// vacuna sin esquema lleva sus dosis activas sin sección. vacunaCodigo: solo esa vacuna (su existencia se revisa antes).
export async function columnasDelInforme({ ddrissId, vacunaCodigo = null, hasta, conDatos = [] }) {
  const [[todas], [catalogo], ddriss] = await Promise.all([
    vacunaCodigo
      ? pool.query('SELECT id, codigo, nombre, activa FROM vacuna WHERE codigo = ?', [vacunaCodigo])
      : pool.query('SELECT id, codigo, nombre, activa FROM vacuna ORDER BY activa DESC, orden_informe, nombre'),
    pool.query('SELECT codigo, descripcion FROM clasificacion_poblacion ORDER BY id'),
    codigoDdriss(ddrissId),
  ]);
  const vacunasConDatos = new Set(conDatos.map((c) => c.vacunaId));
  const vacunas = vacunaCodigo ? todas : todas.filter((v) => v.activa || vacunasConDatos.has(v.id));
  if (vacunas.length === 0) return [];

  const fecha = new Date(Date.UTC(hasta.anio, hasta.mes - 1, 1));
  const [[dosis], secciones] = await Promise.all([
    pool.query('SELECT id, vacuna_id, codigo, orden, activa FROM dosis WHERE vacuna_id IN (?) ORDER BY orden, id', [
      vacunas.map((v) => v.id),
    ]),
    seccionesDelPeriodo(vacunas.map((v) => v.codigo), ddriss, fecha),
  ]);
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
      if (!columnas.has(clave)) {
        columnas.set(clave, { vacuna: { codigo: vacuna.codigo, nombre: vacuna.nombre }, seccion, dosis: d });
      }
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

    return [...columnas.values()].map((c) => ({ ...c, dosis: { id: c.dosis.id, codigo: c.dosis.codigo } }));
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

function leerIds(valor, nombre) {
  if (valor === undefined) return null;
  if (!/^[1-9]\d*(,[1-9]\d*)*$/.test(valor)) {
    throw entradaInvalida(`${nombre} debe ser una lista de ids separados por comas.`);
  }
  const lista = valor.split(',').map(Number);
  if (new Set(lista).size !== lista.length) throw entradaInvalida(`${nombre} no puede repetir un id.`);
  return lista;
}

function leerConsulta(query) {
  revisarParametros(query, [
    'informe', 'desde', 'hasta', 'nivel', 'vacuna', 'redId', 'municipioIds', 'incluirAprobados', 'ddrissId',
  ]);
  if (query.informe === undefined) throw entradaInvalida('informe es obligatorio.');
  if (!INFORMES.includes(query.informe)) throw entradaInvalida(`informe debe ser ${INFORMES.join(', ')}.`);
  const nivel = query.nivel ?? 'municipio';
  if (!NIVELES.includes(nivel)) throw entradaInvalida(`nivel debe ser ${NIVELES.join(', ')}.`);
  if (nivel === 'establecimiento' && query.informe === 'residencia') {
    throw entradaInvalida('El informe por municipio de residencia no tiene nivel establecimiento.');
  }
  if (query.vacuna !== undefined && !/^[A-Z0-9_]{1,20}$/.test(query.vacuna)) {
    throw entradaInvalida('La vacuna debe ser un código de 1 a 20 letras mayúsculas, números o guiones bajos.');
  }
  const desde = leerMesDelRango(query.desde, 'desde');
  const hasta = leerMesDelRango(query.hasta, 'hasta');
  if (numeroDeMes(desde) > numeroDeMes(hasta)) {
    throw entradaInvalida('El mes inicial no puede ser posterior al mes final.');
  }
  let redId = null;
  if (query.redId !== undefined) {
    if (!/^[1-9]\d*$/.test(query.redId)) throw entradaInvalida('redId debe ser un número entero positivo.');
    redId = Number(query.redId);
  }
  return {
    informe: query.informe,
    nivel,
    desde,
    hasta,
    vacuna: query.vacuna ?? null,
    redId,
    municipioIds: leerIds(query.municipioIds, 'municipioIds'),
    incluirAprobados: leerBooleano(query, 'incluirAprobados') ?? false,
  };
}

// La DDRISS con su departamento sede: la fila del nivel departamento.
async function departamentoDeLaDdriss(ddrissId) {
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
async function municipiosDelRecorte({ redId, municipioIds }, ddrissId) {
  const recorte = redId === null ? null : (await leerRedDeLaDdriss(redId, ddrissId)).municipioIds;
  if (municipioIds === null) return recorte;
  return recorte === null ? municipioIds : municipioIds.filter((m) => recorte.includes(m));
}

// Una fila por establecimiento, municipio de la fila (de aplicación o de residencia), dosis y grupo de edad.
// residencia: solo procedencias del departamento de la DDRISS, como v_produccion_atribuida.
async function leerProduccion({ ddrissId, informe, desde, hasta, vacunaId, incluirAprobados }) {
  const estados = incluirAprobados ? ['APROBADO', 'CERRADO', 'RECTIFICACION'] : ['CERRADO', 'RECTIFICACION'];
  const municipio = informe === 'residencia' ? 'vp.municipio_procedencia_id' : 'vp.municipio_aplicacion_id';
  const condiciones = {
    'poblacion-propia': 'AND vp.es_poblacion_propia',
    total: '',
    residencia: `AND vp.municipio_procedencia_id IN
      (SELECT m.id FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id WHERE d.id = ?)`,
  };
  const [filas] = await pool.query(
    `SELECT vp.establecimiento_id, ${municipio} AS municipio_id, vp.solo_cobertura, vp.vacuna_id, vp.dosis_id,
            dd.valor_codigo AS grupo_edad, SUM(vp.cantidad) AS cantidad
       FROM v_produccion vp
       LEFT JOIN detalle_dimension dd ON dd.detalle_id = vp.detalle_id AND dd.dimension_codigo = 'grupo_edad'
      WHERE vp.ddriss_id = ? AND vp.estado IN (?) AND vp.anio * 100 + vp.mes BETWEEN ? AND ?
        AND vp.periodo_id IN (SELECT periodo_id FROM cierre_periodo WHERE ddriss_id = ?)
        ${vacunaId === null ? '' : 'AND vp.vacuna_id = ?'}
        ${condiciones[informe]}
      GROUP BY vp.establecimiento_id, municipio_id, vp.solo_cobertura, vp.vacuna_id, vp.dosis_id, grupo_edad`,
    [
      ddrissId, estados, numeroDeMes(desde), numeroDeMes(hasta), ddrissId,
      ...(vacunaId === null ? [] : [vacunaId]),
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
    grupoEdad: f.grupo_edad ?? null,
    cantidad: Number(f.cantidad),
  }));
}

// Los activos del departamento sede sin el 9999, más los que tienen datos en el rango.
async function universoDeMunicipios(ddrissId, conDatos) {
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
async function filasDelNivel(nivel, { ddrissId, departamento, produccion, enRecorte, ceros }) {
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

export async function informePorFila(usuario, query = {}) {
  const consulta = leerConsulta(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const { informe, nivel, desde, hasta, incluirAprobados } = consulta;

  const departamento = await departamentoDeLaDdriss(ddrissId);
  const [meses, [vacunas], recorte] = await Promise.all([
    mesesDelRango(ddrissId, desde, hasta),
    consulta.vacuna === null ? [[]] : pool.query('SELECT id FROM vacuna WHERE codigo = ?', [consulta.vacuna]),
    municipiosDelRecorte(consulta, ddrissId),
  ]);
  if (consulta.vacuna !== null && vacunas.length === 0) throw noEncontrado('La vacuna no existe.');

  const produccion = await leerProduccion({
    ddrissId, informe, desde, hasta, incluirAprobados, vacunaId: vacunas[0]?.id ?? null,
  });
  const columnas = await columnasDelInforme({ ddrissId, vacunaCodigo: consulta.vacuna, hasta, conDatos: produccion });
  const indice = new Map(columnas.map((c, i) => [llaveDeColumna(c), i]));
  const enRecorte = (municipioId) => recorte === null || recorte.includes(municipioId);
  const ceros = () => columnas.map(() => 0);
  const { filas, destinos } = await filasDelNivel(nivel, { ddrissId, departamento, produccion, enRecorte, ceros });

  const total = { cantidades: ceros() };
  let dosisFueraDelConsolidado = 0;
  for (const p of produccion) {
    if (!enRecorte(p.municipioId)) continue;
    const posicion = indice.get(llave(p.dosisId, p.grupoEdad));
    if (p.fueraDelConsolidado) dosisFueraDelConsolidado += p.cantidad;
    else total.cantidades[posicion] += p.cantidad;
    // Un solo_cobertura solo tiene fila propia por establecimiento: en los demás niveles inflaría su municipio.
    if (p.fueraDelConsolidado && nivel !== 'establecimiento') continue;
    for (const destino of destinos(p)) destino.cantidades[posicion] += p.cantidad;
  }

  const mesesSinCerrar = meses
    .filter((m) => m.estado !== 'CERRADO')
    .map(({ anio, mes, estado }) => ({ anio, mes, estado }));
  return {
    informe,
    nivel,
    desde,
    hasta,
    incluirAprobados,
    columnas,
    filas,
    total,
    dosisFueraDelConsolidado,
    mesesSinCerrar,
    preliminar: incluirAprobados && mesesSinCerrar.length > 0,
  };
}
