// Fórmulas del motor de indicadores (SPEC 44): funciones puras, sin acceso a datos. Cada tipo de
// configuracion_indicadores con cálculo tiene su función en CALCULADORES; HU-37 a HU-39 agregan BRECHA, DESERCION y
// PROYECCION. Un tipo que no está aquí se omite en la corrida sin hacerla fallar.

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
export function calcularContraMeta({ version, mesHasta, municipios, numeradores, poblaciones }) {
  const tipo = TIPOS_INDICADOR[version.tipo_calculo];
  const parametros = {
    prorrateo: tipo.prorrateo.editable ? version.denominador?.prorrateo ?? tipo.prorrateo.porDefecto : tipo.prorrateo.fijo,
    meta: tipo.meta.editable ? version.meta?.valor ?? tipo.meta.porDefecto : tipo.meta.fijo,
    comparador: version.meta?.comparador ?? tipo.meta.comparador,
    mesHasta,
  };

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

export const CALCULADORES = {
  COBERTURA: calcularContraMeta,
  AVANCE_META_MES: calcularContraMeta,
};

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
