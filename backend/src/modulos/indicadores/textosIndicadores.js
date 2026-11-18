import { NOMBRES_MES } from '../produccion/validacion.service.js';
import { TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js';
import { fechaDeGeneracion } from '../informes/textosInforme.js';

// SPEC 72 (HU-64): los textos del Excel de «Indicadores». Repiten los de frontend/src/paginas/indicadores/
// (PaginaIndicadores.jsx, MarcaMayorACien.jsx, DialogoCalcularIndicadores.jsx, TablaBrecha.jsx, TablaDesercion.jsx,
// TablaProyeccion.jsx, TablaRed.jsx, PestanaProduccion.jsx y produccion.js): un cambio va en los dos lados.

export const NOMBRES_VISTA = {
  avance: 'Avance',
  brecha: 'Brecha',
  cobertura: 'Cobertura',
  desercion: 'Deserción',
  proyeccion: 'Proyección',
  redes: 'Redes',
  produccion: 'Producción',
};

export const TEXTO_MAYOR_A_CIEN = 'Mayor al 100 %: revise la población (denominador) o los registros.';
export const TEXTO_DESERCION_NEGATIVA = 'Una deserción negativa indica que en el año se aplicaron más dosis finales '
  + 'que iniciales: esquemas empezados el año anterior o niños que llegaron de otro municipio. Conviene revisar el '
  + 'registro.';
export const NO_SUMA = ' (no suma en el consolidado)';

// Los colores de las insignias de las tablas (CLASES_COLOR de InsigniaValor.jsx), con los hex de
// frontend/src/index.css: verde = --exito, amarillo = --advertencia, rojo = --destructive al 10 % sobre blanco.
// Un cambio del tema va en los dos lados.
export const COLORES = {
  verde: { fondo: '#e3f3e8', texto: '#1e5b34' },
  amarillo: { fondo: '#fff5dd', texto: '#7a4a06' },
  rojo: { fondo: '#f8ebeb', texto: '#b73a3a' },
  estimada: { fondo: '#f0f4f8', texto: null },
};

const SIMBOLOS = { '<=': '≤', '<': '<', '>=': '≥', '>': '>' };
export const simboloDeMeta = (tipo) => SIMBOLOS[TIPOS_INDICADOR[tipo].meta.comparador];

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 });
const formatoPorcentaje = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const formatoPorMes = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 });

const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const enumerar = (textos) => (textos.length === 1 ? textos[0] : `${textos.slice(0, -1).join(', ')} y ${textos.at(-1)}`);
const nombreDelMes = (mes) => NOMBRES_MES[mes - 1];

export function tituloDeLaVista(vista, { vacunaNombre, red }) {
  if (vista === 'redes') return `Cobertura de la ${red.nombre}`;
  return `${NOMBRES_VISTA[vista]} de ${vacunaNombre}`;
}

export const tituloDeProduccion = (vacuna) =>
  (vacuna ? `Producción de ${vacuna.nombre}` : 'Producción de todas las vacunas');

// avisoDeMesesSinCerrar de DialogoCalcularIndicadores.jsx, con «Cálculo parcial.» delante como en TarjetaCorrida.
export function avisoDeCorridaParcial(meses) {
  if (meses.length === 0) return null;
  const verbo = meses.length === 1 ? 'no está cerrado' : 'no están cerrados';
  return `Cálculo parcial. ${conMayuscula(enumerar(meses.map(nombreDelMes)))} ${verbo}: solo se cuentan los reportes `
    + 'ya cerrados.';
}

// textoDelAviso de MarcaMayorACien.jsx: el total primero y luego los municipios por nombre.
export function avisoMayorACien(filas, nombreDe) {
  const marcadas = filas.filter((r) => r.mayorACien);
  if (marcadas.length === 0) return null;
  const ordenadas = [
    ...marcadas.filter((r) => r.municipio === null),
    ...marcadas.filter((r) => r.municipio !== null).sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es')),
  ];
  const cuantos = marcadas.filter((r) => r.municipio !== null).length;
  const sujeto = cuantos === marcadas.length
    ? `${cuantos} ${cuantos === 1 ? 'municipio' : 'municipios'} con cobertura mayor al 100 %`
    : 'Cobertura mayor al 100 %';
  return `${sujeto}: ${ordenadas.map(nombreDe).join(', ')}. Revise la población (denominador) o los registros.`;
}

export const textoSumaDeBrechas = (suma) => `Suma de lo que falta en los municipios: ${formatoEntero.format(suma)} `
  + 'dosis. Los municipios que pasaron la meta no compensan a los demás.';

