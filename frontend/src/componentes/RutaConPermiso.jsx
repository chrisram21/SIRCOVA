import { Navigate } from 'react-router-dom'
import { useSesion } from './ProveedorSesion.jsx'

// Exige todos los permisos; sin alguno, lleva a /inicio.
export default function RutaConPermiso({ permisos, children }) {
  const { tienePermiso } = useSesion()
  if (!permisos.every(tienePermiso)) return <Navigate to="/inicio" replace />
  return children
}
