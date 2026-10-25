import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, CircleAlert, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { obtenerVacuna } from '@/api/catalogos.js'
import { listarDimensiones } from '@/api/configuracion.js'
import { validarTituloSeccion } from '@/validaciones/campos.js'
import { GRUPO_EDAD, problemasDeCoherencia, valoresDeEdad } from './coherenciaEsquema.js'

// Lo que necesita el editor además del esquema: la vacuna con todas sus dosis y las dimensiones activas. En solo
// lectura van todas, para mostrar también las etiquetas de lo que ya está inactivo.
export async function cargarReferencias(vacunaId, { todasLasDimensiones = false } = {}) {
  const [vacuna, dimensiones] = await Promise.all([
    obtenerVacuna(vacunaId),
    listarDimensiones(todasLasDimensiones ? {} : { activa: true }),
  ])
  return { vacuna, dimensiones }
}

// El contenido de un esquema de la API en la forma del cuerpo del PUT, que es la que recibe el editor.
export const contenidoDe = (esquema) => ({
  procedencia: esquema.procedencia,
  dosis: esquema.dosis.map(({ codigo, desagregacion }) => ({ codigo, desagregacion })),
  desagregacion: esquema.desagregacion,
  secciones: esquema.secciones.map(({ titulo, grupoEdad, dosis }) => ({ titulo, grupoEdad, dosis })),
})

export const PESTANA_ESQUEMAS = '?pestana=esquemas'

const MODOS = [
  { valor: 'MUNICIPIO_DETALLADO', etiqueta: 'Por municipio de procedencia' },
  { valor: 'PROPIO_Y_OTROS', etiqueta: 'Propio y otros, como el 5C' },
]

const copiar = (desagregacion) => desagregacion.map(({ dimension, valores }) => ({ dimension, valores: [...valores] }))
const conValor = (lista, valor, incluir) => (incluir ? [...lista, valor] : lista.filter((v) => v !== valor))

function Inactivo() {
  return (
    <Badge variant="outline" className="border-destructive/40 text-destructive">
      Inactivo
    </Badge>
  )
}

function Marca({ id, etiqueta, nombre, marcada, alCambiar, deshabilitada, extra }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        aria-label={nombre}
        checked={marcada}
        disabled={deshabilitada}
        onCheckedChange={(valor) => alCambiar(valor === true)}
      />
      <Label htmlFor={id} className="font-normal">
        {etiqueta}
      </Label>
      {extra}
    </div>
  )
}

