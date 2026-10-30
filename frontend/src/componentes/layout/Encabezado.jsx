import { Fragment } from 'react'
import { CalendarDays } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'
import { Separator } from '@/components/ui/separator'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { tituloDeRuta, ubicarRuta } from './ubicarRuta.js'

// Dónde está el usuario: el padre del menú (sin enlace, no tiene pantalla), la opción y, en una subruta, el enlace para
// volver a ella. Si la pantalla llegó con state.volverA, la miga vuelve como su botón «Volver»: a la lista con sus
// filtros, que son la búsqueda (catálogos) o { pathname, search } (usuarios).
function migasDe(pathname, volverA) {
  const ubicada = ubicarRuta(pathname)
  if (!ubicada) {
    const titulo = tituloDeRuta(pathname)
    return titulo ? [{ titulo }] : []
  }
  const { opcion, hijo, subruta } = ubicada
  const pantalla = hijo ?? opcion
  const migas = hijo ? [{ titulo: opcion.titulo, sinPantalla: true }] : []
  if (!subruta) return [...migas, { titulo: pantalla.titulo }]
  const vuelta = typeof volverA === 'string' ? `${pantalla.ruta}${volverA}` : (volverA ?? pantalla.ruta)
  return [...migas, { titulo: pantalla.titulo, ruta: vuelta }, { titulo: subruta.titulo }]
}

const FECHA_LARGA = new Intl.DateTimeFormat('es-GT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

export default function Encabezado() {
  const { pathname, state } = useLocation()
  const migas = migasDe(pathname, state?.volverA)

  return (
    <header className="sticky top-0 z-10 flex h-16 shrink-0 items-center gap-2 border-b bg-card/80 px-4 backdrop-blur-md backdrop-saturate-150">
      <SidebarTrigger className="-ml-1" aria-label="Mostrar u ocultar el menú" />
      {migas.length > 0 && (
        <>
          <Separator orientation="vertical" className="my-auto mr-1 data-[orientation=vertical]:h-4" />
          <Breadcrumb aria-label="Ubicación">
            <BreadcrumbList>
              {migas.map((miga, indice) => (
                <Fragment key={miga.titulo}>
                  {indice > 0 && <BreadcrumbSeparator />}
                  <BreadcrumbItem>
                    {miga.ruta ? (
                      <BreadcrumbLink asChild>
                        <Link to={miga.ruta}>{miga.titulo}</Link>
                      </BreadcrumbLink>
                    ) : miga.sinPantalla ? (
                      <span>{miga.titulo}</span>
                    ) : (
                      <BreadcrumbPage>{miga.titulo}</BreadcrumbPage>
                    )}
                  </BreadcrumbItem>
                </Fragment>
              ))}
            </BreadcrumbList>
          </Breadcrumb>
        </>
      )}
      <p className="ml-auto hidden items-center gap-2 rounded-full bg-secondary px-3 py-1 text-xs font-medium text-muted-foreground md:flex">
        <CalendarDays className="size-3.5" aria-hidden="true" />
        <span className="first-letter:uppercase">{FECHA_LARGA.format(new Date())}</span>
      </p>
    </header>
  )
}
