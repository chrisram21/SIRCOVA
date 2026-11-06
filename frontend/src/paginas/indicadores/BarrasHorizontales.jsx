import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'

// SPEC 49: barras horizontales, una por municipio (cobertura, brecha y deserción). datos: [{ nombre, valor, relleno }].
// La altura crece con las barras para que cada nombre quepa en su fila.

const ALTO_POR_BARRA = 28
const CONFIG = { valor: { label: 'Valor', color: 'var(--chart-1)' } }

export default function BarrasHorizontales({ datos, formato, referencia, etiqueta, anchoNombres = 150 }) {
  const menor = Math.min(0, ...datos.map((d) => d.valor), referencia?.valor ?? 0)
  return (
    <ChartContainer
      config={CONFIG}
      className="aspect-auto w-full"
      style={{ height: datos.length * ALTO_POR_BARRA + 40 }}
      role="img"
      aria-label={etiqueta}
    >
      <BarChart data={datos} layout="vertical" margin={{ top: 16, right: 48, left: 0, bottom: 0 }}>
        <CartesianGrid horizontal={false} />
        <XAxis type="number" domain={[menor, 'auto']} tickFormatter={formato} tickLine={false} axisLine={false} />
        <YAxis type="category" dataKey="nombre" width={anchoNombres} tickLine={false} axisLine={false} interval={0} />
        <ChartTooltip content={<ChartTooltipContent hideLabel={false} formatter={(valor) => formato(valor)} />} />
        <Bar dataKey="valor" radius={3} isAnimationActive={false}>
          {datos.map((d) => (
            <Cell key={d.nombre} fill={d.relleno} />
          ))}
        </Bar>
        {referencia && (
          <ReferenceLine
            x={referencia.valor}
            stroke="var(--muted-foreground)"
            strokeDasharray="4 4"
            label={{ value: referencia.etiqueta, position: 'top', fill: 'var(--muted-foreground)', fontSize: 11 }}
          />
        )}
      </BarChart>
    </ChartContainer>
  )
}