// El editor común de los borradores (SPEC 19). Recibe el contenido inicial en la forma del cuerpo del POST, y
// onGuardar recibe el contenido editado; un error de onGuardar se muestra aquí y conserva lo editado.
// onPublicar (SPEC 20) recibe el contenido si hay cambios sin guardar, o null. soloLectura muestra una versión sin
// dejar cambiarla.
export default function EditorEsquema({
  vacuna,
  origen,
  notaCopia,
  dosisVacuna,
  dimensiones,
  inicial,
  onGuardar,
  onPublicar,
  volverA,
  soloLectura = false,
}) {
  const siguienteClave = useRef(0)
  const conClave = (seccion) => ({ ...seccion, clave: siguienteClave.current++ })
  const [esquema, setEsquema] = useState(() => ({ ...inicial, secciones: inicial.secciones.map(conClave) }))
  const [tocados, setTocados] = useState(() => new Set())
  const [guardando, setGuardando] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState(null)
  // Lo último guardado, para saber si «Publicar» tiene que guardar antes.
  const [guardado, setGuardado] = useState(() => JSON.stringify(contenidoDe(inicial)))

  const dimensionDe = (codigo) => dimensiones.find((d) => d.codigo === codigo)
  // Los valores activos del catálogo, en su orden, más los elegidos que ya no están activos (marcados).
  const valoresDe = (codigo, elegidos) => {
    const catalogo = dimensionDe(codigo)
    const activos = (catalogo?.valores ?? []).filter((v) => v.activo)
    const fuera = elegidos.filter((v) => !activos.some((a) => a.codigo === v))
    return [
      ...activos.map((v) => ({ codigo: v.codigo, etiqueta: v.etiqueta, inactivo: false })),
      ...fuera.map((v) => ({
        codigo: v,
        etiqueta: catalogo?.valores.find((c) => c.codigo === v)?.etiqueta ?? v,
        inactivo: true,
      })),
    ]
  }
  const etiquetaDeValor = (dimension, valor) => dimensionDe(dimension)?.valores.find((v) => v.codigo === valor)?.etiqueta ?? valor

  const ordenDeDosis = (codigo) => dosisVacuna.find((d) => d.codigo === codigo)?.orden ?? Number.MAX_SAFE_INTEGER
  const dosisActivas = dosisVacuna.filter((d) => d.activa).sort((a, b) => a.orden - b.orden)
  const dosisMostradas = [
    ...dosisActivas.map((d) => ({ codigo: d.codigo, nombre: d.nombre, inactiva: false })),
    ...esquema.dosis
      .filter((d) => !dosisActivas.some((a) => a.codigo === d.codigo))
      .map((d) => ({
        codigo: d.codigo,
        nombre: dosisVacuna.find((v) => v.codigo === d.codigo)?.nombre ?? d.codigo,
        inactiva: true,
      })),
  ]
  const nombreDeDosis = (codigo) => dosisMostradas.find((d) => d.codigo === codigo)?.nombre ?? codigo

  const porEdad = valoresDeEdad(esquema.desagregacion) !== null
  const gruposDeEdad = valoresDeEdad(esquema.desagregacion) ?? []

  const actualizar = (cambio) => {
    setErrorGuardar(null)
    setEsquema((actual) => ({ ...actual, ...cambio(actual) }))
  }

  // Dosis

  function marcarDosis(codigo, marcada) {
    actualizar((actual) => ({
      dosis: marcada
        ? [...actual.dosis, { codigo, desagregacion: null }].sort((a, b) => ordenDeDosis(a.codigo) - ordenDeDosis(b.codigo))
        : actual.dosis.filter((d) => d.codigo !== codigo),
      // Una dosis que sale del esquema sale también de sus secciones.
      secciones: marcada ? actual.secciones : actual.secciones.map((s) => ({ ...s, dosis: s.dosis.filter((d) => d !== codigo) })),
    }))
  }

  function cambiarPropia(codigo, cambio) {
    actualizar((actual) => ({
      dosis: actual.dosis.map((d) => (d.codigo === codigo ? { ...d, desagregacion: cambio(d.desagregacion, actual) } : d)),
    }))
  }

  // Desagregación general

  function agregarDimension(codigo) {
    const activos = (dimensionDe(codigo)?.valores ?? []).filter((v) => v.activo).map((v) => v.codigo)
    actualizar((actual) => ({ desagregacion: [...actual.desagregacion, { dimension: codigo, valores: activos }] }))
  }

  // Lo que deja de estar en la general deja de estar en las dosis y en las secciones.
  function quitarDimension(codigo) {
    actualizar((actual) => ({
      desagregacion: actual.desagregacion.filter((d) => d.dimension !== codigo),
      dosis: actual.dosis.map((d) =>
        d.desagregacion === null ? d : { ...d, desagregacion: d.desagregacion.filter((x) => x.dimension !== codigo) },
      ),
      secciones: codigo === GRUPO_EDAD ? actual.secciones.map((s) => ({ ...s, grupoEdad: null })) : actual.secciones,
    }))
  }

  function marcarValor(dimension, valor, marcado) {
    actualizar((actual) => ({
      desagregacion: actual.desagregacion.map((d) =>
        d.dimension === dimension ? { ...d, valores: conValor(d.valores, valor, marcado) } : d,
      ),
      dosis: marcado
        ? actual.dosis
        : actual.dosis.map((d) =>
          d.desagregacion === null
            ? d
            : {
              ...d,
              desagregacion: d.desagregacion.map((x) =>
                x.dimension === dimension ? { ...x, valores: x.valores.filter((v) => v !== valor) } : x,
              ),
            },
        ),
      secciones:
        marcado || dimension !== GRUPO_EDAD
          ? actual.secciones
          : actual.secciones.map((s) => (s.grupoEdad === valor ? { ...s, grupoEdad: null } : s)),
    }))
  }

  // Secciones

  const cambiarSeccion = (clave, cambio) =>
    actualizar((actual) => ({ secciones: actual.secciones.map((s) => (s.clave === clave ? { ...s, ...cambio(s) } : s)) }))

  function moverSeccion(indice, paso) {
    actualizar((actual) => {
      const secciones = [...actual.secciones]
      ;[secciones[indice], secciones[indice + paso]] = [secciones[indice + paso], secciones[indice]]
      return { secciones }
    })
  }

  const contenido = {
    procedencia: esquema.procedencia,
    dosis: esquema.dosis,
    desagregacion: esquema.desagregacion,
    secciones: esquema.secciones.map(({ titulo, grupoEdad, dosis }) => ({ titulo, grupoEdad, dosis })),
  }
  const erroresDeTitulo = esquema.secciones.map((s) => validarTituloSeccion(s.titulo).error ?? null)
  // Una sección sin título se nombra por su número en los mensajes; lo que se guarda no cambia.
  const paraRevisar = {
    ...contenido,
    secciones: contenido.secciones.map((s, i) => ({ ...s, titulo: s.titulo.trim() || String(i + 1) })),
  }
  const problemas = [
    ...erroresDeTitulo.flatMap((error, i) => (error ? [`Sección ${i + 1}: ${error}`] : [])),
    ...problemasDeCoherencia(paraRevisar, { vacuna, dosis: dosisVacuna, dimensiones }),
  ]

  const conCambios = JSON.stringify(contenido) !== guardado

  async function guardar(evento) {
    evento.preventDefault()
    if (soloLectura || problemas.length > 0) return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      await onGuardar(contenido)
    } catch (err) {
      setErrorGuardar(err.mensaje ?? 'Ocurrió un error inesperado. Intente de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function publicar() {
    if (problemas.length > 0) return
    setGuardando(true)
    setErrorGuardar(null)
    try {
      await onPublicar(conCambios ? contenido : null)
      if (conCambios) setGuardado(JSON.stringify(contenido))
    } catch (err) {
      setErrorGuardar(err.mensaje ?? 'Ocurrió un error inesperado. Intente de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  const disponibles = dimensiones
    .filter((d) => d.activa && !esquema.desagregacion.some((x) => x.dimension === d.codigo))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return (
    // Dentro de un form, Radix agrega el <select> nativo de cada Select.
    <form onSubmit={guardar} noValidate className="flex flex-col gap-6">
      {/* En solo lectura, el fieldset deshabilita todos los controles, también los de Radix (son botones). */}
      <fieldset disabled={soloLectura} className="flex min-w-0 flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{vacuna.nombre}</CardTitle>
            <CardDescription>{origen}</CardDescription>
          </CardHeader>
          {notaCopia && (
            <CardContent>
              <p className="text-sm text-muted-foreground">{notaCopia}</p>
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dosis</CardTitle>
            <CardDescription>
              Las dosis que pide el formulario. Con «Desagregación propia», la dosis reemplaza la desagregación general.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {dosisMostradas.map(({ codigo, nombre, inactiva }) => {
              const enEsquema = esquema.dosis.find((d) => d.codigo === codigo)
              const propia = enEsquema?.desagregacion ?? null
              return (
                <div key={codigo} className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Marca
                      id={`dosis-${codigo}`}
                      nombre={`${nombre} (${codigo})`}
                      etiqueta={`${nombre} (${codigo})`}
                      marcada={Boolean(enEsquema)}
                      alCambiar={(marcada) => marcarDosis(codigo, marcada)}
                      extra={inactiva && <Inactivo />}
                    />
                    {enEsquema && (
                      <div className="flex items-center gap-2">
                        <Switch
                          id={`propia-${codigo}`}
                          aria-label={`Desagregación propia de ${codigo}`}
                          checked={propia !== null}
                          onCheckedChange={(encendida) =>
                            cambiarPropia(codigo, (_, actual) => (encendida ? copiar(actual.desagregacion) : null))
                          }
                        />
                        <Label htmlFor={`propia-${codigo}`} className="font-normal">
                          Desagregación propia
                        </Label>
                      </div>
                    )}
                  </div>
                  {propia !== null && (
                    <div className="flex flex-col gap-3 border-t pt-3">
                      <Marca
                        id={`sin-${codigo}`}
                        nombre={`Sin desagregar ${codigo}`}
                        etiqueta="Sin desagregar"
                        marcada={propia.length === 0}
                        alCambiar={(marcada) => cambiarPropia(codigo, (_, actual) => (marcada ? [] : copiar(actual.desagregacion)))}
                      />
                      {propia.length > 0 &&
                        esquema.desagregacion.map(({ dimension, valores: generales }) => {
                          const incluida = propia.find((x) => x.dimension === dimension)
                          const nombreDimension = dimensionDe(dimension)?.nombre ?? dimension
                          return (
                            <div key={dimension} className="flex flex-col gap-2">
                              {/* grupo_edad no se quita: el grupo de edad de la celda sale de la sección. */}
                              <Marca
                                id={`propia-${codigo}-${dimension}`}
                                nombre={`Por ${nombreDimension} en ${codigo}`}
                                etiqueta={`Por ${nombreDimension}`}
                                marcada={Boolean(incluida)}
                                deshabilitada={dimension === GRUPO_EDAD && Boolean(incluida)}
                                alCambiar={(marcada) =>
                                  cambiarPropia(codigo, (lista) =>
                                    marcada
                                      ? [...lista, { dimension, valores: [...generales] }]
                                      : lista.filter((x) => x.dimension !== dimension),
                                  )
                                }
                              />
                              {incluida && (
                                <div className="flex flex-wrap gap-x-4 gap-y-2 pl-6">
                                  {[...new Set([...generales, ...incluida.valores])].map((valor) => (
                                    <Marca
                                      key={valor}
                                      id={`propia-${codigo}-${dimension}-${valor}`}
                                      nombre={`${etiquetaDeValor(dimension, valor)} en ${codigo}`}
                                      etiqueta={etiquetaDeValor(dimension, valor)}
                                      marcada={incluida.valores.includes(valor)}
                                      alCambiar={(marcado) =>
                                        cambiarPropia(codigo, (lista) =>
                                          lista.map((x) =>
                                            x.dimension === dimension ? { ...x, valores: conValor(x.valores, valor, marcado) } : x,
                                          ),
                                        )
                                      }
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                    </div>
                  )}
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Desagregación</CardTitle>
            <CardDescription>
              Las dimensiones del catálogo que usa la vacuna y los valores de cada una. Sin dimensiones, se reporta solo
              el total por dosis.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {esquema.desagregacion.map(({ dimension, valores }) => {
              const catalogo = dimensionDe(dimension)
              return (
                <div key={dimension} className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{catalogo?.nombre ?? dimension}</span>
                      <span className="text-xs text-muted-foreground">{dimension}</span>
                      {(!catalogo || !catalogo.activa) && <Inactivo />}
                    </div>
                    {!soloLectura && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Quitar ${dimension}`}
                        onClick={() => quitarDimension(dimension)}
                      >
                        <Trash2 />
                        Quitar
                      </Button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {valoresDe(dimension, valores).map((v) => (
                      <Marca
                        key={v.codigo}
                        id={`valor-${dimension}-${v.codigo}`}
                        nombre={`${v.etiqueta} de ${dimension}`}
                        etiqueta={v.etiqueta}
                        marcada={valores.includes(v.codigo)}
                        alCambiar={(marcado) => marcarValor(dimension, v.codigo, marcado)}
                        extra={v.inactivo && <Inactivo />}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {!soloLectura && disponibles.length > 0 && (
              <Select name="agregar-dimension" value="" onValueChange={agregarDimension}>
                <SelectTrigger aria-label="Agregar dimensión" className="w-full bg-card sm:w-72">
                  <SelectValue placeholder="Agregar dimensión" />
                </SelectTrigger>
                <SelectContent>
                  {disponibles.map((d) => (
                    <SelectItem key={d.codigo} value={d.codigo}>
                      {d.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Procedencia</CardTitle>
            <CardDescription>Cómo se registra de dónde viene la persona vacunada.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <RadioGroup
              aria-label="Modo de procedencia"
              value={esquema.procedencia.modo}
              onValueChange={(modo) => actualizar((actual) => ({ procedencia: { ...actual.procedencia, modo } }))}
            >
              {MODOS.map((m) => (
                <div key={m.valor} className="flex items-center gap-2">
                  <RadioGroupItem id={`modo-${m.valor}`} value={m.valor} />
                  <Label htmlFor={`modo-${m.valor}`} className="font-normal">
                    {m.etiqueta}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            <Marca
              id="permite-no-especificado"
              nombre="Permitir procedencia no especificada"
              etiqueta="Permitir procedencia no especificada"
              marcada={esquema.procedencia.permiteNoEspecificado}
              alCambiar={(permite) =>
                actualizar((actual) => ({ procedencia: { ...actual.procedencia, permiteNoEspecificado: permite } }))
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Secciones</CardTitle>
            <CardDescription>
              {porEdad
                ? 'Los encabezados del formulario, uno por grupo de edad, con las dosis que se capturan en cada uno.'
                : 'Sin desagregación por grupo de edad, el formulario lleva una sola sección.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {esquema.secciones.map((seccion, i) => {
              const numero = i + 1
              const errorTitulo = tocados.has(seccion.clave) ? erroresDeTitulo[i] : null
              return (
                <div key={seccion.clave} className="flex flex-col gap-3 rounded-lg border p-3">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex min-w-48 flex-1 flex-col gap-1">
                      <Label htmlFor={`titulo-${seccion.clave}`}>Título</Label>
                      <Input
                        id={`titulo-${seccion.clave}`}
                        aria-label={`Título de la sección ${numero}`}
                        value={seccion.titulo}
                        aria-invalid={errorTitulo ? true : undefined}
                        onChange={(evento) => cambiarSeccion(seccion.clave, () => ({ titulo: evento.target.value }))}
                        onBlur={() => setTocados((actuales) => new Set(actuales).add(seccion.clave))}
                      />
                    </div>
                    {porEdad && (
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">Grupo de edad</span>
                        <Select
                          name={`grupo-seccion-${numero}`}
                          value={seccion.grupoEdad ?? ''}
                          onValueChange={(grupo) => cambiarSeccion(seccion.clave, () => ({ grupoEdad: grupo }))}
                        >
                          <SelectTrigger aria-label={`Grupo de edad de la sección ${numero}`} className="w-full bg-card sm:w-56">
                            <SelectValue placeholder="Elija el grupo" />
                          </SelectTrigger>
                          <SelectContent>
                            {gruposDeEdad.map((grupo) => (
                              <SelectItem key={grupo} value={grupo}>
                                {etiquetaDeValor(GRUPO_EDAD, grupo)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {!soloLectura && (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Subir la sección ${numero}`}
                          disabled={i === 0}
                          onClick={() => moverSeccion(i, -1)}
                        >
                          <ArrowUp />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Bajar la sección ${numero}`}
                          disabled={i === esquema.secciones.length - 1}
                          onClick={() => moverSeccion(i, 1)}
                        >
                          <ArrowDown />
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          aria-label={`Quitar la sección ${numero}`}
                          onClick={() => actualizar((actual) => ({ secciones: actual.secciones.filter((s) => s.clave !== seccion.clave) }))}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    )}
                  </div>
                  {errorTitulo && <p className="text-sm text-destructive">{errorTitulo}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-2">
                    {esquema.dosis.map(({ codigo }) => (
                      <Marca
                        key={codigo}
                        id={`seccion-${seccion.clave}-${codigo}`}
                        nombre={`${codigo} en la sección ${numero}`}
                        etiqueta={nombreDeDosis(codigo)}
                        marcada={seccion.dosis.includes(codigo)}
                        alCambiar={(marcada) =>
                          cambiarSeccion(seccion.clave, (s) => ({
                            dosis: conValor(s.dosis, codigo, marcada).sort((a, b) => ordenDeDosis(a) - ordenDeDosis(b)),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            {!soloLectura && (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!porEdad && esquema.secciones.length >= 1}
                  onClick={() =>
                    actualizar((actual) => ({ secciones: [...actual.secciones, conClave({ titulo: '', grupoEdad: null, dosis: [] })] }))
                  }
                >
                  <Plus />
                  Agregar sección
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </fieldset>

      {!soloLectura && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Problemas</CardTitle>
              <CardDescription>El borrador se guarda cuando no queda ninguno.</CardDescription>
            </CardHeader>
            <CardContent>
              {problemas.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay problemas.</p>
              ) : (
                <ul aria-label="Problemas del esquema" className="flex list-disc flex-col gap-1 pl-5 text-sm text-destructive">
                  {problemas.map((problema) => (
                    <li key={problema}>{problema}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {errorGuardar && (
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
              <CircleAlert />
              <AlertDescription>{errorGuardar}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <Button asChild variant="outline">
              <Link to={volverA}>Cancelar</Link>
            </Button>
            {onPublicar && (
              <Button type="button" variant="outline" disabled={problemas.length > 0 || guardando} onClick={publicar}>
                {conCambios ? 'Guardar y publicar' : 'Publicar'}
              </Button>
            )}
            <Button type="submit" disabled={problemas.length > 0 || guardando}>
              {guardando ? 'Guardando…' : 'Guardar borrador'}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}
