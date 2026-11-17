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
import { atenderAlerta } from '@/api/alertas.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'

// Un 409 (ya no está activa) no se muestra aquí: lo avisa la pantalla, que recarga la lista.
export default function DialogoAtenderAlerta({ alerta, alAtender, alYaNoActiva, alCerrar }) {
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState(null)

  async function confirmar(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso o el error.
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setError(null)
    try {
      alAtender(await atenderAlerta(alerta.id))
    } catch (err) {
      if (err instanceof ErrorApi && err.status === 409) {
        alYaNoActiva(mensajeDeError(err))
        return
      }
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Marcar como atendida «{alerta.titulo}»?</AlertDialogTitle>
          <AlertDialogDescription>
            La alerta quedará como atendida a su nombre y no se puede deshacer.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <p className="text-sm">{alerta.mensaje}</p>
        {error && <AvisoError>{error}</AvisoError>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction disabled={enviando} onClick={confirmar}>
            {enviando ? 'Guardando…' : 'Marcar como atendida'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
