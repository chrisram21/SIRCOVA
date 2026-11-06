import { CartesianGrid, Line, LineChart, ReferenceArea, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { MESES } from '@/lib/fechas.js'
import TarjetaGrafica, { porcentaje, SinDatos } from './TarjetaGrafica.jsx'

// SPEC 49: lo real de enero al corte (sólido), la proyección hasta diciembre (punteada, sobre la zona «Estimación»)
// y la meta proporcional.

const CONFIG = {
  real: { label: 'Real', color: 'var(--chart-1)' },
  proyeccion: { label: 'Proyección', color: 'var(--chart-1)' },
  meta: { label: 'Meta', color: 'var(--muted-foreground)' },
}
const corto = (mes) => MESES[mes - 1][0].toUpperCase() + MESES[mes - 1].slice(1, 3)

// Un punto de una corrida parcial va hueco.
function PuntoReal({ cx, cy, payload }) {
  if (payload.real === null || cx == null) return null
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      stroke="var(--color-real)"
      strokeWidth={2}
      fill={payload.parcial ? 'var(--card)' : 'var(--color-real)'}
    />
  )
}

export default function GraficaAvanceProyeccion({ linea, mesCorte, meta, referencia, vacuna, cargando, error, onReintentar, className }) {
  const titulo = 'Avance acumulado y proyección al cierre del año'
  const subtitulo = `${meta == null ? '' : `¿Llegaremos al ${porcentaje(meta)} en diciembre? · `}${referencia}`
  const reales = linea?.filter((p) => p.real !== null) ?? []
  const diciembre = linea?.[11]?.proyeccion ?? null

  let contenido
  if (cargando) contenido = <Skeleton className="h-64 w-full" aria-label="Cargando la serie" />
  else if (error) contenido = <AvisoError onReintentar={onReintentar}>No se pudo cargar la serie: {error}</AvisoError>
  else if (!linea || reales.length === 0) contenido = <SinDatos>La corrida no tiene un indicador de cobertura de {vacuna}.</SinDatos>
  else {
    const datos = linea.map((p) => ({ ...p, nombre: corto(p.mes) }))
    const mayor = Math.max(100, ...linea.flatMap((p) => [p.real, p.proyeccion, p.meta]).filter((v) => v != null))
    contenido = (
      <ChartContainer config={CONFIG} className="aspect-auto h-72 w-full" aria-label={titulo} role="img">
        <LineChart data={datos} margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="nombre" tickLine={false} axisLine={false} />
          <YAxis domain={[0, Math.ceil(mayor / 10) * 10]} tickFormatter={(v) => `${v} %`} tickLine={false} axisLine={false} width={48} />
          {diciembre !== null && mesCorte < 12 && (
            <ReferenceArea
              x1={corto(mesCorte)}
              x2={corto(12)}
              fill="var(--muted)"
              fillOpacity={0.8}
              label={{ value: 'Estimación', position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }}
            />
          )}
          <ChartTooltip
            content={(
              <ChartTooltipContent
                formatter={(valor, nombre, item) => valor == null ? null : (
                  <span>
                    {CONFIG[nombre]?.label}: {porcentaje(valor)}
                    {nombre === 'real' && item.payload.parcial ? ' (parcial)' : ''}
                  </span>
                )}
              />
            )}
          />
          <Line dataKey="meta" stroke="var(--color-meta)" strokeWidth={1.5} dot={false} isAnimationActive={false} />
          <Line dataKey="proyeccion" stroke="var(--color-proyeccion)" strokeWidth={2} strokeDasharray="6 4" dot={false} isAnimationActive={false} />
          <Line dataKey="real" stroke="var(--color-real)" strokeWidth={2.5} dot={<PuntoReal />} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ChartContainer>
    )
  }

  const ultimo = reales.at(-1)
  const resumen = !cargando && !error && ultimo
    ? `Real a ${MESES[ultimo.mes - 1]}: ${porcentaje(ultimo.real)}.${diciembre === null ? '' : ` Proyección a diciembre: ${porcentaje(diciembre)}.`}`
    : null
  return (
    <TarjetaGrafica titulo={titulo} subtitulo={subtitulo} resumen={resumen} className={className}>
      {contenido}
    </TarjetaGrafica>
  )
}
