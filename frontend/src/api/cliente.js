import { guardarSesion, leerSesion, leerTokenGuardado } from './sesion.js'

const URL_BASE = import.meta.env.VITE_API_URL

let manejadorSesionPerdida = null

export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.status = status
    this.codigo = codigo
    this.mensaje = mensaje
  }
}

// Registra la función que se llama cuando una petición con token pierde la sesión: un 401, o un 403
// CAMBIO_CONTRASENA_REQUERIDO porque el administrador restableció la contraseña. Devuelve cómo quitarla.
export function alPerderSesion(manejador) {
  manejadorSesionPerdida = manejador
  return () => {
    if (manejadorSesionPerdida === manejador) manejadorSesionPerdida = null
  }
}

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intente de nuevo.'

// Lo que se le muestra al usuario de cualquier error: un fallo que no vino de la API no trae `mensaje`.
export function mensajeDeError(error) {
  return error instanceof ErrorApi ? error.mensaje : MENSAJE_INESPERADO
}

function crearError(status, datos) {
  // Los 5xx no muestran el mensaje del backend, aunque venga en el formato común.
  const error = datos?.error
  if (status < 500 && typeof error?.codigo === 'string' && typeof error?.mensaje === 'string') {
    return new ErrorApi(status, error.codigo, error.mensaje)
  }
  return new ErrorApi(status, 'ERROR_INESPERADO', MENSAJE_INESPERADO)
}

// Sin respuesta en este tiempo, la petición se cancela: una red caída no deja la pantalla esperando para siempre.
export const ESPERA_MAXIMA_MS = 30_000

// Un 401 de estas rutas no se reintenta renovando el token: así no hay un bucle de refrescos.
const RUTAS_SIN_REINTENTO = ['/auth/login', '/auth/refrescar']

let ultimaPeticion = Date.now()
let refrescoEnCurso = null

// Hora de la última petición que llegó al servidor con la sesión; el latido la usa para no dejarla inactiva allá.
export function leerUltimaPeticion() {
  return ultimaPeticion
}

// credentials: 'include' para que el navegador guarde y mande la cookie del refresh token (solo viaja a /auth).
async function enviar(ruta, { metodo = 'GET', cuerpo } = {}, token) {
  const encabezados = { Accept: 'application/json' }
  if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json'
  if (token) encabezados.Authorization = `Bearer ${token}`

  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), ESPERA_MAXIMA_MS)
  let respuesta
  let datos = null
  try {
    try {
      respuesta = await fetch(`${URL_BASE}${ruta}`, {
        method: metodo,
        headers: encabezados,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        credentials: 'include',
        signal: control.signal,
      })
    } catch {
      if (control.signal.aborted) {
        throw new ErrorApi(0, 'SIN_RESPUESTA', 'El servidor tardó demasiado en responder. Intente de nuevo.')
      }
      throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.')
    }
    if (token) ultimaPeticion = Date.now()

    if (respuesta.status === 204) return null

    try {
      datos = await respuesta.json()
    } catch {
      datos = null
    }
  } finally {
    clearTimeout(temporizador)
  }

  if (respuesta.ok) return datos
  throw crearError(respuesta.status, datos)
}

async function pedirRefresco() {
  const nueva = await enviar('/auth/refrescar', { metodo: 'POST' }, null)
  ultimaPeticion = Date.now()
  // La cookie es del navegador: si en otra pestaña entró otra cuenta, esta pestaña no debe seguir con ella.
  const actual = leerSesion()
  if (actual && nueva?.usuario?.id !== actual.usuario.id) {
    throw new ErrorApi(401, 'SESION_OTRA_CUENTA', 'Se inició sesión con otra cuenta en este navegador. Inicie sesión de nuevo.')
  }
  guardarSesion(nueva)
  return nueva
}

// Renueva el token con la cookie. Quien llama mientras hay un refresco en curso recibe el mismo: varias peticiones
// vencidas a la vez, el doble efecto de StrictMode o la renovación programada no rotan la cookie varias veces.
export function refrescar() {
  refrescoEnCurso ??= pedirRefresco().finally(() => {
    refrescoEnCurso = null
  })
  return refrescoEnCurso
}

// Con la sesión abierta no se puede cambiar la contraseña restablecida, porque la persona no conoce la temporal.
function avisarSiPierdeSesion(error, token) {
  const pierdeSesion = error.status === 401 || (error.status === 403 && error.codigo === 'CAMBIO_CONTRASENA_REQUERIDO')
  // Si la sesión ya se cerró o cambió mientras tanto, esta respuesta no debe cerrar la sesión actual.
  if (pierdeSesion && token && leerTokenGuardado() === token) {
    manejadorSesionPerdida?.(error)
  }
}

async function repetirTrasRenovar(ruta, opciones, token, errorOriginal) {
  // Si el token guardado ya cambió, otra petición ya lo renovó.
  if (leerTokenGuardado() === token) {
    try {
      await refrescar()
    } catch (error) {
      // Un fallo de red no cierra la sesión: la siguiente renovación lo vuelve a intentar.
      if (error.status === 401) avisarSiPierdeSesion(error, token)
      throw error
    }
  }
  const actual = leerTokenGuardado()
  if (!actual) throw errorOriginal
  try {
    return await enviar(ruta, opciones, actual)
  } catch (error) {
    avisarSiPierdeSesion(error, actual)
    throw error
  }
}

export async function solicitar(ruta, opciones = {}) {
  // Vencido o no: con el token vencido la API responde SESION_VENCIDA y se renueva.
  const token = leerTokenGuardado()
  try {
    return await enviar(ruta, opciones, token)
  } catch (error) {
    if (token && error.codigo === 'SESION_VENCIDA' && !RUTAS_SIN_REINTENTO.includes(ruta)) {
      return repetirTrasRenovar(ruta, opciones, token, error)
    }
    avisarSiPierdeSesion(error, token)
    throw error
  }
}
