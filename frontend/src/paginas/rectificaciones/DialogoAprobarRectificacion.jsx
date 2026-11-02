import { useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { mensajeDeError } from '@/api/cliente.js'
import { aprobarRectificacion } from '@/api/rectificaciones.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { nombreDelMes } from '@/lib/fechas.js'

export const LARGO_COMENTARIO = 500 // solicitud_rectificacion.comentario_resolucion
// Con estos errores la solicitud o el reporte ya no son los que se ven: solo queda volver a cargar.
export const ERRORES_DE_RECARGA = ['RECTIFICACION_RESUELTA', 'RECTIFICACION_DESACTUALIZADA', 'REPORTE_NO_CERRADO']

const celdas = (n) => (n === 1 ? '1 celda' : `${n} celdas`)

// SPEC 41: confirma la aprobación, que aplica los cambios y no se deshace. Quien lo abre lo monta de nuevo en cada
// apertura y, con alHecho(solicitud), avisa y muestra la solicitud resuelta.
export default function DialogoAprobarRectificacion({ solicitud, alHecho, alRecargar, alCerrar }) {
  const [comentario, setComentario] = useState('')
  const [enviando, setEnviando] = useState(false)
  // { mensaje, recargar }
  const [errorApi, setErrorApi] = useState(null)

  async function aprobar(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso o el error.
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setErrorApi(null)
    try {
      alHecho(await aprobarRectificacion(solicitud.id, { comentario: comentario.trim() || undefined }))
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), recargar: ERRORES_DE_RECARGA.includes(err.codigo) })
      setEnviando(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Aprobar y aplicar la rectificación?</AlertDialogTitle>
          <AlertDialogDescription>
            Se cambiarán {celdas(solicitud.cambios.length)} del reporte de {nombreDelMes(solicitud.reporte.periodo)} de{' '}
            {solicitud.reporte.establecimiento.nombre} y quedará cerrado.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comentario-aprobar-rectificacion">Comentario (opcional)</Label>
          <Textarea
            id="comentario-aprobar-rectificacion"
            value={comentario}
            maxLength={LARGO_COMENTARIO}
            disabled={enviando}
            aria-describedby="comentario-aprobar-rectificacion-largo"
            onChange={(evento) => setComentario(evento.target.value)}
          />
          <p id="comentario-aprobar-rectificacion-largo" className="self-end font-mono text-xs text-muted-foreground">
            {comentario.length}/{LARGO_COMENTARIO}
          </p>
        </div>

        {errorApi && (
          <AvisoError onReintentar={errorApi.recargar ? alRecargar : undefined} textoReintentar="Recargar">
            {errorApi.mensaje}
          </AvisoError>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={enviando} onClick={aprobar}>
            {enviando ? 'Aplicando…' : 'Aprobar y aplicar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
