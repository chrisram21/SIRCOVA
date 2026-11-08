import { solicitar } from './cliente.js'

// SPEC 44: corridas del motor de indicadores y sus resultados. Sin caché: cada corrida cambia lo que se ve.

function conConsulta(ruta, filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  const texto = consulta.toString()
  return texto ? `${ruta}?${texto}` : ruta
}

// Calcula en el momento los indicadores de la DDRISS del usuario y responde la corrida ya terminada.
export function calcularIndicadores({ anio, mesHasta }) {
  return solicitar('/indicadores/corridas', { metodo: 'POST', cuerpo: { anio, mesHasta } })
}

// ddrissId solo lo manda la Autoridad nacional.
export function listarCorridas({ anio, mesHasta, ddrissId, pagina, porPagina } = {}) {
  return solicitar(conConsulta('/indicadores/corridas', { anio, mesHasta, ddrissId, pagina, porPagina }))
}

export function obtenerCorrida(id) {
  return solicitar(`/indicadores/corridas/${id}`)
}

// { corrida, resultados } de la corrida vigente del mes; corrida es null si el mes no tiene.
export function listarResultados({ anio, mes, indicador, municipioId, ddrissId } = {}) {
  return solicitar(conConsulta('/indicadores/resultados', { anio, mes, indicador, municipioId, ddrissId }))
}

// SPEC 49: { puntos } con la fila del indicador en la corrida vigente de cada mes del año (sin municipioId, la de la
// DDRISS).
export function obtenerSerie({ anio, indicador, municipioId, ddrissId }) {
  return solicitar(conConsulta('/indicadores/serie', { anio, indicador, municipioId, ddrissId }))
}

// SPEC 51: { anios: [{ anio, meses }] } con corrida vigente de la DDRISS, del año más reciente al más antiguo.
export function obtenerMesesCalculados({ ddrissId } = {}) {
  return solicitar(conConsulta('/indicadores/meses-calculados', { ddrissId }))
}
