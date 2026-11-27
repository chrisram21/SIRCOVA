import { useEffect, useRef, useState } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  desactivarDistrito,
  desactivarMunicipio,
  listarDdriss,
  listarDistritos,
  listarMunicipios,
  reactivarDistrito,
  reactivarMunicipio,
} from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoDistrito from './DialogoDistrito.jsx'
import DialogoMunicipio from './DialogoMunicipio.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'

const MIGRANTES = '9999'

// El orden de alcance=todos: por departamento y nombre, con el 9999 al final.
function ordenarMunicipios(lista) {
  const comparar = (a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })
  return [...lista].sort(
    (a, b) =>
      (a.codigoIne === MIGRANTES) - (b.codigoIne === MIGRANTES) ||
      comparar(a.departamentoNombre, b.departamentoNombre) ||
      comparar(a.nombre, b.nombre),
  )
}

// Lo que cambia en el AlertDialog de confirmación según se desactive o reactive un distrito o un municipio.
const CONFIRMACION = {
  distrito: {
    titulo: (d) => `el distrito ${d.codigo} · ${d.nombre}`,
    activar: 'Se le podrán volver a asignar establecimientos.',
    desactivar: 'No se podrán asignarle establecimientos.',
    aviso: (d, activar) => `Distrito ${d.codigo} ${activar ? 'reactivado' : 'desactivado'}.`,
  },
  municipio: {
    titulo: (m) => `el municipio ${m.codigoIne} · ${m.nombre}`,
    activar: 'Se le podrán volver a registrar distritos y establecimientos.',
    desactivar: 'No se podrán registrarle distritos ni establecimientos. Su producción registrada no cambia.',
    aviso: (m, activar) => `Municipio ${m.codigoIne} ${activar ? 'reactivado' : 'desactivado'}.`,
  },
}
// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'
const ESTADOS = [
  { valor: TODOS, etiqueta: 'Todos los estados' },
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'inactivos', etiqueta: 'Inactivos' },
]

function EstadoActivo({ activo }) {
  return activo ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>
}

