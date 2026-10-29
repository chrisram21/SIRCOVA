import { matchPath } from 'react-router-dom'
import { RUTA_CAMBIO_CONTRASENA, RUTA_PERFIL } from '@/componentes/RutaProtegida.jsx'
import opcionesMenu from './opcionesMenu.js'

// Pantallas que no están en el menú.
const FUERA_DEL_MENU = {
  '/login': 'Iniciar sesión',
  [RUTA_CAMBIO_CONTRASENA]: 'Cambiar contraseña',
  [RUTA_PERFIL]: 'Mi perfil',
}

// La opción del menú y, si la hay, la subruta de la ruta actual. Las subrutas se revisan en su orden de
// opcionesMenu (los segmentos fijos, como «nuevo», van antes que :id).
export function ubicarRuta(pathname) {
  for (const opcion of opcionesMenu) {
    const subruta = opcion.subrutas?.find((s) => matchPath(s.ruta, pathname))
    if (subruta) return { opcion, subruta }
    if (matchPath(opcion.ruta, pathname)) return { opcion, subruta: null }
  }
  return null
}

export function tituloDeRuta(pathname) {
  if (FUERA_DEL_MENU[pathname]) return FUERA_DEL_MENU[pathname]
  const ubicada = ubicarRuta(pathname)
  return ubicada ? (ubicada.subruta ?? ubicada.opcion).titulo : null
}
