import { descargar, solicitar } from './cliente.js'

// SPEC 70 (HU-54). filtros: { desde, hasta, usuarioId, modulo, accion, entidad, entidadId }, con entidad como texto
// (una o varias separadas por coma). Los vacíos no se mandan.
function rutaDe(ruta, filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  const texto = consulta.toString()
  return texto ? `${ruta}?${texto}` : ruta
}

// { elementos, total, pagina, porPagina, resumen: { usuarios, rectificaciones, accesosFallidos } }
export function listarBitacora({ pagina, porPagina, ...filtros } = {}) {
  return solicitar(rutaDe('/auditoria/bitacora', { ...filtros, pagina, porPagina }))
}

// { usuarios, modulos, acciones, entidades }
export function obtenerOpcionesBitacora() {
  return solicitar('/auditoria/bitacora/opciones')
}

// El mismo resultado como .xlsx; devuelve { blob, nombre }. Con más de 10,000 filas, 422 DEMASIADAS_FILAS.
export function descargarBitacoraExcel(filtros = {}) {
  return descargar(rutaDe('/auditoria/bitacora/excel', filtros))
}
