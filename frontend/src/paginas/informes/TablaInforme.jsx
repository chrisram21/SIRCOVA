import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { encabezadosDeTabla } from './informes.js'

// SPEC 62: una fila por unidad del nivel y una columna por vacuna, sección (grupo de edad) y dosis, como el 5C.
// Al agrupar (SPEC 63), la segunda fila del encabezado es el valor de la dimensión en lugar de la sección.
// Solo cantidades. La primera columna queda fija al desplazar la tabla a lo ancho.

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
const cifra = 'text-right font-mono tabular-nums'
const fija = 'sticky left-0 z-10 bg-card'

function tituloDeLaFila(nivel, informe) {
  if (nivel === 'municipio') return informe === 'residencia' ? 'Municipio de residencia' : 'Municipio de aplicación'
  return { departamento: 'Departamento', distrito: 'Distrito', establecimiento: 'Establecimiento' }[nivel]
}

export default function TablaInforme({ informe }) {
  const { nivel, columnas, filas, total, dosisFueraDelConsolidado } = informe
  const { vacunas, secciones, dosis } = encabezadosDeTabla(columnas)
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead rowSpan={3} className={`${fija} min-w-56 align-bottom`}>
                {tituloDeLaFila(nivel, informe.informe)}
              </TableHead>
              {vacunas.map((v) => (
                <TableHead key={v.clave} colSpan={v.abarca} className="border-l text-center" title={v.codigo}>
                  {v.nombre}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {secciones.map((s) => (
                <TableHead key={s.clave} colSpan={s.abarca} className="border-l text-center text-xs font-normal">
                  {s.titulo}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {dosis.map((d) => (
                <TableHead key={d.clave} className="border-l text-right">{d.codigo}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.id ?? 'sin-distrito'}>
                <TableCell className={fija}>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>{fila.nombre}</span>
                    {fila.fueraDelConsolidado && <Badge variant="secondary">No suma en el consolidado</Badge>}
                  </div>
                  {fila.municipio && <p className="text-xs text-muted-foreground">{fila.municipio.nombre}</p>}
                </TableCell>
                {fila.cantidades.map((cantidad, i) => (
                  <TableCell key={dosis[i].clave} className={`${cifra} border-l`}>
                    {formatoEntero.format(cantidad)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="font-semibold">
              <TableCell className={`${fija} bg-muted`}>Total</TableCell>
              {total.cantidades.map((cantidad, i) => (
                <TableCell key={dosis[i].clave} className={`${cifra} border-l`}>
                  {formatoEntero.format(cantidad)}
                </TableCell>
              ))}
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
