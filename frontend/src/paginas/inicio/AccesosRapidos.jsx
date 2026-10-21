import { Link } from 'react-router-dom'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import opcionesMenu from '@/componentes/layout/opcionesMenu.js'

export default function AccesosRapidos() {
  const { tienePermiso } = useSesion()
  const accesos = opcionesMenu.filter((opcion) => opcion.permiso && tienePermiso(opcion.permiso))
  if (accesos.length === 0) return null

  return (
    <section aria-labelledby="titulo-accesos" className="mt-8">
      <h2 id="titulo-accesos" className="text-lg font-semibold">
        Accesos rápidos
      </h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {accesos.map(({ titulo, ruta, icono: Icono }) => (
          <Link key={ruta} to={ruta} className="rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
            <Card className="h-full transition-colors hover:bg-accent hover:text-accent-foreground">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icono className="size-5" />
                  {titulo}
                </CardTitle>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
