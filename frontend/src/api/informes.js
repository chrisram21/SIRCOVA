import { solicitar } from './cliente.js'
import { conConsulta } from './indicadores.js'

// SPEC 62: los informes de producción. Sin caché: los meses se cierran y los reportes cambian.

// Los meses habilitados, las vacunas y los municipios de la DDRISS, para los filtros de «Informes».
export function obtenerOpcionesInformes({ ddrissId } = {}) {
  return solicitar(conConsulta('/informes/opciones', { ddrissId }))
}

// desde y hasta van como AAAA-MM; municipioIds, separados por comas; incluirAprobados solo cuando es true;
// agrupacion, el código de una dimensión (SPEC 63) o nada.
export function obtenerInforme({
  informe, desde, hasta, nivel, vacuna, redId, municipioIds, incluirAprobados, agrupacion, ddrissId,
}) {
  return solicitar(conConsulta('/informes/produccion', {
    informe, desde, hasta, nivel, vacuna, redId,
    municipioIds: municipioIds?.length ? municipioIds.join(',') : undefined,
    incluirAprobados: incluirAprobados ? true : undefined,
    agrupacion: agrupacion || undefined,
    ddrissId,
  }))
}
