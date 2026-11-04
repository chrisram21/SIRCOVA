// Lo que el motor lee de MySQL para calcular una corrida (SPEC 44). Con Aiven, cada consulta cuesta su viaje: todas
// las lecturas van en paralelo por el pool (un solo viaje), fuera de la transacción de la corrida, que solo escribe.
import pool from '../../config/mysql.js';
import { CALCULADORES, SIN_CALCULO, filtroCanonico } from './calculadores.js';

const MIGRANTES = '9999';

// La regla de v_produccion_atribuida (reportes CERRADO, procedencia del departamento de la DDRISS) sobre v_produccion,
// que tiene detalle_id para filtrar por dimensión: la vista atribuida no lo tiene y las vistas no se cambian.
const PRODUCCION_ATRIBUIDA = `
  FROM v_produccion vp
  JOIN ddriss dr    ON dr.id = vp.ddriss_id
  JOIN municipio mp ON mp.id = vp.municipio_procedencia_id`;
const CONDICIONES_ATRIBUIDA = `vp.estado = 'CERRADO' AND mp.departamento_id = dr.departamento_id
  AND vp.ddriss_id = ? AND vp.anio = ? AND vp.mes <= ? AND vp.vacuna_codigo IN (?)`;

const llave = (...partes) => partes.join(':');
const aplicaDe = (version) => version.aplica_a?.[0] ?? {};
const filtrosDe = (version) => Object.fromEntries(
  Object.entries(aplicaDe(version).filtros_dimension ?? {}).filter(([, valores]) => Array.isArray(valores) && valores.length > 0),
);
const filas = async (consulta) => (await consulta)[0];

function sumar(destino, clave, municipioId, dosis) {
  if (!destino.has(clave)) destino.set(clave, new Map());
  const porMunicipio = destino.get(clave);
  porMunicipio.set(municipioId, (porMunicipio.get(municipioId) ?? 0) + Number(dosis));
}

// Sin filtro, una consulta para todas las vacunas; con el filtro de una sola dimensión (el que arma el editor:
// grupo_edad), otra que agrupa por valor; un filtro de varias dimensiones (no lo crea la pantalla), la suya.
function consultasDeNumeradores({ ddrissId, anio, mesHasta, versiones }) {
  const base = [ddrissId, anio, mesHasta];
  const vacunas = [...new Set(versiones.map((v) => aplicaDe(v).vacuna).filter(Boolean))];
  if (vacunas.length === 0) return { totales: [], porValor: [], varias: [] };
  const dimensiones = [...new Set(versiones.flatMap((v) => {
    const claves = Object.keys(filtrosDe(v));
    return claves.length === 1 ? claves : [];
  }))];
  const varias = versiones.filter((v) => Object.keys(filtrosDe(v)).length > 1);
  return {
    totales: filas(pool.query(
      `SELECT vp.vacuna_codigo, vp.dosis_codigo, vp.municipio_procedencia_id AS municipio_id, SUM(vp.cantidad) AS dosis
         ${PRODUCCION_ATRIBUIDA}
        WHERE ${CONDICIONES_ATRIBUIDA}
        GROUP BY vp.vacuna_codigo, vp.dosis_codigo, vp.municipio_procedencia_id`,
      [...base, vacunas],
    )),
    // detalle_dimension tiene una fila por (detalle, dimensión): agrupar por valor no cuenta dos veces una celda.
    porValor: dimensiones.length === 0 ? [] : filas(pool.query(
      `SELECT vp.vacuna_codigo, vp.dosis_codigo, vp.municipio_procedencia_id AS municipio_id, dd.dimension_codigo,
              dd.valor_codigo, SUM(vp.cantidad) AS dosis
         ${PRODUCCION_ATRIBUIDA}
         JOIN detalle_dimension dd ON dd.detalle_id = vp.detalle_id AND dd.dimension_codigo IN (?)
        WHERE ${CONDICIONES_ATRIBUIDA}
        GROUP BY vp.vacuna_codigo, vp.dosis_codigo, vp.municipio_procedencia_id, dd.dimension_codigo, dd.valor_codigo`,
      [dimensiones, ...base, vacunas],
    )),
    varias: varias.map((version) => {
      const { vacuna, dosis } = aplicaDe(version);
      const condiciones = [];
      const parametros = [...base, [vacuna], dosis ?? ''];
      for (const [dimension, valores] of Object.entries(filtrosDe(version))) {
        condiciones.push(
          'AND EXISTS (SELECT 1 FROM detalle_dimension dd WHERE dd.detalle_id = vp.detalle_id AND dd.dimension_codigo = ? AND dd.valor_codigo IN (?))',
        );
        parametros.push(dimension, valores);
      }
      return filas(pool.query(
        `SELECT vp.municipio_procedencia_id AS municipio_id, SUM(vp.cantidad) AS dosis
           ${PRODUCCION_ATRIBUIDA}
          WHERE ${CONDICIONES_ATRIBUIDA} AND vp.dosis_codigo = ? ${condiciones.join(' ')}
          GROUP BY vp.municipio_procedencia_id`,
        parametros,
      )).then((resultado) => [version, new Map(resultado.map((f) => [f.municipio_id, Number(f.dosis)]))]);
    }),
  };
}

