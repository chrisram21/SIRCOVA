// Lo que el motor lee de MySQL para calcular una corrida (SPEC 44). Con Aiven, cada consulta cuesta su viaje: todas
// las lecturas van en paralelo por el pool (un solo viaje), fuera de la transacción de la corrida, que solo escribe.
import pool from '../../config/mysql.js';
import { TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js';
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
// DESERCION (SPEC 46) tiene dosis inicial y final y no usa población.
const esDeDosDosis = (version) => TIPOS_INDICADOR[version.tipo_calculo]?.dosis === 'DOS';
const dosisDe = (version) => {
  const aplica = aplicaDe(version);
  return esDeDosDosis(version) ? [aplica.dosis_inicial, aplica.dosis_final] : [aplica.dosis];
};

// Cada consulta de varias dimensiones es de un indicador y una dosis.
const llaveVarias = (version, dosis) => llave(version.codigo, dosis);

// PROYECCION (SPEC 47) toma la vacuna, la dosis, el filtro y la población de su indicador base.
const TIPOS_BASE_PROYECCION = ['COBERTURA', 'AVANCE_META_MES', 'BRECHA'];
const motivosProyeccion = {
  baseNoAplica: (codigo) => `El indicador base ${codigo} no aplica a la DDRISS.`,
  baseDeOtroTipo: (codigo) => `El indicador base ${codigo} no es de cobertura, avance ni brecha.`,
  metodo: (metodo, horizonte) => `El método ${metodo} hasta ${horizonte} no está disponible.`,
  ventana: 'La ventana de meses debe ser un número de 1 a 12.',
};

function sumar(destino, clave, municipioId, dosis) {
  if (!destino.has(clave)) destino.set(clave, new Map());
  const porMunicipio = destino.get(clave);
  porMunicipio.set(municipioId, (porMunicipio.get(municipioId) ?? 0) + Number(dosis));
}

// Los numeradores se guardan por mes (Map mes → Map municipio → dosis), para sacar la ventana de la proyección.
function sumarEnMes(destino, clave, mes, municipioId, dosis) {
  if (!destino.has(clave)) destino.set(clave, new Map());
  sumar(destino.get(clave), Number(mes), municipioId, dosis);
}

// Suma los meses pedidos (todos con null) en un Map municipio → dosis.
function sumarMeses(porMes, meses = null) {
  const suma = new Map();
  for (const [mes, porMunicipio] of porMes ?? []) {
    if (meses && !meses.includes(mes)) continue;
    for (const [municipioId, dosis] of porMunicipio) suma.set(municipioId, (suma.get(municipioId) ?? 0) + dosis);
  }
  return suma;
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
  const varias = versiones
    .filter((v) => Object.keys(filtrosDe(v)).length > 1)
    .flatMap((v) => [...new Set(dosisDe(v))].map((dosis) => [v, dosis]));
  return {
    totales: filas(pool.query(
      `SELECT vp.vacuna_codigo, vp.dosis_codigo, vp.mes, vp.municipio_procedencia_id AS municipio_id,
              SUM(vp.cantidad) AS dosis
         ${PRODUCCION_ATRIBUIDA}
        WHERE ${CONDICIONES_ATRIBUIDA}
        GROUP BY vp.vacuna_codigo, vp.dosis_codigo, vp.mes, vp.municipio_procedencia_id`,
      [...base, vacunas],
    )),
    // detalle_dimension tiene una fila por (detalle, dimensión): agrupar por valor no cuenta dos veces una celda.
    porValor: dimensiones.length === 0 ? [] : filas(pool.query(
      `SELECT vp.vacuna_codigo, vp.dosis_codigo, vp.mes, vp.municipio_procedencia_id AS municipio_id,
              dd.dimension_codigo, dd.valor_codigo, SUM(vp.cantidad) AS dosis
         ${PRODUCCION_ATRIBUIDA}
         JOIN detalle_dimension dd ON dd.detalle_id = vp.detalle_id AND dd.dimension_codigo IN (?)
        WHERE ${CONDICIONES_ATRIBUIDA}
        GROUP BY vp.vacuna_codigo, vp.dosis_codigo, vp.mes, vp.municipio_procedencia_id, dd.dimension_codigo,
                 dd.valor_codigo`,
      [dimensiones, ...base, vacunas],
    )),
    varias: varias.map(([version, dosis]) => {
      const { vacuna } = aplicaDe(version);
      const condiciones = [];
      const parametros = [...base, [vacuna], dosis ?? ''];
      for (const [dimension, valores] of Object.entries(filtrosDe(version))) {
        condiciones.push(
          'AND EXISTS (SELECT 1 FROM detalle_dimension dd WHERE dd.detalle_id = vp.detalle_id AND dd.dimension_codigo = ? AND dd.valor_codigo IN (?))',
        );
        parametros.push(dimension, valores);
      }
      return filas(pool.query(
        `SELECT vp.mes, vp.municipio_procedencia_id AS municipio_id, SUM(vp.cantidad) AS dosis
           ${PRODUCCION_ATRIBUIDA}
          WHERE ${CONDICIONES_ATRIBUIDA} AND vp.dosis_codigo = ? ${condiciones.join(' ')}
          GROUP BY vp.mes, vp.municipio_procedencia_id`,
        parametros,
      )).then((resultado) => {
        const porMes = new Map();
        for (const f of resultado) sumar(porMes, Number(f.mes), f.municipio_id, f.dosis);
        return [llaveVarias(version, dosis), porMes];
      });
    }),
  };
}

// Todo lo que la corrida necesita leer, en paralelo. mesesCerrados y mesesSinCerrar: los meses de enero al corte con
// y sin CERRADO al empezar, en orden.
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
  for (const f of totales) sumarEnMes(totalPorDosis, llave(f.vacuna_codigo, f.dosis_codigo), f.mes, f.municipio_id, f.dosis);
  const porValorDeDosis = new Map();
  for (const f of porValor) {
    sumarEnMes(
      porValorDeDosis, llave(f.vacuna_codigo, f.dosis_codigo, f.dimension_codigo, f.valor_codigo), f.mes, f.municipio_id,
      f.dosis,
    );
  }
  const cerradosSet = new Set(cerrados.map((f) => Number(f.mes)));
  const meses = Array.from({ length: mesHasta }, (_, i) => i + 1);
  return {
    vacunaPorCodigo: new Map(vacunasDb.map((v) => [v.codigo, v.id])),
    dosisPorLlave: new Map(dosisDb.map((d) => [llave(d.vacuna, d.codigo), d.id])),
    clasificacionPorCodigo: new Map(clasificaciones.map((c) => [c.codigo, c.id])),
    municipios: municipios.map((m) => m.id),
    poblacionPorClasificacion,
    totalPorDosis,
    porValorDeDosis,
    deVarias: new Map(varias),
    mesesCerrados: meses.filter((mes) => cerradosSet.has(mes)),
    mesesSinCerrar: meses.filter((mes) => !cerradosSet.has(mes)),
  };
}

