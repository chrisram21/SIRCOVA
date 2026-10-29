import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Plus } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  desactivarValorDimension,
  editarDimension,
  editarValorDimension,
  obtenerDimension,
  ordenarValoresDimension,
  reactivarValorDimension,
} from '@/api/configuracion.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import {
  LARGOS,
  validarDescripcionDimension,
  validarEtiquetaValorDimension,
  validarNombreDimension,
} from '@/validaciones/campos.js'
import { Campo, CampoTexto } from '../usuarios/CamposEmpleado.jsx'
import DialogoValorDimension from './DialogoValorDimension.jsx'

// Ruta de la pestaña si se llegó a la página sin pasar por ella (p. ej. con la dirección escrita a mano).
const PESTANA = '?pestana=dimensiones'
const TIPOS = { CATEGORICA: 'Categórica', RANGO_EDAD: 'Rango de edad' }
const SIN_GRUPOS = 'Todos los grupos de la clasificación de población ya están en esta dimensión.'

const REGLAS = { nombre: validarNombreDimension, descripcion: validarDescripcionDimension }

// Lo que devuelve la API, en la forma del formulario: los Input no aceptan null.
const aDatos = (dimension) => ({ nombre: dimension.nombre, descripcion: dimension.descripcion ?? '' })

// Solo los campos que cambiaron, como los espera PATCH /dimensiones/{codigo}. Una descripción vacía la quita.
function cambiosDe(base, actual) {
  const cambios = {}
  if (actual.nombre.trim() !== base.nombre.trim()) cambios.nombre = actual.nombre.trim()
  if (actual.descripcion.trim() !== base.descripcion.trim()) cambios.descripcion = actual.descripcion.trim() || null
  return cambios
}

function MensajeError({ id, mensaje }) {
  if (!mensaje) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {mensaje}
    </p>
  )
}

// Un botón deshabilitado no recibe el foco: el Tooltip con el motivo va en un span que sí.
function ConMotivo({ motivo, children }) {
  if (!motivo) return children
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0}>{children}</span>
      </TooltipTrigger>
      <TooltipContent>{motivo}</TooltipContent>
    </Tooltip>
  )
}