// Todo lo que la corrida necesita leer, en paralelo. mesesSinCerrar: los meses de enero al corte sin CERRADO al empezar.
export async function leerDatos({ ddrissId, anio, mesHasta, versiones }) {
  const vacunas = [...new Set(versiones.map((v) => aplicaDe(v).vacuna).filter(Boolean))];
  const numeradores = consultasDeNumeradores({ ddrissId, anio, mesHasta, versiones });
  const [vacunasDb, dosisDb, clasificaciones, municipios, poblaciones, cerrados, totales, porValor, varias] = await Promise.all([
    vacunas.length === 0 ? [] : filas(pool.query('SELECT id, codigo FROM vacuna WHERE codigo IN (?)', [vacunas])),
    vacunas.length === 0 ? [] : filas(pool.query(
      'SELECT d.id, v.codigo AS vacuna, d.codigo FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)',
      [vacunas],
    )),
    filas(pool.query('SELECT id, codigo FROM clasificacion_poblacion')),
    filas(pool.query(
      `SELECT m.id FROM municipio m JOIN ddriss d ON d.id = ?
        WHERE m.activo = TRUE AND m.departamento_id = d.departamento_id AND m.codigo_ine <> ? ORDER BY m.id`,
      [ddrissId, MIGRANTES],
    )),
    filas(pool.query(
      `SELECT po.clasificacion_poblacion_id, po.municipio_id, po.cantidad
         FROM poblacion_objetivo po JOIN municipio m ON m.id = po.municipio_id JOIN ddriss d ON d.id = ?
        WHERE po.anio = ? AND m.departamento_id = d.departamento_id`,
      [ddrissId, anio],
    )),
    filas(pool.query(
      `SELECT p.mes FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
        WHERE cp.ddriss_id = ? AND p.anio = ? AND p.mes <= ? AND cp.estado = 'CERRADO' AND cp.cerrado_en <= NOW()`,
      [ddrissId, anio, mesHasta],
    )),
    numeradores.totales,
    numeradores.porValor,
    Promise.all(numeradores.varias),
  ]);

  const poblacionPorClasificacion = new Map();
  for (const f of poblaciones) sumar(poblacionPorClasificacion, f.clasificacion_poblacion_id, f.municipio_id, f.cantidad);
  const totalPorDosis = new Map();
  for (const f of totales) sumar(totalPorDosis, llave(f.vacuna_codigo, f.dosis_codigo), f.municipio_id, f.dosis);
  const porValorDeDosis = new Map();
  for (const f of porValor) {
    sumar(porValorDeDosis, llave(f.vacuna_codigo, f.dosis_codigo, f.dimension_codigo, f.valor_codigo), f.municipio_id, f.dosis);
  }
  const cerradosSet = new Set(cerrados.map((f) => f.mes));
  return {
    vacunaPorCodigo: new Map(vacunasDb.map((v) => [v.codigo, v.id])),
    dosisPorLlave: new Map(dosisDb.map((d) => [llave(d.vacuna, d.codigo), d.id])),
    clasificacionPorCodigo: new Map(clasificaciones.map((c) => [c.codigo, c.id])),
    municipios: municipios.map((m) => m.id),
    poblacionPorClasificacion,
    totalPorDosis,
    porValorDeDosis,
    deVarias: new Map(varias),
    mesesSinCerrar: Array.from({ length: mesHasta }, (_, i) => i + 1).filter((mes) => !cerradosSet.has(mes)),
  };
}