function Filtro({ nombre, etiqueta, valor, alCambiar, opciones }) {
  return (
    <Select name={nombre} value={valor} onValueChange={alCambiar}>
      <SelectTrigger aria-label={etiqueta} className="w-full bg-card sm:w-56">
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

function CardCargando({ titulo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

function ContenidoTerritorio() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('DISTRITO_CREAR')
  const puedeEditar = tienePermiso('DISTRITO_EDITAR')
  const puedeCrearMunicipio = tienePermiso('MUNICIPIO_CREAR')
  const puedeEditarMunicipio = tienePermiso('MUNICIPIO_EDITAR')
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [filtroMunicipio, setFiltroMunicipio] = useState(TODOS)
  const [filtroEstado, setFiltroEstado] = useState(TODOS)
  // null, { distrito: null } para registrar o { distrito } para renombrar.
  const [dialogo, setDialogo] = useState(null)
  // null, { municipio: null } para registrar o { municipio } para cambiar su nombre.
  const [dialogoMunicipio, setDialogoMunicipio] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  // null o { tipo: 'distrito' | 'municipio', elemento, activar } mientras el AlertDialog está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  const [cambiando, setCambiando] = useState(false)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setDatos(null)
    setErrorCarga(null)
    // alcance=todos: un municipio de fuera recién registrado sale aunque todavía no tenga establecimientos.
    Promise.all([listarDdriss(), listarMunicipios({ alcance: 'todos', incluirInactivos: true }), listarDistritos()])
      .then(([ddriss, municipios, distritos]) => {
        if (carga === cargaActual.current) setDatos({ ddriss, municipios, distritos })
      })
      .catch((err) => {
        if (carga === cargaActual.current) setErrorCarga(mensajeDeError(err))
      })
  }

  // La fila se agrega o se reemplaza con la respuesta, sin volver a pedir la lista.
  function ponerDistrito(distrito, nuevo) {
    setDatos((actual) => ({
      ...actual,
      distritos: nuevo
        ? [...actual.distritos, distrito]
        : actual.distritos.map((d) => (d.id === distrito.id ? distrito : d)),
    }))
  }

  function ponerMunicipio(municipio, nuevo) {
    setDatos((actual) => ({
      ...actual,
      municipios: ordenarMunicipios(
        nuevo
          ? [...actual.municipios, municipio]
          : actual.municipios.map((m) => (m.id === municipio.id ? municipio : m)),
      ),
    }))
  }

  function alGuardar(guardado) {
    const nuevo = dialogo.distrito === null
    ponerDistrito(guardado, nuevo)
    toast.success(`Distrito ${guardado.codigo} ${nuevo ? 'registrado' : 'actualizado'}.`)
    setDialogo(null)
  }

  function alGuardarMunicipio(guardado) {
    const nuevo = dialogoMunicipio.municipio === null
    ponerMunicipio(guardado, nuevo)
    toast.success(`Municipio ${guardado.codigoIne} ${nuevo ? 'registrado' : 'actualizado'}.`)
    setDialogoMunicipio(null)
  }

  async function confirmarCambio(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    const { tipo, elemento, activar } = porCambiar
    setCambiando(true)
    setErrorAccion(null)
    try {
      if (tipo === 'municipio') {
        const actualizado = activar ? await reactivarMunicipio(elemento.id) : await desactivarMunicipio(elemento.id)
        ponerMunicipio(actualizado, false)
      } else {
        const actualizado = activar ? await reactivarDistrito(elemento.id) : await desactivarDistrito(elemento.id)
        ponerDistrito(actualizado, false)
      }
      toast.success(CONFIRMACION[tipo].aviso(elemento, activar))
    } catch (err) {
      setErrorAccion(mensajeDeError(err))
    } finally {
      setCambiando(false)
      setPorCambiar(null)
    }
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [])

  if (errorCarga) {
    return <AvisoError onReintentar={cargar}>No se pudo cargar el catálogo territorial: {errorCarga}</AvisoError>
  }

  if (datos === null) {
    return (
      <div className="flex flex-col gap-6" aria-label="Cargando catálogo territorial">
        <CardCargando titulo="DDRISS" />
        <CardCargando titulo="Municipios" />
        <CardCargando titulo="Distritos de salud" />
      </div>
    )
  }

  const { ddriss, municipios, distritos } = datos
  const departamentosSede = new Set(ddriss.map((d) => d.departamentoId))
  const municipiosSede = municipios.filter((m) => departamentosSede.has(m.departamentoId))
  const distritosActivosDe = (municipioId) => distritos.filter((d) => d.activo && d.municipioId === municipioId).length

  const distritosFiltrados = distritos.filter(
    (d) =>
      (filtroMunicipio === TODOS || d.municipioId === Number(filtroMunicipio)) &&
      (filtroEstado === TODOS || d.activo === (filtroEstado === 'activos')),
  )

  return (
    <div className="flex flex-col gap-6">
      {errorAccion && <AvisoError>{errorAccion}</AvisoError>}

      {ddriss.map((d) => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle>
              {d.nombre} <span className="font-normal text-muted-foreground">· {d.codigo}</span>
            </CardTitle>
            <CardDescription>Departamento sede: {d.departamentoNombre}</CardDescription>
          </CardHeader>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Municipios</CardTitle>
          <CardDescription>Catálogo INE. Un municipio no se borra: se desactiva.</CardDescription>
          {puedeCrearMunicipio && (
            <CardAction>
              <Button onClick={() => setDialogoMunicipio({ municipio: null })}>
                <Plus />
                Registrar municipio
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label="Municipios">
              <TableHeader>
                <TableRow>
                  <TableHead>Código INE</TableHead>
                  <TableHead>Municipio</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Distritos activos</TableHead>
                  <TableHead>Estado</TableHead>
                  {puedeEditarMunicipio && <TableHead className="text-right">Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipios.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.codigoIne}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{m.nombre}</span>
                        {m.codigoIne === MIGRANTES ? (
                          <Badge variant="secondary">Procedencia especial</Badge>
                        ) : (
                          !departamentosSede.has(m.departamentoId) && <Badge variant="outline">Fuera del departamento</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{m.departamentoNombre}</TableCell>
                    <TableCell>{distritosActivosDe(m.id)}</TableCell>
                    <TableCell>
                      <EstadoActivo activo={m.activo} />
                    </TableCell>
                    {puedeEditarMunicipio && (
                      <TableCell className="text-right">
                        {/* El 9999 no se renombra ni se desactiva. */}
                        {m.codigoIne !== MIGRANTES && (
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label={`Acciones de ${m.codigoIne}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setDialogoMunicipio({ municipio: m })}>
                                Cambiar nombre
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onSelect={() => setPorCambiar({ tipo: 'municipio', elemento: m, activar: !m.activo })}
                              >
                                {m.activo ? 'Desactivar' : 'Reactivar'}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distritos de salud</CardTitle>
          {puedeCrear && (
            <CardAction>
              <Button onClick={() => setDialogo({ distrito: null })}>
                <Plus />
                Registrar distrito
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
          <form className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
            <Filtro
              nombre="municipio"
              etiqueta="Filtrar por municipio"
              valor={filtroMunicipio}
              alCambiar={setFiltroMunicipio}
              opciones={[
                { valor: TODOS, etiqueta: 'Todos los municipios' },
                ...municipiosSede.map((m) => ({ valor: String(m.id), etiqueta: m.nombre })),
              ]}
            />
            <Filtro
              nombre="estado"
              etiqueta="Filtrar por estado"
              valor={filtroEstado}
              alCambiar={setFiltroEstado}
              opciones={ESTADOS}
            />
          </form>

          {distritos.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground">No hay distritos de salud registrados.</p>
              {puedeCrear && (
                <Button variant="outline" onClick={() => setDialogo({ distrito: null })}>
                  <Plus />
                  Registrar distrito
                </Button>
              )}
            </div>
          ) : distritosFiltrados.length === 0 ? (
            <p className="text-muted-foreground">No hay distritos que coincidan con los filtros.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Distritos de salud">
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Establecimientos activos</TableHead>
                    <TableHead>Estado</TableHead>
                    {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distritosFiltrados.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.codigo}</TableCell>
                      <TableCell className="font-medium">{d.nombre}</TableCell>
                      <TableCell>{d.municipioNombre}</TableCell>
                      <TableCell>{d.establecimientosActivos}</TableCell>
                      <TableCell>
                        <EstadoActivo activo={d.activo} />
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="text-right">
                          {/* No modal: así el diálogo que abre una opción no hereda el bloqueo del menú. */}
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label={`Acciones de ${d.codigo}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setDialogo({ distrito: d })}>Renombrar</DropdownMenuItem>
                              {d.activo ? (
                                // El backend respondería 409: primero se mueven o desactivan sus establecimientos.
                                <DropdownMenuItem
                                  disabled={d.establecimientosActivos > 0}
                                  onSelect={() => setPorCambiar({ tipo: 'distrito', elemento: d, activar: false })}
                                >
                                  <div className="flex flex-col items-start">
                                    <span>Desactivar</span>
                                    {d.establecimientosActivos > 0 && (
                                      <span className="text-xs text-muted-foreground">Tiene establecimientos activos</span>
                                    )}
                                  </div>
                                </DropdownMenuItem>
                              ) : (
                                <DropdownMenuItem
                                  onSelect={() => setPorCambiar({ tipo: 'distrito', elemento: d, activar: true })}
                                >
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
            {porCambiar && (
              <>
                <AlertDialogTitle>
                  ¿{porCambiar.activar ? 'Reactivar' : 'Desactivar'}{' '}
                  {CONFIRMACION[porCambiar.tipo].titulo(porCambiar.elemento)}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {CONFIRMACION[porCambiar.tipo][porCambiar.activar ? 'activar' : 'desactivar']}
                </AlertDialogDescription>
              </>
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

      {dialogo && (
        <DialogoDistrito
          distrito={dialogo.distrito}
          municipios={municipiosSede.filter((m) => m.activo)}
          alGuardar={alGuardar}
          alCerrar={() => setDialogo(null)}
        />
      )}

      {dialogoMunicipio && (
        <DialogoMunicipio
          municipio={dialogoMunicipio.municipio}
          alGuardar={alGuardarMunicipio}
          alCerrar={() => setDialogoMunicipio(null)}
        />
      )}
    </div>
  )
}

export default function PaginaTerritorio() {
  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Administración" titulo="Territorio" />
      <ContenidoTerritorio />
    </section>
  )
}
