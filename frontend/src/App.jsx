import { lazy, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import PantallaCargaSesion from '@/componentes/PantallaCargaSesion.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import RutaConPermiso from '@/componentes/RutaConPermiso.jsx'
import RutaProtegida, { RUTA_CAMBIO_CONTRASENA, RUTA_PERFIL } from '@/componentes/RutaProtegida.jsx'
import Layout from '@/componentes/layout/Layout.jsx'
import { rutasDelMenu } from '@/componentes/layout/opcionesMenu.js'
import { tituloDeRuta } from '@/componentes/layout/ubicarRuta.js'
import PaginaCambiarContrasena from '@/paginas/cuenta/PaginaCambiarContrasena.jsx'
import PaginaEnConstruccion from '@/paginas/en-construccion/PaginaEnConstruccion.jsx'
import PaginaLogin from '@/paginas/login/PaginaLogin.jsx'

const PaginaMiPerfil = lazy(() => import('@/paginas/cuenta/PaginaMiPerfil.jsx'))

// Un hijo de un padre del menú pide todos sus `permisos`; una opción o una subruta, su `permiso`.
function elementoDe({ titulo, permiso, permisos = permiso ? [permiso] : [], pagina: Pagina = PaginaEnConstruccion }) {
  const contenido = <Pagina titulo={titulo} />
  if (permisos.length === 0) return contenido
  return <RutaConPermiso permisos={permisos}>{contenido}</RutaConPermiso>
}

// El título de la pestaña del navegador sigue a la pantalla, y cada pantalla nueva empieza arriba.
function useCambioDePantalla() {
  const { pathname } = useLocation()
  useEffect(() => {
    const titulo = tituloDeRuta(pathname)
    document.title = titulo ? `${titulo} · SIRCOVA` : 'SIRCOVA'
    window.scrollTo(0, 0)
  }, [pathname])
}

export default function App() {
  const { sesion, cargando } = useSesion()
  useCambioDePantalla()
  // Sin rutas mientras se recupera la sesión: ninguna redirige y se conserva la dirección pedida.
  if (cargando) return <PantallaCargaSesion />
  // Con el cambio obligatorio la pantalla va sola, sin menú; si no, dentro del Layout.
  const debeCambiar = sesion?.usuario?.debeCambiarContrasena === true

  return (
    <Routes>
      <Route path="/login" element={sesion ? <Navigate to="/inicio" replace /> : <PaginaLogin />} />
      {debeCambiar && (
        <Route
          path={RUTA_CAMBIO_CONTRASENA}
          element={
            <RutaProtegida>
              <PaginaCambiarContrasena obligatoria />
            </RutaProtegida>
          }
        />
      )}
      <Route
        element={
          <RutaProtegida>
            <Layout />
          </RutaProtegida>
        }
      >
        {!debeCambiar && <Route path={RUTA_CAMBIO_CONTRASENA} element={<PaginaCambiarContrasena />} />}
        <Route path={RUTA_PERFIL} element={<PaginaMiPerfil />} />
        {rutasDelMenu().map((ruta) => (
          <Route key={ruta.ruta} path={ruta.ruta} element={elementoDe(ruta)} />
        ))}
      </Route>
      <Route path="*" element={<Navigate to="/inicio" replace />} />
    </Routes>
  )
}
