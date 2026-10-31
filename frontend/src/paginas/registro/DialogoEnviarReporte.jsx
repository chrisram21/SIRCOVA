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
import { cambiarEstadoReporte } from '@/api/revision.js'

// Confirma el envío a revisión, que no se deshace. Quien lo abre decide qué hacer con la respuesta o el error y lo
// cierra; se monta de nuevo en cada apertura.
export default function DialogoEnviarReporte({ reporteId, versionFila, advertencias, alEnviar, alFallar, alCerrar }) {
  const [enviando, setEnviando] = useState(false)

  async function enviar(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso.
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    try {
      alEnviar(await cambiarEstadoReporte(reporteId, { estadoDestino: 'ENVIADO', versionFila }))
    } catch (err) {
      setEnviando(false)
      alFallar(err)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Enviar a revisión?</AlertDialogTitle>
          <AlertDialogDescription>Después de enviarlo ya no podrá editar el reporte.</AlertDialogDescription>
        </AlertDialogHeader>
        {advertencias > 0 && (
          <p className="text-sm text-muted-foreground">
            Se enviará con {advertencias} {advertencias === 1 ? 'advertencia' : 'advertencias'}; la estadígrafa las verá.
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={enviando} onClick={enviar}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
