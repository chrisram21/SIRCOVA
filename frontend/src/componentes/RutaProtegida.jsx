import { Navigate, useLocation } from 'react-router-dom'
import { useSesion } from './ProveedorSesion.jsx'

export const RUTA_CAMBIO_CONTRASENA = '/cuenta/contrasena'
export const RUTA_PERFIL = '/cuenta/perfil'

export default function RutaProtegida({ children }) {
  const { sesion } = useSesion()
  const { pathname } = useLocation()
  if (!sesion) return <Navigate to="/login" replace />
  // Solo evita pantallas que fallarían: el backend responde 403 CAMBIO_CONTRASENA_REQUERIDO a todo lo demás.
  if (sesion.usuario.debeCambiarContrasena && pathname !== RUTA_CAMBIO_CONTRASENA) {
    return <Navigate to={RUTA_CAMBIO_CONTRASENA} replace />
  }
  return children
}
