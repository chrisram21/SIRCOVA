import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, MoreHorizontal, Plus, Search } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { desactivarEstablecimiento, listarEstablecimientos, reactivarEstablecimiento } from '@/api/catalogos.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'
const ESTADOS = [
  { valor: TODOS, etiqueta: 'Todos los estados' },
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'inactivos', etiqueta: 'Inactivos' },
]

// Para buscar sin distinguir mayúsculas ni tildes.
const normalizar = (texto) =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

// Opciones de un filtro sacadas de la misma lista, sin repetir y por nombre.
function opcionesDe(establecimientos, id, nombre) {
  const unicas = new Map(establecimientos.map((e) => [String(e[id]), e[nombre]]))
  return [...unicas]
    .map(([valor, etiqueta]) => ({ valor, etiqueta }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta, 'es'))
}

function Filtro({ nombre, etiqueta, valor, alCambiar, opciones }) {
  return (
    <Select name={nombre} value={valor} onValueChange={alCambiar}>
      <SelectTrigger aria-label={etiqueta} className="w-full bg-card sm:w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((opcion) => (
          <SelectItem key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function Marcas({ establecimiento: e }) {
  return (
    <div className="flex flex-wrap gap-1">
      {e.reporta5c && <Badge variant="secondary">Envía 5C</Badge>}
      {e.soloCobertura && <Badge variant="outline">Solo cobertura</Badge>}
      {e.esExterno && <Badge variant="outline">Externo</Badge>}
      {!e.reportaProduccion && <Badge variant="outline">Lo consolida otro</Badge>}
    </div>
  )
}

export default function PestanaEstablecimientos() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('ESTABLECIMIENTO_CREAR')
  const puedeEditar = tienePermiso('ESTABLECIMIENTO_EDITAR')
  const navigate = useNavigate()
  const { search, state } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const [establecimientos, setEstablecimientos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  // Empieza con el que trae el formulario en el state de la navegación, así no se pierde al cambiar un filtro.
  const [aviso, setAviso] = useState(() => (state?.aviso ? { tipo: 'exito', mensaje: state.aviso } : null))
  // null o { establecimiento, activar } mientras el AlertDialog de confirmación está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  const [cambiando, setCambiando] = useState(false)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setEstablecimientos(null)
    setErrorCarga(null)
    listarEstablecimientos()
      .then((lista) => {
        if (carga === cargaActual.current) setEstablecimientos(lista)
      })
      .catch((err) => {
        if (carga === cargaActual.current) setErrorCarga(err.mensaje)
      })
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [])

  // Los filtros viajan al formulario para volver a la pestaña con los mismos.
  const abrirEdicion = (establecimiento) =>
    navigate(`/configuracion/establecimientos/${establecimiento.id}/editar`, { state: { volverA: search } })

  async function confirmarCambio(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    const { establecimiento, activar } = porCambiar
    setCambiando(true)
    setAviso(null)
    try {
      const actualizado = activar
        ? await reactivarEstablecimiento(establecimiento.id)
        : await desactivarEstablecimiento(establecimiento.id)
      // La fila se reemplaza con la respuesta, sin volver a pedir la lista.
      setEstablecimientos((actuales) => actuales.map((e) => (e.id === actualizado.id ? actualizado : e)))
      setAviso({
        tipo: 'exito',
        mensaje: `Establecimiento ${actualizado.codigo} ${activar ? 'reactivado' : 'desactivado'}.`,
      })
    } catch (err) {
      setAviso({ tipo: 'error', mensaje: err.mensaje })
    } finally {
      setCambiando(false)
      setPorCambiar(null)
    }
  }

  // Los filtros van en la URL junto a la pestaña, para que sigan puestos al volver de un formulario.
  function cambiarFiltro(nombre, valor) {
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (valor === TODOS || valor === '') nuevos.delete(nombre)
        else nuevos.set(nombre, valor)
        return nuevos
      },
      { replace: true },
    )
  }

  if (errorCarga) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudieron cargar los establecimientos: {errorCarga}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={cargar}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (establecimientos === null) {
    return (
      <Card aria-label="Cargando establecimientos">
        <CardHeader>
          <CardTitle>Establecimientos e instituciones</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const municipios = opcionesDe(establecimientos, 'municipioId', 'municipioNombre')
  const tipos = opcionesDe(establecimientos, 'tipoEstablecimientoId', 'tipoEstablecimientoNombre')
  // Un valor de la URL que no está entre las opciones (p. ej. escrito a mano) equivale a no filtrar.
  const elegido = (nombre, opciones) => {
    const valor = parametros.get(nombre)
    return opciones.some((o) => o.valor === valor) ? valor : TODOS
  }
  const busqueda = parametros.get('q') ?? ''
  const filtroMunicipio = elegido('municipio', municipios)
  const filtroTipo = elegido('tipo', tipos)
  const filtroEstado = elegido('estado', ESTADOS)

  const buscado = normalizar(busqueda)
  const filtrados = establecimientos.filter(
    (e) =>
      (buscado === '' || normalizar(`${e.codigo} ${e.nombre}`).includes(buscado)) &&
      (filtroMunicipio === TODOS || String(e.municipioId) === filtroMunicipio) &&
      (filtroTipo === TODOS || String(e.tipoEstablecimientoId) === filtroTipo) &&
      (filtroEstado === TODOS || e.activo === (filtroEstado === 'activos')),
  )
  const envian5c = establecimientos.filter((e) => e.activo && e.reporta5c).length

  return (
    <div className="flex flex-col gap-6">
      {aviso?.tipo === 'exito' && (
        <Alert role="status" className="border-ring/40 bg-accent text-accent-foreground">
          <CircleCheck />
          <AlertDescription className="text-accent-foreground">{aviso.mensaje}</AlertDescription>
        </Alert>
      )}
      {aviso?.tipo === 'error' && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>{aviso.mensaje}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Establecimientos e instituciones</CardTitle>
          <CardDescription>Envían el 5C: {envian5c} establecimientos activos.</CardDescription>
          {puedeCrear && (
            <CardAction>
              {/* Los filtros viajan al formulario para volver a la pestaña con los mismos. */}
              <Button asChild>
                <Link to="/configuracion/establecimientos/nuevo" state={{ volverA: search }}>
                  <Plus />
                  Registrar establecimiento
                </Link>
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
          <form className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
            <div className="relative w-full sm:w-64">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                name="q"
                aria-label="Buscar por código o nombre"
                placeholder="Buscar por código o nombre"
                className="bg-card pl-8"
                value={busqueda}
                onChange={(evento) => cambiarFiltro('q', evento.target.value)}
              />
            </div>
            <Filtro
              nombre="municipio"
              etiqueta="Filtrar por municipio"
              valor={filtroMunicipio}
              alCambiar={(valor) => cambiarFiltro('municipio', valor)}
              opciones={[{ valor: TODOS, etiqueta: 'Todos los municipios' }, ...municipios]}
            />
            <Filtro
              nombre="tipo"
              etiqueta="Filtrar por tipo"
              valor={filtroTipo}
              alCambiar={(valor) => cambiarFiltro('tipo', valor)}
              opciones={[{ valor: TODOS, etiqueta: 'Todos los tipos' }, ...tipos]}
            />
            <Filtro
              nombre="estado"
              etiqueta="Filtrar por estado"
              valor={filtroEstado}
              alCambiar={(valor) => cambiarFiltro('estado', valor)}
              opciones={ESTADOS}
            />
          </form>

          {establecimientos.length === 0 ? (
            <p className="text-muted-foreground">No hay establecimientos registrados.</p>
          ) : filtrados.length === 0 ? (
            <p className="text-muted-foreground">No hay establecimientos que coincidan con los filtros.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Establecimientos">
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Distrito</TableHead>
                    <TableHead>Marcas</TableHead>
                    <TableHead>Estado</TableHead>
                    {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtrados.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell>{e.codigo}</TableCell>
                      <TableCell className="font-medium">{e.nombre}</TableCell>
                      <TableCell>{e.tipoEstablecimientoNombre}</TableCell>
                      <TableCell>{e.municipioNombre}</TableCell>
                      <TableCell>{e.distritoSaludCodigo ?? '—'}</TableCell>
                      <TableCell>
                        <Marcas establecimiento={e} />
                      </TableCell>
                      <TableCell>
                        {e.activo ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>}
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="text-right">
                          {/* No modal: así el diálogo que abre una opción no hereda el bloqueo del menú. */}
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label={`Acciones de ${e.codigo}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => abrirEdicion(e)}>Editar</DropdownMenuItem>
                              {e.activo ? (
                                // El backend respondería 409: primero se mueven o desactivan sus cuentas.
                                <DropdownMenuItem
                                  disabled={e.cuentasActivas > 0}
                                  onSelect={() => setPorCambiar({ establecimiento: e, activar: false })}
                                >
                                  <div className="flex flex-col items-start">
                                    <span>Desactivar</span>
                                    {e.cuentasActivas > 0 && (
                                      <span className="text-xs text-muted-foreground">Tiene cuentas activas</span>
                                    )}
                                  </div>
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem onSelect={() => setPorCambiar({ establecimiento: e, activar: true })}>
                                  Reactivar
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={porCambiar !== null} onOpenChange={(abierto) => !abierto && !cambiando && setPorCambiar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{porCambiar?.activar ? 'Reactivar' : 'Desactivar'} el establecimiento {porCambiar?.establecimiento.codigo}{' '}
              · {porCambiar?.establecimiento.nombre}?
            </AlertDialogTitle>
            {!porCambiar?.activar && (
              <AlertDialogDescription>Su personal no podrá crear reportes nuevos.</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cambiando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant={porCambiar?.activar ? 'default' : 'destructive'}
              disabled={cambiando}
              onClick={confirmarCambio}
            >
              {porCambiar?.activar ? (cambiando ? 'Reactivando…' : 'Reactivar') : cambiando ? 'Desactivando…' : 'Desactivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
