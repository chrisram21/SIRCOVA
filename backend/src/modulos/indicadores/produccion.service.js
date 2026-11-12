import pool from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { entradaInvalida, leerBooleano, revisarParametros } from '../catalogos/catalogos.service.js';
import { ddrissDeLaConsulta, leerRedDeLaDdriss } from './corridas.service.js';

// La regla de estados de v_consolidado_establecimiento, sin excluir solo_cobertura (SPEC 61).
const ESTADOS_CONTADOS = "('APROBADO','CERRADO','RECTIFICACION')";
const PRODUCCION_DE_LA_DDRISS = `SELECT DISTINCT establecimiento_id, municipio_aplicacion_id, vacuna_id, dosis_id
  FROM v_produccion WHERE ddriss_id = ? AND estado IN ${ESTADOS_CONTADOS}`;

// Universo de filas: los activos más los que tienen producción en la DDRISS, para que el total cuadre con las filas.
async function municipiosDelUniverso(ddrissId) {
  const [filas] = await pool.query(
    `SELECT m.id, m.codigo_ine, m.nombre
       FROM municipio m
      WHERE (m.activo = TRUE AND m.codigo_ine <> '9999'
             AND m.departamento_id = (SELECT departamento_id FROM ddriss WHERE id = ?))
         OR m.id IN (SELECT municipio_aplicacion_id FROM (${PRODUCCION_DE_LA_DDRISS}) p)
      ORDER BY m.nombre`,
    [ddrissId, ddrissId],
  );
  return filas.map((m) => ({ id: m.id, codigoIne: m.codigo_ine, nombre: m.nombre }));
}

async function establecimientosDelUniverso(ddrissId) {
  const [filas] = await pool.query(
    `SELECT e.id, e.codigo, e.nombre, e.municipio_id, e.solo_cobertura, e.activo
       FROM establecimiento e
      WHERE e.ddriss_id = ?
        AND ((e.activo = TRUE AND (e.reporta_5c = TRUE OR e.solo_cobertura = TRUE))
             OR e.id IN (SELECT establecimiento_id FROM (${PRODUCCION_DE_LA_DDRISS}) p))
      ORDER BY e.nombre`,
    [ddrissId, ddrissId],
  );
  return filas.map((e) => ({
    id: e.id,
    codigo: e.codigo,
    nombre: e.nombre,
    municipioId: e.municipio_id,
    fueraDelConsolidado: Boolean(e.solo_cobertura),
    activo: Boolean(e.activo),
  }));
}

export async function opcionesDeProduccion(usuario, query = {}) {
  revisarParametros(query, ['ddrissId']);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const [[meses], [producidas], [vacunas], [dosis], [distritos], municipios, establecimientos] = await Promise.all([
    pool.query(
      `SELECT p.anio, p.mes, cp.estado FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
        WHERE cp.ddriss_id = ? ORDER BY p.anio DESC, p.mes DESC`,
      [ddrissId],
    ),
    pool.query(`SELECT DISTINCT vacuna_id, dosis_id FROM (${PRODUCCION_DE_LA_DDRISS}) p`, [ddrissId]),
    pool.query('SELECT id, codigo, nombre, activa FROM vacuna ORDER BY activa DESC, orden_informe, nombre'),
    pool.query('SELECT id, vacuna_id, codigo, activa FROM dosis ORDER BY orden, id'),
    pool.query(
      'SELECT id, nombre, municipio_id FROM distrito_salud WHERE ddriss_id = ? AND activo = TRUE ORDER BY nombre',
      [ddrissId],
    ),
    municipiosDelUniverso(ddrissId),
    establecimientosDelUniverso(ddrissId),
  ]);
  const vacunasConProduccion = new Set(producidas.map((p) => p.vacuna_id));
  const dosisConProduccion = new Set(producidas.map((p) => p.dosis_id));
  return {
    meses: meses.map(({ anio, mes, estado }) => ({ anio, mes, estado })),
    vacunas: vacunas
      .filter((v) => v.activa || vacunasConProduccion.has(v.id))
      .map((v) => ({
        codigo: v.codigo,
        nombre: v.nombre,
        activa: Boolean(v.activa),
        dosis: dosis
          .filter((d) => d.vacuna_id === v.id && (d.activa || dosisConProduccion.has(d.id)))
          .map((d) => ({ id: d.id, codigo: d.codigo, activa: Boolean(d.activa) })),
      })),
    distritos: distritos.map((d) => ({ id: d.id, nombre: d.nombre, municipioId: d.municipio_id })),
    municipios,
    establecimientos,
  };
}