// Las dosis por municipio de una dosis del indicador, con su filtro de dimensiones, de los meses pedidos (todos los
// leídos, de enero al corte, con null).
function dosisPorMunicipio(version, dosis, datos, meses = null) {
  const { vacuna } = aplicaDe(version);
  const filtros = Object.entries(filtrosDe(version));
  if (filtros.length === 0) return sumarMeses(datos.totalPorDosis.get(llave(vacuna, dosis)), meses);
  if (filtros.length > 1) return sumarMeses(datos.deVarias.get(llaveVarias(version, dosis)), meses);
  const [[dimension, valores]] = filtros;
  const suma = new Map();
  for (const valor of new Set(valores)) {
    for (const [municipioId, cantidad] of sumarMeses(datos.porValorDeDosis.get(llave(vacuna, dosis, dimension, valor)), meses)) {
      suma.set(municipioId, (suma.get(municipioId) ?? 0) + cantidad);
    }
  }
  return suma;
}

// Los ids de MySQL de la vacuna, la dosis y el grupo de población del indicador, o el motivo para omitirlo. En los
// de dos dosis, dosisId es la final (la que guarda resultado_indicador) y no hay grupo de población.
function referenciasDe(version, datos) {
  const { vacuna, clasificacion_poblacion: clasificacion } = aplicaDe(version);
  const vacunaId = datos.vacunaPorCodigo.get(vacuna);
  if (!vacunaId) return { omitido: `La vacuna ${vacuna} no existe.` };
  const dosisIds = [];
  for (const dosis of dosisDe(version)) {
    if (!dosis) return { omitido: 'El indicador no tiene dosis.' };
    const dosisId = datos.dosisPorLlave.get(llave(vacuna, dosis));
    if (!dosisId) return { omitido: `La dosis ${dosis} no existe en ${vacuna}.` };
    dosisIds.push(dosisId);
  }
  const dosisId = dosisIds.at(-1);
  if (esDeDosDosis(version)) return { vacunaId, dosisId };
  const clasificacionId = datos.clasificacionPorCodigo.get(clasificacion);
  if (!clasificacionId) return { omitido: `El grupo de población ${clasificacion} no existe.` };
  return { vacunaId, dosisId, clasificacionId };
}

