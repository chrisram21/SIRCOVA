import { Info } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MESES } from '@/lib/fechas.js'
import InsigniaValor from './InsigniaValor.jsx'
import { MarcaMayorACien } from './MarcaMayorACien.jsx'
import { esperadoDeLaTabla, filasDeLaRed, gruposDeColumnas, sinCoberturaAnual } from './tablaRed.js'

// SPEC 60: la cobertura anual de las trazadoras de una red, municipios × trazadoras, con el semáforo contra lo
// esperado del mes (lo calcula la API) y la fila «Total de la red». Las columnas las arma columnasDeLaRed.

const formatoPorcentaje = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const formatoPorMes = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 })

function Celda({ resultado, textoEsperado }) {
  if (!resultado) return <TableCell className="text-center text-muted-foreground">—</TableCell>
  return (
    <TableCell className="text-center" title={textoEsperado ?? undefined}>
      <span className="inline-flex items-center justify-center gap-1.5">
        <InsigniaValor resultado={resultado} />
        {resultado.mayorACien && <MarcaMayorACien />}
      </span>
    </TableCell>
  )
}

export default function TablaRed({ red, columnas, resultados, mes }) {
  const filas = filasDeLaRed(red, columnas, resultados)
  const grupos = gruposDeColumnas(columnas)
  const faltan = sinCoberturaAnual(columnas)
  const esperado = esperadoDeLaTabla(filas)
  const nombreMes = MESES[mes - 1]
  const textoEsperado = esperado == null ? null : `Esperado a ${nombreMes}: ${formatoPorcentaje.format(esperado)} %`

  return (
    <div className="flex flex-col gap-2">
      {faltan.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Sin indicador de cobertura anual para: {faltan.join(', ')}. Se configuran en Administración · Indicadores.
          </span>
        </p>
      )}
      {esperado != null && (
        <p className="text-sm text-muted-foreground">
          Lo esperado a {nombreMes} es {formatoPorcentaje.format(esperado)} % de la población anual (
          {formatoPorMes.format(100 / 12)} % por mes).
        </p>
      )}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={2} className="align-bottom">Municipio</TableHead>
              {grupos.map((g) => (
                <TableHead key={g.grupo} colSpan={g.columnas} className="border-l text-center">
                  {g.grupo}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {columnas.map((c) => (
                <TableHead key={c.clave} className="border-l text-center font-mono">
                  {c.etiqueta}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.municipios.map(({ municipio, celdas }) => (
              <TableRow key={municipio.id}>
                <TableCell>{municipio.nombre}</TableCell>
                {celdas.map((r, i) => (
                  <Celda key={columnas[i].clave} resultado={r} textoEsperado={textoEsperado} />
                ))}
              </TableRow>
            ))}
            <TableRow className="bg-muted/50 font-semibold">
              <TableCell>Total de la red</TableCell>
              {filas.total.map((r, i) => (
                <Celda key={columnas[i].clave} resultado={r} textoEsperado={textoEsperado} />
              ))}
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
