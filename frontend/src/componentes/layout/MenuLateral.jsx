import { NavLink, useLocation } from 'react-router-dom'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import MarcaSircova from '@/componentes/MarcaSircova.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import MenuUsuario from './MenuUsuario.jsx'
import opcionesMenu from './opcionesMenu.js'

export default function MenuLateral() {
  const { tienePermiso } = useSesion()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const visibles = opcionesMenu.filter((opcion) => !opcion.permiso || tienePermiso(opcion.permiso))

  return (
    <Sidebar>
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
        <NavLink
          to="/inicio"
          className="group/marca flex items-center gap-2.5 rounded-md"
          onClick={() => isMobile && setOpenMobile(false)}
        >
          <MarcaSircova className="size-9 transition-transform duration-300 ease-salida group-hover/marca:-rotate-6 group-hover/marca:scale-105" />
          <span className="flex flex-col leading-tight">
            <span className="text-[17px] font-bold tracking-wide text-primary">SIRCOVA</span>
            <span className="text-[11px] font-medium text-muted-foreground">Registro de vacunación</span>
          </span>
        </NavLink>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <nav aria-label="Menú principal">
              <SidebarMenu className="gap-1">
                {visibles.map(({ titulo, ruta, icono: Icono }) => (
                  <SidebarMenuItem key={ruta}>
                    <SidebarMenuButton
                      asChild
                      isActive={pathname === ruta || pathname.startsWith(`${ruta}/`)}
                      className="relative h-9 text-[0.9rem] transition-colors duration-200 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:scale-y-0 before:rounded-r-full before:bg-ring before:transition-transform before:duration-300 data-[active=true]:font-semibold data-[active=true]:before:scale-y-100 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110"
                    >
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
      <SidebarFooter className="border-t border-sidebar-border">
        <MenuUsuario />
      </SidebarFooter>
    </Sidebar>
  )
}
