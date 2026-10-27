import { Outlet } from 'react-router-dom'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { ProveedorCambiosPendientes } from '@/componentes/ProveedorCambiosPendientes.jsx'
import Encabezado from './Encabezado.jsx'
import MenuLateral from './MenuLateral.jsx'

// 15rem = 240 px, el ancho del menú en los mockups (shadcn trae 16rem).
const ANCHO_MENU = { '--sidebar-width': '15rem' }

export default function Layout() {
  return (
    <ProveedorCambiosPendientes>
      <SidebarProvider style={ANCHO_MENU}>
        <MenuLateral />
        <SidebarInset>
          <Encabezado />
          <div className="flex-1">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </ProveedorCambiosPendientes>
  )
}
