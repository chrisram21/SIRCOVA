import { useEffect, useRef, useState } from 'react'
import { CircleCheck, MoreHorizontal, Plus } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  agregarDosis,
  desactivarDosis,
  editarDosis,
  editarVacuna,
  obtenerVacuna,
  reactivarDosis,
} from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { LARGOS, validarDescripcionVacuna, validarNombreDosis, validarNombreVacuna } from '@/validaciones/campos.js'
import { Campo, CampoTexto } from '../usuarios/CamposEmpleado.jsx'
import { MENSAJE_ORDEN, ORDEN_INFORME_MAXIMO, validarOrdenInforme } from './FormularioVacuna.jsx'
import { nombreSugerido, siguienteCodigo, tiposAdmitidos, TIPOS_DOSIS } from './secuenciaDosis.js'

// Ruta de la pestaña si se llegó a la página sin pasar por ella (p. ej. con la dirección escrita a mano).
const PESTANA = '?pestana=vacunas'

// Al editar, el orden en el informe no puede quedar vacío: PATCH /vacunas/{id} exige un número.
const REGLAS = {
  nombre: validarNombreVacuna,
  descripcion: validarDescripcionVacuna,
  ordenInforme: (valor) => (valor.trim() === '' ? { error: MENSAJE_ORDEN } : validarOrdenInforme(valor)),
}

// Lo que devuelve la API, en la forma del formulario: los Input no aceptan null.
const aDatos = (vacuna) => ({
  nombre: vacuna.nombre,
  descripcion: vacuna.descripcion ?? '',
  ordenInforme: String(vacuna.ordenInforme),
})

