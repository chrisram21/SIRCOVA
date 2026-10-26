import { solicitar } from './cliente.js'

// El Personal de establecimiento solo ve los reportes de su establecimiento; la API los filtra.
export function listarReportes({ periodoId, estado, pagina, porPagina } = {}) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries({ periodoId, estado, pagina, porPagina })) {
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
