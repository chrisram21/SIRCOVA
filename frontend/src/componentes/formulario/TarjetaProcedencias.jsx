import { MapPinned } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  CLASES_MARCA,
  etiquetaDeColumna,
  leerCantidad,
  LetraTarjeta,
  moverEntreCasillas,
  seleccionarAlEntrar,
} from './FormularioCaptura.jsx'

const formatoCantidad = new Intl.NumberFormat('es-GT')

// La llave de una cantidad de la tarjeta B; la de la tarjeta A no lleva el municipio.
export const llaveProcedencia = (dosis, municipioId, claveCombinacion) => `${dosis}|${municipioId}|${claveCombinacion}`

// Cada dosis está en una sola tabla (la general o la de su desagregación propia).
function ubicaciones(formulario) {
  return new Map(formulario.tablas.flatMap((tabla) => tabla.filas.map((fila) => [fila.dosis, { tabla, fila }])))
}

// Las celdas de una dosis en una sección de su tabla: las mismas claves de la tarjeta A.
const celdasDeSeccion = ({ tabla, fila }, seccion) =>
  fila.celdas.flatMap((celda, j) => (celda && tabla.columnas[j].seccion === seccion ? [{ celda, j }] : []))

// La fila de una celda guardada de otra procedencia: su sección es la de la columna de su clave. null si la celda no
// se puede dibujar (su dosis o su clave no están en el formulario).
function filaDeCelda(dondeEsta, c) {
  const ubicacion = dondeEsta.get(c.dosisCodigo)
  if (!ubicacion) return null
  const j = ubicacion.fila.celdas.findIndex((celda) => celda?.claveCombinacion === c.claveCombinacion)
  if (j === -1) return null
  return { municipioId: c.municipioProcedenciaId, dosis: c.dosisCodigo, seccion: ubicacion.tabla.columnas[j].seccion }
}

// Las cantidades guardadas de otras procedencias con llaveProcedencia, solo las que tienen fila; un 0 se ve como «0».
export function cantidadesDeOtras(formulario, celdas, municipioPropioId) {
  const dondeEsta = ubicaciones(formulario)
  return Object.fromEntries(
    celdas
      .filter((c) => c.municipioProcedenciaId !== municipioPropioId && filaDeCelda(dondeEsta, c))
      .map((c) => [llaveProcedencia(c.dosisCodigo, c.municipioProcedenciaId, c.claveCombinacion), String(c.cantidad)]),
  )
}

// Las columnas de una tabla de la tarjeta B: por sección, sus dosis (en el orden de la tabla A) y, en cada dosis, sus
// casillas. encabezados: un nivel por sección (si hay más de una o la única tiene grupo de edad), uno por dosis y
// los de las otras dimensiones, como los de armarFormulario.
export function columnasDeProcedencia(tabla) {
  const conSeccion = tabla.secciones.length > 1 || tabla.secciones[0]?.grupoEdad !== null
  const deDimensiones = encabezadosDeSeccion(tabla)
  const grupos = tabla.secciones.flatMap((seccion, s) =>
    tabla.filas
      .map((fila) => ({ seccion, s, fila, celdas: celdasDeSeccion({ tabla, fila }, s) }))
      .filter(({ celdas }) => celdas.length > 0),
  )

  const encabezados = []
  if (conSeccion) {
    encabezados.push(
      tabla.secciones.map((seccion, s) => ({
        etiqueta: seccion.titulo,
        columnas: grupos.filter((g) => g.s === s).reduce((n, g) => n + g.celdas.length, 0),
      })),
    )
  }
  encabezados.push(grupos.map(({ fila, celdas }) => ({ etiqueta: fila.etiqueta, columnas: celdas.length })))
  deDimensiones.forEach((nivel) => encabezados.push(grupos.flatMap(() => nivel)))

  const columnas = grupos
    .flatMap(({ s, fila, celdas }) => celdas.map(({ celda }) => ({ dosis: fila.dosis, seccion: s, ...celda })))
    .map((columna, k) => ({ ...columna, etiqueta: etiquetaDeColumna(encabezados, k) }))
  return { encabezados, columnas }
}

