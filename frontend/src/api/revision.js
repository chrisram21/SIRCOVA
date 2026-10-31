import { solicitar } from './cliente.js'

// SPEC 34: la única vía para cambiar el estado del reporte; responde el reporte como GET /reportes/{id}. Un 422
// REPORTE_CON_ERRORES trae la validación en `err.datos.validacion`.
export function cambiarEstadoReporte(reporteId, { estadoDestino, versionFila }) {
  return solicitar(`/reportes/${reporteId}/transiciones`, { metodo: 'POST', cuerpo: { estadoDestino, versionFila } })
}
