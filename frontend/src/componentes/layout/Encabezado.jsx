import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

export default function Encabezado() {
  const { sesion, cerrar } = useSesion()
  const navegar = useNavigate()
  const { rol, rolNombre, empleado } = sesion.usuario

  function cerrarSesion() {
    cerrar()
    navegar('/login', { replace: true })
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
      <Button variant="outline" size="sm" onClick={cerrarSesion}>
        <LogOut />
        Cerrar sesión
      </Button>
    </header>
  )
}