// Las filas de la tarjeta B: las procedencias permitidas (ya en el orden de municipios, el 9999 al final) y después
// las heredadas, con heredada: true (con alguna casilla guardada que hoy no se ofrece). En solo lectura, solo las que
// tienen alguna cantidad. En PROPIO_Y_OTROS la fila del 9999 es «Otros municipios».
export function filasDeProcedencia({
  formulario,
  permitidas,
  municipios,
  celdas,
  municipioPropioId,
  modo,
  soloLectura = false,
}) {
  const dondeEsta = ubicaciones(formulario)
  const conDatos = new Set(
    celdas
      .filter((c) => c.municipioProcedenciaId !== municipioPropioId && filaDeCelda(dondeEsta, c))
      .map((c) => c.municipioProcedenciaId),
  )
  const posicion = new Map(municipios.map((m, i) => [m.id, i]))
  const enOrden = (a, b) => (posicion.get(a) ?? Infinity) - (posicion.get(b) ?? Infinity) || a - b
  const heredadas = [...conDatos].filter((id) => !permitidas.includes(id)).sort(enOrden)
  const esNoEspecificado = (id) => municipios.find((m) => m.id === id)?.codigoIne === CODIGO_NO_ESPECIFICADO
  const nombre = (id) => {
    if (modo === 'PROPIO_Y_OTROS' && esNoEspecificado(id)) return 'Otros municipios'
    return municipios.find((m) => m.id === id)?.nombre ?? `Municipio ${id}`
  }
  const motivo = (id) =>
    modo === 'PROPIO_Y_OTROS'
      ? MOTIVOS.juntas
      : esNoEspecificado(id)
        ? MOTIVOS.sinMigrantes
        : MOTIVOS.municipio
  return [
    ...permitidas.map((id) => ({ municipioId: id, nombre: nombre(id), heredada: false })),
    ...heredadas.map((id) => ({ municipioId: id, nombre: nombre(id), heredada: true, motivo: motivo(id) })),
  ].filter((fila) => !soloLectura || conDatos.has(fila.municipioId))
}

const CODIGO_NO_ESPECIFICADO = '9999'
const CORREGIR = 'Corrija o vacíe sus casillas; al guardarla vacía, la fila desaparece.'
const MOTIVOS = {
  juntas: `Este esquema registra juntas las dosis de otros municipios, en «Otros municipios». ${CORREGIR}`,
  sinMigrantes: `Este esquema ya no registra las dosis de Migrantes por separado. ${CORREGIR}`,
  municipio: `El municipio ya no se ofrece como procedencia: está desactivado o no es del departamento. ${CORREGIR}`,
}

// Los encabezados de la tabla A sin el nivel de las secciones, para las columnas de una sola sección.
function encabezadosDeSeccion(tabla) {
  const niveles = tabla.secciones.length > 1 ? tabla.encabezados.slice(1) : tabla.encabezados
  const columnas = tabla.columnas.length / tabla.secciones.length
  return niveles.map((nivel) => {
    let cubiertas = 0
    return nivel.filter(({ columnas: abarca }) => {
      if (cubiertas >= columnas) return false
      cubiertas += abarca
      return true
    })
  })
}

// Las celdas de cada nivel del encabezado con la columna en que empiezan.
const conInicio = (nivel) => {
  let inicio = 0
  return nivel.map((celda) => {
    const conSuInicio = { ...celda, inicio }
    inicio += celda.columnas
    return conSuInicio
  })
}

const fija = 'sticky left-0 z-10 min-w-44 bg-card'
const LLENA = 'border-ring/50 bg-accent font-semibold text-accent-foreground'

function MarcaHeredada({ motivo }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Sin el data-slot propio, el TooltipTrigger le pondría el suyo. */}
        <Badge variant="outline" tabIndex={0} data-slot="badge" className="font-normal">
          Ya no disponible
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-72">{motivo}</TooltipContent>
    </Tooltip>
  )
}

