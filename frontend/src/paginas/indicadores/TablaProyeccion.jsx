import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MESES } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'
import { TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js'
import InsigniaCumple from './InsigniaCumple.jsx'

// SPEC 47: los resultados de un indicador PROYECCION. El numerador guardado son las dosis proyectadas a diciembre; las
// acumuladas y el ritmo vienen en proyeccion. Las columnas estimadas van sobre fondo gris, como pide el estilo general.

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
const formatoDecimal = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 })
const formatoPorcentaje = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const SIMBOLOS = { '<=': '≤', '<': '<', '>=': '≥', '>': '>' }
const SIMBOLO_META = SIMBOLOS[TIPOS_INDICADOR.PROYECCION.meta.comparador]
const ESTIMADA = 'bg-muted'

const dosis = (valor) => (valor === null || valor === undefined ? '—' : formatoEntero.format(valor))

// Sin población o sin meses cerrados en la ventana; null si la fila es calculable.
export function motivoNoCalculable(resultado) {
  if (resultado.calculable) return null
  if (!resultado.proyeccion || resultado.proyeccion.mesesUsados.length === 0) return 'Sin meses cerrados'
  return 'Sin población'
}

// La DDRISS primero; luego los municipios de menor a mayor cobertura proyectada (primero los que no llegarán, por
// nombre si empatan) y al final los no calculables.
export function ordenarPorProyeccion(resultados) {
  const porNombre = (a, b) => a.municipio.nombre.localeCompare(b.municipio.nombre, 'es')
  const municipales = resultados.filter((r) => r.municipio !== null)
  return [
    ...resultados.filter((r) => r.municipio === null),
    ...municipales.filter((r) => r.calculable).sort((a, b) => a.valor - b.valor || porNombre(a, b)),
    ...municipales.filter((r) => !r.calculable).sort(porNombre),
  ]
}

// «junio», «junio y julio», «junio, julio y agosto».
function listaDeMeses(meses) {
  const nombres = meses.map((m) => MESES[m - 1])
  return nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

export function notaDelMetodo({ mes, mesesVentana, mesesUsados }) {
  const estimacion = 'Es una estimación, no un dato registrado.'
  if (mes === 12) {
    return 'Con corte a diciembre ya no quedan meses por estimar: la proyección es el dato real del año.'
  }
  if (mesesUsados.length === 0) {
    return `No hay meses cerrados de enero a ${MESES[mes - 1]}, así que todavía no hay ritmo para proyectar. ${estimacion}`
  }
  const ventana = mesesVentana === 1 ? 'del último mes cerrado' : `de los últimos ${mesesVentana} meses cerrados`
  const pocos = mesesUsados.length < mesesVentana
    ? ` Solo hay ${mesesUsados.length === 1 ? '1 mes cerrado' : `${mesesUsados.length} meses cerrados`}, así que el promedio usa ${mesesUsados.length === 1 ? 'ese' : 'esos'}.`
    : ''
  return `La proyección suma a las dosis acumuladas el promedio ${ventana} (${listaDeMeses(mesesUsados)}) por cada mes `
    + `que falta hasta diciembre.${pocos} ${estimacion}`
}

export default function TablaProyeccion({ resultados }) {
  const filas = ordenarPorProyeccion(resultados)
  const referencia = filas.find((r) => r.proyeccion) ?? filas[0]
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold">Cobertura estimada a diciembre</h2>
        <Badge variant="secondary">Estimación</Badge>
      </div>
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Municipio</TableHead>
              <TableHead className="text-right">Dosis acumuladas</TableHead>
              <TableHead className={cn('text-right', ESTIMADA)}>Ritmo mensual</TableHead>
              <TableHead className={cn('text-right', ESTIMADA)}>Dosis proyectadas a diciembre</TableHead>
              <TableHead className="text-right">Población</TableHead>
              <TableHead className={cn('text-right', ESTIMADA)}>Dosis que faltarían</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead className={cn('text-right', ESTIMADA)}>Cobertura proyectada</TableHead>
              <TableHead className={ESTIMADA}>¿Llega a la meta?</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((r) => {
              const departamental = r.municipio === null
              const motivo = motivoNoCalculable(r)
              return (
                <TableRow key={r.municipio?.id ?? 'ddriss'} className={cn(departamental && 'font-semibold')}>
                  <TableCell>{departamental ? 'Total de la DDRISS' : r.municipio.nombre}</TableCell>
                  <TableCell className="text-right font-mono">{dosis(r.proyeccion?.dosisAcumuladas)}</TableCell>
                  <TableCell className={cn('text-right font-mono', ESTIMADA)}>{dosis(r.proyeccion?.ritmoMensual)}</TableCell>
                  <TableCell className={cn('text-right font-mono', ESTIMADA)}>{dosis(r.numerador)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.denominador === null ? '—' : formatoEntero.format(r.denominador)}
                  </TableCell>
                  <TableCell className={cn('text-right font-mono', ESTIMADA)}>{dosis(r.brechaDosis)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.meta === null ? '—' : `${SIMBOLO_META} ${formatoDecimal.format(r.meta)} %`}
                  </TableCell>
                  <TableCell className={cn('text-right', ESTIMADA)}>
                    {motivo ? (
                      <span className="text-muted-foreground">{motivo}</span>
                    ) : (
                      <span className="font-mono">{formatoPorcentaje.format(r.valor)} %</span>
                    )}
                  </TableCell>
                  <TableCell className={ESTIMADA}><InsigniaCumple cumple={r.cumpleMeta} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      {referencia?.proyeccion && (
        <p className="text-sm text-muted-foreground">
          {notaDelMetodo({ mes: referencia.mes, ...referencia.proyeccion })}
        </p>
      )}
    </div>
  )
}
