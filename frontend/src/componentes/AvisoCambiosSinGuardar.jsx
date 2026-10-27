import { useEffect } from 'react'
import { useBlocker } from 'react-router-dom'
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
import { useCambiosPendientes } from '@/componentes/ProveedorCambiosPendientes.jsx'

// Necesita un data router (createBrowserRouter o, en las pruebas, createMemoryRouter): useBlocker falla sin él.
// Bloquea la navegación a otra ruta u otra búsqueda (?periodo=) y el cierre o la recarga de la pestaña.
export function useAvisoCambiosSinGuardar(hayCambios) {
  const { anotarCambios } = useCambiosPendientes()
  const bloqueo = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hayCambios &&
      (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search),
  )

  useEffect(() => {
    if (bloqueo.state === 'blocked' && !hayCambios) bloqueo.reset()
  }, [bloqueo, hayCambios])

  useEffect(() => {
    anotarCambios(hayCambios)
  }, [anotarCambios, hayCambios])

  useEffect(() => () => anotarCambios(false), [anotarCambios])

  useEffect(() => {
    if (!hayCambios) return undefined
    // El navegador muestra su propio texto; no se puede cambiar.
    const avisar = (evento) => evento.preventDefault()
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [hayCambios])

  return bloqueo
}

export default function AvisoCambiosSinGuardar({ bloqueo, descripcion }) {
  return (
    <AlertDialog
      open={bloqueo.state === 'blocked'}
      onOpenChange={(abierto) => !abierto && bloqueo.state === 'blocked' && bloqueo.reset()}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
          <AlertDialogDescription>{descripcion}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Seguir editando</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            // Sin preventDefault, Radix cierra el diálogo y onOpenChange llamaría a reset después de proceed.
            onClick={(evento) => {
              evento.preventDefault()
              bloqueo.proceed()
            }}
          >
            Salir sin guardar
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