// ---------------------------------------------------------------- Producción por fila

const noEncontrado = (mensaje) => new ErrorApi(404, 'NO_ENCONTRADO', mensaje);

function leerEntero(valor, mensaje, minimo, maximo) {
  if (!/^\d+$/.test(valor ?? '') || Number(valor) < minimo || Number(valor) > maximo) throw entradaInvalida(mensaje);
  return Number(valor);
}

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
    'anio', 'mes', 'acumulado', 'agrupar', 'vacuna', 'distritoId', 'redId', 'municipioIds', 'establecimientoIds',
    'ddrissId',
  ]);
  const agrupar = query.agrupar ?? 'municipio';
  if (!['municipio', 'establecimiento'].includes(agrupar)) {
    throw entradaInvalida('agrupar debe ser municipio o establecimiento.');
  }
  if (query.vacuna !== undefined && !/^[A-Z0-9_]{1,20}$/.test(query.vacuna)) {
    throw entradaInvalida('La vacuna debe ser un código de 1 a 20 letras mayúsculas, números o guiones bajos.');
  }
  if (query.distritoId !== undefined && query.redId !== undefined) {
    throw entradaInvalida('El distrito y la red no se combinan.');
  }
  const id = (nombre) =>
    (query[nombre] === undefined
      ? null
      : leerEntero(query[nombre], `${nombre} debe ser un número entero positivo.`, 1, Number.MAX_SAFE_INTEGER));
  return {
    anio: leerEntero(query.anio, 'El año debe ser un número de 2000 a 2100.', 2000, 2100),
    mes: leerEntero(query.mes, 'El mes debe ser un número de 1 a 12.', 1, 12),
    acumulado: leerBooleano(query, 'acumulado') ?? true,
    agrupar,
    vacuna: query.vacuna ?? null,
    distritoId: id('distritoId'),
    redId: id('redId'),
    municipioIds: leerIds(query.municipioIds, 'municipioIds'),
    establecimientoIds: leerIds(query.establecimientoIds, 'establecimientoIds'),
  };
}

// Los municipios del recorte (distrito o red) y, dentro de él, los elegidos; null = sin recorte.
async function municipiosDelRecorte({ distritoId, redId, municipioIds }, ddrissId) {
  let recorte = null;
  if (distritoId !== null) {
    const [[distrito]] = await pool.query(
      'SELECT municipio_id FROM distrito_salud WHERE id = ? AND ddriss_id = ? AND activo = TRUE',
      [distritoId, ddrissId],
    );
    if (!distrito) throw noEncontrado('El distrito de salud no existe.');
    recorte = [distrito.municipio_id];
  }
  if (redId !== null) recorte = (await leerRedDeLaDdriss(redId, ddrissId)).municipioIds;
  if (municipioIds === null) return recorte;
  return recorte === null ? municipioIds : municipioIds.filter((m) => recorte.includes(m));
}

const ceros = (dosis) => ({
  porDosis: dosis.map((d) => ({ dosisId: d.id, dosisTotal: 0 })),
  dosisPoblacionPropia: 0,
  dosisOtrosMunicipios: 0,
  dosisTotal: 0,
});

function sumar(destino, { dosisId, propia, otros }) {
  destino.dosisPoblacionPropia += propia;
  destino.dosisOtrosMunicipios += otros;
  destino.dosisTotal += propia + otros;
  const columna = destino.porDosis.find((d) => d.dosisId === dosisId);
  if (columna) columna.dosisTotal += propia + otros;
}

function filasVacias(agrupar, { municipios, establecimientos, enRecorte, conElegidos, dosis }) {
  if (agrupar === 'establecimiento') {
    const porId = new Map(municipios.map((m) => [m.id, m]));
    return establecimientos
      .map((e) => ({
        municipio: porId.get(e.municipioId),
        establecimiento: { id: e.id, codigo: e.codigo, nombre: e.nombre },
        fueraDelConsolidado: e.fueraDelConsolidado,
        ...ceros(dosis),
      }))
      .sort((a, b) => a.municipio.nombre.localeCompare(b.municipio.nombre, 'es')
        || a.establecimiento.nombre.localeCompare(b.establecimiento.nombre, 'es'));
  }
  return municipios
    .filter((m) => enRecorte(m.id) && (conElegidos === null || conElegidos.has(m.id)))
    .map((m) => ({ municipio: m, establecimiento: null, fueraDelConsolidado: false, ...ceros(dosis) }));
}

