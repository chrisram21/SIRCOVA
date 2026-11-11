import { useEffect, useState } from 'react'
import { CircleCheck, TriangleAlert, X } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerRectificacion } from '@/api/rectificaciones.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import InsigniaEstadoRectificacion from '@/componentes/InsigniaEstadoRectificacion.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { nombreDelMes } from '@/lib/fechas.js'
import DialogoAprobarRectificacion from './DialogoAprobarRectificacion.jsx'
import DialogoRechazarRectificacion from './DialogoRechazarRectificacion.jsx'
import { aFechaHora, combinacionDe, diferenciaDe, mesDe } from './formato.js'

function Dato({ etiqueta, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// SPEC 57: las solicitudes del establecimiento en el mes de esta, en ámbar desde el umbral.
function ConteoDelMes({ conteo }) {
  if (!conteo) return null
  const texto = `Solicitudes del establecimiento en ${nombreDelMes(conteo)}: ${conteo.cantidad}`
  if (conteo.cantidad < conteo.umbral) return <p className="text-sm text-muted-foreground">{texto}</p>
  return (
    <Alert className="border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground">
      <TriangleAlert />
      <AlertDescription className="text-advertencia-foreground">
        {texto} Llega al límite de {conteo.umbral} al mes.
      </AlertDescription>
    </Alert>
  )
}

// La tabla celda por celda, con el valor anterior y el nuevo; también la usa la nueva solicitud antes de enviar.
export function TablaCambios({ cambios, etiqueta = 'Cambios' }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <Table aria-label={etiqueta}>
        <TableHeader>
          <TableRow>
            <TableHead>Vacuna</TableHead>
            <TableHead>Dosis</TableHead>
            <TableHead>Procedencia</TableHead>
            <TableHead>Combinación</TableHead>
            <TableHead className="text-right">Anterior</TableHead>
            <TableHead className="text-right">Nuevo</TableHead>
            <TableHead className="text-right">Diferencia</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cambios.map((cambio) => (
            <TableRow key={`${cambio.vacuna.id}|${cambio.dosis.codigo}|${cambio.municipioProcedencia.id}|${cambio.claveCombinacion}`}>
              <TableCell className="font-medium">{cambio.vacuna.nombre}</TableCell>
              <TableCell>{cambio.dosis.nombre}</TableCell>
              <TableCell>{cambio.municipioProcedencia.nombre}</TableCell>
              <TableCell className="whitespace-normal">{combinacionDe(cambio.dimensiones)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {cambio.celdaNueva ? <span className="text-muted-foreground">Vacía</span> : cambio.cantidadAnterior}
              </TableCell>
              <TableCell className="text-right font-semibold tabular-nums">{cambio.cantidadNueva}</TableCell>
              <TableCell className="text-right tabular-nums">
                {diferenciaDe(cambio.cantidadAnterior, cambio.cantidadNueva)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

export default function PaginaDetalleRectificacion() {
  const { id } = useParams()
  const { state } = useLocation()
  const volverA = `/rectificaciones${typeof state?.volverA === 'string' ? state.volverA : ''}`

  const [solicitud, setSolicitud] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  // 'aprobar' | 'rechazar' | null
  const [dialogo, setDialogo] = useState(null)
  const sesion = useSesion()
  const puedeResolver = sesion?.tienePermiso('RECTIFICACION_RESOLVER') ?? false
  const puedeVerReporte = sesion?.tienePermiso('REPORTE_REVISAR') ?? false

  useEffect(() => {
    let vigente = true
    setErrorCarga(null)
    obtenerRectificacion(id)
      .then((respuesta) => vigente && setSolicitud(respuesta))
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [id, intento])

  const titulo = solicitud ? `Rectificación de ${nombreDelMes(solicitud.reporte.periodo)}` : 'Solicitud de rectificación'
  const resolver = puedeResolver && solicitud?.estado === 'PENDIENTE'

  function resuelta(mensaje) {
    return (respuesta) => {
      setDialogo(null)
      setSolicitud(respuesta)
      toast.success(mensaje)
    }
  }

  function recargar() {
    setDialogo(null)
    setIntento((n) => n + 1)
  }

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Rectificaciones"
        titulo={titulo}
        descripcion={solicitud?.reporte.establecimiento.nombre}
        volverA={volverA}
        textoVolver="Volver a las solicitudes"
        acciones={
          solicitud && (
            <>
              <InsigniaEstadoRectificacion estado={solicitud.estado} />
              {resolver && (
                <>
                  <Button variant="outline" onClick={() => setDialogo('rechazar')}>
                    <X />
                    Rechazar
                  </Button>
                  <Button onClick={() => setDialogo('aprobar')}>
                    <CircleCheck />
                    Aprobar
                  </Button>
                </>
              )}
            </>
          )
        }
      />

      {errorCarga ? (
        <AvisoError onReintentar={() => setIntento((n) => n + 1)}>
          No se pudo cargar la solicitud: {errorCarga}
        </AvisoError>
      ) : solicitud === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando solicitud">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <>
          <dl className="grid gap-4 rounded-lg border bg-card p-4 sm:grid-cols-2">
            <Dato etiqueta="Solicitada por">
              {solicitud.solicitadoPor.nombre} · {aFechaHora(solicitud.solicitadoEn)}
            </Dato>
            <Dato etiqueta="Reporte">
              {solicitud.reporte.establecimiento.codigo} · {mesDe(solicitud.reporte.periodo)}
              {puedeVerReporte && (
                <>
                  {' · '}
                  <Link
                    to={`/revision/reportes/${solicitud.reporte.id}`}
                    state={{
                      regresarA: { ruta: `/rectificaciones/${solicitud.id}`, texto: 'Volver a la solicitud', estado: state },
                    }}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Ver reporte
                  </Link>
                </>
              )}
            </Dato>
            <div className="sm:col-span-2">
              <Dato etiqueta="Justificación">
                <p className="whitespace-pre-line">{solicitud.motivo}</p>
              </Dato>
            </div>
            {solicitud.resueltoPor && (
              <Dato etiqueta="Resuelta por">
                {solicitud.resueltoPor.nombre} · {aFechaHora(solicitud.resueltoEn)}
              </Dato>
            )}
            {solicitud.comentarioResolucion && (
              <Dato etiqueta="Comentario de la resolución">
                <p className="whitespace-pre-line">{solicitud.comentarioResolucion}</p>
              </Dato>
            )}
          </dl>

          <ConteoDelMes conteo={solicitud.solicitudesDelMes} />

          {solicitud.totales?.map((total) => (
            <Alert key={total.vacunaId} className="border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground">
              <TriangleAlert />
              <AlertDescription className="text-advertencia-foreground">
                {total.vacuna}: el total declarado ({total.totalDeclarado}) ya no cuadrará con la suma ({total.sumaActual}{' '}
                → {total.sumaConCambios}).
              </AlertDescription>
            </Alert>
          ))}

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Cambios ({solicitud.cambios.length})</h2>
            <TablaCambios cambios={solicitud.cambios} />
          </div>
        </>
      )}

      {dialogo === 'aprobar' && (
        <DialogoAprobarRectificacion
          solicitud={solicitud}
          alHecho={resuelta('Rectificación aplicada.')}
          alRecargar={recargar}
          alCerrar={() => setDialogo(null)}
        />
      )}
      {dialogo === 'rechazar' && (
        <DialogoRechazarRectificacion
          solicitud={solicitud}
          alHecho={resuelta('Solicitud rechazada.')}
          alRecargar={recargar}
          alCerrar={() => setDialogo(null)}
        />
      )}
    </section>
  )
}
