import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { barrasPorVacuna } from './panelIndicadores.js'
import TarjetaGrafica, { NombresSinPoblacion, porcentaje, SinDatos } from './TarjetaGrafica.jsx'

// SPEC 49: la fila de referencia de cada indicador del mismo tipo que la cobertura del panel, de todas las vacunas,
// con la vacuna elegida resaltada.

const CONFIG = {
  resaltada: { label: 'Vacuna elegida', color: 'var(--chart-1)' },
  otra: { label: 'Otras vacunas', color: 'var(--chart-2)' },
}
const LARGO_ETIQUETA = 14
const recortar = (texto) => (texto.length > LARGO_ETIQUETA ? `${texto.slice(0, LARGO_ETIQUETA - 1)}…` : texto)

export default function GraficaPorVacuna({ tipo, indicadores, resultados, visibles, vacuna, referencia, className }) {
  const titulo = tipo === 'COBERTURA' ? 'Cobertura por vacuna' : 'Avance por vacuna'
  if (!tipo) {
    return (
      <TarjetaGrafica titulo="Cobertura por vacuna" className={className}>
        <SinDatos>La corrida no tiene indicadores de cobertura.</SinDatos>
      </TarjetaGrafica>
    )
  }
  const { barras, sinPoblacion, metaComun } = barrasPorVacuna(indicadores, resultados, tipo, visibles, vacuna)
  const datos = barras.map((b) => ({ ...b, etiqueta: recortar(b.nombre) }))
  return (
    <TarjetaGrafica
      titulo={titulo}
      subtitulo={`${referencia}${metaComun == null ? '' : ` · meta ${porcentaje(metaComun)}`}`}
      className={className}
    >
      {datos.length === 0 ? (
        <SinDatos>Ningún indicador tiene población registrada.</SinDatos>
      ) : (
        <ChartContainer config={CONFIG} className="aspect-auto h-72 w-full" role="img" aria-label={titulo}>
          <BarChart data={datos} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="etiqueta" tickLine={false} axisLine={false} interval={0} angle={-35} textAnchor="end" height={70} />
            <YAxis tickFormatter={(v) => `${v} %`} tickLine={false} axisLine={false} width={48} />
            <ChartTooltip
              content={(
                <ChartTooltipContent
                  labelFormatter={(_, carga) => carga?.[0]?.payload.nombre}
                  formatter={(valor, _, item) => `${porcentaje(valor)}${metaComun == null ? ` (meta ${porcentaje(item.payload.meta)})` : ''}`}
                />
              )}
            />
            <Bar dataKey="valor" radius={3} isAnimationActive={false}>
              {datos.map((b) => (
                <Cell key={b.codigo} fill={b.resaltada ? 'var(--color-resaltada)' : 'var(--color-otra)'} />
              ))}
            </Bar>
            {metaComun != null && (
              <ReferenceLine
                y={metaComun}
                stroke="var(--muted-foreground)"
                strokeDasharray="4 4"
                label={{ value: `Meta ${porcentaje(metaComun)}`, position: 'insideTopRight', fill: 'var(--muted-foreground)', fontSize: 11 }}
              />
            )}
          </BarChart>
        </ChartContainer>
      )}
      <NombresSinPoblacion nombres={sinPoblacion} />
    </TarjetaGrafica>
  )
}
