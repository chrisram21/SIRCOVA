import { Suspense } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import PantallaCargaSesion from '@/componentes/PantallaCargaSesion.jsx'
import { ProveedorCambiosPendientes } from '@/componentes/ProveedorCambiosPendientes.jsx'
import Encabezado from './Encabezado.jsx'
import MenuLateral from './MenuLateral.jsx'

// 15rem = 240 px, el ancho del menú en los mockups (shadcn trae 16rem).
const ANCHO_MENU = { '--sidebar-width': '15rem' }

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
            {/* Mientras llega el código de una pantalla (se carga al entrar en ella). */}
            <Suspense fallback={<PantallaCargaSesion etiqueta="Cargando pantalla" />}>
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
