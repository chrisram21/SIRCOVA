import { solicitar } from './cliente.js'

// SPEC 34: la única vía para cambiar el estado del reporte; responde el reporte como GET /reportes/{id}. Un 422
// REPORTE_CON_ERRORES trae la validación en `err.datos.validacion`.
export function cambiarEstadoReporte(reporteId, { estadoDestino, versionFila }) {
  return solicitar(`/reportes/${reporteId}/transiciones`, { metodo: 'POST', cuerpo: { estadoDestino, versionFila } })
}

// SPEC 35: la bandeja de un mes de la DDRISS; responde { elementos, total, pagina, porPagina, conteos }.
export function obtenerBandeja({ periodoId, municipioId, grupo, pagina, porPagina }) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries({ periodoId, municipioId, grupo, pagina, porPagina })) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  return solicitar(`/revision/bandeja?${consulta}`)
}

// Los revisores activos de la DDRISS del usuario: [{ id, nombre }].
export function listarRevisores() {
  return solicitar('/revision/revisores')
}

// Asignar es la transición ENVIADO → EN_REVISION; responde el reporte.
export function asignarRevisor(reporteId, { versionFila, revisorId }) {
  return solicitar(`/reportes/${reporteId}/transiciones`, {
    metodo: 'POST',
    cuerpo: { estadoDestino: 'EN_REVISION', versionFila, revisorId },
  })
}

// Solo el revisor asignado; responde { versionFila, revisor }.
export function reasignarRevisor(reporteId, { versionFila, revisorId }) {
  return solicitar(`/reportes/${reporteId}/revisor`, { metodo: 'PATCH', cuerpo: { versionFila, revisorId } })
}

// SPEC 36: devolver es la transición EN_REVISION → CORRECCION_SOLICITADA, solo del revisor asignado;
// observaciones: [{ vacunaId (null = general), texto }]. Responde el reporte.
export function solicitarCorreccion(reporteId, { versionFila, observaciones }) {
  return solicitar(`/reportes/${reporteId}/transiciones`, {
    metodo: 'POST',
    cuerpo: { estadoDestino: 'CORRECCION_SOLICITADA', versionFila, observaciones },
  })
}
