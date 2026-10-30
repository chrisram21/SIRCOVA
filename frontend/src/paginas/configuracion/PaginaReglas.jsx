import { useEffect, useRef, useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarReglas } from '@/api/configuracion.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoEstadoRegla from './DialogoEstadoRegla.jsx'
import PanelHistorialRegla from './PanelHistorialRegla.jsx'
import PanelRegla from './PanelRegla.jsx'
import { InsigniaSeveridad, territorioDeRegla, vacunasDeRegla } from './presentacionRegla.jsx'
import { TIPOS_REGLA } from './tiposRegla.js'

// La versión que se muestra: la que aplica o, si la regla está inactiva, la última de la DDRISS.
const versionVisible = (fila) => fila.aplica ?? fila.ultimaDdriss

function ContenidoReglas() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('REGLA_CREAR')
  const puedeEditar = tienePermiso('REGLA_EDITAR')
  const [filas, setFilas] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  // { fila, accion: 'desactivar' | 'activar' } mientras el diálogo está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  // { tipo: 'nueva' } | { tipo: 'version' | 'historial', fila } mientras un panel lateral está abierto.
  const [panel, setPanel] = useState(null)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setFilas(null)
    setErrorCarga(null)
    listarReglas()
      .then((lista) => {
        if (carga === cargaActual.current) setFilas(lista)
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

  function alDesactivar(filaNueva) {
    setPorCambiar(null)
    setFilas((actuales) => actuales.map((f) => (f.codigo === filaNueva.codigo ? filaNueva : f)))
    toast.success(`Regla ${filaNueva.codigo} desactivada.`)
  }

  function alActivar(regla) {
    setPorCambiar(null)
    toast.success(`Regla ${regla.codigo} activada (versión ${regla.version}).`)
    cargar()
  }

  function alGuardar(regla) {
    setPanel(null)
    toast.success(`Regla ${regla.codigo} publicada (versión ${regla.version}).`)
    cargar()
  }

  function recargar() {
    setPorCambiar(null)
    setPanel(null)
    cargar()
  }

  const encabezado = (
    <EncabezadoPagina
      antetitulo="Administración"
      titulo="Reglas de validación"
      acciones={puedeCrear && <Button onClick={() => setPanel({ tipo: 'nueva' })}>Nueva regla</Button>}
    />
  )

  if (errorCarga) {
    return (
      <>
        {encabezado}
        <AvisoError onReintentar={cargar}>No se pudieron cargar las reglas: {errorCarga}</AvisoError>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <Card>
        <CardHeader>
          <CardTitle>Reglas que aplican a su DDRISS</CardTitle>
          <CardDescription>
            Las reglas de error impiden enviar el reporte; las advertencias solo avisan. Una regla de su DDRISS
            reemplaza a la nacional del mismo código.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filas === null ? (
            <div aria-label="Cargando reglas" className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-8 w-full" />
              ))}
            </div>
          ) : filas.length === 0 ? (
            <p className="text-muted-foreground">No hay reglas de validación.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Reglas de validación">
                <TableHeader>
                  <TableRow>
                    <TableHead>Regla</TableHead>
                    <TableHead>Severidad</TableHead>
                    <TableHead>Vacunas</TableHead>
                    <TableHead>Aplica</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((fila) => {
                    const { codigo, tipo, aplica, ultimaDdriss } = fila
                    const visible = versionVisible(fila)
                    const puedeDesactivar = puedeEditar && aplica?.territorio.nivel === 'DDRISS'
                    const puedeActivar = puedeEditar && ultimaDdriss?.estado === 'HISTORICO'
                    return (
                      <TableRow key={codigo}>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium">{visible?.nombre ?? codigo}</span>
                            <span className="text-xs text-muted-foreground">
                              {codigo} · {TIPOS_REGLA[tipo]?.etiqueta ?? tipo}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>{aplica ? <InsigniaSeveridad severidad={aplica.severidad} /> : '—'}</TableCell>
                        <TableCell>{visible ? vacunasDeRegla(visible.vacunas) : '—'}</TableCell>
                        <TableCell>
                          {aplica ? `Versión ${aplica.version} · ${territorioDeRegla(aplica.territorio)}` : '—'}
                        </TableCell>
                        <TableCell>
                          {aplica ? (
                            <Badge variant="secondary">Activa</Badge>
                          ) : (
                            <Badge variant="outline">Inactiva</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon-sm" aria-label={`Acciones de ${codigo}`}>
                                  <EllipsisVertical />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {puedeEditar && visible && (
                                  <DropdownMenuItem onSelect={() => setPanel({ tipo: 'version', fila })}>
                                    Nueva versión
                                  </DropdownMenuItem>
                                )}
                                {puedeDesactivar && (
                                  <DropdownMenuItem onSelect={() => setPorCambiar({ fila, accion: 'desactivar' })}>
                                    Desactivar
                                  </DropdownMenuItem>
                                )}
                                {puedeActivar && (
                                  <DropdownMenuItem onSelect={() => setPorCambiar({ fila, accion: 'activar' })}>
                                    Activar versión {ultimaDdriss.version} de {ultimaDdriss.territorio.ddrissCodigo}
                                  </DropdownMenuItem>
                                )}
                                <DropdownMenuItem onSelect={() => setPanel({ tipo: 'historial', fila })}>
                                  Historial
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {porCambiar && (
        <DialogoEstadoRegla
          fila={porCambiar.fila}
          accion={porCambiar.accion}
          alDesactivar={alDesactivar}
          alActivar={alActivar}
          alRecargar={recargar}
          alCerrar={() => setPorCambiar(null)}
        />
      )}
      {(panel?.tipo === 'nueva' || panel?.tipo === 'version') && (
        <PanelRegla
          modo={panel.tipo}
          fila={panel.fila}
          alGuardar={alGuardar}
          alRecargar={recargar}
          alCerrar={() => setPanel(null)}
        />
      )}
      {panel?.tipo === 'historial' && (
        <PanelHistorialRegla
          codigo={panel.fila.codigo}
          nombre={versionVisible(panel.fila)?.nombre ?? panel.fila.codigo}
          alCerrar={() => setPanel(null)}
        />
      )}
    </>
  )
}

export default function PaginaReglas() {
  return (
    <section className="flex flex-col gap-6 p-6">
      <ContenidoReglas />
    </section>
  )
}
