import { solicitar } from './cliente.js'

// SPEC 40: pide la rectificación de un reporte CERRADO; cambios: [{ vacunaId, dosisCodigo, municipioProcedenciaId,
// dimensiones, cantidadNueva }], solo las celdas que cambian. Responde la solicitud como obtenerRectificacion. Un 409
// RECTIFICACION_PENDIENTE trae el id de la que ya existe en `err.datos.solicitudId`.
export function solicitarRectificacion(reporteId, { motivo, versionFila, cambios }) {
  return solicitar(`/reportes/${reporteId}/rectificaciones`, { metodo: 'POST', cuerpo: { motivo, versionFila, cambios } })
}

// SPEC 57: las solicitudes que ya lleva el establecimiento del reporte en el mes actual de Guatemala, en cualquier
// estado: { anio, mes, cantidad, umbral }.
export function contarRectificacionesDelMes(reporteId) {
  return solicitar(`/reportes/${reporteId}/rectificaciones/conteo-del-mes`)
}

// Las del ámbito del usuario (su establecimiento o su DDRISS), de la más reciente a la más antigua.
export function listarRectificaciones({ estado, pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries({ estado, pagina, porPagina })) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  const texto = consulta.toString()
  return solicitar(texto ? `/rectificaciones?${texto}` : '/rectificaciones')
}

// Con el valor anterior y el nuevo de cada celda; una PENDIENTE trae también `totales`.
export function obtenerRectificacion(id) {
  return solicitar(`/rectificaciones/${id}`)
}

// SPEC 41: aplica los cambios y deja el reporte CERRADO; el comentario es opcional. Responde la solicitud APLICADA.
export function aprobarRectificacion(id, { comentario } = {}) {
  return solicitar(`/rectificaciones/${id}/aprobar`, { metodo: 'POST', cuerpo: comentario ? { comentario } : {} })
}

// El motivo (comentario) es obligatorio; el reporte no cambia. Responde la solicitud RECHAZADA.
export function rechazarRectificacion(id, { comentario }) {
  return solicitar(`/rectificaciones/${id}/rechazar`, { metodo: 'POST', cuerpo: { comentario } })
}
