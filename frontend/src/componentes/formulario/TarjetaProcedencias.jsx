import { useState } from 'react'
import { MapPinned, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
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

// Las secciones que incluyen la dosis (las que tienen alguna celda suya).
const seccionesDe = (ubicacion) =>
  ubicacion.tabla.secciones.map((_, i) => i).filter((i) => celdasDeSeccion(ubicacion, i).length > 0)

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

// Las filas de la tarjeta B solo existen en la pantalla: se arman con las celdas de otras procedencias, por municipio
// (en el orden de municipios, el 9999 al final), dosis y sección.
export function filasDeCeldas(formulario, celdas, municipioPropioId, municipios) {
  const dondeEsta = ubicaciones(formulario)
  const ordenDosis = [...dondeEsta.keys()]
  const ordenMunicipio = new Map(municipios.map((m, i) => [m.id, i]))
  const filas = new Map()
  for (const c of celdas) {
    if (c.municipioProcedenciaId === municipioPropioId) continue
    const fila = filaDeCelda(dondeEsta, c)
    if (fila) filas.set(`${fila.municipioId}|${fila.dosis}|${fila.seccion}`, fila)
  }
  const posicion = (id) => ordenMunicipio.get(id) ?? municipios.length
  return [...filas.values()].sort(
    (a, b) =>
      posicion(a.municipioId) - posicion(b.municipioId) ||
      ordenDosis.indexOf(a.dosis) - ordenDosis.indexOf(b.dosis) ||
      a.seccion - b.seccion,
  )
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

const mismaFila = (a, b) => a.municipioId === b.municipioId && a.dosis === b.dosis && a.seccion === b.seccion

function TablaProcedencias({
  tabla,
  filas,
  dondeEsta,
  nombreMunicipio,
  cantidades,
  alCambiar,
  alQuitar,
  soloLectura,
  marcas,
}) {
  const encabezados = encabezadosDeSeccion(tabla)
  const niveles = Math.max(encabezados.length, 1)
  const conGrupo = tabla.secciones.length > 1 || tabla.secciones[0]?.grupoEdad !== null
  const tituloGrupo = tabla.secciones.some((s) => s.grupoEdad) ? 'Grupo de edad' : 'Sección'

  return (
    <div className="flex flex-col gap-2">
      {tabla.titulo && (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ring" />
          {tabla.titulo}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border bg-card">
      <Table aria-label={tabla.titulo ? `Otros municipios · ${tabla.titulo}` : 'Otros municipios'}>
        <TableHeader>
          {(encabezados.length > 0 ? encabezados : [[{ etiqueta: 'Cantidad', columnas: 1 }]]).map((nivel, n) => (
            <TableRow key={n} className="hover:bg-transparent">
              {n === 0 && (
                <>
                  <TableHead rowSpan={niveles}>Municipio de procedencia</TableHead>
                  <TableHead rowSpan={niveles}>Dosis</TableHead>
                  {conGrupo && <TableHead rowSpan={niveles}>{tituloGrupo}</TableHead>}
                </>
              )}
              {nivel.map(({ etiqueta, columnas: abarca }, i) => (
                <TableHead
                  key={i}
                  colSpan={abarca}
                  className={cn(
                    'h-auto py-2 text-center',
                    encabezados.length > 1 && n === encabezados.length - 1
                      ? 'text-xs leading-tight font-medium whitespace-normal text-muted-foreground'
                      : 'bg-accent/40 font-semibold text-accent-foreground',
                  )}
                >
                  {etiqueta}
                </TableHead>
              ))}
              {n === 0 && (
                <>
                  <TableHead rowSpan={niveles} className="border-l bg-muted/60 text-right">
                    Total
                  </TableHead>
                  {!soloLectura && (
                    <TableHead rowSpan={niveles}>
                      <span className="sr-only">Acciones</span>
                    </TableHead>
                  )}
                </>
              )}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {filas.map((fila, i) => {
            const ubicacion = dondeEsta.get(fila.dosis)
            const seccion = tabla.secciones[fila.seccion]
            const nombreFila = [
              nombreMunicipio(fila.municipioId),
              ubicacion.fila.etiqueta,
              ...(conGrupo ? [seccion.titulo] : []),
            ].join(' · ')
            const celdas = celdasDeSeccion(ubicacion, fila.seccion)
            const llaves = celdas.map(({ celda }) => llaveProcedencia(fila.dosis, fila.municipioId, celda.claveCombinacion))
            const total = llaves.reduce((suma, llave) => suma + leerCantidad(cantidades[llave] ?? '').valor, 0)
            return (
              <TableRow key={`${fila.municipioId}|${fila.dosis}|${fila.seccion}`}>
                <TableCell className="font-medium">{nombreMunicipio(fila.municipioId)}</TableCell>
                <TableCell>{ubicacion.fila.etiqueta}</TableCell>
                {conGrupo && <TableCell>{seccion.titulo}</TableCell>}
                {llaves.map((llave, k) => {
                  const columna = etiquetaDeColumna(encabezados, k)
                  const texto = cantidades[llave] ?? ''
                  const valida = leerCantidad(texto).valida
                  const marca = marcas[llave]
                  return (
                    <TableCell key={llave} className="px-1.5 text-center">
                      <Input
                        aria-label={columna ? `${nombreFila} · ${columna}` : nombreFila}
                        inputMode="numeric"
                        autoComplete="off"
                        data-fila={i}
                        data-col={k}
                        data-celda={llave}
                        value={texto}
                        disabled={soloLectura}
                        aria-invalid={!valida || marca === 'ERROR' || undefined}
                        onChange={(e) => alCambiar(llave, e.target.value)}
                        onFocus={seleccionarAlEntrar}
                        onKeyDown={moverEntreCasillas}
                        className={cn(
                          'mx-auto h-9 w-full max-w-24 min-w-14 bg-card text-center font-mono transition-colors',
                          valida && texto.trim() !== '' && 'border-ring/50 bg-accent font-semibold text-accent-foreground',
                          valida && CLASES_MARCA[marca],
                        )}
                      />
                    </TableCell>
                  )
                })}
                <TableCell className="border-l bg-muted/40 text-right font-mono font-semibold" aria-label={`Total de ${nombreFila}`}>
                  {formatoCantidad.format(total)}
                </TableCell>
                {!soloLectura && (
                  <TableCell>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Quitar fila ${nombreFila}`}
                      onClick={() => alQuitar(fila)}
                    >
                      <X />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      </div>
    </div>
  )
}

// Las llaves de las cantidades de una fila, para borrarlas al quitarla.
export function llavesDeFila(formulario, fila) {
  const ubicacion = ubicaciones(formulario).get(fila.dosis)
  return celdasDeSeccion(ubicacion, fila.seccion).map(({ celda }) =>
    llaveProcedencia(fila.dosis, fila.municipioId, celda.claveCombinacion),
  )
}

// Quien lo abre lo monta de nuevo en cada apertura, así empieza vacío.
function DialogoProcedencia({ dondeEsta, filas, opcionesMunicipio, alAgregar, alCerrar }) {
  const [municipio, setMunicipio] = useState(opcionesMunicipio.length === 1 ? String(opcionesMunicipio[0].id) : '')
  const [dosis, setDosis] = useState('')
  const [elegida, setElegida] = useState('')

  const ocupada = (municipioId, codigo, seccion) =>
    filas.some((f) => mismaFila(f, { municipioId, dosis: codigo, seccion }))
  const libres = (municipioId, codigo) =>
    seccionesDe(dondeEsta.get(codigo)).filter((s) => !ocupada(municipioId, codigo, s))
  const municipioId = municipio === '' ? null : Number(municipio)

  const secciones = dosis === '' ? [] : seccionesDe(dondeEsta.get(dosis))
  const tabla = dosis === '' ? null : dondeEsta.get(dosis).tabla
  // Con una sola sección posible no hace falta elegirla.
  const seccion = elegida !== '' ? Number(elegida) : secciones.length === 1 ? secciones[0] : null
  const listo = municipioId !== null && dosis !== '' && seccion !== null && !ocupada(municipioId, dosis, seccion)

  function agregar(evento) {
    evento.preventDefault()
    if (!listo) return
    alAgregar({ municipioId, dosis, seccion })
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={agregar} noValidate>
          <DialogHeader>
            <DialogTitle>Agregar municipio de procedencia</DialogTitle>
            <DialogDescription>
              Elija de dónde son las personas vacunadas y la dosis. La fila se agrega con sus cantidades vacías.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="procedencia-municipio" className="font-semibold">
              Municipio
            </Label>
            <Select name="municipio" value={municipio} onValueChange={setMunicipio}>
              <SelectTrigger id="procedencia-municipio" className="w-full">
                <SelectValue placeholder="Elija el municipio" />
              </SelectTrigger>
              <SelectContent>
                {opcionesMunicipio.map((m) => (
                  <SelectItem
                    key={m.id}
                    value={String(m.id)}
                    disabled={[...dondeEsta.keys()].every((codigo) => libres(m.id, codigo).length === 0)}
                  >
                    {m.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="procedencia-dosis" className="font-semibold">
              Dosis
            </Label>
            <Select
              name="dosis"
              value={dosis}
              onValueChange={(valor) => {
                setDosis(valor)
                setElegida('')
              }}
            >
              <SelectTrigger id="procedencia-dosis" className="w-full">
                <SelectValue placeholder="Elija la dosis" />
              </SelectTrigger>
              <SelectContent>
                {[...dondeEsta.entries()].map(([codigo, { fila }]) => (
                  <SelectItem
                    key={codigo}
                    value={codigo}
                    disabled={municipioId !== null && libres(municipioId, codigo).length === 0}
                  >
                    {fila.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {tabla && tabla.secciones.length > 1 && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="procedencia-seccion" className="font-semibold">
                {tabla.secciones.some((s) => s.grupoEdad) ? 'Grupo de edad' : 'Sección'}
              </Label>
              <Select name="seccion" value={seccion === null ? '' : String(seccion)} onValueChange={setElegida}>
                <SelectTrigger id="procedencia-seccion" className="w-full">
                  <SelectValue placeholder="Elija el grupo" />
                </SelectTrigger>
                <SelectContent>
                  {secciones.map((s) => (
                    <SelectItem
                      key={s}
                      value={String(s)}
                      disabled={municipioId !== null && ocupada(municipioId, dosis, s)}
                    >
                      {tabla.secciones[s].titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!listo}>
              Agregar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

// La tarjeta B: dosis aplicadas a personas de otros municipios (HU-21). formulario: lo que devuelve armarFormulario;
// filas: [{ municipioId, dosis, seccion }] (seccion es la posición en tabla.secciones); cantidades usan
// llaveProcedencia. municipios y permitidas vienen de GET /reportes/{id}/formulario. marcas: la severidad de la
// validación por llaveProcedencia (SPEC 33).
export default function TarjetaProcedencias({
  formulario,
  filas,
  cantidades,
  municipios,
  permitidas,
  modo,
  alAgregar,
  alQuitar,
  alCambiar,
  soloLectura = false,
  marcas = {},
}) {
  const [agregando, setAgregando] = useState(false)
  const dondeEsta = ubicaciones(formulario)
  const nombres = new Map(municipios.map((m) => [m.id, m.nombre]))
  const nombreMunicipio = (id) => nombres.get(id) ?? `Municipio ${id}`
  const opcionesMunicipio = permitidas.map((id) => ({ id, nombre: nombreMunicipio(id) }))
  const tablas = formulario.tablas
    .map((tabla) => ({ tabla, filas: filas.filter((f) => dondeEsta.get(f.dosis)?.tabla === tabla) }))
    .filter(({ filas: deLaTabla }) => deLaTabla.length > 0)

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
        {tablas.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
            <MapPinned className="size-5 shrink-0 text-ring" aria-hidden="true" />
            <p>No hay dosis de otros municipios.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 overflow-x-auto">
            {tablas.map(({ tabla, filas: deLaTabla }) => (
              <TablaProcedencias
                key={tabla.clave}
                tabla={tabla}
                filas={deLaTabla}
                dondeEsta={dondeEsta}
                nombreMunicipio={nombreMunicipio}
                cantidades={cantidades}
                alCambiar={alCambiar}
                alQuitar={alQuitar}
                soloLectura={soloLectura}
                marcas={marcas}
              />
            ))}
          </div>
        )}
        {!soloLectura && permitidas.length > 0 && dondeEsta.size > 0 && (
          <Button type="button" variant="outline" className="self-start border-dashed" onClick={() => setAgregando(true)}>
            <Plus />
            Agregar municipio de procedencia
          </Button>
        )}
      </CardContent>
      {agregando && (
        <DialogoProcedencia
          dondeEsta={dondeEsta}
          filas={filas}
          opcionesMunicipio={opcionesMunicipio}
          alAgregar={(fila) => {
            alAgregar(fila)
            setAgregando(false)
          }}
          alCerrar={() => setAgregando(false)}
        />
      )}
    </Card>
  )
}
