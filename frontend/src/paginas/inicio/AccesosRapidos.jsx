import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/card'
import { seguirPuntero } from '@/componentes/efectos.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import opcionesMenu, { puedeVer } from '@/componentes/layout/opcionesMenu.js'

export default function AccesosRapidos() {
  const { tienePermiso } = useSesion()
  // Un padre del menú no tiene acceso propio: van sus hijos, en su lugar y en su orden. Inicio no lleva acceso.
  const accesos = opcionesMenu
    .flatMap((opcion) => opcion.hijos ?? (opcion.permiso ? [opcion] : []))
    .filter((pantalla) => puedeVer(pantalla, tienePermiso))
  if (accesos.length === 0) return null

  return (
    <section aria-labelledby="titulo-accesos" className="flex flex-col gap-4">
      <h2 id="titulo-accesos" className="text-lg font-semibold">
        Accesos rápidos
      </h2>
      <div className="escalonado grid gap-4 [--retraso:200ms] sm:grid-cols-2 xl:grid-cols-4">
        {accesos.map(({ titulo, descripcion, ruta, icono: Icono }) => (
          <Link
            key={ruta}
            to={ruta}
            onPointerMove={seguirPuntero}
            className="group rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Card className="foco-luz h-full shadow-tarjeta transition-[translate,box-shadow] duration-300 ease-salida group-hover:-translate-y-1 group-hover:shadow-elevada group-hover:ring-ring/40">
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex size-10 items-center justify-center rounded-xl bg-accent text-accent-foreground transition-colors duration-300 group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icono className="size-5" aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    aria-hidden="true"
                    className="size-4 -translate-x-1 translate-y-1 text-enlace opacity-0 transition-all duration-300 group-hover:translate-0 group-hover:opacity-100"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className="font-semibold">{titulo}</h3>
                  {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
                </div>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}
