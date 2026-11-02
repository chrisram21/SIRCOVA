import InsigniaEstadoReporte, { ESTADOS_REPORTE } from '@/componentes/InsigniaEstadoReporte.jsx'

const FECHA_HORA = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})
const aFechaHoraGuatemala = (iso) => FECHA_HORA.format(new Date(iso)).replace(', ', ' ')

const nombreEstado = (codigo) => ESTADOS_REPORTE[codigo]?.titulo ?? codigo

// La línea de tiempo de GET /reportes/{id}/historial, ya cargada y en el orden de la API.
export default function HistorialEstadosReporte({ cambios }) {
  if (cambios.length === 0) return <p className="text-sm text-muted-foreground">Sin cambios de estado.</p>
  return (
    <ol aria-label="Historial de estados" className="flex flex-col">
      {cambios.map((cambio, i) => (
        <li key={cambio.id} className="relative flex gap-3 pb-4 last:pb-0">
          {i < cambios.length - 1 && (
            <span aria-hidden="true" className="absolute top-3 bottom-0 left-[5px] w-px bg-border" />
          )}
          <span aria-hidden="true" className="relative mt-1.5 size-[11px] shrink-0 rounded-full border-2 border-primary bg-card" />
          <div className="flex min-w-0 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-2">
              <InsigniaEstadoReporte estado={cambio.estadoNuevo} />
              <span className="text-sm text-muted-foreground">
                {cambio.estadoAnterior ? `desde ${nombreEstado(cambio.estadoAnterior)}` : 'Reporte creado'}
              </span>
            </div>
            <p className="text-sm">
              {cambio.usuario.nombre} · <span className="text-muted-foreground">{cambio.usuario.rol.nombre}</span>
            </p>
            <time dateTime={cambio.fecha} className="font-mono text-xs text-muted-foreground">
              {aFechaHoraGuatemala(cambio.fecha)}
            </time>
            {cambio.comentario && (
              <p className="whitespace-pre-line rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                {cambio.comentario}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