// Solo cambia la etiqueta. Quien lo abre lo monta de nuevo en cada apertura, así empieza con la etiqueta actual.
function DialogoEtiqueta({ dimension, valor, alGuardar, alCerrar }) {
  const [etiqueta, setEtiqueta] = useState(valor.etiqueta)
  const [error, setError] = useState(null)
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // Cada intento con error sube este número; un efecto lleva el foco al campo.
  const [revisar, setRevisar] = useState(0)
  const campo = useRef(null)

  useEffect(() => {
    if (revisar > 0) campo.current?.focus()
  }, [revisar])

  async function guardar(evento) {
    evento.preventDefault()
    const validacion = validarEtiquetaValorDimension(etiqueta)
    setError(validacion.error ?? null)
    if (validacion.error) {
      setRevisar((n) => n + 1)
      return
    }
    if (validacion.valor === valor.etiqueta) return alCerrar()
    setGuardando(true)
    setErrorApi(null)
    try {
      const actualizada = await editarValorDimension(dimension.codigo, valor.codigo, { etiqueta: validacion.valor })
      alGuardar(actualizada, `Etiqueta de ${valor.codigo} actualizada.`)
    } catch (err) {
      setErrorApi(mensajeDeError(err))
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !guardando && alCerrar()}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>Editar la etiqueta de {valor.codigo}</DialogTitle>
            <DialogDescription>El código, el orden y el rango de edad no cambian.</DialogDescription>
          </DialogHeader>
          {errorApi && <AvisoError>{errorApi}</AvisoError>}
          <CampoTexto
            ref={campo}
            id="etiqueta-valor"
            etiqueta="Etiqueta"
            obligatorio
            valor={etiqueta}
            alCambiar={setEtiqueta}
            error={error}
            deshabilitado={guardando}
            maxLength={LARGOS.etiquetaValorDimension}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function TablaValores({ dimension, ocupado, alMover, alEditar, alCambiarEstado }) {
  const esRango = dimension.tipo === 'RANGO_EDAD'
  const activos = dimension.valores.filter((v) => v.activo).length
  return (
    <div className="overflow-x-auto rounded-lg border">
      <TooltipProvider>
        <Table aria-label="Valores">
          <TableHeader>
            <TableRow>
              <TableHead>Orden</TableHead>
              <TableHead>Código</TableHead>
              <TableHead>Etiqueta</TableHead>
              {esRango && <TableHead>Rango</TableHead>}
              <TableHead>Estado</TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {dimension.valores.map((v, i) => {
              // El backend respondería 409: un valor en uso o el último activo no se desactiva.
              const motivo = v.enUso
                ? 'Lo usa un esquema vigente o en borrador.'
                : v.activo && activos === 1
                  ? 'La dimensión debe conservar al menos un valor activo.'
                  : null
              return (
                <TableRow key={v.codigo}>
                  <TableCell>{v.orden}</TableCell>
                  <TableCell>{v.codigo}</TableCell>
                  <TableCell className="font-medium">{v.etiqueta}</TableCell>
                  {esRango && (
                    <TableCell>
                      {v.edadMinMeses} a {v.edadMaxMeses} meses
                    </TableCell>
                  )}
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {v.activo ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}
                      {v.enUso && <Badge variant="outline">En uso</Badge>}
                      {v.sinPoblacion && <Badge variant="outline">Sin población</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Subir ${v.codigo}`}
                        disabled={ocupado || i === 0}
                        onClick={() => alMover(i, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Bajar ${v.codigo}`}
                        disabled={ocupado || i === dimension.valores.length - 1}
                        onClick={() => alMover(i, 1)}
                      >
                        <ArrowDown />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        aria-label={`Editar la etiqueta de ${v.codigo}`}
                        disabled={ocupado}
                        onClick={() => alEditar(v)}
                      >
                        Editar etiqueta
                      </Button>
                      {v.activo ? (
                        <ConMotivo motivo={motivo}>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Desactivar ${v.codigo}`}
                            disabled={ocupado || motivo !== null}
                            onClick={() => alCambiarEstado(v, false)}
                          >
                            Desactivar
                          </Button>
                        </ConMotivo>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Reactivar ${v.codigo}`}
                          disabled={ocupado}
                          onClick={() => alCambiarEstado(v, true)}
                        >
                          Reactivar
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TooltipProvider>
    </div>
  )
}

export default function PaginaEditarDimension() {
  const { codigo } = useParams()
  const { state } = useLocation()
  // La pestaña manda su filtro al abrir la página, para volver a ella con el mismo.
  const volverA = `/configuracion${state?.volverA || PESTANA}`

  // La dimensión como la devuelve el backend; cada acción la reemplaza con su respuesta.
  const [dimension, setDimension] = useState(null)
  const [noExiste, setNoExiste] = useState(false)
  const [errorCarga, setErrorCarga] = useState(null)
  const [datos, setDatos] = useState(null)
  const [intentado, setIntentado] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // Cada intento de envío con errores sube este número; un efecto lleva el foco al primer campo inválido.
  const [revisar, setRevisar] = useState(0)
  // Cada «Reintentar» sube este número y vuelve a cargar.
  const [intentoCarga, setIntentoCarga] = useState(0)
  // El error de una acción sobre los valores; los éxitos van en un toast.
  const [errorValores, setErrorValores] = useState(null)
  // null, { tipo: 'agregar' } o { tipo: 'etiqueta', valor } mientras un Dialog está abierto.
  const [dialogo, setDialogo] = useState(null)
  // null o { valor, activar } mientras el AlertDialog de confirmación está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const formulario = useRef(null)
  const avisoError = useRef(null)

  useEffect(() => {
    let vigente = true
    obtenerDimension(codigo)
      .then((encontrada) => {
        if (!vigente) return
        setDimension(encontrada)
        setDatos(aDatos(encontrada))
      })
      .catch((err) => {
        if (!vigente) return
        if (err instanceof ErrorApi && err.status === 404) setNoExiste(true)
        else setErrorCarga(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [codigo, intentoCarga])

  const cambios = dimension ? cambiosDe(aDatos(dimension), datos) : {}
  const hayCambios = Object.keys(cambios).length > 0
  // Solo los datos de la dimensión: las acciones sobre los valores se guardan al confirmarlas.
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios)

  useEffect(() => {
    if (revisar > 0) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  useEffect(() => {
    if (errorGuardar) avisoError.current?.scrollIntoView?.({ block: 'nearest' })
  }, [errorGuardar])

  // Solo se validan los campos que cambian, como el backend.
  const errores = {}
  for (const campo of Object.keys(cambios)) {
    const { error } = REGLAS[campo](datos[campo])
    if (error) errores[campo] = error
  }
  const errorDe = (campo) => (intentado ? errores[campo] : undefined)
  const cambiar = (campo) => (valor) => setDatos((actual) => ({ ...actual, [campo]: valor }))

  async function guardarDatos(evento) {
    evento.preventDefault()
    setIntentado(true)
    if (guardando) return
    if (Object.keys(errores).length > 0) {
      setRevisar((n) => n + 1)
      return
    }
    if (!hayCambios) {
      toast.info('No hay cambios que guardar.')
      return
    }
    setGuardando(true)
    setErrorGuardar(null)
    try {
      const actualizada = await editarDimension(dimension.codigo, cambios)
      setDimension(actualizada)
      setDatos(aDatos(actualizada))
      setIntentado(false)
      toast.success(`Dimensión ${actualizada.nombre} actualizada.`)
    } catch (err) {
      setErrorGuardar(mensajeDeError(err))
    } finally {
      setGuardando(false)
    }
  }

  function reintentarCarga() {
    setErrorCarga(null)
    setIntentoCarga((n) => n + 1)
  }

  function alGuardarValor(actualizada, mensaje) {
    setDimension(actualizada)
    setDialogo(null)
    setErrorValores(null)
    toast.success(mensaje)
  }

  // Ejecuta una acción sobre los valores y reemplaza la dimensión con la respuesta.
  async function accionDeValores(accion, mensaje) {
    setOcupado(true)
    setErrorValores(null)
    try {
      setDimension(await accion())
      toast.success(mensaje)
    } catch (err) {
      setErrorValores(mensajeDeError(err))
    } finally {
      setOcupado(false)
    }
  }

  // Subir o bajar manda la lista completa, con activos e inactivos, en el orden nuevo.
  function mover(indice, desplazamiento) {
    const codigos = dimension.valores.map((v) => v.codigo)
    ;[codigos[indice], codigos[indice + desplazamiento]] = [codigos[indice + desplazamiento], codigos[indice]]
    accionDeValores(() => ordenarValoresDimension(dimension.codigo, codigos), 'Orden de los valores actualizado.')
  }

  async function confirmarCambio(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    const { valor, activar } = porCambiar
    await accionDeValores(
      () =>
        activar
          ? reactivarValorDimension(dimension.codigo, valor.codigo)
          : desactivarValorDimension(dimension.codigo, valor.codigo),
      `Valor ${valor.codigo} ${activar ? 'reactivado' : 'desactivado'}.`,
    )
    setPorCambiar(null)
  }

  const sinGrupos = dimension?.tipo === 'RANGO_EDAD' && (dimension.gruposPoblacionDisponibles ?? []).length === 0

  return (
    <section className="flex max-w-5xl flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Configuración" titulo="Editar dimensión" volverA={volverA} />

      {noExiste && (
        <AvisoError>
          <span>
            La dimensión no existe.{' '}
            <Link to={volverA} className="underline">
              Volver a las dimensiones
            </Link>
          </span>
        </AvisoError>
      )}

      {errorCarga && (
        <AvisoError onReintentar={reintentarCarga}>No se pudo cargar la dimensión: {errorCarga}</AvisoError>
      )}

      {!dimension && !noExiste && !errorCarga && (
        <Card aria-label="Cargando dimensión">
          <CardContent className="flex flex-col gap-2">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {dimension && (
        <>
          <form ref={formulario} onSubmit={guardarDatos} noValidate>
            <Card>
              <CardHeader>
                <CardTitle>Datos de la dimensión</CardTitle>
                <CardDescription>Catálogo nacional: los cambios aplican a todas las DDRISS.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">Código</dt>
                  <dd className="font-medium">{dimension.codigo}</dd>
                  <dt className="text-muted-foreground">Tipo</dt>
                  <dd>{TIPOS[dimension.tipo] ?? dimension.tipo}</dd>
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd>
                    {dimension.activa ? 'Activa' : 'Inactiva'}
                    {dimension.enUso && ' · En uso'}
                  </dd>
                </dl>
                <CampoTexto
                  id="nombre"
                  etiqueta="Nombre"
                  obligatorio
                  valor={datos.nombre}
                  alCambiar={cambiar('nombre')}
                  error={errorDe('nombre')}
                  deshabilitado={guardando}
                  maxLength={LARGOS.nombreDimension}
                />
                <Campo id="descripcion" etiqueta="Descripción">
                  <Textarea
                    id="descripcion"
                    className="bg-card"
                    value={datos.descripcion}
                    maxLength={LARGOS.descripcionDimension}
                    onChange={(evento) => cambiar('descripcion')(evento.target.value)}
                    disabled={guardando}
                    aria-invalid={errorDe('descripcion') ? true : undefined}
                    aria-describedby={errorDe('descripcion') ? 'descripcion-error' : undefined}
                  />
                  <MensajeError id="descripcion-error" mensaje={errorDe('descripcion')} />
                </Campo>
                {errorGuardar && (
                  <div ref={avisoError}>
                    <AvisoError>{errorGuardar}</AvisoError>
                  </div>
                )}
                <div>
                  <Button type="submit" disabled={guardando}>
                    {guardando ? 'Guardando…' : 'Guardar cambios'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </form>

          <Card>
            <CardHeader>
              <CardTitle>Valores</CardTitle>
              <CardDescription>
                Cada cambio se guarda al confirmarlo. Los valores no se borran ni se renombran; se desactivan.
              </CardDescription>
              <CardAction>
                <Button type="button" onClick={() => setDialogo({ tipo: 'agregar' })} disabled={ocupado || sinGrupos}>
                  <Plus />
                  Agregar valor
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {sinGrupos && <p className="text-sm text-muted-foreground">{SIN_GRUPOS}</p>}
              {errorValores && <AvisoError>{errorValores}</AvisoError>}
              <TablaValores
                dimension={dimension}
                ocupado={ocupado}
                alMover={mover}
                alEditar={(valor) => setDialogo({ tipo: 'etiqueta', valor })}
                alCambiarEstado={(valor, activar) => setPorCambiar({ valor, activar })}
              />
            </CardContent>
          </Card>

          {dialogo?.tipo === 'agregar' && (
            <DialogoValorDimension dimension={dimension} alGuardar={alGuardarValor} alCerrar={() => setDialogo(null)} />
          )}
          {dialogo?.tipo === 'etiqueta' && (
            <DialogoEtiqueta
              dimension={dimension}
              valor={dialogo.valor}
              alGuardar={alGuardarValor}
              alCerrar={() => setDialogo(null)}
            />
          )}

          <AlertDialog open={porCambiar !== null} onOpenChange={(abierto) => !abierto && !ocupado && setPorCambiar(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿{porCambiar?.activar ? 'Reactivar' : 'Desactivar'} el valor {porCambiar?.valor.codigo} ·{' '}
                  {porCambiar?.valor.etiqueta}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {porCambiar?.activar
                    ? 'Los esquemas nuevos podrán volver a usarlo.'
                    : 'No se borra y su código no se reutiliza; lo que ya se capturó con él se conserva.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={ocupado}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant={porCambiar?.activar ? 'default' : 'destructive'}
                  disabled={ocupado}
                  onClick={confirmarCambio}
                >
                  {porCambiar?.activar ? (ocupado ? 'Reactivando…' : 'Reactivar') : ocupado ? 'Desactivando…' : 'Desactivar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Si sale ahora, se pierden los cambios de la dimensión." />
    </section>
  )
}
