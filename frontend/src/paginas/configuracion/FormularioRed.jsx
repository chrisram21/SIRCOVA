import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { crearRed, editarRed, obtenerOpcionesRed, obtenerRed, reactivarRed } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { LARGOS, validarNombreRed } from '@/validaciones/campos.js'
import { CampoTexto } from '../usuarios/CamposEmpleado.jsx'

const LISTA = '/administracion/redes'
const VACIO = { nombre: '', municipioIds: [], dosisIds: [] }

const ordenar = (ids) => [...ids].sort((a, b) => a - b)
const igual = (a, b) => JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b))
const alternar = (ids, id, marcado) => (marcado ? [...ids, id] : ids.filter((otro) => otro !== id))

const aDatos = (red) => ({
  nombre: red.nombre,
  municipioIds: red.municipios.map((m) => m.id),
  dosisIds: red.trazadoras.map((t) => t.dosisId),
})

// Al crear, las trazadoras las pone el backend (las de por defecto); no se revisan aquí.
function erroresDe(datos, { conTrazadoras }) {
  const errores = {}
  const { error } = validarNombreRed(datos.nombre)
  if (error) errores.nombre = error
  if (datos.municipioIds.length === 0) errores.municipioIds = 'Elija al menos un municipio.'
  if (conTrazadoras && datos.dosisIds.length === 0) errores.dosisIds = 'Elija al menos una trazadora.'
  return errores
}

// Solo lo que cambió, como lo espera PATCH /redes/{id}.
function cambiosDe(base, datos) {
  const cambios = {}
  if (datos.nombre.trim() !== base.nombre) cambios.nombre = datos.nombre.trim()
  if (!igual(datos.municipioIds, base.municipioIds)) cambios.municipioIds = ordenar(datos.municipioIds)
  if (!igual(datos.dosisIds, base.dosisIds)) cambios.dosisIds = ordenar(datos.dosisIds)
  return cambios
}

function Casilla({ id, etiqueta, nombreAccesible, marcado, alCambiar, deshabilitado, invalido, extra }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={marcado}
        onCheckedChange={(valor) => alCambiar(valor === true)}
        disabled={deshabilitado}
        aria-label={nombreAccesible}
        aria-invalid={invalido ? true : undefined}
      />
      <Label htmlFor={id} className="font-normal">
        {etiqueta}
        {extra}
      </Label>
    </div>
  )
}

function MensajeError({ id, children }) {
  return (
    <p id={id} className="text-sm text-destructive">
      {children}
    </p>
  )
}

// Las vacunas de las opciones con sus dosis activas, y al final las trazadoras guardadas que ya no se ofrecen
// (dosis o vacuna inactiva), para poder quitarlas.
function gruposDeTrazadoras(vacunas, guardadas) {
  const ofrecidas = new Set(vacunas.flatMap((v) => v.dosis.map((d) => d.id)))
  const grupos = vacunas.map((v) => ({
    id: v.id,
    nombre: v.nombre,
    dosis: v.dosis.map((d) => ({ ...d, inactiva: false })),
  }))
  for (const t of guardadas.filter((g) => !ofrecidas.has(g.dosisId))) {
    let grupo = grupos.find((g) => g.id === t.vacuna.id)
    if (!grupo) {
      grupo = { id: t.vacuna.id, nombre: t.vacuna.nombre, dosis: [] }
      grupos.push(grupo)
    }
    grupo.dosis.push({ id: t.dosisId, codigo: t.codigo, nombre: t.nombre, esTrazadora: false, inactiva: true })
  }
  return grupos
}

