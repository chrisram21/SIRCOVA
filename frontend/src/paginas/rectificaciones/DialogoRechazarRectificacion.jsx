import { useRef, useState } from 'react'
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
import { rechazarRectificacion } from '@/api/rectificaciones.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { ERRORES_DE_RECARGA, LARGO_COMENTARIO } from './DialogoAprobarRectificacion.jsx'

// SPEC 41: el motivo es obligatorio y se revisa antes de llamar a la API; los datos del reporte no cambian.
export default function DialogoRechazarRectificacion({ solicitud, alHecho, alRecargar, alCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [errorMotivo, setErrorMotivo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  // { mensaje, recargar }
  const [errorApi, setErrorApi] = useState(null)
  const campo = useRef(null)

  async function rechazar(evento) {
    evento.preventDefault()
    if (enviando) return
    if (!motivo.trim()) {
      setErrorMotivo('Escriba el motivo del rechazo.')
      campo.current?.focus()
      return
    }
    setErrorMotivo(null)
    setEnviando(true)
    setErrorApi(null)
    try {
      alHecho(await rechazarRectificacion(solicitud.id, { comentario: motivo.trim() }))
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), recargar: ERRORES_DE_RECARGA.includes(err.codigo) })
      setEnviando(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Rechazar la solicitud?</AlertDialogTitle>
          <AlertDialogDescription>
            Los datos del reporte de {solicitud.reporte.establecimiento.nombre} no cambian. El motivo queda en la
            solicitud.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="motivo-rechazo">Motivo del rechazo</Label>
          <Textarea
            id="motivo-rechazo"
            ref={campo}
            value={motivo}
            maxLength={LARGO_COMENTARIO}
            disabled={enviando}
            aria-invalid={errorMotivo ? true : undefined}
            aria-describedby={errorMotivo ? 'motivo-rechazo-error motivo-rechazo-largo' : 'motivo-rechazo-largo'}
            onChange={(evento) => setMotivo(evento.target.value)}
          />
          <div className="flex items-start justify-between gap-3">
            {errorMotivo ? (
              <p id="motivo-rechazo-error" className="text-sm text-destructive">
                {errorMotivo}
              </p>
            ) : (
              <span />
            )}
            <p id="motivo-rechazo-largo" className="font-mono text-xs text-muted-foreground">
              {motivo.length}/{LARGO_COMENTARIO}
            </p>
          </div>
        </div>

        {errorApi && (
          <AvisoError onReintentar={errorApi.recargar ? alRecargar : undefined} textoReintentar="Recargar">
            {errorApi.mensaje}
          </AvisoError>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={enviando} onClick={rechazar}>
            {enviando ? 'Rechazando…' : 'Rechazar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
