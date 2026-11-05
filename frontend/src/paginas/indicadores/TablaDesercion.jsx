import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js'
import { InsigniaValor } from './PaginaIndicadores.jsx'

// SPEC 46: los resultados de un indicador DESERCION. El numerador guardado es la pérdida (iniciales − finales) y el
// denominador, las iniciales: las finales se deducen.

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
const formatoDecimal = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 })
const textoCumple = (cumple) => (cumple === null ? '—' : cumple ? 'Sí' : 'No')
const SIMBOLOS = { '<=': '≤', '<': '<', '>=': '≥', '>': '>' }
const SIMBOLO_META = SIMBOLOS[TIPOS_INDICADOR.DESERCION.meta.comparador]

export const dosisFinales = (resultado) => resultado.denominador - resultado.numerador

// La DDRISS primero; luego los municipios de mayor a menor deserción (por nombre si empatan) y al final los que no
// tuvieron primeras dosis.
export function ordenarPorDesercion(resultados) {
  const porNombre = (a, b) => a.municipio.nombre.localeCompare(b.municipio.nombre, 'es')
  const municipales = resultados.filter((r) => r.municipio !== null)
  return [
    ...resultados.filter((r) => r.municipio === null),
    ...municipales.filter((r) => r.calculable).sort((a, b) => b.valor - a.valor || porNombre(a, b)),
    ...municipales.filter((r) => !r.calculable).sort(porNombre),
  ]
}

export default function TablaDesercion({ resultados }) {
  const filas = ordenarPorDesercion(resultados)
  const hayNegativas = filas.some((r) => r.calculable && r.valor < 0)
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Municipio</TableHead>
              <TableHead className="text-right">Dosis iniciales</TableHead>
              <TableHead className="text-right">Dosis finales</TableHead>
              <TableHead className="text-right">Pérdida</TableHead>
              <TableHead className="text-right">Deserción</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead>Cumple</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((r) => {
              const departamental = r.municipio === null
              return (
                <TableRow key={r.municipio?.id ?? 'ddriss'} className={cn(departamental && 'bg-muted/50 font-semibold')}>
                  <TableCell>{departamental ? 'Total de la DDRISS' : r.municipio.nombre}</TableCell>
                  <TableCell className="text-right font-mono">{formatoEntero.format(r.denominador ?? 0)}</TableCell>
                  <TableCell className="text-right font-mono">{formatoEntero.format(dosisFinales(r))}</TableCell>
                  <TableCell className="text-right font-mono">{formatoEntero.format(r.numerador ?? 0)}</TableCell>
                  <TableCell className="text-right">
                    {r.calculable ? (
                      <div className="flex flex-wrap items-center justify-end gap-1">
                        <InsigniaValor resultado={r} />
                        {r.valor < 0 && <Badge variant="secondary">Deserción negativa</Badge>}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Sin primeras dosis</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {r.meta === null ? '—' : `${SIMBOLO_META} ${formatoDecimal.format(r.meta)} %`}
                  </TableCell>
                  <TableCell>{textoCumple(r.cumpleMeta)}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {hayNegativas && (
        <p className="text-sm text-muted-foreground">
          Una deserción negativa indica que en el año se aplicaron más dosis finales que iniciales: esquemas empezados el
          año anterior o niños que llegaron de otro municipio. Conviene revisar el registro.
        </p>
      )}
    </div>
  )
}
