import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { cerrarSesion } from '@/api/auth.js'
import { alPerderSesion, leerUltimaPeticion, mensajeDeError, refrescar } from '@/api/cliente.js'
import { borrarSesion, guardarSesion, leerSesion, leerTokenGuardado, leerVencimiento } from '@/api/sesion.js'

const MINUTOS_INACTIVIDAD = 30
const MINUTOS_RENOVACION = 5
const MINUTOS_LATIDO = 10
const SEGUNDOS_REVISION = 15
const EVENTOS_ACTIVIDAD = ['mousemove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']
// capture: el evento scroll no sube desde los elementos con desplazamiento propio hasta window.
const OPCIONES_EVENTO = { capture: true, passive: true }
// Hora de la última actividad en cualquier pestaña: todas comparten la sesión, y una quieta no debe cerrarla.
const CLAVE_ACTIVIDAD = 'sircova.actividad'

const AVISO_INACTIVIDAD = 'Su sesión se cerró por inactividad. Inicie sesión de nuevo.'
const AVISO_CONTRASENA_RESTABLECIDA =
  'Su contraseña fue restablecida. Inicie sesión con la contraseña temporal que le dé su administrador.'

const ContextoSesion = createContext(null)

// solicitar() lee el token antes de su primer await, así que la sesión se puede borrar justo después de llamarla.
function avisarCierre(motivo) {
  cerrarSesion(motivo).catch(() => {})
}

// Sin localStorage (navegación privada o bloqueada), cada pestaña cuenta solo su propia actividad.
function leerActividadCompartida() {
  try {
    return Number(localStorage.getItem(CLAVE_ACTIVIDAD)) || 0
  } catch {
    return 0
  }
}

function anotarActividadCompartida(hora) {
  try {
    localStorage.setItem(CLAVE_ACTIVIDAD, String(hora))
  } catch {
    // Sin localStorage no se comparte.
  }
}

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(() => leerSesion())
  // Sin sesión en memoria (al recargar o en una pestaña nueva) se intenta recuperar con la cookie.
  const [cargando, setCargando] = useState(() => leerSesion() === null)
  const [aviso, setAviso] = useState(null)
  // En un ref y no en el efecto: renovar el token no es actividad y no debe reiniciar la cuenta.
  const ultimaActividad = useRef(Date.now())

  function empezarActividad() {
    ultimaActividad.current = Date.now()
    anotarActividadCompartida(ultimaActividad.current)
  }

  function terminar(nuevoAviso) {
    borrarSesion()
    setSesion(null)
    setAviso(nuevoAviso)
  }

  function iniciar(respuestaLogin) {
    guardarSesion(respuestaLogin)
    empezarActividad()
    setSesion(respuestaLogin)
    setAviso(null)
  }

  function cerrar() {
    avisarCierre('MANUAL')
    terminar(null)
  }

  // Tras cambiar la contraseña temporal, la sesión sigue: la renovada trae debeCambiarContrasena: false y los permisos.
  // Si no se puede renovar, se cierra sin logout. Devuelve si la sesión sigue.
  async function actualizarTrasCambioContrasena() {
    try {
      setSesion(await refrescar())
      return true
    } catch (error) {
      terminar(mensajeDeError(error))
      return false
    }
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

  // Con StrictMode el efecto corre dos veces, pero refrescar() devuelve la misma promesa.
  useEffect(() => {
    if (!cargando) return
    refrescar()
      .then(
        (recuperada) => {
          empezarActividad()
          setSesion(recuperada)
        },
        // NO_AUTENTICADO es una visita normal al login (sin cookie): no hay nada que avisar.
        (error) => setAviso(error.codigo === 'NO_AUTENTICADO' ? null : mensajeDeError(error)),
      )
      .finally(() => setCargando(false))
  }, [])

  const token = sesion?.token
  useEffect(() => {
    if (!token) return undefined

    const vencimiento = leerVencimiento(token)
    let activo = true
    let ultimaEscritura = 0
    const registrarActividad = () => {
      const ahora = Date.now()
      ultimaActividad.current = ahora
      if (ahora - ultimaEscritura >= SEGUNDOS_REVISION * 1000) {
        ultimaEscritura = ahora
        anotarActividadCompartida(ahora)
      }
    }

    function renovar() {
      refrescar().then(
        (renovada) => {
          if (activo) setSesion(renovada)
          // Se cerró la sesión mientras se renovaba: el token que llegó no debe revivirla.
          else if (leerTokenGuardado() === renovada.token) borrarSesion()
        },
        // Sin logout: la sesión ya no sirve en el servidor, o la cookie es de otra cuenta y se le cerraría a ella.
        // Un fallo de red no cierra: se vuelve a intentar en la siguiente revisión.
        (error) => {
          if (activo && error.status === 401) terminar(error.mensaje)
        },
      )
    }

    // Se comparan horas en lugar de esperar un solo temporizador: el navegador retrasa los de las pestañas ocultas.
    function revisar() {
      // Una petición que recibió SESION_VENCIDA ya renovó el token en el cliente.
      const guardada = leerSesion()
      if (guardada && guardada.token !== token) {
        setSesion(guardada)
        return
      }

      const ahora = Date.now()
      const actividad = Math.max(ultimaActividad.current, leerActividadCompartida())
      if (ahora - actividad >= MINUTOS_INACTIVIDAD * 60_000) {
        avisarCierre('INACTIVIDAD')
        terminar(AVISO_INACTIVIDAD)
      } else if (vencimiento !== null && ahora >= vencimiento - MINUTOS_RENOVACION * 60_000) {
        renovar()
      } else if (
        // El servidor cuenta la inactividad por peticiones: sin este latido, quien escribe mucho rato sin guardar
        // la perdería allá aunque aquí siga activo.
        ahora - ultimaActividad.current < MINUTOS_LATIDO * 60_000 &&
        ahora - leerUltimaPeticion() >= MINUTOS_LATIDO * 60_000
      ) {
        renovar()
      }
    }

    EVENTOS_ACTIVIDAD.forEach((evento) => window.addEventListener(evento, registrarActividad, OPCIONES_EVENTO))
    const intervalo = setInterval(revisar, SEGUNDOS_REVISION * 1000)
    return () => {
      activo = false
      clearInterval(intervalo)
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, registrarActividad, OPCIONES_EVENTO))
    }
  }, [token])

  return (
    <ContextoSesion.Provider
      value={{ sesion, cargando, aviso, iniciar, cerrar, actualizarTrasCambioContrasena, tienePermiso }}
    >
      {children}
    </ContextoSesion.Provider>
  )
}

export function useSesion() {
  return useContext(ContextoSesion)
}