// Sin `id` registra una red nueva; con `id` edita esa red, o la reactiva si está inactiva.
export default function FormularioRed({ id }) {
  const editando = id !== undefined
  const navigate = useNavigate()
  const { state } = useLocation()
  // La lista manda su búsqueda al abrir el formulario, para volver a ella con la misma.
  const volverA = `${LISTA}${state?.volverA ?? ''}`

  const [opciones, setOpciones] = useState(null)
  const [red, setRed] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [datos, setDatos] = useState(VACIO)
  const [tocados, setTocados] = useState({})
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  // Tras guardar se sale en un efecto, cuando el aviso de cambios sin guardar ya no bloquea.
  const [guardado, setGuardado] = useState(false)
  // Cada intento de envío con errores sube este número; un efecto lleva el foco al primer campo inválido.
  const [revisar, setRevisar] = useState(0)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const formulario = useRef(null)
  const avisoError = useRef(null)

  useEffect(() => {
    let vigente = true
    Promise.all([obtenerOpcionesRed(), editando ? obtenerRed(id) : null])
      .then(([opcionesCargadas, redCargada]) => {
        if (!vigente) return
        setOpciones(opcionesCargadas)
        if (redCargada) {
          setRed(redCargada)
          setDatos(aDatos(redCargada))
        }
      })
      .catch((err) => {
        if (vigente) setErrorCarga(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [editando, id, intentoCarga])

  const reactivando = red !== null && !red.activo
  const base = red ? aDatos(red) : VACIO
  const cambios = cambiosDe(base, datos)
  const hayCambios = Object.keys(cambios).length > 0
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !guardado)
  const errores = erroresDe(datos, { conTrazadoras: editando })
  const errorDe = (campo) => (intentado || tocados[campo] ? errores[campo] : undefined)
  const cargado = opciones !== null && (!editando || red !== null)
  const deshabilitado = !cargado || enviando

  const cambiar = (campo, valor) => setDatos((actual) => ({ ...actual, [campo]: valor }))
  const porDefecto = (opciones?.vacunas ?? []).flatMap((v) => v.dosis.filter((d) => d.esTrazadora).map((d) => d.id))

  useEffect(() => {
    if (guardado) navigate(volverA)
  }, [guardado, navigate, volverA])

  useEffect(() => {
    if (revisar > 0) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView?.({ block: 'nearest' })
  }, [error])

  function reintentarCarga() {
    setErrorCarga(null)
    setIntentoCarga((n) => n + 1)
  }

  async function enviar(evento) {
    evento.preventDefault()
    setIntentado(true)
    if (deshabilitado) return
    if (Object.keys(errores).length > 0) {
      setRevisar((n) => n + 1)
      return
    }
    if (editando && !reactivando && !hayCambios) {
      toast.info('No hay cambios que guardar.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      let respuesta
      if (!editando) {
        respuesta = await crearRed({ nombre: datos.nombre.trim(), municipioIds: ordenar(datos.municipioIds) })
      } else if (reactivando) {
        respuesta = await reactivarRed(id, { ...cambios, municipioIds: ordenar(datos.municipioIds) })
      } else {
        respuesta = await editarRed(id, cambios)
      }
      const hecho = !editando ? 'registrada' : reactivando ? 'reactivada' : 'actualizada'
      toast.success(`${respuesta.nombre} ${hecho}.`)
      setGuardado(true)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const titulo = !editando ? 'Nueva red' : reactivando ? 'Reactivar red' : 'Editar red'
  const textoBoton = enviando
    ? 'Guardando…'
    : !editando
      ? 'Registrar red'
      : reactivando
        ? 'Reactivar red'
        : 'Guardar cambios'
  const errorMunicipios = errorDe('municipioIds')
  const errorTrazadoras = errorDe('dosisIds')

  return (
    <section className="flex max-w-4xl flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Administración" titulo={titulo} volverA={volverA} />

      {errorCarga && (
        <AvisoError onReintentar={reintentarCarga}>
          No se pudieron cargar los datos del formulario: {errorCarga}
        </AvisoError>
      )}

      <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la red</CardTitle>
            {reactivando && (
              <CardDescription>
                La red está inactiva y no tiene municipios. Elija sus municipios para reactivarla.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <CampoTexto
              id="nombre"
              etiqueta="Nombre"
              obligatorio
              valor={datos.nombre}
              alCambiar={(valor) => cambiar('nombre', valor)}
              onBlur={() => setTocados((actual) => ({ ...actual, nombre: true }))}
              error={errorDe('nombre')}
              deshabilitado={deshabilitado}
              maxLength={LARGOS.nombreRed}
              ayuda={editando ? undefined : 'El código se genera al guardar.'}
            />
            {red && (
              <dl className="flex flex-col gap-1">
                <dt className="text-sm text-muted-foreground">Código</dt>
                <dd>{red.codigo}</dd>
              </dl>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Municipios</CardTitle>
            <CardDescription>Cada municipio pertenece a una sola red.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <fieldset aria-label="Municipios" aria-describedby={errorMunicipios ? 'municipios-error' : undefined}>
              <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                {(opciones?.municipios ?? []).map((m, i) => {
                  const enOtraRed = m.red !== null && m.red.id !== red?.id
                  return (
                    <Casilla
                      key={m.id}
                      id={`municipio-${m.id}`}
                      etiqueta={m.nombre}
                      nombreAccesible={enOtraRed ? `${m.nombre} · ${m.red.nombre}` : undefined}
                      extra={enOtraRed && <span className="text-muted-foreground">· {m.red.nombre}</span>}
                      marcado={datos.municipioIds.includes(m.id)}
                      alCambiar={(marcado) => cambiar('municipioIds', alternar(datos.municipioIds, m.id, marcado))}
                      deshabilitado={deshabilitado || enOtraRed}
                      invalido={errorMunicipios !== undefined && i === 0}
                    />
                  )
                })}
              </div>
            </fieldset>
            {errorMunicipios && <MensajeError id="municipios-error">{errorMunicipios}</MensajeError>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Trazadoras</CardTitle>
            <CardDescription>
              {editando
                ? 'Las dosis que se presentan en la cobertura de la red.'
                : 'La red empieza con las dosis trazadoras de cada vacuna; se ajustan después, al editarla.'}
            </CardDescription>
          </CardHeader>
          {editando && (
            <CardContent className="flex flex-col gap-3">
              <Button
                type="button"
                variant="outline"
                className="self-start"
                disabled={deshabilitado}
                onClick={() => cambiar('dosisIds', porDefecto)}
              >
                <RotateCcw />
                Restablecer trazadoras por defecto
              </Button>
              <fieldset aria-label="Trazadoras" aria-describedby={errorTrazadoras ? 'trazadoras-error' : undefined}>
                <div className="flex flex-col divide-y">
                  {gruposDeTrazadoras(opciones?.vacunas ?? [], red?.trazadoras ?? []).map((grupo, i) => (
                    <div key={grupo.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-4">
                      <span className="font-medium sm:w-56 sm:shrink-0">{grupo.nombre}</span>
                      <div className="flex flex-wrap gap-x-5 gap-y-2">
                        {grupo.dosis.map((d, j) => (
                          <Casilla
                            key={d.id}
                            id={`dosis-${d.id}`}
                            etiqueta={d.codigo}
                            nombreAccesible={`${grupo.nombre} ${d.codigo}${d.inactiva ? ' (inactiva)' : ''}`}
                            extra={d.inactiva && <Badge variant="outline" className="ml-1">inactiva</Badge>}
                            marcado={datos.dosisIds.includes(d.id)}
                            alCambiar={(marcado) => cambiar('dosisIds', alternar(datos.dosisIds, d.id, marcado))}
                            deshabilitado={deshabilitado}
                            invalido={errorTrazadoras !== undefined && i === 0 && j === 0}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </fieldset>
              {errorTrazadoras && <MensajeError id="trazadoras-error">{errorTrazadoras}</MensajeError>}
            </CardContent>
          )}
        </Card>

        {error && (
          <div ref={avisoError}>
            <AvisoError>{error}</AvisoError>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={deshabilitado}>
            {textoBoton}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(volverA)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </form>

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Si sale ahora, se pierden los cambios de la red." />
    </section>
  )
}
