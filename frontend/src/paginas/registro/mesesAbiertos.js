import { listarPeriodos } from '@/api/catalogos.js'
import { listarReportes } from '@/api/produccion.js'
import { porFecha } from '@/lib/fechas.js'

// Los meses abiertos, del más antiguo al más reciente, y el reporte de cada uno (periodoId → resumen o null).
export async function cargarMesesAbiertos() {
  const abiertos = await listarPeriodos({ estado: 'ABIERTO' })
  const periodos = [...abiertos].sort(porFecha)
  const paginas = await Promise.all(periodos.map((p) => listarReportes({ periodoId: p.id })))
  return { periodos, reportes: new Map(periodos.map((p, i) => [p.id, paginas[i].elementos[0] ?? null])) }
}

// El más antiguo sin reporte o con el reporte en borrador; si todos se enviaron, el más reciente.
export function mesPendiente(periodos, reportes) {
  const pendiente = periodos.find((p) => !reportes.get(p.id) || reportes.get(p.id).estado === 'BORRADOR')
  return pendiente ?? periodos.at(-1)
}
