import { Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import RutaProtegida from '@/componentes/RutaProtegida.jsx'
import PaginaInicio from '@/paginas/inicio/PaginaInicio.jsx'
import PaginaLogin from '@/paginas/login/PaginaLogin.jsx'

export default function App() {
  const { sesion } = useSesion()

  return (
    <Routes>
      <Route path="/login" element={sesion ? <Navigate to="/inicio" replace /> : <PaginaLogin />} />
      <Route
        path="/inicio"
        element={
          <RutaProtegida>
            <PaginaInicio />
          </RutaProtegida>
        }
      />
      <Route path="*" element={<Navigate to="/inicio" replace />} />
    </Routes>
  )
}
