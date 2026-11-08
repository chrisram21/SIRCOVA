import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { MESES } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'
import { etiquetaDelMes, textoDelMotivo } from './comparacionPeriodos.js'
import { formatoEntero, formatoPorcentaje, porcentaje } from './TarjetaGrafica.jsx'

// SPEC 51: los valores de cada periodo y la diferencia (en pp, y en dosis por mes). Es también la lectura accesible
// de la gráfica.

const CLASES = { sube: 'text-exito-foreground', baja: 'text-destructive', igual: 'text-muted-foreground' }
const MARCAS = { sube: '▲', baja: '▼', igual: '=' }
const conSigno = (valor, formato) => `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${formato.format(Math.abs(valor))}`
const conMayuscula = (texto) => texto[0].toUpperCase() + texto.slice(1)

function Diferencia({ diferencia, conDosis = false }) {
  if (!diferencia) return <span className="text-muted-foreground">—</span>
  const { pp, dosis, sentido } = diferencia
  return (
    <span className={cn('whitespace-nowrap font-mono', CLASES[sentido])}>
      <span aria-hidden="true">{MARCAS[sentido]} </span>
      {conSigno(Math.round(pp * 10) / 10, formatoPorcentaje)} pp
      {conDosis && dosis != null ? ` · ${conSigno(dosis, formatoEntero)} dosis` : ''}
    </span>
  )
}

function Valor({ valor }) {
  if (!valor) return <span className="text-muted-foreground">—</span>
  return (
    <span className="font-mono">
      {porcentaje(valor.porcentaje)}
      {valor.parcial && <span className="ml-1 text-xs text-muted-foreground">(parcial)</span>}
    </span>
  )
}

export function TablaPorAnio({ filas, anios }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table aria-label="Cobertura real por año">
        <TableHeader>
          <TableRow>
            <TableHead>Mes</TableHead>
            {anios.map((anio) => <TableHead key={anio} className="text-right">{anio}</TableHead>)}
            <TableHead className="text-right">Diferencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.mes}>
              <TableCell>{conMayuscula(MESES[f.mes - 1])}</TableCell>
              {anios.map((anio) => (
                <TableCell key={anio} className="text-right"><Valor valor={f.porAnio[anio]} /></TableCell>
              ))}
              <TableCell className="text-right"><Diferencia diferencia={f.diferencia} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export function TablaPorMes({ filas, codigo }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table aria-label="Vacunado en cada mes">
        <TableHeader>
          <TableRow>
            <TableHead>Mes</TableHead>
            <TableHead className="text-right">Dosis del mes</TableHead>
            <TableHead className="text-right">% de la población anual</TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={`${f.anio}-${f.mes}`}>
              <TableCell>{etiquetaDelMes(f)}</TableCell>
              {f.motivo ? (
                <TableCell colSpan={3} className="text-right text-muted-foreground">
                  {textoDelMotivo(f.motivo, { codigo, anio: f.anio })}
                </TableCell>
              ) : (
                <>
                  <TableCell className="text-right font-mono">{formatoEntero.format(f.dosis)}</TableCell>
                  <TableCell className="text-right"><Valor valor={f} /></TableCell>
                  <TableCell className="text-right"><Diferencia diferencia={f.diferencia} conDosis /></TableCell>
                </>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
