import { useEffect, useRef, useState } from 'react'
import { EllipsisVertical } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarConfigIndicadores } from '@/api/configuracion.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoEstadoIndicador from './DialogoEstadoIndicador.jsx'
import PanelHistorialIndicador from './PanelHistorialIndicador.jsx'
import PanelIndicador from './PanelIndicador.jsx'
import {
  InsigniasSemaforo,
  etiquetaTipo,
  poblacionYEdad,
  territorioDeIndicador,
  textoMeta,
  vacunaYDosis,
} from './presentacionIndicador.jsx'

// La versión que se muestra: la que aplica o, si el indicador está inactivo, la última de la DDRISS.
const versionVisible = (fila) => fila.aplica ?? fila.ultimaDdriss

function ContenidoIndicadores() {
  const { tienePermiso } = useSesion()
  const puedeEditar = tienePermiso('INDICADOR_CONFIG_EDITAR')
  const [filas, setFilas] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  // { fila, accion: 'desactivar' | 'activar' } mientras el diálogo está abierto.
  const [porCambiar, setPorCambiar] = useState(null)
  // { tipo: 'nuevo' } | { tipo: 'version' | 'historial', fila } mientras un panel lateral está abierto.
  const [panel, setPanel] = useState(null)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setFilas(null)
    setErrorCarga(null)
    listarConfigIndicadores()
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
    toast.success(`Indicador ${filaNueva.codigo} desactivado.`)
  }

  function alActivar(indicador) {
    setPorCambiar(null)
    toast.success(`Indicador ${indicador.codigo} activado (versión ${indicador.version}).`)
    cargar()
  }

  function alGuardar(indicador) {
    setPanel(null)
    toast.success(`Indicador ${indicador.codigo} publicado (versión ${indicador.version}).`)
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
      titulo="Configuración de indicadores"
      acciones={puedeEditar && <Button onClick={() => setPanel({ tipo: 'nuevo' })}>Nuevo indicador</Button>}
    />
  )

  if (errorCarga) {
    return (
      <>
        {encabezado}
        <AvisoError onReintentar={cargar}>No se pudieron cargar los indicadores: {errorCarga}</AvisoError>
      </>
    )
  }

  return (
    <>
      {encabezado}
      <Card>
        <CardHeader>
          <CardTitle>Indicadores que aplican a su DDRISS</CardTitle>
          <CardDescription>
            Cada cambio publica una versión nueva: los resultados ya calculados conservan la versión con la que se
            calcularon. Un indicador de su DDRISS reemplaza al nacional del mismo código.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filas === null ? (
            <div aria-label="Cargando indicadores" className="flex flex-col gap-2">
              {[1, 2, 3, 4].map((n) => (
                <Skeleton key={n} className="h-8 w-full" />
              ))}
            </div>
          ) : filas.length === 0 ? (
            <p className="text-muted-foreground">No hay indicadores configurados.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Indicadores">
                <TableHeader>
                  <TableRow>
                    <TableHead>Indicador</TableHead>
                    <TableHead>Vacuna y dosis</TableHead>
                    <TableHead>Meta</TableHead>
                    <TableHead>Semáforo</TableHead>
                    <TableHead>Aplica</TableHead>
                    <TableHead>Estado</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((fila) => {
                    const { codigo, tipoCalculo, aplica, ultimaDdriss } = fila
                    const visible = versionVisible(fila)
                    const puedeDesactivar = puedeEditar && aplica?.territorio.nivel === 'DDRISS'
                    const puedeActivar = puedeEditar && ultimaDdriss?.estado === 'HISTORICO'
                    return (
                      <TableRow key={codigo}>
                        <TableCell>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{visible?.nombre ?? codigo}</span>
                            <span className="text-xs text-muted-foreground">
                              {codigo} · {etiquetaTipo(tipoCalculo)}
                            </span>
                            {(visible?.esIndicadorMapa || visible?.esEstimacion) && (
                              <span className="flex gap-1">
                                {visible.esIndicadorMapa && <Badge variant="outline">Mapa</Badge>}
                                {visible.esEstimacion && <Badge variant="outline">Estimación</Badge>}
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {visible ? (
                            <div className="flex flex-col gap-0.5">
                              <span>{vacunaYDosis(visible)}</span>
                              <span className="text-xs text-muted-foreground">{poblacionYEdad(visible)}</span>
                            </div>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">{aplica ? textoMeta(aplica) : '—'}</TableCell>
                        <TableCell>{aplica ? <InsigniasSemaforo indicador={aplica} /> : '—'}</TableCell>
                        <TableCell className="whitespace-nowrap">
                          {aplica ? `Versión ${aplica.version} · ${territorioDeIndicador(aplica.territorio)}` : '—'}
                        </TableCell>
                        <TableCell>
                          {aplica ? (
                            <Badge variant="secondary">Activo</Badge>
                          ) : (
                            <Badge variant="outline">Inactivo</Badge>
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
        <DialogoEstadoIndicador
          fila={porCambiar.fila}
          accion={porCambiar.accion}
          alDesactivar={alDesactivar}
          alActivar={alActivar}
          alRecargar={recargar}
          alCerrar={() => setPorCambiar(null)}
        />
      )}
      {(panel?.tipo === 'nuevo' || panel?.tipo === 'version') && (
        <PanelIndicador
          modo={panel.tipo}
          fila={panel.fila}
          alGuardar={alGuardar}
          alRecargar={recargar}
          alCerrar={() => setPanel(null)}
        />
      )}
      {panel?.tipo === 'historial' && (
        <PanelHistorialIndicador
          codigo={panel.fila.codigo}
          nombre={versionVisible(panel.fila)?.nombre ?? panel.fila.codigo}
          alCerrar={() => setPanel(null)}
        />
      )}
    </>
  )
}

export default function PaginaConfigIndicadores() {
  return (
    <section className="flex flex-col gap-6 p-6">
      <ContenidoIndicadores />
    </section>
  )
}
