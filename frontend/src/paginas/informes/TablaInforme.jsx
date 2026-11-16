import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CIFRAS, encabezadosDeTabla, textoCifra, textoMeta } from './informes.js'

// SPEC 62: una fila por unidad del nivel y una columna por vacuna, sección (grupo de edad) y dosis, como el 5C.
// Al agrupar (SPEC 63), la segunda fila del encabezado es el valor de la dimensión en lugar de la sección.
// Con `acumulado` (SPEC 66), cada unidad ocupa cuatro filas (Dosis, Población, Cobertura %, Brecha) con la columna
// «Cifra», y el encabezado lleva una cuarta fila con la meta de cada columna. Las columnas del nombre (y «Cifra»)
// quedan fijas al desplazar la tabla a lo ancho.

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
const cifra = 'text-right font-mono tabular-nums'
const fija = 'sticky left-0 z-10 bg-card'
// La segunda columna fija empieza donde termina la primera (w-56).
const fijaCifra = 'sticky left-56 z-10 bg-card'

function tituloDeLaFila(nivel, informe) {
  if (nivel === 'municipio') {
    return ['residencia', 'acumulado-anual'].includes(informe) ? 'Municipio de residencia' : 'Municipio de aplicación'
  }
  return { departamento: 'Departamento', distrito: 'Distrito', establecimiento: 'Establecimiento' }[nivel]
}

function NombreDeFila({ fila }) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span>{fila.nombre}</span>
        {fila.fueraDelConsolidado && <Badge variant="secondary">No suma en el consolidado</Badge>}
      </div>
      {fila.municipio && <p className="text-xs text-muted-foreground">{fila.municipio.nombre}</p>}
    </>
  )
}

// Las cuatro filas de una unidad del acumulado; el nombre abarca las cuatro.
function FilasDeCifras({ nombre, valores, dosis, claseNombre = '' }) {
  return CIFRAS.map(([clave, etiqueta], n) => (
    <TableRow key={clave} className={n === 0 ? 'border-t-2' : 'border-b-0'}>
      {n === 0 && (
        <TableCell rowSpan={CIFRAS.length} className={`${fija} w-56 min-w-56 align-top ${claseNombre}`}>
          {nombre}
        </TableCell>
      )}
      <TableCell className={`${fijaCifra} text-xs text-muted-foreground ${claseNombre}`}>{etiqueta}</TableCell>
      {valores[clave].map((valor, i) => (
        <TableCell key={dosis[i].clave} className={`${cifra} border-l`}>
          {textoCifra(clave, valor)}
        </TableCell>
      ))}
    </TableRow>
  ))
}

export default function TablaInforme({ informe, acumulado = false }) {
  const { nivel, columnas, filas, total, dosisFueraDelConsolidado } = informe
  const { vacunas, secciones, dosis } = encabezadosDeTabla(columnas)
  const filasDeEncabezado = acumulado ? 4 : 3
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                rowSpan={filasDeEncabezado}
                className={`${fija} ${acumulado ? 'w-56' : ''} min-w-56 align-bottom`}
              >
                {tituloDeLaFila(nivel, informe.informe)}
              </TableHead>
              {acumulado && (
                <TableHead rowSpan={filasDeEncabezado} className={`${fijaCifra} min-w-28 align-bottom`}>
                  Cifra
                </TableHead>
              )}
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
            {acumulado && (
              <TableRow>
                {columnas.map((c, i) => (
                  <TableHead key={dosis[i].clave} className="border-l text-right text-xs font-normal">
                    {textoMeta(c.meta)}
                  </TableHead>
                ))}
              </TableRow>
            )}
          </TableHeader>
          {acumulado ? (
            <>
              <TableBody>
                {filas.map((fila) => (
                  <FilasDeCifras
                    key={fila.id ?? 'sin-distrito'}
                    nombre={<NombreDeFila fila={fila} />}
                    valores={fila}
                    dosis={dosis}
                  />
                ))}
              </TableBody>
              <TableFooter className="font-semibold">
                <FilasDeCifras nombre="Total" valores={total} dosis={dosis} claseNombre="bg-muted" />
              </TableFooter>
            </>
          ) : (
            <>
              <TableBody>
                {filas.map((fila) => (
                  <TableRow key={fila.id ?? 'sin-distrito'}>
                    <TableCell className={fija}>
                      <NombreDeFila fila={fila} />
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
            </>
          )}
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
