import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { desactivarDimension, listarDimensiones, reactivarDimension } from '@/api/configuracion.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

// Radix Select no acepta '' como valor de una opción; "todas" equivale a no filtrar.
const TODAS = 'todas'
const ESTADOS = [
  { valor: TODAS, etiqueta: 'Todas' },
  { valor: 'true', etiqueta: 'Activas' },
  { valor: 'false', etiqueta: 'Inactivas' },
]
const TIPOS = { CATEGORICA: 'Categórica', RANGO_EDAD: 'Rango de edad' }
const MOTIVO_EN_USO = 'La usa un esquema vigente o en borrador.'

function ValoresActivos({ dimension }) {
  const inactivos = dimension.valores.filter((v) => !v.activo).length
  return (
    <div className="flex flex-wrap items-center gap-1">
      {dimension.valores
        .filter((v) => v.activo)
        .map((v) => (
          <Badge key={v.codigo} variant="outline" title={v.codigo}>
            {v.etiqueta}
          </Badge>
        ))}
      {inactivos > 0 && <span className="text-xs text-muted-foreground">+{inactivos} inactivos</span>}
    </div>
  )
}

export default function PestanaDimensiones() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('DIMENSION_CREAR')
  const puedeEditar = tienePermiso('DIMENSION_EDITAR')
  const { search } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  // Un estado de la URL que no está entre las opciones (p. ej. escrito a mano) equivale a no filtrar.
  const filtroEstado = ESTADOS.some((e) => e.valor === parametros.get('activa')) ? parametros.get('activa') : TODAS
  const [dimensiones, setDimensiones] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  // null o { dimension, activar } mientras el AlertDialog de confirmación está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  const [cambiando, setCambiando] = useState(false)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setDimensiones(null)
    setErrorCarga(null)
    listarDimensiones(filtroEstado === TODAS ? {} : { activa: filtroEstado === 'true' })
      .then((lista) => {
        if (carga === cargaActual.current) setDimensiones(lista)
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
  }, [filtroEstado])

  // El filtro va en la URL junto a la pestaña, para que siga puesto al volver de un formulario.
  function cambiarEstado(valor) {
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        if (valor === TODAS) nuevos.delete('activa')
        else nuevos.set('activa', valor)
        return nuevos
      },
      { replace: true },
    )
  }

  async function confirmarCambio(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar el progreso mientras tanto.
    evento.preventDefault()
    const { dimension, activar } = porCambiar
    setCambiando(true)
    setErrorAccion(null)
    try {
      const actualizada = activar
        ? await reactivarDimension(dimension.codigo)
        : await desactivarDimension(dimension.codigo)
      // La fila se reemplaza con la respuesta, sin volver a pedir la lista.
      setDimensiones((actuales) => actuales.map((d) => (d.codigo === actualizada.codigo ? actualizada : d)))
      toast.success(`Dimensión ${actualizada.nombre} ${activar ? 'reactivada' : 'desactivada'}.`)
    } catch (err) {
      setErrorAccion(mensajeDeError(err))
    } finally {
      setCambiando(false)
      setPorCambiar(null)
    }
  }

  if (errorCarga) {
    return <AvisoError onReintentar={cargar}>No se pudieron cargar las dimensiones: {errorCarga}</AvisoError>
  }

  return (
    <div className="flex flex-col gap-6">
      {errorAccion && <AvisoError>{errorAccion}</AvisoError>}
      <Card>
        <CardHeader>
          <CardTitle>Dimensiones de desagregación</CardTitle>
          <CardDescription>
            Formas de desagregar la producción que pueden usar los esquemas de captura. Los códigos no se borran ni
            se renombran; se desactivan.
          </CardDescription>
          {puedeCrear && (
            <CardAction>
              {/* El filtro viaja al formulario para volver a la pestaña con el mismo. */}
              <Button asChild>
                <Link to="/configuracion/dimensiones/nueva" state={{ volverA: search }}>
                  <Plus />
                  Nueva dimensión
                </Link>
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Dentro de un form, Radix agrega el <select> nativo del Select. */}
          <form className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
            <Select name="activa" value={filtroEstado} onValueChange={cambiarEstado}>
              <SelectTrigger aria-label="Estado" className="w-full bg-card sm:w-52">
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

          {dimensiones === null ? (
            <div aria-label="Cargando dimensiones" className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-8 w-full" />
              ))}
            </div>
          ) : dimensiones.length === 0 ? (
            <p className="text-muted-foreground">No hay dimensiones con ese estado.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <TooltipProvider>
                <Table aria-label="Dimensiones">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Código</TableHead>
                      <TableHead>Nombre</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Valores</TableHead>
                      <TableHead>Estado</TableHead>
                      {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dimensiones.map((d) => (
                      <TableRow key={d.codigo}>
                        <TableCell>{d.codigo}</TableCell>
                        <TableCell className="font-medium">{d.nombre}</TableCell>
                        <TableCell>{TIPOS[d.tipo] ?? d.tipo}</TableCell>
                        <TableCell>
                          <ValoresActivos dimension={d} />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {d.activa ? <Badge variant="secondary">Activa</Badge> : <Badge variant="outline">Inactiva</Badge>}
                            {d.enUso && <Badge variant="outline">En uso</Badge>}
                          </div>
                        </TableCell>
                        {puedeEditar && (
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <Button asChild variant="outline" size="sm">
                                <Link
                                  to={`/configuracion/dimensiones/${encodeURIComponent(d.codigo)}/editar`}
                                  state={{ volverA: search }}
                                  aria-label={`Editar ${d.codigo}`}
                                >
                                  Editar
                                </Link>
                              </Button>
                              {!d.activa ? (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Reactivar ${d.codigo}`}
                                  onClick={() => setPorCambiar({ dimension: d, activar: true })}
                                >
                                  Reactivar
                                </Button>
                              ) : d.enUso ? (
                                // Un botón deshabilitado no recibe el foco: el Tooltip va en un span que sí.
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span tabIndex={0}>
                                      <Button variant="outline" size="sm" disabled aria-label={`Desactivar ${d.codigo}`}>
                                        Desactivar
                                      </Button>
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>{MOTIVO_EN_USO}</TooltipContent>
                                </Tooltip>
                              ) : (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  aria-label={`Desactivar ${d.codigo}`}
                                  onClick={() => setPorCambiar({ dimension: d, activar: false })}
                                >
                                  Desactivar
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TooltipProvider>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={porCambiar !== null} onOpenChange={(abierto) => !abierto && !cambiando && setPorCambiar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              ¿{porCambiar?.activar ? 'Reactivar' : 'Desactivar'} la dimensión {porCambiar?.dimension.nombre}?
            </AlertDialogTitle>
            {!porCambiar?.activar && (
              <AlertDialogDescription>
                Los esquemas nuevos ya no podrán usarla; lo que ya se capturó con ella se conserva.
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
