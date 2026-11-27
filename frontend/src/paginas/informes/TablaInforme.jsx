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
// Encabezado (SPEC 66, en los cuatro informes): la vacuna y su sección en el celeste del tema, la meta en gris.
const encabezadoVacuna = 'bg-accent text-accent-foreground'
const encabezadoSeccion = 'bg-accent/50 text-accent-foreground'

// El tono de cada cifra del acumulado: la etiqueta fija lleva el color entero (opaco, para tapar lo que se desplaza
// debajo) y las celdas, uno más suave. Una cobertura o una brecha que alcanza la meta (brecha 0) va en verde.
const TONOS = {
  dosis: { etiqueta: 'bg-card', celda: '' },
  poblacion: { etiqueta: 'bg-muted text-muted-foreground', celda: 'bg-muted/60 text-muted-foreground' },
  cobertura: { etiqueta: 'bg-accent text-accent-foreground', celda: 'bg-accent/40 text-accent-foreground' },
  brecha: { etiqueta: 'bg-advertencia text-advertencia-foreground', celda: 'bg-advertencia/50 text-advertencia-foreground' },
}
const CUMPLE = 'bg-exito text-exito-foreground font-semibold'
const cumpleMeta = (valores, i) => valores.brecha[i] === 0

function claseDeCelda(clave, valores, i) {
  if ((clave === 'cobertura' || clave === 'brecha') && cumpleMeta(valores, i)) return CUMPLE
  return TONOS[clave].celda
}

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
      <TableCell className={`${fijaCifra} text-xs ${TONOS[clave].etiqueta}`}>{etiqueta}</TableCell>
      {valores[clave].map((valor, i) => (
        <TableCell
          key={dosis[i].clave}
          className={`${cifra} border-l ${claseDeCelda(clave, valores, i)}`}
          data-cumple={(clave === 'cobertura' || clave === 'brecha') && cumpleMeta(valores, i) ? '' : undefined}
        >
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
      {/*
        isolate: el z-10 de las columnas fijas queda dentro de la tabla y no tapa el encabezado de la página.
        La tabla se desplaza dentro de este contenedor, que mide como mucho la ventana, para que la barra horizontal
        quede a la vista sin bajar hasta el final; el contenedor propio de shadcn deja de desplazarse.
      */}
      <div
        data-testid="contenedor-informe"
        className="isolate max-h-[calc(100svh-9rem)] overflow-auto rounded-lg border bg-card [&>[data-slot=table-container]]:overflow-visible"
      >
        <Table>
          <TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
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
                <TableHead
                  key={v.clave}
                  colSpan={v.abarca}
                  className={`border-l text-center ${encabezadoVacuna}`}
                  title={v.codigo}
                >
                  {v.nombre}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {secciones.map((s) => (
                <TableHead
                  key={s.clave}
                  colSpan={s.abarca}
                  className={`border-l text-center text-xs font-normal ${encabezadoSeccion}`}
                >
                  {s.titulo}
                </TableHead>
              ))}
            </TableRow>
            <TableRow>
              {dosis.map((d) => (
                <TableHead key={d.clave} className="border-l text-right">{d.etiqueta}</TableHead>
              ))}
            </TableRow>
            {acumulado && (
              <TableRow>
                {columnas.map((c, i) => (
                  <TableHead
                    key={dosis[i].clave}
                    className="border-l bg-muted text-right text-xs font-normal text-muted-foreground"
                  >
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
      {acumulado && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`inline-block size-3 rounded-sm ${CUMPLE}`} aria-hidden="true" />
          En verde, las coberturas que alcanzan su meta (brecha 0).
        </p>
      )}
      {dosisFueraDelConsolidado > 0 && (
        <p className="text-sm text-muted-foreground">
          Además, {formatoEntero.format(dosisFueraDelConsolidado)} dosis de establecimientos que no suman en el
          consolidado.
        </p>
      )}
    </div>
  )
}
