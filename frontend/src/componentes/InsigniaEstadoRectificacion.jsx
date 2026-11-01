import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Los estados de solicitud_rectificacion (01).
export const ESTADOS_RECTIFICACION = {
  PENDIENTE: { titulo: 'Pendiente', clases: 'bg-advertencia text-advertencia-foreground' },
  AUTORIZADA: { titulo: 'Autorizada', clases: 'bg-estado-revision text-estado-revision-foreground' },
  RECHAZADA: { titulo: 'Rechazada', clases: 'bg-estado-correccion text-estado-correccion-foreground' },
  APLICADA: { titulo: 'Aplicada', clases: 'bg-exito text-exito-foreground' },
}

export default function InsigniaEstadoRectificacion({ estado, className }) {
  const { titulo, clases } = ESTADOS_RECTIFICACION[estado] ?? { titulo: estado, clases: '' }
  return (
    <Badge className={cn('gap-1.5', clases, className)}>
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current opacity-70" />
      {titulo}
    </Badge>
  )
}
