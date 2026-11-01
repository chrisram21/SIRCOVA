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
import { aprobarReporte } from '@/api/revision.js'
import { AvisoError } from '@/componentes/Avisos.jsx'

const LARGO_COMENTARIO = 1000 // historial_estado_reporte.comentario
// Con estos dos errores el reporte ya no es el que se ve: solo queda volver a cargar.
const ERRORES_DE_RECARGA = ['REPORTE_DESACTUALIZADO', 'TRANSICION_NO_PERMITIDA']

// SPEC 38: confirma la aprobación, que no se deshace. Los errores se quedan en el diálogo; quien lo abre lo monta de
// nuevo en cada apertura y, con alHecho(reporte), avisa y sale.
export default function DialogoAprobarReporte({
  reporteId,
  establecimiento,
  versionFila,
  advertencias,
  alHecho,
  alRecargar,
  alCerrar,
}) {
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
      alHecho(await aprobarReporte(reporteId, { versionFila, comentario: comentario.trim() || undefined }))
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), recargar: ERRORES_DE_RECARGA.includes(err.codigo) })
      setEnviando(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Aprobar el reporte?</AlertDialogTitle>
          <AlertDialogDescription>
            El reporte de {establecimiento} queda aprobado y ya no se puede editar.
          </AlertDialogDescription>
          {advertencias > 0 && (
            <p className="text-sm text-advertencia-foreground">
              {advertencias === 1
                ? 'Tiene 1 advertencia abierta; se aprueba igual.'
                : `Tiene ${advertencias} advertencias abiertas; se aprueba igual.`}
            </p>
          )}
        </AlertDialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="comentario-aprobacion">Comentario (opcional)</Label>
          <Textarea
            id="comentario-aprobacion"
            value={comentario}
            maxLength={LARGO_COMENTARIO}
            disabled={enviando}
            aria-describedby="comentario-aprobacion-largo"
            onChange={(evento) => setComentario(evento.target.value)}
          />
          <p id="comentario-aprobacion-largo" className="self-end font-mono text-xs text-muted-foreground">
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
            {enviando ? 'Aprobando…' : 'Aprobar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
