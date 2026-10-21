import { Cross } from 'lucide-react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import opcionesMenu from './opcionesMenu.js'

export default function MenuLateral() {
  const { tienePermiso } = useSesion()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const visibles = opcionesMenu.filter((opcion) => !opcion.permiso || tienePermiso(opcion.permiso))

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Cross className="size-4" fill="currentColor" />
          </span>
          <span className="text-lg font-semibold text-primary">SIRCOVA</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Menú principal">
              <SidebarMenu>
                {visibles.map(({ titulo, ruta, icono: Icono }) => (
                  <SidebarMenuItem key={ruta}>
                    <SidebarMenuButton asChild isActive={pathname === ruta || pathname.startsWith(`${ruta}/`)}>
                      <NavLink to={ruta} onClick={() => isMobile && setOpenMobile(false)}>
                        <Icono />
                        <span>{titulo}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </nav>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
