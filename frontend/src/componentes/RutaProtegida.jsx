import { Navigate } from 'react-router-dom'
import { useSesion } from './ProveedorSesion.jsx'

export default function RutaProtegida({ children }) {
  const { sesion } = useSesion()
  if (!sesion) return <Navigate to="/login" replace />
  return children
}
