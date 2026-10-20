import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

// Página provisional: HU-11 la reemplaza por el layout con el menú y la pantalla inicial de cada rol.
export default function PaginaInicio() {
  const { sesion, cerrar } = useSesion()
  const navegar = useNavigate()
  const { nombres, apellidos } = sesion.usuario.empleado

  function cerrarSesion() {
    cerrar()
    navegar('/login', { replace: true })
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-xl border bg-card p-8 text-card-foreground">
        <h1 className="text-2xl font-semibold">
          Hola, {nombres} {apellidos}
        </h1>
        <p className="mt-2 text-muted-foreground">
          Rol: <span className="font-medium text-foreground">{sesion.usuario.rol}</span>
        </p>
        <Button variant="outline" className="mt-6" onClick={cerrarSesion}>
          <LogOut />
          Cerrar sesión
        </Button>
      </div>
    </main>
  )
}
