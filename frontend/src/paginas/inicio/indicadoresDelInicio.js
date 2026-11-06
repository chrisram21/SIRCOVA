import { listarCorridas, listarResultados } from '@/api/indicadores.js'

// SPEC 48: los datos de indicadores del Inicio (Epidemiología y Autoridad): el último mes con corrida vigente, el
// indicador de avance que «Indicadores» muestra por defecto, la proyección, los municipios en meta y el ranking.

// El mayor mes de corte con una corrida vigente; null si no hay.
export function mesDeCorte(corridas) {
  const meses = corridas.filter((c) => c.vigente && c.estado === 'COMPLETADA').map((c) => c.mesHasta)
  return meses.length === 0 ? null : Math.max(...meses)
}

// La corrida vigente del último mes con corrida del año en curso o, si no tiene, del anterior; null sin ninguna.
export async function cargarIndicadoresDelInicio({ ddrissId, hoy = new Date() } = {}) {
  for (const anio of [hoy.getFullYear(), hoy.getFullYear() - 1]) {
    const { elementos } = await listarCorridas({ anio, ddrissId })
    const mes = mesDeCorte(elementos)
    if (mes === null) continue
    const { corrida, resultados } = await listarResultados({ anio, mes, ddrissId })
    if (corrida) return { anio, mes, corrida, resultados }
  }
  return null
}

// El primer indicador del tipo que la corrida calculó con resultados, con su fila departamental y sus municipios.
export function indicadorDelTipo(datos, tipoCalculo) {
  if (!datos) return null
  const indicador = datos.corrida.indicadores.find(
    (i) => i.tipoCalculo === tipoCalculo && datos.resultados.some((r) => r.indicadorCodigo === i.codigo),
  )
  if (!indicador) return null
  const filas = datos.resultados.filter((r) => r.indicadorCodigo === indicador.codigo)
  return {
    indicador,
    departamental: filas.find((r) => r.municipio === null) ?? null,
    municipios: filas.filter((r) => r.municipio !== null),
  }
}

// Municipios en meta de los calculables, los que tienen brecha y los que no se pudieron calcular.
export function municipiosEnMeta(municipios) {
  const calculables = municipios.filter((r) => r.calculable)
  const enMeta = calculables.filter((r) => r.cumpleMeta).length
  return {
    enMeta,
    total: municipios.length,
    conBrecha: calculables.length - enMeta,
    sinPoblacion: municipios.length - calculables.length,
  }
}

// Los n municipios calculables de menor valor, de menor a mayor; empates por nombre.
export function menorAvance(municipios, n = 5) {
  return municipios
    .filter((r) => r.calculable)
    .sort((a, b) => a.valor - b.valor || a.municipio.nombre.localeCompare(b.municipio.nombre, 'es'))
    .slice(0, n)
}

// Puntos del valor sobre (positivo) o bajo (negativo) la meta; null si la fila no se calculó.
export function puntosContraMeta(fila) {
  if (!fila?.calculable || fila.valor === null || fila.meta === null) return null
  return fila.valor - fila.meta
}
