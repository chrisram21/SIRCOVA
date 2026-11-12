import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { nombreDeFilaProduccion } from './produccion.js'

// SPEC 61: las dosis aplicadas por municipio de aplicación o por establecimiento. Solo cantidades: sin metas,
// porcentajes ni semáforo.

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
const cifra = 'text-right font-mono tabular-nums'

function Cantidades({ cantidades }) {
  return (
    <>
      {cantidades.porDosis.map((d) => (
        <TableCell key={d.dosisId} className={cifra}>{formatoEntero.format(d.dosisTotal)}</TableCell>
      ))}
      <TableCell className={cifra}>{formatoEntero.format(cantidades.dosisPoblacionPropia)}</TableCell>
      <TableCell className={cifra}>{formatoEntero.format(cantidades.dosisOtrosMunicipios)}</TableCell>
      <TableCell className={`${cifra} font-semibold`}>{formatoEntero.format(cantidades.dosisTotal)}</TableCell>
    </>
  )
}

export default function TablaProduccion({ produccion }) {
  const { agrupar, vacuna, filas, total, dosisFueraDelConsolidado } = produccion
  const porEstablecimiento = agrupar === 'establecimiento'
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{porEstablecimiento ? 'Establecimiento' : 'Municipio de aplicación'}</TableHead>
              {vacuna?.dosis.map((d) => (
                <TableHead key={d.id} className="text-right" title={d.activa ? undefined : 'Dosis inactiva'}>
                  {d.codigo}
                </TableHead>
              ))}
              <TableHead className="text-right">Población propia</TableHead>
              <TableHead className="text-right">Otros municipios</TableHead>
              <TableHead className="text-right">Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.establecimiento?.id ?? fila.municipio.id}>
                <TableCell>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{nombreDeFilaProduccion(fila)}</span>
                    {fila.fueraDelConsolidado && <Badge variant="secondary">No suma en el consolidado</Badge>}
                  </div>
                  {porEstablecimiento && <p className="text-xs text-muted-foreground">{fila.municipio.nombre}</p>}
                </TableCell>
                <Cantidades cantidades={fila} />
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell>Total</TableCell>
              <Cantidades cantidades={total} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
      {dosisFueraDelConsolidado > 0 && (
        <p className="text-sm text-muted-foreground">
          Además, {formatoEntero.format(dosisFueraDelConsolidado)} dosis de establecimientos que no suman en el
          consolidado.
        </p>
      )}
    </div>
  )
}
