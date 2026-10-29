import { leerSesion, leerTokenGuardado } from './sesion.js'

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

export async function solicitar(ruta, { metodo = 'GET', cuerpo } = {}) {
  const encabezados = { Accept: 'application/json' }
  if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json'
  const token = leerSesion()?.token ?? null
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
        signal: control.signal,
      })
    } catch {
      if (control.signal.aborted) {
        throw new ErrorApi(0, 'SIN_RESPUESTA', 'El servidor tardó demasiado en responder. Intente de nuevo.')
      }
      throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.')
    }

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

  const error = crearError(respuesta.status, datos)
  // Con la sesión abierta no se puede cambiar la contraseña restablecida, porque la persona no conoce la temporal.
  const pierdeSesion =
    respuesta.status === 401 || (respuesta.status === 403 && error.codigo === 'CAMBIO_CONTRASENA_REQUERIDO')
  // Si la sesión ya se cerró o cambió mientras tanto, esta respuesta no debe cerrar la sesión actual.
  if (pierdeSesion && token && leerTokenGuardado() === token) {
    manejadorSesionPerdida?.(error)
  }
  throw error
}
