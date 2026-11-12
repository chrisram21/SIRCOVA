import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
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
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { desactivarRed, listarRedes } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

const RUTA = '/administracion/redes'

const textoTrazadoras = (n) => `${n} ${n === 1 ? 'trazadora' : 'trazadoras'}`

function ContenidoRedes() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('RED_CREAR')
  const puedeEditar = tienePermiso('RED_EDITAR')
  const navigate = useNavigate()
  const { search } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const [redes, setRedes] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  const [porDesactivar, setPorDesactivar] = useState(null)
  const [desactivando, setDesactivando] = useState(false)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setRedes(null)
    setErrorCarga(null)
    listarRedes()
      .then((lista) => {
        if (carga === cargaActual.current) setRedes(lista)
      })
      .catch((err) => {
        if (carga === cargaActual.current) setErrorCarga(mensajeDeError(err))
      })
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [])

  // Reactivar también va a la edición: una red inactiva no tiene municipios y se reactiva eligiéndolos.
  const abrirEdicion = (red) => navigate(`${RUTA}/${red.id}/editar`, { state: { volverA: search } })

  async function confirmarDesactivar(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    setDesactivando(true)
    setErrorAccion(null)
    try {
      const actualizada = await desactivarRed(porDesactivar.id)
      setRedes((actuales) => actuales.map((r) => (r.id === actualizada.id ? actualizada : r)))
      toast.success(`${actualizada.nombre} desactivada.`)
    } catch (err) {
      setErrorAccion(mensajeDeError(err))
    } finally {
      setDesactivando(false)
      setPorDesactivar(null)
    }
  }

  function cambiarInactivas(mostrar) {
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (mostrar) nuevos.set('inactivas', '1')
        else nuevos.delete('inactivas')
        return nuevos
      },
      { replace: true },
    )
  }

  if (errorCarga) {
    return <AvisoError onReintentar={cargar}>No se pudieron cargar las redes: {errorCarga}</AvisoError>
  }

  if (redes === null) {
    return (
      <Card aria-label="Cargando redes">
        <CardHeader>
          <CardTitle>Redes de municipios</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  const mostrarInactivas = parametros.get('inactivas') === '1'
  const visibles = redes.filter((r) => mostrarInactivas || r.activo)
  const enlaceNueva = (
    <Link to={`${RUTA}/nueva`} state={{ volverA: search }}>
      <Plus />
      Nueva red
    </Link>
  )

  return (
    <div className="flex flex-col gap-6">
      {errorAccion && <AvisoError>{errorAccion}</AvisoError>}
      <Card>
        <CardHeader>
          <CardTitle>Redes de municipios</CardTitle>
          <CardDescription>
            Cada municipio pertenece a una sola red. Las trazadoras son las dosis que se presentan por red.
          </CardDescription>
          {puedeCrear && (
            <CardAction>
              <Button asChild>{enlaceNueva}</Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="mostrar-inactivas"
              checked={mostrarInactivas}
              onCheckedChange={(marcada) => cambiarInactivas(marcada === true)}
            />
            <Label htmlFor="mostrar-inactivas">Mostrar inactivas</Label>
          </div>

          {redes.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground">Todavía no hay redes en la DDRISS.</p>
              {puedeCrear && (
                <Button asChild variant="outline">
                  {enlaceNueva}
                </Button>
              )}
            </div>
          ) : visibles.length === 0 ? (
            <p className="text-muted-foreground">No hay redes activas. Marque «Mostrar inactivas» para verlas.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Redes">
                <TableHeader>
                  <TableRow>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Código</TableHead>
                    <TableHead>Municipios</TableHead>
                    <TableHead>Trazadoras</TableHead>
                    <TableHead>Estado</TableHead>
                    {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {visibles.map((red) => (
                    <TableRow key={red.id}>
                      <TableCell className="font-medium">{red.nombre}</TableCell>
                      <TableCell>{red.codigo}</TableCell>
                      <TableCell className="whitespace-normal">
                        {red.municipios.length === 0 ? (
                          <span className="text-muted-foreground">Sin municipios</span>
                        ) : (
                          <div className="flex min-w-48 flex-wrap gap-1">
                            {red.municipios.map((m) => (
                              <Badge key={m.id} variant="outline">
                                {m.nombre}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>{textoTrazadoras(red.trazadoras.length)}</TableCell>
                      <TableCell>
                        <Badge variant={red.activo ? 'secondary' : 'outline'}>
                          {red.activo ? 'Activa' : 'Inactiva'}
                        </Badge>
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="text-right">
                          {/* No modal: así el diálogo que abre una opción no hereda el bloqueo del menú. */}
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label={`Acciones de ${red.nombre}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {red.activo ? (
                                <>
                                  <DropdownMenuItem onSelect={() => abrirEdicion(red)}>Editar</DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => setPorDesactivar(red)}>Desactivar</DropdownMenuItem>
                                </>
                              ) : (
                                <DropdownMenuItem onSelect={() => abrirEdicion(red)}>Reactivar</DropdownMenuItem>
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

      <AlertDialog
        open={porDesactivar !== null}
        onOpenChange={(abierto) => !abierto && !desactivando && setPorDesactivar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar la {porDesactivar?.nombre}?</AlertDialogTitle>
            <AlertDialogDescription>
              Sus municipios quedan libres para otra red y sus trazadoras se conservan. Para reactivarla habrá que
              volver a elegir sus municipios.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={desactivando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={desactivando} onClick={confirmarDesactivar}>
              {desactivando ? 'Desactivando…' : 'Desactivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function PaginaRedes() {
  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Administración" titulo="Redes" />
      <ContenidoRedes />
    </section>
  )
}
