import { solicitar } from './cliente.js'

// Las alertas del rol del usuario en su ámbito, por severidad y de la más reciente a la más antigua (SPEC 69):
// { elementos, total, pagina, porPagina, activas: { total, porSeveridad } }. Sin `estado`, solo las activas;
// `activas` cuenta todas las activas sin filtros.
export function listarAlertas({ estado, tipo, severidad, pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries({ estado, tipo, severidad, pagina, porPagina })) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  const texto = consulta.toString()
  return solicitar(texto ? `/alertas?${texto}` : '/alertas')
}

// Lo escucha la campana del encabezado para volver a contar las activas.
export const EVENTO_ALERTAS_CAMBIARON = 'sircova:alertas-cambiaron'

// Definitivo: responde 409 si la alerta ya no está activa.
export async function atenderAlerta(id) {
  const alerta = await solicitar(`/alertas/${id}/atender`, { metodo: 'POST' })
  window.dispatchEvent(new Event(EVENTO_ALERTAS_CAMBIARON))
  return alerta
}
