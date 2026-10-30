import { Navigate, useLocation } from 'react-router-dom'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import opcionesMenu, { puedeVer, RUTA_ADMINISTRACION } from './opcionesMenu.js'

const HIJOS = opcionesMenu.find((opcion) => opcion.ruta === RUTA_ADMINISTRACION).hijos
// El último segmento de cada hijo (/administracion/vacunas → vacunas), que era el valor de ?pestana= en /configuracion.
const SECCIONES = new Set(HIJOS.map((hijo) => hijo.ruta.slice(RUTA_ADMINISTRACION.length + 1)))

// Las rutas que usaban los enlaces guardados antes del SPEC 30, y /administracion, que no tiene pantalla propia.
export const RUTAS_VIEJAS = ['/configuracion', '/configuracion/*', '/usuarios', '/usuarios/*', '/permisos', RUTA_ADMINISTRACION]

export function destinoDeRutaVieja(pathname, search, tienePermiso) {
  if (pathname === RUTA_ADMINISTRACION) return HIJOS.find((hijo) => puedeVer(hijo, tienePermiso))?.ruta ?? '/inicio'
  if (pathname === '/configuracion') {
    const parametros = new URLSearchParams(search)
    const seccion = parametros.get('pestana')
    if (!SECCIONES.has(seccion)) return RUTA_ADMINISTRACION
    parametros.delete('pestana')
    const resto = parametros.toString()
    return `${RUTA_ADMINISTRACION}/${seccion}${resto ? `?${resto}` : ''}`
  }
  if (pathname.startsWith('/configuracion/')) return `${RUTA_ADMINISTRACION}${pathname.slice('/configuracion'.length)}${search}`
  return `${RUTA_ADMINISTRACION}${pathname}${search}`
}

// El destino aplica sus propios permisos (RutaConPermiso): sin ellos, termina en /inicio.
export default function RedireccionRutaVieja() {
  const { pathname, search, state } = useLocation()
  const { tienePermiso } = useSesion()
  return <Navigate to={destinoDeRutaVieja(pathname, search, tienePermiso)} state={state} replace />
}
