import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export const CLASES_COLOR = {
  verde: 'border-transparent bg-exito text-exito-foreground',
  amarillo: 'border-transparent bg-advertencia text-advertencia-foreground',
  rojo: 'border-transparent bg-destructive/10 text-destructive',
}

const formatoPorcentaje = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

// El valor de un resultado con el color de su semáforo.
export default function InsigniaValor({ resultado, className }) {
  if (!resultado.calculable) return <span className="text-muted-foreground">Sin población</span>
  const texto = `${formatoPorcentaje.format(resultado.valor)} %`
  if (!resultado.color) return <span className={cn('font-mono', className)}>{texto}</span>
  return (
    <Badge variant="outline" className={cn('font-mono', CLASES_COLOR[resultado.color], className)}>
      {texto}
    </Badge>
  )
}
