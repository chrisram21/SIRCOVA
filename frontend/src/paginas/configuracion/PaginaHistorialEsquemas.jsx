import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { historialEsquemas } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { aDiaMesAnio } from './DialogoPublicarEsquema.jsx'
import { PESTANA_ESQUEMAS } from './EditorEsquema.jsx'
import { territorioDe } from './PestanaEsquemas.jsx'

const NO_EXISTE = 'NO_EXISTE'

export const ESTADOS = {
  BORRADOR: { etiqueta: 'Borrador', variante: 'secondary' },
  VIGENTE: { etiqueta: 'Vigente', variante: 'default' },
  HISTORICO: { etiqueta: 'Histórica', variante: 'outline' },
}

// El día de Guatemala de una fecha y hora ISO, como DD/MM/AAAA.
export const fechaGuatemala = (iso) =>
  new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(iso))

export function textoVigencia(vigencia) {
  if (!vigencia) return '—'
  if (!vigencia.hasta) return `Desde ${aDiaMesAnio(vigencia.desde)}`
  return `${aDiaMesAnio(vigencia.desde)} – ${aDiaMesAnio(vigencia.hasta)}`
}

export function textoPublicacion({ publicadoEn, publicadoPor }) {
  if (!publicadoEn) return '—'
  return publicadoPor ? `${fechaGuatemala(publicadoEn)} · ${publicadoPor.nombreUsuario}` : fechaGuatemala(publicadoEn)
}

export default function PaginaHistorialEsquemas() {
  const { vacunaId } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const pestana = state?.volverA || PESTANA_ESQUEMAS
  const volverA = `/configuracion${pestana}`
  const [historial, setHistorial] = useState(null)
  const [error, setError] = useState(null)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setHistorial(null)
    setError(null)
    historialEsquemas(vacunaId)
      .then((datos) => {
        if (carga === cargaActual.current) setHistorial(datos)
      })
      .catch((err) => {
        if (carga !== cargaActual.current) return
        setError(err instanceof ErrorApi && err.status === 404 ? NO_EXISTE : err.mensaje)
      })
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [vacunaId])

  return (
    <section className="flex max-w-6xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold">
            {historial ? `Historial de ${historial.vacuna.nombre}` : 'Historial del esquema'}
          </h1>
          {historial && !historial.vacuna.activa && <Badge variant="outline">Inactiva</Badge>}
        </div>
        <Button type="button" variant="outline" onClick={() => navigate(volverA)}>
          Volver
        </Button>
      </div>

      {error === NO_EXISTE && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>
            <span>
              La vacuna no existe.{' '}
              <Link to={volverA} className="underline">
                Volver a los esquemas
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      {error && error !== NO_EXISTE && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
            <CircleAlert />
            <AlertDescription>No se pudo cargar el historial: {error}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={cargar}>
            Reintentar
          </Button>
        </div>
      )}

      {!error && (
        <Card>
          <CardHeader>
            <CardTitle>Versiones del esquema</CardTitle>
            <CardDescription>
              Las versiones nacionales y las de su DDRISS, de la más nueva a la más vieja. Una versión publicada no
              cambia: los reportes conservan la que usaron.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historial === null ? (
              <div aria-label="Cargando historial" className="flex flex-col gap-2">
                {[1, 2, 3].map((n) => (
                  <Skeleton key={n} className="h-8 w-full" />
                ))}
              </div>
            ) : historial.versiones.length === 0 ? (
              <p className="text-muted-foreground">Esta vacuna aún no tiene esquemas.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table aria-label="Versiones del esquema">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Versión</TableHead>
                      <TableHead>Territorio</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Vigencia</TableHead>
                      <TableHead>Publicada</TableHead>
                      <TableHead>Motivo</TableHead>
                      <TableHead className="text-right">Reportes</TableHead>
                      <TableHead className="text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {historial.versiones.map((v) => (
                      <TableRow key={v.id}>
                        <TableCell className="font-medium">{v.version}</TableCell>
                        <TableCell>{territorioDe(v.territorio)}</TableCell>
                        <TableCell>
                          <Badge variant={ESTADOS[v.estado].variante}>{ESTADOS[v.estado].etiqueta}</Badge>
                        </TableCell>
                        <TableCell>{textoVigencia(v.vigencia)}</TableCell>
                        <TableCell>{textoPublicacion(v)}</TableCell>
                        <TableCell className="max-w-72 whitespace-normal">{v.motivoCambio ?? '—'}</TableCell>
                        <TableCell className="text-right">{v.reportes}</TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <Button asChild variant="outline" size="sm">
                              <Link
                                to={`/configuracion/esquemas/${v.id}`}
                                state={{ volverA: pestana }}
                                aria-label={`Ver la versión ${v.version}`}
                              >
                                Ver
                              </Link>
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </section>
  )
}
