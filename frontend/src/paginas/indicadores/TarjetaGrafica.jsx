import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'

// SPEC 49: lo común de las gráficas del panel de «Indicadores».

export const COLOR_SEMAFORO = {
  verde: 'var(--semaforo-verde)',
  amarillo: 'var(--semaforo-amarillo)',
  rojo: 'var(--semaforo-rojo)',
}
export const colorDeBarra = (color) => COLOR_SEMAFORO[color] ?? 'var(--chart-1)'

export const formatoPorcentaje = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
export const porcentaje = (valor) => `${formatoPorcentaje.format(valor)} %`

// La tarjeta de una gráfica: título, subtítulo y, para leerla sin la imagen, un resumen con el dato principal.
export default function TarjetaGrafica({ titulo, subtitulo, resumen, children, className }) {
  return (
    <Card className={cn('min-w-0', className)}>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {subtitulo && <CardDescription>{subtitulo}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {resumen && <p className="text-sm">{resumen}</p>}
        {children}
      </CardContent>
    </Card>
  )
}

export const SinDatos = ({ children }) => <p className="text-sm text-muted-foreground">{children}</p>

export function NombresSinPoblacion({ nombres }) {
  if (nombres.length === 0) return null
  return <p className="text-xs text-muted-foreground">Sin población: {nombres.join(', ')}.</p>
}
