import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

// SPEC 45: los resultados de un indicador BRECHA, con lo que falta o el excedente por municipio. La fila de la
// DDRISS compara el total del departamento; la suma municipal, debajo, no deja que los excedentes compensen.

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
const textoCumple = (cumple) => (cumple === null ? '—' : cumple ? 'Sí' : 'No')

// La DDRISS primero; luego los municipios de mayor a menor brecha (por nombre si empatan) y al final los que no se
// pudieron calcular.
export function ordenarPorBrecha(resultados) {
  const porNombre = (a, b) => a.municipio.nombre.localeCompare(b.municipio.nombre, 'es')
  const municipales = resultados.filter((r) => r.municipio !== null)
  return [
    ...resultados.filter((r) => r.municipio === null),
    ...municipales.filter((r) => r.calculable).sort((a, b) => b.brechaDosis - a.brechaDosis || porNombre(a, b)),
    ...municipales.filter((r) => !r.calculable).sort(porNombre),
  ]
}

function Cantidad({ valor, clase }) {
  if (valor === null) return '—'
  if (valor === 0) return '0'
  return (
    <Badge variant="outline" className={cn('border-transparent font-mono', clase)}>
      {formatoEntero.format(valor)}
    </Badge>
  )
}

export default function TablaBrecha({ resultados }) {
  const filas = ordenarPorBrecha(resultados)
  const suma = filas.find((r) => r.municipio === null)?.sumaBrechasMunicipales ?? null
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Municipio</TableHead>
              <TableHead className="text-right">Dosis acumuladas</TableHead>
              <TableHead className="text-right">Dosis para la meta</TableHead>
              <TableHead className="text-right">Dosis que faltan</TableHead>
              <TableHead className="text-right">Excedente</TableHead>
              <TableHead>Cumple</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((r) => {
              const departamental = r.municipio === null
              return (
                <TableRow key={r.municipio?.id ?? 'ddriss'} className={cn(departamental && 'bg-muted/50 font-semibold')}>
                  <TableCell>{departamental ? 'Total de la DDRISS' : r.municipio.nombre}</TableCell>
                  <TableCell className="text-right font-mono">{formatoEntero.format(r.numerador ?? 0)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.calculable ? formatoEntero.format(r.metaDosis) : <span className="font-sans text-muted-foreground">Sin población</span>}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <Cantidad valor={r.calculable ? r.brechaDosis : null} clase="bg-advertencia text-advertencia-foreground" />
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    <Cantidad valor={r.calculable ? r.excedenteDosis : null} clase="bg-exito text-exito-foreground" />
                  </TableCell>
                  <TableCell>{textoCumple(r.cumpleMeta)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {suma !== null && (
        <p className="text-sm text-muted-foreground">
          Suma de lo que falta en los municipios: <span className="font-mono font-semibold text-foreground">{formatoEntero.format(suma)}</span> dosis.
          Los municipios que pasaron la meta no compensan a los demás.
        </p>
      )}
    </div>
  )
}
