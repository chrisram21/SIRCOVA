import { createContext, useContext, useEffect, useState } from 'react'
import { cerrarSesion } from '@/api/auth.js'
import { alPerderSesion } from '@/api/cliente.js'
import { borrarSesion, guardarSesion, leerSesion, leerVencimiento } from '@/api/sesion.js'

const MINUTOS_INACTIVIDAD = 30
const SEGUNDOS_REVISION = 15
const EVENTOS_ACTIVIDAD = ['mousemove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
// capture: el evento scroll no sube desde los elementos con desplazamiento propio hasta window.
const OPCIONES_EVENTO = { capture: true, passive: true }

const AVISO_INACTIVIDAD = 'Su sesión se cerró por inactividad. Inicie sesión de nuevo.'
const AVISO_VENCIDA = 'Su sesión venció; inicie sesión de nuevo.'
const AVISO_CAMBIO_CONTRASENA = 'Su contraseña se cambió. Inicie sesión con la nueva.'
const AVISO_CONTRASENA_RESTABLECIDA =
  'Su contraseña fue restablecida. Inicie sesión con la contraseña temporal que le dé su administrador.'

const ContextoSesion = createContext(null)

// solicitar() lee el token antes de su primer await, así que la sesión se puede borrar justo después de llamarla.
function avisarCierre(motivo) {
  cerrarSesion(motivo).catch(() => {})
}

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(() => leerSesion())
  const [aviso, setAviso] = useState(null)

  function terminar(nuevoAviso) {
    borrarSesion()
    setSesion(null)
    setAviso(nuevoAviso)
  }

  function iniciar(respuestaLogin) {
    guardarSesion(respuestaLogin)
    setSesion(respuestaLogin)
    setAviso(null)
  }

  function cerrar() {
    avisarCierre('MANUAL')
    terminar(null)
  }

  // Sin POST /auth/logout: el cambio ya quedó en la bitácora como CAMBIO_CONTRASENA.
  function terminarTrasCambioContrasena() {
    terminar(AVISO_CAMBIO_CONTRASENA)
  }

  // Solo sirve para mostrar u ocultar elementos; quien decide el acceso es el backend.
  function tienePermiso(codigo) {
    return sesion?.usuario?.permisos?.includes(codigo) ?? false
  }

  // Sin POST /auth/logout, como en cualquier sesión perdida.
  useEffect(
    () =>
      alPerderSesion((error) =>
        terminar(error.codigo === 'CAMBIO_CONTRASENA_REQUERIDO' ? AVISO_CONTRASENA_RESTABLECIDA : error.mensaje),
      ),
    [],
  )

  const token = sesion?.token
  useEffect(() => {
    if (!token) return undefined

    const vencimiento = leerVencimiento(token)
    let ultimaActividad = Date.now()
    const registrarActividad = () => {
      ultimaActividad = Date.now()
    }

    // Se comparan horas en lugar de esperar un solo temporizador: el navegador retrasa los de las pestañas ocultas.
    function revisar() {
      const ahora = Date.now()
      if (vencimiento !== null && ahora >= vencimiento) {
        terminar(AVISO_VENCIDA)
      } else if (ahora - ultimaActividad >= MINUTOS_INACTIVIDAD * 60_000) {
        avisarCierre('INACTIVIDAD')
        terminar(AVISO_INACTIVIDAD)
      }
    }

    EVENTOS_ACTIVIDAD.forEach((evento) => window.addEventListener(evento, registrarActividad, OPCIONES_EVENTO))
    const intervalo = setInterval(revisar, SEGUNDOS_REVISION * 1000)
    return () => {
      clearInterval(intervalo)
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, registrarActividad, OPCIONES_EVENTO))
    }
  }, [token])

  return <ContextoSesion.Provider value={{ sesion, aviso, iniciar, cerrar, terminarTrasCambioContrasena, tienePermiso }}>{children}</ContextoSesion.Provider>
}

export function useSesion() {
  return useContext(ContextoSesion)
}
