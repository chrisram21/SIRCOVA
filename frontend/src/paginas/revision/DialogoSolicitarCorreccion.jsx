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
import { solicitarCorreccion } from '@/api/revision.js'

// Resume lo que se devuelve y lo envía; no se deshace. observaciones: [{ vacunaId, nombre, texto }] (nombre null en la
// general). Quien lo abre decide qué hacer con la respuesta o el error y lo cierra; se monta de nuevo en cada apertura.
export default function DialogoSolicitarCorreccion({ reporteId, versionFila, observaciones, alHecho, alFallar, alCerrar }) {
  const [enviando, setEnviando] = useState(false)

  async function devolver(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso.
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    try {
      alHecho(
        await solicitarCorreccion(reporteId, {
          versionFila,
          observaciones: observaciones.map(({ vacunaId, texto }) => ({ vacunaId, texto })),
        }),
      )
    } catch (err) {
      setEnviando(false)
      alFallar(err)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Devolver el reporte al establecimiento?</AlertDialogTitle>
          <AlertDialogDescription>
            Pasará a «Corrección solicitada» con {observaciones.length === 1 ? 'esta observación' : 'estas observaciones'}, y
            el establecimiento podrá corregirlo.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <ul aria-label="Observaciones que se envían" className="flex max-h-72 flex-col gap-2 overflow-y-auto text-sm">
          {observaciones.map(({ vacunaId, nombre, texto }) => (
            <li key={vacunaId ?? 'general'} className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="font-medium">{nombre ?? 'General'}</p>
              <p className="whitespace-pre-line text-muted-foreground">{texto}</p>
            </li>
          ))}
        </ul>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={enviando} onClick={devolver}>
            {enviando ? 'Devolviendo…' : 'Devolver al establecimiento'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
