import { descargar, solicitar } from './cliente.js'
import { conConsulta } from './indicadores.js'

// SPEC 62: los informes de producción. Sin caché: los meses se cierran y los reportes cambian.

// Los meses habilitados, las vacunas y los municipios de la DDRISS, para los filtros de «Informes».
export function obtenerOpcionesInformes({ ddrissId } = {}) {
  return solicitar(conConsulta('/informes/opciones', { ddrissId }))
}

// desde y hasta van como AAAA-MM; municipioIds, separados por comas; incluirAprobados solo cuando es true;
// agrupacion, el código de una dimensión (SPEC 63) o nada.
function rutaDelInforme(ruta, {
  informe, desde, hasta, nivel, vacuna, redId, municipioIds, incluirAprobados, agrupacion, ddrissId,
}) {
  return conConsulta(ruta, {
    informe, desde, hasta, nivel, vacuna, redId,
    municipioIds: municipioIds?.length ? municipioIds.join(',') : undefined,
    incluirAprobados: incluirAprobados ? true : undefined,
    agrupacion: agrupacion || undefined,
    ddrissId,
  })
}

export function obtenerInforme(pedido) {
  return solicitar(rutaDelInforme('/informes/produccion', pedido))
}

// SPEC 64: el mismo informe como libro .xlsx; devuelve { blob, nombre }.
export function descargarInformeExcel(pedido) {
  return descargar(rutaDelInforme('/informes/produccion/excel', pedido))
}

// SPEC 65: el mismo informe como PDF; devuelve { blob, nombre }.
export function descargarInformePdf(pedido) {
  return descargar(rutaDelInforme('/informes/produccion/pdf', pedido))
}