// Una tabla de la tarjeta B: una fila por municipio (filasDeProcedencia) y las columnas de columnasDeProcedencia. El
// contenedor desplaza en los dos sentidos con el encabezado y la columna del municipio fijos (como TablaInforme).
export function TablaProcedencias({ tabla, filas, cantidades, alCambiar, soloLectura = false, marcas = {} }) {
  const { encabezados, columnas } = columnasDeProcedencia(tabla)
  const niveles = encabezados.map(conInicio)
  const llave = (fila, columna) => llaveProcedencia(columna.dosis, fila.municipioId, columna.claveCombinacion)
  const leer = (fila, columna) => leerCantidad(cantidades[llave(fila, columna)] ?? '').valor
  const totalFila = (fila) => columnas.reduce((suma, columna) => suma + leer(fila, columna), 0)
  const totalColumna = (columna) => filas.reduce((suma, fila) => suma + leer(fila, columna), 0)
  // Una línea separa cada dosis de cada sección.
  const empiezaGrupo = (c, k) => k === 0 || c.dosis !== columnas[k - 1].dosis || c.seccion !== columnas[k - 1].seccion
  const iniciosDeGrupo = new Set(columnas.flatMap((c, k) => (empiezaGrupo(c, k) ? [k] : [])))
  const separa = (k) => iniciosDeGrupo.has(k) && 'border-l'
  const nombreTabla = tabla.titulo ? `Otros municipios · ${tabla.titulo}` : 'Otros municipios'

  return (
    <div className="flex flex-col gap-2">
      {tabla.titulo && (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ring" />
          {tabla.titulo}
        </p>
      )}
      {/* isolate: el z-10 de la columna fija no tapa el encabezado de la página. */}
      <div
        data-testid="contenedor-procedencias"
        className={cn(
          'isolate max-h-[70svh] overflow-auto rounded-lg border bg-card',
          '[&>[data-slot=table-container]]:overflow-visible',
        )}
      >
        <TooltipProvider>
          <Table aria-label={nombreTabla}>
            <TableHeader className="sticky top-0 z-20 bg-card shadow-[0_1px_0_var(--border)]">
              {niveles.map((nivel, n) => (
                <TableRow key={n} className="hover:bg-transparent">
                  {n === 0 && (
                    <TableHead rowSpan={niveles.length} className={cn(fija, 'align-bottom')}>
                      Municipio de procedencia
                    </TableHead>
                  )}
                  {nivel.map(({ etiqueta, columnas: abarca, inicio }) => (
                    <TableHead
                      key={inicio}
                      colSpan={abarca}
                      className={cn(
                        'h-auto py-2 text-center',
                        separa(inicio),
                        niveles.length > 1 && n === niveles.length - 1
                          ? 'text-xs leading-tight font-medium whitespace-normal text-muted-foreground'
                          : n === 0 && niveles.length > 1
                            ? 'bg-accent font-semibold text-accent-foreground'
                            : 'bg-accent/40 font-semibold text-accent-foreground',
                      )}
                    >
                      {etiqueta}
                    </TableHead>
                  ))}
                  {n === 0 && (
                    <TableHead rowSpan={niveles.length} className="border-l bg-muted text-right align-bottom">
                      Total
                    </TableHead>
                  )}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {filas.map((fila, i) => (
                <TableRow key={fila.municipioId}>
                  <TableCell className={cn(fija, 'font-medium whitespace-normal')}>
                    <span className="flex flex-wrap items-center gap-2">
                      {fila.nombre}
                      {fila.heredada && <MarcaHeredada motivo={fila.motivo} />}
                    </span>
                  </TableCell>
                  {columnas.map((columna, k) => {
                    const clave = llave(fila, columna)
                    const texto = cantidades[clave] ?? ''
                    const valida = leerCantidad(texto).valida
                    const marca = marcas[clave]
                    return (
                      <TableCell key={clave} className={cn('px-1.5 text-center', separa(k))}>
                        <Input
                          aria-label={`${fila.nombre} · ${columna.etiqueta}`}
                          inputMode="numeric"
                          autoComplete="off"
                          data-fila={i}
                          data-col={k}
                          data-celda={clave}
                          data-cambiada={marca === 'CAMBIADA' || undefined}
                          value={texto}
                          disabled={soloLectura}
                          aria-invalid={!valida || marca === 'ERROR' || undefined}
                          onChange={(e) => alCambiar(clave, e.target.value)}
                          onFocus={seleccionarAlEntrar}
                          onKeyDown={moverEntreCasillas}
                          className={cn(
                            'mx-auto h-9 w-full max-w-24 min-w-14 bg-card text-center font-mono transition-colors',
                            valida && texto.trim() !== '' && LLENA,
                            valida && CLASES_MARCA[marca],
                          )}
                        />
                      </TableCell>
                    )
                  })}
                  <TableCell
                    className="border-l bg-muted/40 text-right font-mono font-semibold"
                    aria-label={`Total de ${fila.nombre}`}
                  >
                    {formatoCantidad.format(totalFila(fila))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow className="font-semibold">
                <TableCell className={cn(fija, 'bg-muted')}>Total</TableCell>
                {columnas.map((columna, k) => (
                  <TableCell
                    key={k}
                    className={cn('text-center font-mono', separa(k))}
                    aria-label={`Total de ${columna.etiqueta}`}
                  >
                    {formatoCantidad.format(totalColumna(columna))}
                  </TableCell>
                ))}
                <TableCell className="border-l text-right font-mono" aria-label={`Total de ${nombreTabla}`}>
                  {formatoCantidad.format(filas.reduce((suma, fila) => suma + totalFila(fila), 0))}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </TooltipProvider>
      </div>
    </div>
  )
}

// La tarjeta B: dosis aplicadas a personas de otros municipios (HU-21). formulario: lo que devuelve armarFormulario;
// celdas: las guardadas (de ellas salen las filas heredadas y las de solo lectura); cantidades usan llaveProcedencia.
// municipios, permitidas y modo vienen de GET /reportes/{id}/formulario. marcas: la severidad de la validación por
// llaveProcedencia (SPEC 33).
export default function TarjetaProcedencias({
  formulario,
  celdas,
  cantidades,
  municipios,
  permitidas,
  modo,
  municipioPropioId,
  alCambiar,
  soloLectura = false,
  marcas = {},
}) {
  const filas = filasDeProcedencia({
    formulario,
    permitidas,
    municipios,
    celdas,
    municipioPropioId,
    modo,
    soloLectura,
  })
  const vacia = filas.length === 0 || formulario.tablas.length === 0

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <LetraTarjeta>B</LetraTarjeta>
          <div className="flex flex-col gap-1.5">
            <CardTitle className="text-base">Dosis aplicadas a personas de otros municipios</CardTitle>
            <CardDescription>
              Se atribuyen al municipio de procedencia al calcular la cobertura. Solo cantidades, sin datos personales.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {modo === 'PROPIO_Y_OTROS' && (
          <p className="text-sm text-muted-foreground">
            Este esquema registra juntas las dosis de otros municipios, como en el 5C.
          </p>
        )}
        {vacia ? (
          <div
            className={cn(
              'flex items-center gap-3 rounded-lg border border-dashed px-4 py-5',
              'text-sm text-muted-foreground',
            )}
          >
            <MapPinned className="size-5 shrink-0 text-ring" aria-hidden="true" />
            <p>
              {soloLectura
                ? 'Sin dosis atribuidas a otros municipios.'
                : 'Esta vacuna no tiene municipios de procedencia para registrar.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {formulario.tablas.map((tabla) => (
              <TablaProcedencias
                key={tabla.clave}
                tabla={tabla}
                filas={filas}
                cantidades={cantidades}
                alCambiar={alCambiar}
                soloLectura={soloLectura}
                marcas={marcas}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
