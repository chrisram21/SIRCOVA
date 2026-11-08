import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { etiquetaDelMes } from './comparacionPeriodos.js'
import { formatoEntero, porcentaje } from './TarjetaGrafica.jsx'

// SPEC 51: una barra por mes elegido con lo vacunado en ese mes, en % de la población anual.

const CONFIG = { porcentaje: { label: 'Vacunado en el mes', color: 'var(--chart-1)' } }

export default function GraficaComparacionMeses({ filas, titulo }) {
  const datos = filas.filter((f) => f.motivo === null).map((f) => ({ ...f, nombre: etiquetaDelMes(f) }))
  const mayor = Math.max(...datos.map((d) => d.porcentaje), 1)

  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full" aria-label={titulo} role="img">
      <BarChart data={datos} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="nombre" tickLine={false} axisLine={false} />
        <YAxis domain={[0, Math.ceil(mayor)]} tickFormatter={(v) => `${v} %`} tickLine={false} axisLine={false} width={48} />
        <ChartTooltip
          content={(
            <ChartTooltipContent
              formatter={(valor, _nombre, item) => (
                <span>
                  {porcentaje(valor)} · {formatoEntero.format(item.payload.dosis)} dosis
                  {item.payload.parcial ? ' (parcial)' : ''}
                </span>
              )}
            />
          )}
        />
        <Bar dataKey="porcentaje" fill="var(--color-porcentaje)" radius={4} isAnimationActive={false} />
      </BarChart>
    </ChartContainer>
  )
}