function numeradorDe(version, datos) {
  const { vacuna, dosis } = aplicaDe(version);
  const filtros = Object.entries(filtrosDe(version));
  if (filtros.length === 0) return datos.totalPorDosis.get(llave(vacuna, dosis)) ?? new Map();
  if (filtros.length > 1) return datos.deVarias.get(version) ?? new Map();
  const [[dimension, valores]] = filtros;
  const suma = new Map();
  for (const valor of new Set(valores)) {
    for (const [municipioId, cantidad] of datos.porValorDeDosis.get(llave(vacuna, dosis, dimension, valor)) ?? []) {
      suma.set(municipioId, (suma.get(municipioId) ?? 0) + cantidad);
    }
  }
  return suma;
}

// Los ids de MySQL de la vacuna, la dosis y el grupo de población del indicador, o el motivo para omitirlo.
function referenciasDe(version, datos) {
  const { vacuna, dosis, clasificacion_poblacion: clasificacion } = aplicaDe(version);
  const vacunaId = datos.vacunaPorCodigo.get(vacuna);
  if (!vacunaId) return { omitido: `La vacuna ${vacuna} no existe.` };
  if (!dosis) return { omitido: 'El indicador no tiene dosis.' };
  const dosisId = datos.dosisPorLlave.get(llave(vacuna, dosis));
  if (!dosisId) return { omitido: `La dosis ${dosis} no existe en ${vacuna}.` };
  const clasificacionId = datos.clasificacionPorCodigo.get(clasificacion);
  if (!clasificacionId) return { omitido: `El grupo de población ${clasificacion} no existe.` };
  return { vacunaId, dosisId, clasificacionId };
}

// Las filas de resultado_indicador de todos los indicadores, y los que se omitieron con su motivo. Es puro: recibe lo
// que leyó leerDatos.
export function calcularIndicadores({ mesHasta, versiones, datos }) {
  const filasResultado = [];
  const calculados = [];
  const omitidos = [];
  for (const version of versiones) {
    const calcular = CALCULADORES[version.tipo_calculo];
    if (!calcular) {
      omitidos.push({ codigo: version.codigo, motivo: SIN_CALCULO });
      continue;
    }
    const referencias = referenciasDe(version, datos);
    if (referencias.omitido) {
      omitidos.push({ codigo: version.codigo, motivo: referencias.omitido });
      continue;
    }
    const resultado = calcular({
      version,
      mesHasta,
      municipios: datos.municipios,
      numeradores: numeradorDe(version, datos),
      poblaciones: datos.poblacionPorClasificacion.get(referencias.clasificacionId) ?? new Map(),
    });
    const filtro = filtroCanonico(filtrosDe(version));
    const numeroVersion = Number(version.version);
    for (const fila of resultado) filasResultado.push({ ...fila, codigo: version.codigo, version: numeroVersion, ...referencias, filtro });
    calculados.push({ codigo: version.codigo, version: numeroVersion });
  }
  return { filas: filasResultado, calculados, omitidos };
}
