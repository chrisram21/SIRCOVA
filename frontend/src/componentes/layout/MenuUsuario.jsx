import { useState } from 'react'
import { ChevronsUpDown, KeyRound, LogOut, UserRound } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar'
import { useCambiosPendientes } from '@/componentes/ProveedorCambiosPendientes.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { RUTA_CAMBIO_CONTRASENA, RUTA_PERFIL } from '@/componentes/RutaProtegida.jsx'

export const inicialesDe = (empleado) =>
  [empleado.nombres, empleado.apellidos]
    .map((parte) => parte?.trim()?.[0] ?? '')
    .join('')
    .toUpperCase()

// Al pie del menú lateral, como en los mockups: el usuario y su rol, con sus acciones de cuenta.
export default function MenuUsuario() {
  const { sesion, cerrar } = useSesion()
  const { hayCambios } = useCambiosPendientes()
  const { isMobile, setOpenMobile } = useSidebar()
  const navegar = useNavigate()
  const [confirmando, setConfirmando] = useState(false)
  const { rol, rolNombre, empleado } = sesion.usuario
  const nombre = `${empleado.nombres} ${empleado.apellidos}`

  function cerrarSesion() {
    cerrar()
    navegar('/login', { replace: true })
  }

  // useBlocker no lo detecta: la sesión se borra antes de navegar.
  function pedirCierre() {
    if (hayCambios) setConfirmando(true)
    else cerrarSesion()
  }

  function ir(ruta) {
    if (isMobile) setOpenMobile(false)
    navegar(ruta)
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              aria-label={`Cuenta de ${nombre}`}
              className="bg-sidebar-accent/60 data-[state=open]:bg-sidebar-accent"
            >
              <span
                aria-hidden="true"
                className="flex size-8 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-primary to-marca-profundo text-xs font-semibold text-primary-foreground ring-1 ring-ring/40"
              >
                {inicialesDe(empleado)}
              </span>
              <span className="grid flex-1 text-left leading-tight">
                <span className="truncate font-semibold text-foreground">{nombre}</span>
                <span className="truncate text-xs">{rolNombre ?? rol}</span>
              </span>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            side={isMobile ? 'top' : 'right'}
            align="end"
            sideOffset={8}
            className="min-w-56"
          >
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span className="font-semibold text-foreground">{nombre}</span>
              <span className="text-xs font-normal text-muted-foreground">{rolNombre ?? rol}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => ir(RUTA_PERFIL)}>
              <UserRound />
              Mi perfil
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => ir(RUTA_CAMBIO_CONTRASENA)}>
              <KeyRound />
              Cambiar contraseña
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={pedirCierre}>
              <LogOut />
              Cerrar sesión
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>

      <AlertDialog open={confirmando} onOpenChange={setConfirmando}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hay cambios sin guardar</AlertDialogTitle>
            <AlertDialogDescription>
              Si cierra sesión ahora, se pierden los cambios sin guardar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={cerrarSesion}>
              Cerrar sesión sin guardar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarMenu>
  )
}