// La base de una proyección y sus referencias, o el motivo para omitirla. motivosOmitidos: los de los indicadores
// que ya se omitieron en la corrida, por código.
function baseDeProyeccion(version, versiones, motivosOmitidos, datos) {
  const { indicador_base: codigoBase, metodo, horizonte, meses_ventana: ventana } = version.parametros ?? {};
  const base = versiones.find((v) => v.codigo === codigoBase);
  if (!base) return { omitido: motivosProyeccion.baseNoAplica(codigoBase) };
  if (!TIPOS_BASE_PROYECCION.includes(base.tipo_calculo)) return { omitido: motivosProyeccion.baseDeOtroTipo(codigoBase) };
  if (motivosOmitidos.has(base.codigo)) return { omitido: motivosOmitidos.get(base.codigo) };
  if (metodo !== 'PROMEDIO_MOVIL' || horizonte !== 'FIN_DE_ANIO') return { omitido: motivosProyeccion.metodo(metodo, horizonte) };
  const mesesVentana = Number(ventana);
  if (!Number.isInteger(mesesVentana) || mesesVentana < 1 || mesesVentana > 12) return { omitido: motivosProyeccion.ventana };
  const referencias = referenciasDe(base, datos);
  if (referencias.omitido) return referencias;
  return { base, mesesVentana, referencias };
}

// Las filas de resultado_indicador de todos los indicadores, y los que se omitieron con su motivo. Es puro: recibe lo
// que leyó leerDatos. Las proyecciones van al final porque usan lo que se resolvió de su indicador base.
export function calcularIndicadores({ mesHasta, versiones, datos }) {
  const filasResultado = [];
  const calculados = [];
  const omitidos = [];
  const motivosOmitidos = new Map();
  const omitir = (codigo, motivo) => {
    omitidos.push({ codigo, motivo });
    motivosOmitidos.set(codigo, motivo);
  };
  const guardar = (version, resultado, referencias, filtro) => {
    const numeroVersion = Number(version.version);
    for (const fila of resultado) filasResultado.push({ ...fila, codigo: version.codigo, version: numeroVersion, ...referencias, filtro });
    calculados.push({ codigo: version.codigo, version: numeroVersion });
  };
  const proyecciones = versiones.filter((v) => v.tipo_calculo === 'PROYECCION');

  for (const version of versiones.filter((v) => v.tipo_calculo !== 'PROYECCION')) {
    const calcular = CALCULADORES[version.tipo_calculo];
    if (!calcular) {
      omitir(version.codigo, SIN_CALCULO);
      continue;
    }
    const referencias = referenciasDe(version, datos);
    if (referencias.omitido) {
      omitir(version.codigo, referencias.omitido);
      continue;
    }
    const dosis = dosisDe(version);
    const resultado = calcular(esDeDosDosis(version)
      ? {
        version,
        municipios: datos.municipios,
        iniciales: dosisPorMunicipio(version, dosis[0], datos),
        finales: dosisPorMunicipio(version, dosis[1], datos),
      }
      : {
        version,
        mesHasta,
        municipios: datos.municipios,
        numeradores: dosisPorMunicipio(version, dosis[0], datos),
        poblaciones: datos.poblacionPorClasificacion.get(referencias.clasificacionId) ?? new Map(),
      });
    guardar(version, resultado, referencias, filtroCanonico(filtrosDe(version)));
  }

  for (const version of proyecciones) {
    const resuelta = baseDeProyeccion(version, versiones, motivosOmitidos, datos);
    if (resuelta.omitido) {
      omitir(version.codigo, resuelta.omitido);
      continue;
    }
    const { base, mesesVentana, referencias } = resuelta;
    const [dosis] = dosisDe(base);
    const mesesUsados = datos.mesesCerrados.slice(-mesesVentana);
    const resultado = CALCULADORES.PROYECCION({
      version,
      mesHasta,
      municipios: datos.municipios,
      acumulados: dosisPorMunicipio(base, dosis, datos),
      enVentana: dosisPorMunicipio(base, dosis, datos, mesesUsados),
      mesesEnVentana: mesesUsados.length,
      poblaciones: datos.poblacionPorClasificacion.get(referencias.clasificacionId) ?? new Map(),
    });
    guardar(version, resultado, referencias, filtroCanonico(filtrosDe(base)));
  }
  return { filas: filasResultado, calculados, omitidos };
}
