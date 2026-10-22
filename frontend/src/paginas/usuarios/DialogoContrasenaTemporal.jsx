import { useEffect, useState } from 'react'
import { Check, Copy } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'

const SEGUNDOS_COPIADA = 2
const TEXTO_COPIA = { inicial: 'Copiar', copiada: 'Copiada', fallo: 'No se pudo copiar' }

// Muestra la contraseña temporal una sola vez; quien lo abre debe borrarla de su estado en alCerrar.
export default function DialogoContrasenaTemporal({ nombreUsuario, contrasena, alCerrar }) {
  const [copia, setCopia] = useState('inicial')

  useEffect(() => {
    if (copia !== 'copiada') return undefined
    const temporizador = setTimeout(() => setCopia('inicial'), SEGUNDOS_COPIADA * 1000)
    return () => clearTimeout(temporizador)
  }, [copia])

  async function copiar() {
    try {
      // Sin HTTPS (fuera de localhost) navigator.clipboard no existe.
      await navigator.clipboard.writeText(contrasena)
      setCopia('copiada')
    } catch {
      setCopia('fallo')
    }
  }

  return (
    <AlertDialog open>
      {/* Solo se cierra con "Ya la anoté", para no perder la contraseña con un Escape. */}
      <AlertDialogContent onEscapeKeyDown={(evento) => evento.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>Contraseña temporal</AlertDialogTitle>
          <AlertDialogDescription>
            Esta contraseña no se volverá a mostrar. Entréguela a la persona de forma segura; deberá cambiarla al
            iniciar sesión.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
          <dt className="text-sm text-muted-foreground">Usuario</dt>
          <dd className="font-mono">{nombreUsuario}</dd>
          <dt className="text-sm text-muted-foreground">Contraseña</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span data-testid="contrasena-temporal" className="rounded-md bg-muted px-2 py-1 font-mono text-lg select-all">
              {contrasena}
            </span>
            <Button type="button" variant="outline" size="sm" onClick={copiar}>
              {copia === 'copiada' ? <Check /> : <Copy />}
              {TEXTO_COPIA[copia]}
            </Button>
          </dd>
        </dl>

        <AlertDialogFooter>
          <AlertDialogAction onClick={alCerrar}>Ya la anoté</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
