import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { Skeleton } from '@/components/ui/skeleton'
import { ProveedorCambiosPendientes } from '@/componentes/ProveedorCambiosPendientes.jsx'
import Encabezado from './Encabezado.jsx'
import MenuLateral from './MenuLateral.jsx'

// 15rem = 240 px, el ancho del menú en los mockups (shadcn trae 16rem).
const ANCHO_MENU = { '--sidebar-width': '15rem' }

// Mientras llega el código de una pantalla (se carga al entrar en ella).
function CargandoPantalla() {
  return (
    <div aria-label="Cargando pantalla" className="flex flex-col gap-4 p-6">
      <div aria-hidden="true" className="fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-ring/20">
        <div className="h-full w-1/3 animate-barra-carga bg-ring" />
      </div>
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-8 w-72" />
      <Skeleton className="h-40 w-full" />
    </div>
  )
}

export default function Layout() {
  const { pathname } = useLocation()
  return (
    <ProveedorCambiosPendientes>
      <SidebarProvider style={ANCHO_MENU}>
        <a
          href="#contenido"
          className="sr-only z-50 rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Saltar al contenido
        </a>
        <MenuLateral />
        <SidebarInset>
          <Encabezado />
          {/* SidebarInset ya es el <main>. */}
          <div id="contenido" tabIndex={-1} className="flex-1 outline-none">
            <Suspense fallback={<CargandoPantalla />}>
              {/* La clave hace que cada pantalla nueva entre con su animación. */}
              <div key={pathname} className="animate-aparecer">
                <Outlet />
              </div>
            </Suspense>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ProveedorCambiosPendientes>
  )
}
