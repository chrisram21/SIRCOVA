import { UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

// El listado de usuarios llega con HU-07; por ahora la página solo lleva al registro.
export default function PaginaUsuarios() {
  const { tienePermiso } = useSesion()

  return (
    <section className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        {tienePermiso('EMPLEADO_CREAR') && (
          <Button asChild>
            <Link to="/usuarios/nuevo">
              <UserPlus />
              Registrar personal
            </Link>
          </Button>
        )}
      </div>
    </section>
  )
}
