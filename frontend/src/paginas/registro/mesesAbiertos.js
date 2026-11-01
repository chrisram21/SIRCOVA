import { listarPeriodos } from '@/api/catalogos.js'
import { listarReportes } from '@/api/produccion.js'
import { porFecha } from '@/lib/fechas.js'

// Con el mes en cierre ya no se crean reportes, pero el que existe sigue su ciclo (SPEC 39): estos aún se trabajan.
export const EDITABLES_EN_CIERRE = ['BORRADOR', 'CORRECCION_SOLICITADA']

// Los meses abiertos y los en cierre donde el establecimiento tiene un reporte que todavía trabaja, del más antiguo
// al más reciente, y el reporte de cada uno (periodoId → resumen o null).
export async function cargarMesesAbiertos() {
  const todos = await listarPeriodos()
  const candidatos = todos.filter((p) => p.estado === 'ABIERTO' || p.estado === 'EN_CIERRE').sort(porFecha)
  const paginas = await Promise.all(candidatos.map((p) => listarReportes({ periodoId: p.id })))
  const reportes = new Map(candidatos.map((p, i) => [p.id, paginas[i].elementos[0] ?? null]))
  const periodos = candidatos.filter(
    (p) => p.estado === 'ABIERTO' || EDITABLES_EN_CIERRE.includes(reportes.get(p.id)?.estado),
  )
  for (const p of candidatos) if (!periodos.includes(p)) reportes.delete(p.id)
  return { periodos, reportes }
}

// El más antiguo sin reporte o con el reporte en borrador; si todos se enviaron, el más reciente.
export function mesPendiente(periodos, reportes) {
  const pendiente = periodos.find((p) => !reportes.get(p.id) || reportes.get(p.id).estado === 'BORRADOR')
  return pendiente ?? periodos.at(-1)
}
