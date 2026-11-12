// Fórmulas del motor de indicadores (SPEC 44): funciones puras, sin acceso a datos. Cada tipo de
// configuracion_indicadores con cálculo tiene su función en CALCULADORES. Un tipo que no está aquí se omite en la
// corrida sin hacerla fallar.

import { DESCENDENTE, TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js';

export const SIN_CALCULO = 'Su cálculo todavía no está disponible.';

const COMPARADORES = {
  '>': (valor, meta) => valor > meta,
  '>=': (valor, meta) => valor >= meta,
  '<': (valor, meta) => valor < meta,
  '<=': (valor, meta) => valor <= meta,
};

function redondear(numero, decimales) {
  const factor = 10 ** decimales;
  return Math.round(numero * factor) / factor;
}

// El redondeo a 6 decimales quita el error de coma flotante antes de subir al entero (0.95 × 1450 = 1377.4999…).
function dosisQueFaltan(meta, denominador, numerador) {
  return Math.max(0, Math.ceil(redondear((meta / 100) * denominador - numerador, 6)));
}

function filaContraMeta(municipioId, numerador, poblacion, { prorrateo, meta, comparador, mesHasta }) {
  if (poblacion == null) {
    return { municipioId, numerador, denominador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null };
  }
  const denominador = prorrateo === 'MENSUAL_LINEAL' ? (poblacion / 12) * mesHasta : poblacion;
  if (denominador === 0) {
    return { municipioId, numerador, denominador: 0, valor: null, meta: null, brechaDosis: null, cumpleMeta: null };
  }
  const valor = redondear((numerador / denominador) * 100, 4);
  return {
    municipioId,
    numerador,
    denominador: redondear(denominador, 2),
    valor,
    meta,
    brechaDosis: dosisQueFaltan(meta, denominador, numerador),
    cumpleMeta: COMPARADORES[comparador](valor, meta),
  };
}

// COBERTURA y AVANCE_META_MES: dosis acumuladas contra la población (prorrateada al mes con MENSUAL_LINEAL).
// numeradores y poblaciones son Map por municipio; una población que falta deja la fila no calculable, y también la
// departamental (municipioId null), que suma los numeradores y las poblaciones de todos los municipios.
function parametrosContraMeta(version, mesHasta) {
  const tipo = TIPOS_INDICADOR[version.tipo_calculo];
  return {
    prorrateo: tipo.prorrateo.editable ? version.denominador?.prorrateo ?? tipo.prorrateo.porDefecto : tipo.prorrateo.fijo,
    meta: tipo.meta.editable ? version.meta?.valor ?? tipo.meta.porDefecto : tipo.meta.fijo,
    comparador: version.meta?.comparador ?? tipo.meta.comparador,
    mesHasta,
  };
}

const parametrosDesercion = (version) => {
  const tipo = TIPOS_INDICADOR[version.tipo_calculo];
  return { meta: version.meta?.valor ?? tipo.meta.porDefecto, comparador: version.meta?.comparador ?? tipo.meta.comparador };
};

export function calcularContraMeta({ version, mesHasta, municipios, numeradores, poblaciones }) {
  const parametros = parametrosContraMeta(version, mesHasta);

  let numeradorTotal = 0;
  let poblacionTotal = 0;
  let faltaPoblacion = false;
  const filas = municipios.map((municipioId) => {
    const numerador = numeradores.get(municipioId) ?? 0;
    const poblacion = poblaciones.get(municipioId) ?? null;
    numeradorTotal += numerador;
    if (poblacion == null) faltaPoblacion = true;
    else poblacionTotal += poblacion;
    return filaContraMeta(municipioId, numerador, poblacion, parametros);
  });
  const departamental = filaContraMeta(null, numeradorTotal, faltaPoblacion ? null : poblacionTotal, parametros);
  return [departamental, ...filas];
}

function filaDesercion(municipioId, inicial, final, { meta, comparador }) {
  const perdida = inicial - final;
  if (inicial === 0) {
    return { municipioId, numerador: perdida, denominador: 0, valor: null, meta: null, brechaDosis: null, cumpleMeta: null };
  }
  const valor = redondear((perdida / inicial) * 100, 4);
  return {
    municipioId,
    numerador: perdida,
    denominador: inicial,
    valor,
    meta,
    brechaDosis: null,
    cumpleMeta: COMPARADORES[comparador](valor, meta),
  };
}

// DESERCION (SPEC 46), como la semilla: numerador = inicial − final (negativo si hubo más finales), denominador =
// inicial. No usa población: solo deja de calcularse sin dosis iniciales. iniciales y finales son Map por municipio.
export function calcularDesercion({ version, municipios, iniciales, finales }) {
  const parametros = parametrosDesercion(version);
  let inicialTotal = 0;
  let finalTotal = 0;
  const filas = municipios.map((municipioId) => {
    const inicial = iniciales.get(municipioId) ?? 0;
    const final = finales.get(municipioId) ?? 0;
    inicialTotal += inicial;
    finalTotal += final;
    return filaDesercion(municipioId, inicial, final, parametros);
  });
  return [filaDesercion(null, inicialTotal, finalTotal, parametros), ...filas];
}

// PROYECCION (SPEC 47): dosis proyectadas a diciembre = acumulado + ritmo × (12 − mes de corte), con ritmo = dosis de
// la ventana ÷ meses de la ventana (los últimos meses cerrados), contra la población anual y la meta de la proyección.
// acumulados, enVentana y poblaciones son Map por municipio; mesesEnVentana, cuántos meses cerrados se usaron. Sin
// ninguno, las filas solo llevan la población. La departamental suma las proyecciones y las poblaciones.
export function calcularProyeccion({ version, mesHasta, municipios, acumulados, enVentana, mesesEnVentana, poblaciones }) {
  const tipo = TIPOS_INDICADOR[version.tipo_calculo];
  const parametros = {
    prorrateo: 'NINGUNO',
    meta: version.meta?.valor ?? tipo.meta.porDefecto,
    comparador: version.meta?.comparador ?? tipo.meta.comparador,
    mesHasta,
  };
  const fila = (municipioId, proyectadas, poblacion) => {
    if (mesesEnVentana === 0) {
      return {
        municipioId, numerador: null, denominador: poblacion, valor: null, meta: null, brechaDosis: null,
        cumpleMeta: null, esProyeccion: true,
      };
    }
    const calculada = filaContraMeta(municipioId, proyectadas, poblacion, parametros);
    return { ...calculada, numerador: redondear(proyectadas, 2), esProyeccion: true };
  };

  let proyectadasTotal = 0;
  let poblacionTotal = 0;
  let faltaPoblacion = false;
  const filas = municipios.map((municipioId) => {
    const ritmo = mesesEnVentana === 0 ? 0 : (enVentana.get(municipioId) ?? 0) / mesesEnVentana;
    const proyectadas = (acumulados.get(municipioId) ?? 0) + ritmo * (12 - mesHasta);
    const poblacion = poblaciones.get(municipioId) ?? null;
    proyectadasTotal += proyectadas;
    if (poblacion == null) faltaPoblacion = true;
    else poblacionTotal += poblacion;
    return fila(municipioId, proyectadas, poblacion);
  });
  return [fila(null, proyectadasTotal, faltaPoblacion ? null : poblacionTotal), ...filas];
}

// BRECHA (SPEC 45) usa las mismas fórmulas, con el prorrateo y la meta de su versión: valor en porcentaje y
// brecha_dosis en dosis, como la semilla.
export const CALCULADORES = {
  COBERTURA: calcularContraMeta,
  AVANCE_META_MES: calcularContraMeta,
  BRECHA: calcularContraMeta,
  DESERCION: calcularDesercion,
  PROYECCION: calcularProyeccion,
};

// SPEC 60: la fila «Total de la red» se arma al leer, con las filas guardadas de los municipios de la red, como la
// departamental: suma de numeradores y de denominadores (ya prorrateados, así que no se vuelven a prorratear) o, en
// DESERCION, de las pérdidas y de las dosis iniciales. Un municipio sin denominador deja la fila no calculable.
// Devuelve { numerador, denominador, valor, meta, brechaDosis, cumpleMeta }, o null si el tipo no tiene total de red.
export const TIPOS_CON_TOTAL_DE_RED = ['COBERTURA', 'AVANCE_META_MES', 'BRECHA', 'DESERCION'];

export function calcularTotalDeRed(version, municipales) {
  if (!TIPOS_CON_TOTAL_DE_RED.includes(version?.tipo_calculo)) return null;
  const suma = (campo) => municipales.reduce((total, fila) => total + (fila[campo] ?? 0), 0);
  const { municipioId, ...fila } = version.tipo_calculo === 'DESERCION'
    ? filaDesercion(null, suma('denominador'), suma('denominador') - suma('numerador'), parametrosDesercion(version))
    : filaContraMeta(
      null,
      suma('numerador'),
      municipales.some((f) => f.denominador == null) ? null : suma('denominador'),
      { ...parametrosContraMeta(version, 12), prorrateo: 'NINGUNO' },
    );
  return fila;
}

// La meta en dosis y el excedente de una fila guardada, que no se guardan (SPEC 45). El denominador guardado va
// redondeado a 2 decimales y la brecha se calculó sin redondear, así que, para que siempre se cumpla
// metaDosis − numerador = brechaDosis − excedenteDosis, la meta sale de la brecha cuando falta algo y, si no,
// no pasa del numerador. Sin meta o sin denominador (fila no calculable), los dos son null.
export function metaYExcedente({ numerador, denominador, meta, brechaDosis }) {
  if (meta == null || denominador == null || brechaDosis == null) return { metaDosis: null, excedenteDosis: null };
  const metaDosis = brechaDosis > 0
    ? numerador + brechaDosis
    : Math.min(numerador, Math.ceil(redondear((meta / 100) * denominador, 6)));
  return { metaDosis, excedenteDosis: numerador - metaDosis + brechaDosis };
}

// Una cobertura mayor al 100 % pide revisar la población (denominador) o los registros (HU-44, SPEC 52). Compara el
// valor guardado, con o sin prorrateo; la proyección es una estimación y no se marca.
export const TIPOS_CON_TOPE = ['COBERTURA', 'AVANCE_META_MES', 'BRECHA'];
export const mayorACien = ({ tipoCalculo, valor, esProyeccion }) =>
  !esProyeccion && TIPOS_CON_TOPE.includes(tipoCalculo) && valor != null && valor > 100;

// Lo que falta en los municipios de un indicador, sin que los que pasaron la meta compensen a los demás. Un
// municipio con población 0 (brecha null) no tiene meta y no suma. null si la departamental no es calculable.
export function sumaBrechasMunicipales(departamental, municipales) {
  if (departamental.brechaDosis == null) return null;
  return municipales.reduce((suma, fila) => suma + (fila.brechaDosis ?? 0), 0);
}

// filtros_dimension → texto canónico de resultado_indicador.filtro_dimensiones, como clave_combinacion: dimensiones
// ordenadas por código y separadas por «|»; varios valores de una dimensión, ordenados y separados por «,».
export function filtroCanonico(filtros) {
  return Object.keys(filtros ?? {})
    .filter((dimension) => Array.isArray(filtros[dimension]) && filtros[dimension].length > 0)
    .sort()
    .map((dimension) => `${dimension}=${[...filtros[dimension]].sort().join(',')}`)
    .join('|');
}

// Franja del semáforo de un valor. Ascendente: desde ≤ valor < hasta; descendente (DESERCION): desde < valor ≤ hasta.
// null en un límite es abierto. Sin umbrales o sin valor, null.
export function colorDelValor(umbrales, valor, tipoCalculo) {
  if (valor == null || !Array.isArray(umbrales) || umbrales.length === 0) return null;
  const descendente = TIPOS_INDICADOR[tipoCalculo]?.semaforo === DESCENDENTE;
  const franja = umbrales.find(({ desde = null, hasta = null }) => (descendente
    ? (desde == null || valor > desde) && (hasta == null || valor <= hasta)
    : (desde == null || valor >= desde) && (hasta == null || valor < hasta)));
  return franja?.color ?? null;
}

// SPEC 60: lo esperado de una cobertura contra la población anual (prorrateo NINGUNO) avanza 100 ÷ 12 por mes.
export const esperadoDelMes = (mes) => redondear((100 / 12) * mes, 2);

// Color de una cobertura anual: los cortes del indicador se aplican al cumplimiento (valor ÷ esperado del mes × 100),
// no al valor. Sin valor, sin umbrales o sin mes, null.
export function colorContraEsperado(umbrales, valor, mes) {
  if (valor == null || !mes) return null;
  return colorDelValor(umbrales, (valor / ((100 / 12) * mes)) * 100, 'COBERTURA');
}
