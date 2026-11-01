import { useEffect, useState } from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerRectificacion } from '@/api/rectificaciones.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import InsigniaEstadoRectificacion from '@/componentes/InsigniaEstadoRectificacion.jsx'
import { nombreDelMes } from '@/lib/fechas.js'
import { aFechaHora, combinacionDe, diferenciaDe, mesDe } from './formato.js'

function Dato({ etiqueta, children }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
      <dd>{children}</dd>
    </div>
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

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Rectificaciones"
        titulo={titulo}
        descripcion={solicitud?.reporte.establecimiento.nombre}
        volverA={volverA}
        textoVolver="Volver a las solicitudes"
        acciones={solicitud && <InsigniaEstadoRectificacion estado={solicitud.estado} />}
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

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Cambios ({solicitud.cambios.length})</h2>
            <TablaCambios cambios={solicitud.cambios} />
          </div>
        </>
      )}
    </section>
  )
}
