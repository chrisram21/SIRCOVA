import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Los nombres son los de estado_reporte.nombre (01).
export const ESTADOS_REPORTE = {
  BORRADOR: { titulo: 'Borrador', clases: 'bg-estado-borrador text-estado-borrador-foreground ring-1 ring-border' },
  ENVIADO: { titulo: 'Enviado', clases: 'bg-estado-enviado text-estado-enviado-foreground' },
  EN_REVISION: { titulo: 'En revisión', clases: 'bg-estado-revision text-estado-revision-foreground' },
  CORRECCION_SOLICITADA: { titulo: 'Corrección solicitada', clases: 'bg-estado-correccion text-estado-correccion-foreground' },
  APROBADO: { titulo: 'Aprobado', clases: 'bg-estado-aprobado text-estado-aprobado-foreground' },
  CERRADO: { titulo: 'Cerrado', clases: 'bg-estado-cerrado text-estado-cerrado-foreground' },
  RECTIFICACION: { titulo: 'Rectificación', clases: 'bg-advertencia text-advertencia-foreground' },
}

export default function InsigniaEstadoReporte({ estado, className }) {
  const { titulo, clases } = ESTADOS_REPORTE[estado] ?? { titulo: estado, clases: '' }
  return (
    <Badge className={cn('gap-1.5', clases, className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      {titulo}
    </Badge>
  )
}
