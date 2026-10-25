import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronDown, CircleAlert, CircleCheck } from 'lucide-react'
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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { descartarEsquema, listarEsquemas } from '@/api/configuracion.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

export const territorioDe = (territorio) => (territorio.nivel === 'NACIONAL' ? 'Nacional' : territorio.ddrissCodigo)

export default function PestanaEsquemas() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('ESQUEMA_CREAR')
  const puedeEditar = tienePermiso('ESQUEMA_EDITAR')
  const navigate = useNavigate()
  const { search, state } = useLocation()
  const [filas, setFilas] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  // Empieza con el que trae el editor en el state de la navegación.
  const [aviso, setAviso] = useState(() => (state?.aviso ? { tipo: 'exito', mensaje: state.aviso } : null))
  // La fila cuyo borrador se va a descartar, mientras el AlertDialog está abierto.
  const [porDescartar, setPorDescartar] = useState(null)
  const [descartando, setDescartando] = useState(false)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setFilas(null)
    setErrorCarga(null)
    listarEsquemas()
      .then((lista) => {
        if (carga === cargaActual.current) setFilas(lista)
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

  // La pestaña viaja al editor para volver a ella al guardar.
  const crearBorrador = (vacuna, origen) =>
    navigate(`/configuracion/esquemas/nuevo?vacuna=${vacuna.id}&origen=${origen}`, { state: { volverA: search } })

  async function confirmarDescarte(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    const { vacuna, borrador } = porDescartar
    setDescartando(true)
    setAviso(null)
    try {
      await descartarEsquema(borrador.id)
      setFilas((actuales) => actuales.map((f) => (f.vacuna.codigo === vacuna.codigo ? { ...f, borrador: null } : f)))
      setAviso({ tipo: 'exito', mensaje: `Borrador versión ${borrador.version} de ${vacuna.nombre} descartado.` })
    } catch (err) {
      setAviso({ tipo: 'error', mensaje: err.mensaje })
    } finally {
      setDescartando(false)
      setPorDescartar(null)
    }
  }

  if (errorCarga) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudieron cargar los esquemas: {errorCarga}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={cargar}>
          Reintentar
        </Button>
      </div>
    )
  }

  const conAcciones = puedeCrear || puedeEditar

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
          <CardTitle>Esquemas de captura</CardTitle>
          <CardDescription>
            Definen qué dosis, dimensiones y secciones pide el formulario de cada vacuna. Los borradores no se usan
            para capturar hasta que se publiquen.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filas === null ? (
            <div aria-label="Cargando esquemas" className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-8 w-full" />
              ))}
            </div>
          ) : filas.length === 0 ? (
            <p className="text-muted-foreground">No hay vacunas activas.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Esquemas de captura">
                <TableHeader>
                  <TableRow>
                    <TableHead>Vacuna</TableHead>
                    <TableHead>Vigente que aplica</TableHead>
                    <TableHead>Borrador</TableHead>
                    {conAcciones && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map(({ vacuna, vigente, borrador }) => (
                    <TableRow key={vacuna.codigo}>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{vacuna.nombre}</span>
                          {!vacuna.activa && <Badge variant="outline">Inactiva</Badge>}
                        </div>
                      </TableCell>
                      <TableCell>
                        {vigente ? (
                          `Versión ${vigente.version} · ${territorioDe(vigente.territorio)}`
                        ) : (
                          <span className="text-muted-foreground">Sin esquema</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {borrador ? <Badge variant="secondary">Versión {borrador.version}</Badge> : '—'}
                      </TableCell>
                      {conAcciones && (
                        <TableCell>
                          <div className="flex justify-end gap-2">
                            {!borrador && puedeCrear && vacuna.activa && vigente && (
                              <DropdownMenu modal={false}>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm" aria-label={`Crear borrador de ${vacuna.codigo}`}>
                                    Crear borrador
                                    <ChevronDown />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onSelect={() => crearBorrador(vacuna, 'copia')}>
                                    Copiar la versión vigente
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onSelect={() => crearBorrador(vacuna, 'vacio')}>
                                    Empezar vacío
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            )}
                            {!borrador && puedeCrear && vacuna.activa && !vigente && (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Crear borrador de ${vacuna.codigo}`}
                                onClick={() => crearBorrador(vacuna, 'vacio')}
                              >
                                Crear borrador
                              </Button>
                            )}
                            {borrador && puedeEditar && vacuna.activa && (
                              <Button asChild variant="outline" size="sm">
                                <Link
                                  to={`/configuracion/esquemas/${borrador.id}/editar`}
                                  state={{ volverA: search }}
                                  aria-label={`Editar borrador de ${vacuna.codigo}`}
                                >
                                  Editar borrador
                                </Link>
                              </Button>
                            )}
                            {borrador && puedeEditar && (
                              <Button
                                variant="outline"
                                size="sm"
                                aria-label={`Descartar borrador de ${vacuna.codigo}`}
                                onClick={() => setPorDescartar({ vacuna, borrador })}
                              >
                                Descartar
                              </Button>
                            )}
                          </div>
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
        open={porDescartar !== null}
        onOpenChange={(abierto) => !abierto && !descartando && setPorDescartar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿Descartar el borrador versión {porDescartar?.borrador.version} de {porDescartar?.vacuna.nombre}?
            </AlertDialogTitle>
            <AlertDialogDescription>No se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={descartando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={descartando} onClick={confirmarDescarte}>
              {descartando ? 'Descartando…' : 'Descartar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
