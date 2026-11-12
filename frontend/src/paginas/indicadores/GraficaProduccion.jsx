import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { barrasDeProduccion } from './produccion.js'
import TarjetaGrafica, { formatoEntero, SinDatos } from './TarjetaGrafica.jsx'

// SPEC 61: el total de dosis de cada fila, apilado en población propia y otros municipios, de mayor a menor. Sin meta
// ni semáforo. Los establecimientos que no suman en el consolidado van en gris.

const ALTO_POR_BARRA = 28
const COLORES = { propia: 'var(--chart-5)', otros: 'var(--chart-2)' }
const GRIS = { propia: 'var(--muted-foreground)', otros: 'var(--border)' }
const CONFIG = {
  propia: { label: 'Población propia', color: COLORES.propia },
  otros: { label: 'Otros municipios', color: COLORES.otros },
}
const dosis = (n) => `${formatoEntero.format(n)} dosis`

function Leyenda({ conGris }) {
  const elementos = [
    ['Población propia', COLORES.propia],
    ['Otros municipios', COLORES.otros],
    ...(conGris ? [['No suma en el consolidado', GRIS.propia]] : []),
  ]
  return (
    <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Leyenda">
      {elementos.map(([nombre, color]) => (
        <li key={nombre} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />
          {nombre}
        </li>
      ))}
    </ul>
  )
}

export default function GraficaProduccion({ produccion, className }) {
  const titulo = produccion.agrupar === 'establecimiento'
    ? 'Dosis por establecimiento'
    : 'Dosis por municipio de aplicación'
  const barras = barrasDeProduccion(produccion.filas)
  const hayDosis = barras.some((b) => b.total > 0)
  if (!hayDosis) {
    return (
      <TarjetaGrafica titulo={titulo} className={className}>
        <SinDatos>No hay dosis aplicadas con estos filtros.</SinDatos>
      </TarjetaGrafica>
    )
  }
  const resumen = `Mayor: ${barras[0].nombre} (${dosis(barras[0].total)}). Menor: ${barras.at(-1).nombre} `
    + `(${dosis(barras.at(-1).total)}).`
  const relleno = (serie) => (b) => (b.fueraDelConsolidado ? GRIS[serie] : COLORES[serie])
  return (
    <TarjetaGrafica titulo={titulo} resumen={resumen} preliminar={produccion.preliminar} className={className}>
      <Leyenda conGris={barras.some((b) => b.fueraDelConsolidado)} />
      <ChartContainer
        config={CONFIG}
        className="aspect-auto w-full"
        style={{ height: barras.length * ALTO_POR_BARRA + 40 }}
        role="img"
        aria-label={titulo}
      >
        <BarChart data={barras} layout="vertical" margin={{ top: 8, right: 48, left: 0, bottom: 0 }}>
          <CartesianGrid horizontal={false} />
          <XAxis type="number" tickFormatter={(n) => formatoEntero.format(n)} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="nombre" width={180} tickLine={false} axisLine={false} interval={0} />
          <ChartTooltip content={<ChartTooltipContent hideLabel={false} />} />
          {['propia', 'otros'].map((serie) => (
            <Bar key={serie} dataKey={serie} stackId="dosis" isAnimationActive={false}>
              {barras.map((b) => (
                <Cell key={b.clave} fill={relleno(serie)(b)} />
              ))}
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </TarjetaGrafica>
  )
}
