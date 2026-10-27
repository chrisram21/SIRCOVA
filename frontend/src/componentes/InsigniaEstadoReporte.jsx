import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Los nombres son los de estado_reporte.nombre (01).
export const ESTADOS_REPORTE = {
  BORRADOR: { titulo: 'Borrador', clases: 'bg-secondary text-secondary-foreground' },
  ENVIADO: { titulo: 'Enviado', clases: 'bg-accent text-accent-foreground' },
  EN_REVISION: { titulo: 'En revisión', clases: 'bg-accent text-accent-foreground' },
  CORRECCION_SOLICITADA: { titulo: 'Corrección solicitada', clases: 'bg-advertencia text-advertencia-foreground' },
  APROBADO: { titulo: 'Aprobado', clases: 'bg-primary text-primary-foreground' },
  CERRADO: { titulo: 'Cerrado', clases: 'bg-primary text-primary-foreground' },
  RECTIFICACION: { titulo: 'Rectificación', clases: 'bg-advertencia text-advertencia-foreground' },
}

export default function InsigniaEstadoReporte({ estado, className }) {
  const { titulo, clases } = ESTADOS_REPORTE[estado] ?? { titulo: estado, clases: '' }
  return <Badge className={cn(clases, className)}>{titulo}</Badge>
}