// Solo los campos que cambiaron, como los espera PATCH /vacunas/{id}. Una descripción vacía la borra.
function cambiosDe(base, actual) {
  const cambios = {}
  if (actual.nombre.trim() !== base.nombre.trim()) cambios.nombre = actual.nombre.trim()
  if (actual.descripcion.trim() !== base.descripcion.trim()) cambios.descripcion = actual.descripcion.trim() || null
  if (actual.ordenInforme.trim() !== base.ordenInforme) cambios.ordenInforme = actual.ordenInforme.trim()
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

// Sin dosis, agrega una al final de la vacuna; con dosis, solo cambia su nombre y su marca de trazadora.
// Quien lo abre lo monta de nuevo en cada apertura, así el formulario empieza limpio.
function DialogoDosis({ vacuna, dosis, alGuardar, alCerrar }) {
  const editando = Boolean(dosis)
  // Los tipos que la secuencia no admite no se ofrecen.
  const admitidos = TIPOS_DOSIS.filter((t) => tiposAdmitidos(vacuna.dosis).includes(t.valor))
  const [tipo, setTipo] = useState('')
  const [nombre, setNombre] = useState(dosis?.nombre ?? '')
  const [esTrazadora, setEsTrazadora] = useState(dosis?.esTrazadora ?? false)
  const [errores, setErrores] = useState({})
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // Cada intento con errores sube este número; un efecto lleva el foco al primer campo inválido.
  const [revisar, setRevisar] = useState(0)
  const formulario = useRef(null)

  useEffect(() => {
    if (revisar > 0) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  const codigoDe = (t) => (t ? siguienteCodigo(t, vacuna.dosis.map((d) => d.codigo)) : null)
  const codigo = editando ? dosis.codigo : codigoDe(tipo)

  // El nombre sugerido reemplaza al que había si estaba vacío o era el sugerido del tipo anterior.
  function cambiarTipo(nuevo) {
    const anterior = codigoDe(tipo)
    if (nombre.trim() === '' || (anterior && nombre.trim() === nombreSugerido(anterior))) {
      setNombre(nombreSugerido(codigoDe(nuevo)))
    }
    setTipo(nuevo)
  }

  async function guardar(evento) {
    evento.preventDefault()
    const validacion = validarNombreDosis(nombre)
    const nuevosErrores = {
      tipo: !editando && !tipo ? 'Elija el tipo de la dosis.' : undefined,
      nombre: validacion.error,
    }
    setErrores(nuevosErrores)
    if (nuevosErrores.tipo || nuevosErrores.nombre) {
      setRevisar((n) => n + 1)
      return
    }

    const cambios = {}
    if (editando) {
      if (validacion.valor !== dosis.nombre) cambios.nombre = validacion.valor
      if (esTrazadora !== dosis.esTrazadora) cambios.esTrazadora = esTrazadora
      if (Object.keys(cambios).length === 0) return alCerrar()
    }

    setGuardando(true)
    setErrorApi(null)
    try {
      const guardada = editando
        ? await editarDosis(vacuna.id, dosis.id, cambios)
        : await agregarDosis(vacuna.id, { tipo, nombre: validacion.valor, esTrazadora })
      alGuardar(guardada, editando ? `Dosis ${dosis.codigo} actualizada.` : `Dosis ${codigo} agregada.`)
    } catch (err) {
      // El Dialog sigue abierto para corregir y volver a intentar.
      setErrorApi(mensajeDeError(err))
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !guardando && alCerrar()}>
      <DialogContent>
        <form ref={formulario} className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>{editando ? `Editar la dosis ${dosis.codigo}` : 'Agregar dosis'}</DialogTitle>
            <DialogDescription>
              {editando
                ? 'Solo se pueden cambiar el nombre y la marca de trazadora; el código, el tipo y el orden no cambian.'
                : 'La dosis va al final de la vacuna. El código y el orden los genera el sistema.'}
            </DialogDescription>
          </DialogHeader>

          {errorApi && <AvisoError>{errorApi}</AvisoError>}

          {!editando && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="dosis-tipo" className="font-semibold">
                Tipo
              </Label>
              <Select name="dosis-tipo" value={tipo} onValueChange={cambiarTipo} disabled={guardando}>
                <SelectTrigger
                  id="dosis-tipo"
                  className="w-full"
                  aria-invalid={errores.tipo ? true : undefined}
                  aria-describedby={errores.tipo ? 'dosis-tipo-error' : undefined}
                >
                  <SelectValue placeholder="Elija el tipo" />
                </SelectTrigger>
                <SelectContent>
                  {admitidos.map((t) => (
                    <SelectItem key={t.valor} value={t.valor}>
                      {t.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <MensajeError id="dosis-tipo-error" mensaje={errores.tipo} />
            </div>
          )}

          <p className="text-sm">
            <span className="text-muted-foreground">Código: </span>
            <span className="font-medium" aria-label="Código de la dosis">
              {codigo ?? '—'}
            </span>
          </p>

          <div className="flex flex-col gap-2">
            <Label htmlFor="dosis-nombre" className="font-semibold">
              Nombre
            </Label>
            <Input
              id="dosis-nombre"
              value={nombre}
              maxLength={LARGOS.nombreDosis}
              onChange={(evento) => setNombre(evento.target.value)}
              disabled={guardando}
              aria-invalid={errores.nombre ? true : undefined}
              aria-describedby={errores.nombre ? 'dosis-nombre-error' : undefined}
            />
            <MensajeError id="dosis-nombre-error" mensaje={errores.nombre} />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="dosis-trazadora"
              checked={esTrazadora}
              onCheckedChange={(valor) => setEsTrazadora(valor === true)}
              disabled={guardando}
            />
            <Label htmlFor="dosis-trazadora">Trazadora</Label>
          </div>

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

function TablaDosis({ dosis, alEditar, alCambiarEstado }) {
  const activas = dosis.filter((d) => d.activa).length
  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table aria-label="Dosis">
        <TableHeader>
          <TableRow>
            <TableHead>Orden</TableHead>
            <TableHead>Código</TableHead>
            <TableHead>Nombre</TableHead>
            <TableHead>Marcas</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dosis.map((d) => {
            // El backend respondería 409: la vacuna conserva siempre una dosis activa.
            const unicaActiva = d.activa && activas === 1
            return (
              <TableRow key={d.id}>
                <TableCell>{d.orden}</TableCell>
                <TableCell>{d.codigo}</TableCell>
                <TableCell className="font-medium">{d.nombre}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {d.completaEsquema && (
                      <Badge variant="secondary">
                        <CircleCheck aria-hidden="true" />
                        Completa el esquema
                      </Badge>
                    )}
                    {d.esTrazadora && <Badge variant="outline">Trazadora</Badge>}
                  </div>
                </TableCell>
                <TableCell>
                  {d.activa ? <Badge variant="secondary">Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  {/* No modal: así el diálogo que abre una opción no hereda el bloqueo del menú. */}
                  <DropdownMenu modal={false}>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="icon-sm" aria-label={`Acciones de ${d.codigo}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => alEditar(d)}>Editar</DropdownMenuItem>
                      {d.activa ? (
                        <DropdownMenuItem disabled={unicaActiva} onSelect={() => alCambiarEstado(d, false)}>
                          <div className="flex flex-col items-start">
                            <span>Desactivar</span>
                            {unicaActiva && (
                              <span className="text-xs text-muted-foreground">Es la única dosis activa</span>
                            )}
                          </div>
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => alCambiarEstado(d, true)}>Reactivar</DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

export default function PaginaEditarVacuna() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  // La pestaña manda sus filtros al abrir la página, para volver a ella con los mismos.
  const volverA = `/configuracion${state?.volverA || PESTANA}`

  // La vacuna como la devuelve el backend; cada acción de una dosis la reemplaza con su respuesta.
  const [vacuna, setVacuna] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [datos, setDatos] = useState(null)
  // Un mensaje aparece cuando la persona sale del campo por primera vez, o al intentar guardar.
  const [tocados, setTocados] = useState({})
  const [intentado, setIntentado] = useState(false)
  const [errorGuardar, setErrorGuardar] = useState(null)
  const [guardando, setGuardando] = useState(false)
  // Tras guardar se sale en un efecto, cuando el aviso de cambios sin guardar ya no bloquea.
  const [guardado, setGuardado] = useState(false)
  // Cada intento de envío con errores sube este número; un efecto lleva el foco al primer campo inválido.
  const [revisar, setRevisar] = useState(0)
  // Cada «Reintentar» sube este número y vuelve a cargar.
  const [intentoCarga, setIntentoCarga] = useState(0)
  // El error de una acción sobre las dosis; los éxitos van en un toast.
  const [errorDosis, setErrorDosis] = useState(null)
  // null, { dosis: null } para agregar o { dosis } para editar, mientras el Dialog está abierto.
  const [dialogo, setDialogo] = useState(null)
  // null o { dosis, activar } mientras el AlertDialog de confirmación está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  const [cambiando, setCambiando] = useState(false)
  const formulario = useRef(null)
  const avisoError = useRef(null)

  useEffect(() => {
    let vigente = true
    obtenerVacuna(id)
      .then((encontrada) => {
        if (!vigente) return
        setVacuna(encontrada)
        setDatos(aDatos(encontrada))
      })
      .catch((err) => {
        if (vigente) setErrorCarga(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [id, intentoCarga])

  const cambios = vacuna ? cambiosDe(aDatos(vacuna), datos) : {}
  const hayCambios = Object.keys(cambios).length > 0
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !guardado)

  useEffect(() => {
    if (guardado) navigate(volverA)
  }, [guardado, navigate, volverA])

  useEffect(() => {
    if (revisar > 0) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  useEffect(() => {
    if (errorGuardar) avisoError.current?.scrollIntoView?.({ block: 'nearest' })
  }, [errorGuardar])

  // Al editar, solo se validan los campos que cambian, como el backend.
  const errores = {}
  for (const campo of Object.keys(cambios)) {
    const { error } = REGLAS[campo](datos[campo])
    if (error) errores[campo] = error
  }
  const errorDe = (campo) => (intentado || tocados[campo] ? errores[campo] : undefined)

  const tocar = (campo) => () => setTocados((actual) => (actual[campo] ? actual : { ...actual, [campo]: true }))
  const cambiar = (campo) => (valor) => setDatos((actual) => ({ ...actual, [campo]: valor }))
  const texto = (campo) => ({
    valor: datos[campo],
    alCambiar: cambiar(campo),
    onBlur: tocar(campo),
    error: errorDe(campo),
    deshabilitado: guardando,
  })

  async function guardar(evento) {
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
    const cuerpo = { ...cambios }
    if (cuerpo.ordenInforme !== undefined) cuerpo.ordenInforme = validarOrdenInforme(cuerpo.ordenInforme).valor
    try {
      const guardada = await editarVacuna(vacuna.id, cuerpo)
      toast.success(`Vacuna ${guardada.codigo} actualizada.`)
      setGuardado(true)
    } catch (err) {
      setErrorGuardar(mensajeDeError(err))
      setGuardando(false)
    }
  }

  function reintentarCarga() {
    setErrorCarga(null)
    setIntentoCarga((n) => n + 1)
  }

  function alGuardarDosis(actualizada, mensaje) {
    setVacuna(actualizada)
    setDialogo(null)
    setErrorDosis(null)
    toast.success(mensaje)
  }

  async function confirmarCambio(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    const { dosis, activar } = porCambiar
    setCambiando(true)
    setErrorDosis(null)
    try {
      const actualizada = activar
        ? await reactivarDosis(vacuna.id, dosis.id)
        : await desactivarDosis(vacuna.id, dosis.id)
      setVacuna(actualizada)
      toast.success(`Dosis ${dosis.codigo} ${activar ? 'reactivada' : 'desactivada'}.`)
    } catch (err) {
      setErrorDosis(mensajeDeError(err))
    } finally {
      setCambiando(false)
      setPorCambiar(null)
    }
  }

  return (
    <section className="flex max-w-4xl flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Configuración" titulo="Editar vacuna" volverA={volverA} />

      {errorCarga && <AvisoError onReintentar={reintentarCarga}>No se pudo cargar la vacuna: {errorCarga}</AvisoError>}

      {!vacuna && !errorCarga && (
        <Card aria-label="Cargando vacuna">
          <CardContent className="flex flex-col gap-2">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {vacuna && (
        <>
          <form ref={formulario} onSubmit={guardar} noValidate>
            <Card>
              <CardHeader>
                <CardTitle>Datos de la vacuna</CardTitle>
                <CardDescription>Catálogo nacional: los cambios aplican a todas las DDRISS.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                  <dt className="text-muted-foreground">Código</dt>
                  <dd className="font-medium">{vacuna.codigo}</dd>
                  <dt className="text-muted-foreground">Estado</dt>
                  <dd>{vacuna.activa ? 'Activa' : 'Inactiva'}</dd>
                </dl>
                <div className="grid gap-4 md:grid-cols-[1fr_12rem]">
                  <CampoTexto
                    id="nombre"
                    etiqueta="Nombre"
                    obligatorio
                    {...texto('nombre')}
                    maxLength={LARGOS.nombreVacuna}
                  />
                  <CampoTexto
                    id="orden-informe"
                    etiqueta="Orden en el informe"
                    obligatorio
                    {...texto('ordenInforme')}
                    type="number"
                    min={0}
                    max={ORDEN_INFORME_MAXIMO}
                    inputMode="numeric"
                  />
                </div>
                <Campo id="descripcion" etiqueta="Descripción">
                  <Textarea
                    id="descripcion"
                    className="bg-card"
                    value={datos.descripcion}
                    maxLength={LARGOS.descripcionVacuna}
                    onChange={(evento) => cambiar('descripcion')(evento.target.value)}
                    onBlur={tocar('descripcion')}
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
              <CardTitle>Dosis</CardTitle>
              <CardDescription>
                Cada cambio se guarda al confirmarlo. La dosis que completa el esquema la calcula el sistema.
              </CardDescription>
              <CardAction>
                <Button type="button" onClick={() => setDialogo({ dosis: null })}>
                  <Plus />
                  Agregar dosis
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {errorDosis && <AvisoError>{errorDosis}</AvisoError>}
              <TablaDosis
                dosis={vacuna.dosis}
                alEditar={(dosis) => setDialogo({ dosis })}
                alCambiarEstado={(dosis, activar) => setPorCambiar({ dosis, activar })}
              />
            </CardContent>
          </Card>

          {dialogo && (
            <DialogoDosis
              vacuna={vacuna}
              dosis={dialogo.dosis}
              alGuardar={alGuardarDosis}
              alCerrar={() => setDialogo(null)}
            />
          )}

          <AlertDialog
            open={porCambiar !== null}
            onOpenChange={(abierto) => !abierto && !cambiando && setPorCambiar(null)}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  ¿{porCambiar?.activar ? 'Reactivar' : 'Desactivar'} la dosis {porCambiar?.dosis.codigo} ·{' '}
                  {porCambiar?.dosis.nombre}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {porCambiar?.activar
                    ? 'Vuelve a ofrecerse en los reportes nuevos.'
                    : 'No se borra y su código no se reutiliza; los reportes anteriores la conservan.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={cambiando}>Cancelar</AlertDialogCancel>
                <AlertDialogAction
                  variant={porCambiar?.activar ? 'default' : 'destructive'}
                  disabled={cambiando}
                  onClick={confirmarCambio}
                >
                  {porCambiar?.activar
                    ? cambiando
                      ? 'Reactivando…'
                      : 'Reactivar'
                    : cambiando
                      ? 'Desactivando…'
                      : 'Desactivar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Si sale ahora, se pierden los cambios de la vacuna." />
    </section>
  )
}
