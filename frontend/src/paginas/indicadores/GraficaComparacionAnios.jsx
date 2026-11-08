import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { MESES } from '@/lib/fechas.js'
import { porcentaje } from './TarjetaGrafica.jsx'

// SPEC 51: una línea por año con la cobertura real acumulada de cada mes. El año más reciente va con --chart-1; los
// demás, con colores que se distinguen de él.

const COLORES = ['var(--chart-1)', 'var(--chart-3)', 'var(--chart-5)', 'var(--chart-4)', 'var(--chart-2)']
const corto = (mes) => MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1, 3)
const clave = (anio) => `a${anio}`

function Punto({ cx, cy, payload, dataKey, stroke }) {
  if (cx == null || cy == null || payload[dataKey] == null) return null
  const parcial = payload[`${dataKey}parcial`]
  return <circle cx={cx} cy={cy} r={3.5} stroke={stroke} strokeWidth={2} fill={parcial ? 'var(--card)' : stroke} />
}

export default function GraficaComparacionAnios({ lineas, titulo }) {
  const recientes = [...lineas].sort((a, b) => b.anio - a.anio)
  const config = Object.fromEntries(recientes.map((l, i) => [clave(l.anio), { label: String(l.anio), color: COLORES[i] }]))
  const datos = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    const fila = { mes, nombre: corto(mes) }
    for (const l of lineas) {
      const valor = l.valores.find((v) => v.mes === mes)
      fila[clave(l.anio)] = valor?.porcentaje ?? null
      fila[`${clave(l.anio)}parcial`] = valor?.parcial ?? false
    }
    return fila
  })
  const mayor = Math.max(100, ...lineas.flatMap((l) => l.valores.map((v) => v.porcentaje)))

  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full" aria-label={titulo} role="img">
      <LineChart data={datos} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="nombre" tickLine={false} axisLine={false} />
        <YAxis domain={[0, Math.ceil(mayor / 10) * 10]} tickFormatter={(v) => `${v} %`} tickLine={false} axisLine={false} width={48} />
        <ChartTooltip
          content={(
            <ChartTooltipContent
              formatter={(valor, nombre, item) => valor == null ? null : (
                <span>
                  {config[nombre]?.label}: {porcentaje(valor)}
                  {item.payload[`${nombre}parcial`] ? ' (parcial)' : ''}
                </span>
              )}
            />
          )}
        />
        <ChartLegend content={<ChartLegendContent />} />
        {lineas.map((l) => (
          <Line
            key={l.anio}
            dataKey={clave(l.anio)}
            stroke={`var(--color-${clave(l.anio)})`}
            strokeWidth={2.5}
            dot={<Punto />}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ChartContainer>
  )
}