// notaDelMetodo de TablaProyeccion.jsx.
export function notaDelMetodo({ mes, mesesVentana, mesesUsados }) {
  const estimacion = 'Es una estimación, no un dato registrado.';
  if (mes === 12) {
    return 'Con corte a diciembre ya no quedan meses por estimar: la proyección es el dato real del año.';
  }
  if (mesesUsados.length === 0) {
    return `No hay meses cerrados de enero a ${nombreDelMes(mes)}, así que todavía no hay ritmo para proyectar. `
      + estimacion;
  }
  const ventana = mesesVentana === 1 ? 'del último mes cerrado' : `de los últimos ${mesesVentana} meses cerrados`;
  const usados = mesesUsados.length;
  const pocos = usados < mesesVentana
    ? ` Solo hay ${usados === 1 ? '1 mes cerrado' : `${usados} meses cerrados`}, así que el promedio usa `
      + `${usados === 1 ? 'ese' : 'esos'}.`
    : '';
  const meses = enumerar(mesesUsados.map(nombreDelMes));
  return `La proyección suma a las dosis acumuladas el promedio ${ventana} (${meses}) `
    + `por cada mes que falta hasta diciembre.${pocos} ${estimacion}`;
}

// Proyección sin valor (motivoNoCalculable de TablaProyeccion.jsx).
export function motivoNoCalculable(resultado) {
  if (resultado.calculable) return null;
  if (!resultado.proyeccion || resultado.proyeccion.mesesUsados.length === 0) return 'Sin meses cerrados';
  return 'Sin población';
}

export const avisoSinCoberturaAnual = (faltan) => `Sin indicador de cobertura anual para: ${faltan.join(', ')}. `
  + 'Se configuran en Administración · Indicadores.';

export const textoEsperado = (esperado, mes) => `Lo esperado a ${nombreDelMes(mes)} es `
  + `${formatoPorcentaje.format(esperado)} % de la población anual (${formatoPorMes.format(100 / 12)} % por mes).`;

// textoPreliminar de produccion.js: los meses del rango son de un año.
export function avisoPreliminarDeProduccion(mesesSinCerrar) {
  if (mesesSinCerrar.length === 0) return null;
  const meses = `${enumerar(mesesSinCerrar.map((m) => nombreDelMes(m.mes)))} de ${mesesSinCerrar[0].anio}`;
  const verbo = mesesSinCerrar.length === 1 ? 'todavía no está cerrado' : 'todavía no están cerrados';
  return `Datos preliminares: ${meses} ${verbo}.`;
}

export const textoFueraDelConsolidado = (dosis) =>
  `Además, ${formatoEntero.format(dosis)} dosis de establecimientos que no suman en el consolidado.`;

export const textoMesDeCorte = (anio, mes) => `${conMayuscula(nombreDelMes(mes))} de ${anio}`;

export function textoPeriodoDeProduccion({ anio, mes, acumulado }) {
  if (!acumulado || mes === 1) return textoMesDeCorte(anio, mes);
  return `De enero a ${nombreDelMes(mes)} de ${anio}`;
}

// territorio: { red: { nombre } | null, distrito: { nombre } | null, municipios: [nombres] }. La red manda; los
// municipios elegidos están dentro del distrito, así que lo nombran mejor. Los nombres ya dicen «Red No. 1» o
// «Distrito de Salud Ayutla»: no llevan prefijo.
export function textoTerritorio({ red = null, distrito = null, municipios = [] }) {
  if (red) return red.nombre;
  if (municipios.length) return municipios.join(', ');
  if (distrito) return distrito.nombre;
  return 'Todos los municipios';
}

/**
 * Las líneas [etiqueta, valor] del encabezado de una pestaña de indicadores, después del título y de «PRELIMINAR».
 * datos: { ddriss, territorio, generadoPor, generadoEn (Date) }; avisos: los textos que muestra la pantalla.
 */
export function lineasDelEncabezado({ corrida, indicador }, datos, avisos) {
  return [
    ['DDRISS', datos.ddriss],
    ['Mes de corte', textoMesDeCorte(corrida.anio, corrida.mesHasta)],
    ...(indicador ? [['Indicador', `${indicador.nombre ?? indicador.codigo} (${indicador.codigo})`]] : []),
    ['Territorio', textoTerritorio(datos.territorio)],
    ['Generado', `${fechaDeGeneracion(datos.generadoEn)} por ${datos.generadoPor}`],
    ...[avisoDeCorridaParcial(corrida.parcial ? corrida.mesesSinCerrar : []), ...avisos]
      .filter(Boolean).map((aviso) => ['Aviso', aviso]),
  ];
}

/** Las de la pestaña «Producción». datos: los mismos, más establecimientos (nombres). */
export function lineasDeProduccion(produccion, datos) {
  return [
    ['DDRISS', datos.ddriss],
    ['Periodo', textoPeriodoDeProduccion(produccion)],
    ['Vacuna', produccion.vacuna?.nombre ?? 'Todas las vacunas'],
    ['Territorio', textoTerritorio(datos.territorio)],
    ...(datos.establecimientos?.length ? [['Establecimiento', datos.establecimientos.join(', ')]] : []),
    ['Generado', `${fechaDeGeneracion(datos.generadoEn)} por ${datos.generadoPor}`],
    ...[avisoPreliminarDeProduccion(produccion.mesesSinCerrar)].filter(Boolean).map((aviso) => ['Aviso', aviso]),
  ];
}
