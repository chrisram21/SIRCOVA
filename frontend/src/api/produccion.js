import { solicitar } from './cliente.js'

// El Personal de establecimiento solo ve los reportes de su establecimiento; la API los filtra.
export function listarReportes({ periodoId, anio, estado, pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries({ periodoId, anio, estado, pagina, porPagina })) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  const texto = consulta.toString()
  return solicitar(texto ? `/reportes?${texto}` : '/reportes')
}

// Trae las vacunas con la versión del esquema fijada al crear el reporte, y sus dosis y dimensiones con etiquetas.
export function obtenerReporte(id) {
  return solicitar(`/reportes/${id}`)
}

// El establecimiento sale de la cuenta: solo se manda el mes.
export function crearReporte(periodoId) {
  return solicitar('/reportes', { metodo: 'POST', cuerpo: { periodoId } })
}

// El esquema de cada vacuna del reporte, con sus celdas guardadas (de cualquier procedencia) y sus datos adicionales.
export function obtenerFormulario(id) {
  return solicitar(`/reportes/${id}/formulario`)
}

// Reemplaza las celdas del municipio propio de una vacuna; cuerpo: { versionFila, celdas, datosAdicionales }.
export function guardarVacuna(reporteId, vacunaId, cuerpo) {
  return solicitar(`/reportes/${reporteId}/vacunas/${vacunaId}`, { metodo: 'PUT', cuerpo })
}
