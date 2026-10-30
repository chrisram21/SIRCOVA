import { useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from '@/components/ui/sidebar'
import MarcaSircova from '@/componentes/MarcaSircova.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import MenuUsuario from './MenuUsuario.jsx'
import opcionesMenu, { puedeVer } from './opcionesMenu.js'

// Las opciones y el disparador de un padre comparten el aspecto: la línea de color a la izquierda de la activa y el
// ícono que crece al pasar el puntero.
const CLASES_OPCION =
  'relative h-9 text-[0.9rem] transition-colors duration-200 before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:scale-y-0 before:rounded-r-full before:bg-ring before:transition-transform before:duration-300 data-[active=true]:font-semibold data-[active=true]:before:scale-y-100 [&_svg]:transition-transform [&_svg]:duration-200 hover:[&_svg]:scale-110'

// La línea del hijo activo cae sobre el borde izquierdo del submenú.
const CLASES_HIJO =
  'relative h-8 before:absolute before:inset-y-1.5 before:-left-2.5 before:w-[3px] before:scale-y-0 before:rounded-full before:bg-ring before:transition-transform before:duration-300 data-[active=true]:font-semibold data-[active=true]:before:scale-y-100 motion-reduce:before:transition-none'

const estaEn = (pathname, ruta) => pathname === ruta || pathname.startsWith(`${ruta}/`)

// Un padre del menú: se despliega al entrar en uno de sus hijos (o en sus subrutas) y el usuario lo pliega a mano.
function OpcionConHijos({ opcion, hijos, alElegir }) {
  const { pathname } = useLocation()
  const dentro = estaEn(pathname, opcion.ruta)
  const [abierto, setAbierto] = useState(dentro)
  // Al cambiar de ruta (no en cada render), se despliega si la nueva está dentro del padre.
  const [rutaVista, setRutaVista] = useState(pathname)
  if (rutaVista !== pathname) {
    setRutaVista(pathname)
    if (dentro) setAbierto(true)
  }
  const Icono = opcion.icono

  return (
    <Collapsible asChild open={abierto} onOpenChange={setAbierto}>
      <SidebarMenuItem className="group/colapsable">
        <CollapsibleTrigger asChild>
          <SidebarMenuButton className={CLASES_OPCION}>
            <Icono />
            <span>{opcion.titulo}</span>
            <ChevronRight
              aria-hidden="true"
              className="ml-auto transition-transform duration-200 ease-salida group-data-[state=open]/colapsable:rotate-90 motion-reduce:transition-none"
            />
          </SidebarMenuButton>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <SidebarMenuSub className="mt-1">
            {hijos.map(({ titulo, ruta, icono: IconoHijo }) => (
              <SidebarMenuSubItem key={ruta}>
                <SidebarMenuSubButton asChild isActive={estaEn(pathname, ruta)} className={CLASES_HIJO}>
                  <NavLink to={ruta} onClick={alElegir}>
                    <IconoHijo />
                    <span>{titulo}</span>
                  </NavLink>
                </SidebarMenuSubButton>
              </SidebarMenuSubItem>
            ))}
          </SidebarMenuSub>
        </CollapsibleContent>
      </SidebarMenuItem>
    </Collapsible>
  )
}

export default function MenuLateral() {
  const { tienePermiso } = useSesion()
  const { pathname } = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const visibles = opcionesMenu.filter((opcion) => puedeVer(opcion, tienePermiso))
  // En móvil el menú es un Sheet: elegir una pantalla lo cierra; desplegar un padre, no.
  const alElegir = () => isMobile && setOpenMobile(false)

  return (
    <Sidebar>
      <SidebarHeader className="h-16 justify-center border-b border-sidebar-border px-4">
        <NavLink to="/inicio" className="group/marca flex items-center gap-2.5 rounded-md" onClick={alElegir}>
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
                {visibles.map((opcion) =>
                  opcion.hijos ? (
                    <OpcionConHijos
                      key={opcion.ruta}
                      opcion={opcion}
                      hijos={opcion.hijos.filter((hijo) => puedeVer(hijo, tienePermiso))}
                      alElegir={alElegir}
                    />
                  ) : (
                    <SidebarMenuItem key={opcion.ruta}>
                      <SidebarMenuButton asChild isActive={estaEn(pathname, opcion.ruta)} className={CLASES_OPCION}>
                        <NavLink to={opcion.ruta} onClick={alElegir}>
                          <opcion.icono />
                          <span>{opcion.titulo}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ),
                )}
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