export async function produccionPorFila(usuario, query = {}) {
  const consulta = leerConsulta(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const { anio, mes, acumulado, agrupar } = consulta;
  const desde = acumulado ? 1 : mes;

  const [[meses], [vacunas], municipiosRecorte] = await Promise.all([
    pool.query(
      `SELECT p.mes, cp.estado FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
        WHERE cp.ddriss_id = ? AND p.anio = ? AND p.mes BETWEEN ? AND ? ORDER BY p.mes`,
      [ddrissId, anio, desde, mes],
    ),
    consulta.vacuna === null
      ? [[]]
      : pool.query('SELECT id, codigo, nombre FROM vacuna WHERE codigo = ?', [consulta.vacuna]),
    municipiosDelRecorte(consulta, ddrissId),
  ]);
  if (!meses.some((m) => m.mes === mes)) {
    throw noEncontrado(`El mes ${mes} de ${anio} no está habilitado en la DDRISS.`);
  }
  const vacuna = vacunas[0] ?? null;
  if (consulta.vacuna !== null && !vacuna) throw noEncontrado('La vacuna no existe.');

  const [[producidas], [dosisVacuna], municipios, establecimientos] = await Promise.all([
    pool.query(
      `SELECT establecimiento_id, municipio_aplicacion_id, dosis_id, solo_cobertura,
              SUM(CASE WHEN es_poblacion_propia THEN cantidad ELSE 0 END) AS propia,
              SUM(CASE WHEN es_poblacion_propia THEN 0 ELSE cantidad END) AS otros
         FROM v_produccion
        WHERE ddriss_id = ? AND estado IN ${ESTADOS_CONTADOS} AND anio = ? AND mes BETWEEN ? AND ?
          ${vacuna ? 'AND vacuna_id = ?' : ''}
          AND periodo_id IN (SELECT periodo_id FROM cierre_periodo WHERE ddriss_id = ?)
        GROUP BY establecimiento_id, municipio_aplicacion_id, dosis_id, solo_cobertura`,
      [ddrissId, anio, desde, mes, ...(vacuna ? [vacuna.id] : []), ddrissId],
    ),
    vacuna
      ? pool.query('SELECT id, codigo, activa FROM dosis WHERE vacuna_id = ? ORDER BY orden, id', [vacuna.id])
      : [[]],
    municipiosDelUniverso(ddrissId),
    establecimientosDelUniverso(ddrissId),
  ]);

  // Las columnas no dependen de los recortes: las activas más las inactivas con producción en el rango.
  const conProduccion = new Set(producidas.map((p) => p.dosis_id));
  const dosis = dosisVacuna
    .filter((d) => d.activa || conProduccion.has(d.id))
    .map((d) => ({ id: d.id, codigo: d.codigo, activa: Boolean(d.activa) }));

  const enRecorte = (municipioId) => municipiosRecorte === null || municipiosRecorte.includes(municipioId);
  const visibles = establecimientos.filter(
    (e) => enRecorte(e.municipioId) && (consulta.establecimientoIds?.includes(e.id) ?? true),
  );
  const conElegidos = consulta.establecimientoIds === null ? null : new Set(visibles.map((e) => e.municipioId));
  const filas = filasVacias(agrupar, { municipios, establecimientos: visibles, enRecorte, conElegidos, dosis });

  const total = ceros(dosis);
  let dosisFueraDelConsolidado = 0;
  const idsVisibles = new Set(visibles.map((e) => e.id));
  for (const p of producidas) {
    if (!idsVisibles.has(p.establecimiento_id)) continue;
    const celda = { dosisId: p.dosis_id, propia: Number(p.propia), otros: Number(p.otros) };
    if (p.solo_cobertura) dosisFueraDelConsolidado += celda.propia + celda.otros;
    else sumar(total, celda);
    // Por municipio, un solo_cobertura no se suma: inflaría el municipio con el hospital.
    const fila = agrupar === 'establecimiento'
      ? filas.find((f) => f.establecimiento.id === p.establecimiento_id)
      : !p.solo_cobertura && filas.find((f) => f.municipio.id === p.municipio_aplicacion_id);
    if (fila) sumar(fila, celda);
  }

  const mesesSinCerrar = meses
    .filter((m) => m.estado !== 'CERRADO')
    .map((m) => ({ anio, mes: m.mes, estado: m.estado }));
  return {
    anio,
    mes,
    acumulado,
    agrupar,
    vacuna: vacuna ? { codigo: vacuna.codigo, nombre: vacuna.nombre, dosis } : null,
    filas,
    total,
    dosisFueraDelConsolidado,
    preliminar: mesesSinCerrar.length > 0,
    mesesSinCerrar,
  };
}
