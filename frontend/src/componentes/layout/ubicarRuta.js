import { matchPath } from 'react-router-dom'
import { RUTA_CAMBIO_CONTRASENA, RUTA_PERFIL } from '@/componentes/RutaProtegida.jsx'
import opcionesMenu from './opcionesMenu.js'

// Pantallas que no están en el menú.
const FUERA_DEL_MENU = {
  '/login': 'Iniciar sesión',
  [RUTA_CAMBIO_CONTRASENA]: 'Cambiar contraseña',
  [RUTA_PERFIL]: 'Mi perfil',
}

// La opción del menú, el hijo (si la opción es un padre) y la subruta de la ruta actual; hijo y subruta son null
// cuando no aplican. Las subrutas se revisan en su orden de opcionesMenu (los segmentos fijos, como «nuevo», van
// antes que :id).
export function ubicarRuta(pathname) {
  for (const opcion of opcionesMenu) {
    for (const pantalla of opcion.hijos ?? [opcion]) {
      const hijo = opcion.hijos ? pantalla : null
      const subruta = pantalla.subrutas?.find((s) => matchPath(s.ruta, pathname)) ?? null
      if (subruta || matchPath(pantalla.ruta, pathname)) return { opcion, hijo, subruta }
    }
  }
  return null
}

// «Administración › Vacunas» en un hijo; en una subruta, solo su título.
export function tituloDeRuta(pathname) {
  if (FUERA_DEL_MENU[pathname]) return FUERA_DEL_MENU[pathname]
  const ubicada = ubicarRuta(pathname)
  if (!ubicada) return null
  const { opcion, hijo, subruta } = ubicada
  if (subruta) return subruta.titulo
  return hijo ? `${opcion.titulo} › ${hijo.titulo}` : opcion.titulo
}
