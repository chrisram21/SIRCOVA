import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
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
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useCambiosPendientes } from '@/componentes/ProveedorCambiosPendientes.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { RUTA_CAMBIO_CONTRASENA } from '@/componentes/RutaProtegida.jsx'

export default function Encabezado() {
  const { sesion, cerrar } = useSesion()
  const { hayCambios } = useCambiosPendientes()
  const navegar = useNavigate()
  const [confirmando, setConfirmando] = useState(false)
  const { rol, rolNombre, empleado } = sesion.usuario

  function cerrarSesion() {
    cerrar()
    navegar('/login', { replace: true })
  }

  // useBlocker no lo detecta: la sesión se borra antes de navegar.
  function pedirCierre() {
    if (hayCambios) setConfirmando(true)
    else cerrarSesion()
  }

  return (
    <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
      <SidebarTrigger aria-label="Mostrar u ocultar el menú" />
      <div className="ml-auto text-right leading-tight">
        <p className="text-sm font-medium">
          {empleado.nombres} {empleado.apellidos}
        </p>
        <p className="text-xs text-muted-foreground">{rolNombre ?? rol}</p>
      </div>
      <Button variant="outline" size="sm" onClick={() => navegar(RUTA_CAMBIO_CONTRASENA)}>
        <KeyRound />
        Cambiar contraseña
      </Button>
      <Button variant="outline" size="sm" onClick={pedirCierre}>
        <LogOut />
        Cerrar sesión
      </Button>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Si cierra sesión ahora, se pierden los cambios sin guardar del reporte.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={cerrarSesion}>
              Cerrar sesión sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </header>
  )
}
