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
import { desactivarVacuna, listarVacunas, reactivarVacuna } from '@/api/catalogos.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'
const ESTADOS = [
  { valor: TODOS, etiqueta: 'Todos los estados' },
  { valor: 'activas', etiqueta: 'Activas' },
  { valor: 'inactivas', etiqueta: 'Inactivas' },
]

// Para buscar sin distinguir mayúsculas ni tildes.
const normalizar = (texto) =>
  texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')

// Solo las dosis activas, en orden; las trazadoras con la variante secondary.
function DosisActivas({ vacuna }) {
  return (
    <div className="flex flex-wrap gap-1">
      {vacuna.dosis
        .filter((d) => d.activa)
        .map((d) => (
          <Badge
            key={d.id}
            variant={d.esTrazadora ? 'secondary' : 'outline'}
            title={d.completaEsquema ? 'Completa el esquema' : undefined}
          >
            {d.completaEsquema && <CircleCheck aria-hidden="true" />}
            {d.codigo}
          </Badge>
        ))}
    </div>
  )
}

export default function PestanaVacunas() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('VACUNA_CREAR')
  const puedeEditar = tienePermiso('VACUNA_EDITAR')
  const navigate = useNavigate()
  const { search, state } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const [vacunas, setVacunas] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  // Empieza con el que trae el formulario en el state de la navegación, así no se pierde al cambiar un filtro.
  const [aviso, setAviso] = useState(() => (state?.aviso ? { tipo: 'exito', mensaje: state.aviso } : null))
  // null o { vacuna, activar } mientras el AlertDialog de confirmación está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  const [cambiando, setCambiando] = useState(false)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setVacunas(null)
    setErrorCarga(null)
    listarVacunas()
      .then((lista) => {
        if (carga === cargaActual.current) setVacunas(lista)
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
  const abrirEdicion = (vacuna) => navigate(`/configuracion/vacunas/${vacuna.id}/editar`, { state: { volverA: search } })

  async function confirmarCambio(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    const { vacuna, activar } = porCambiar
    setCambiando(true)
    setAviso(null)
    try {
      const actualizada = activar ? await reactivarVacuna(vacuna.id) : await desactivarVacuna(vacuna.id)
      // La fila se reemplaza con la respuesta, sin volver a pedir la lista.
      setVacunas((actuales) => actuales.map((v) => (v.id === actualizada.id ? actualizada : v)))
      setAviso({ tipo: 'exito', mensaje: `Vacuna ${actualizada.codigo} ${activar ? 'reactivada' : 'desactivada'}.` })
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
          <AlertDescription>No se pudieron cargar las vacunas: {errorCarga}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={cargar}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (vacunas === null) {
    return (
      <Card aria-label="Cargando vacunas">
        <CardHeader>
          <CardTitle>Vacunas y dosis</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const busqueda = parametros.get('q') ?? ''
  // Un estado de la URL que no está entre las opciones (p. ej. escrito a mano) equivale a no filtrar.
  const filtroEstado = ESTADOS.some((e) => e.valor === parametros.get('estado')) ? parametros.get('estado') : TODOS
  const buscado = normalizar(busqueda)
  const filtradas = vacunas.filter(
    (v) =>
      (buscado === '' || normalizar(`${v.codigo} ${v.nombre}`).includes(buscado)) &&
      (filtroEstado === TODOS || v.activa === (filtroEstado === 'activas')),
  )

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
          <CardTitle>Vacunas y dosis</CardTitle>
          <CardDescription>Catálogo nacional: los cambios aplican a todas las DDRISS.</CardDescription>
          {puedeCrear && (
            <CardAction>
              {/* Los filtros viajan al formulario para volver a la pestaña con los mismos. */}
              <Button asChild>
                <Link to="/configuracion/vacunas/nueva" state={{ volverA: search }}>
                  <Plus />
                  Registrar vacuna
                </Link>
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Dentro de un form, Radix agrega el <select> nativo del Select. */}
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
            <Select name="estado" value={filtroEstado} onValueChange={(valor) => cambiarFiltro('estado', valor)}>
              <SelectTrigger aria-label="Filtrar por estado" className="w-full bg-card sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS.map((opcion) => (
                  <SelectItem key={opcion.valor} value={opcion.valor}>
                    {opcion.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </form>

          {vacunas.length === 0 ? (
            <p className="text-muted-foreground">No hay vacunas registradas.</p>
          ) : filtradas.length === 0 ? (
            <p className="text-muted-foreground">No hay vacunas que coincidan con los filtros.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Vacunas">
                <TableHeader>
                  <TableRow>
                    <TableHead>Orden</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Dosis</TableHead>
                    <TableHead>Estado</TableHead>
                    {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtradas.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell>{v.ordenInforme}</TableCell>
                      <TableCell>{v.codigo}</TableCell>
                      <TableCell className="font-medium">{v.nombre}</TableCell>
                      <TableCell>
                        <DosisActivas vacuna={v} />
                      </TableCell>
                      <TableCell>
                        {v.activa ? <Badge variant="secondary">Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="text-right">
                          {/* No modal: así el diálogo que abre una opción no hereda el bloqueo del menú. */}
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label={`Acciones de ${v.codigo}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => abrirEdicion(v)}>Editar</DropdownMenuItem>
                              <DropdownMenuItem onSelect={() => setPorCambiar({ vacuna: v, activar: !v.activa })}>
                                {v.activa ? 'Desactivar' : 'Reactivar'}
                              </DropdownMenuItem>
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
              ¿{porCambiar?.activar ? 'Reactivar' : 'Desactivar'} la vacuna {porCambiar?.vacuna.codigo} ·{' '}
              {porCambiar?.vacuna.nombre}?
            </AlertDialogTitle>
            {!porCambiar?.activar && (
              <AlertDialogDescription>
                No se ofrecerá en reportes nuevos; los reportes anteriores la conservan.
              </AlertDialogDescription>
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
