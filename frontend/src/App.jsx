import { Navigate, Route, Routes } from 'react-router-dom'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import RutaConPermiso from '@/componentes/RutaConPermiso.jsx'
import RutaProtegida from '@/componentes/RutaProtegida.jsx'
import Layout from '@/componentes/layout/Layout.jsx'
import opcionesMenu from '@/componentes/layout/opcionesMenu.js'
import PaginaEnConstruccion from '@/paginas/en-construccion/PaginaEnConstruccion.jsx'
import PaginaLogin from '@/paginas/login/PaginaLogin.jsx'

function elementoDe({ titulo, permiso, pagina: Pagina = PaginaEnConstruccion }) {
  const contenido = <Pagina titulo={titulo} />
  if (!permiso) return contenido
  return <RutaConPermiso permiso={permiso}>{contenido}</RutaConPermiso>
}

export default function App() {
  const { sesion } = useSesion()

  return (
    <Routes>
      <Route path="/login" element={sesion ? <Navigate to="/inicio" replace /> : <PaginaLogin />} />
      <Route
        element={
          <RutaProtegida>
            <Layout />
          </RutaProtegida>
        }
      >
        {opcionesMenu
          .flatMap((opcion) => [opcion, ...(opcion.subrutas ?? [])])
          .map((ruta) => (
            <Route key={ruta.ruta} path={ruta.ruta} element={elementoDe(ruta)} />
          ))}
      </Route>
      <Route path="*" element={<Navigate to="/inicio" replace />} />
    </Routes>
  )
}
