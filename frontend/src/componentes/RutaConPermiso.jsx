import { Navigate } from 'react-router-dom'
import { useSesion } from './ProveedorSesion.jsx'

export default function RutaConPermiso({ permiso, children }) {
  const { tienePermiso } = useSesion()
  if (!tienePermiso(permiso)) return <Navigate to="/inicio" replace />
  return children
}
