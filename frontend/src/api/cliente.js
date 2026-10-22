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

function crearError(status, datos) {
  // Los 5xx no muestran el mensaje del backend, aunque venga en el formato común.
  const error = datos?.error
  if (status < 500 && typeof error?.codigo === 'string' && typeof error?.mensaje === 'string') {
    return new ErrorApi(status, error.codigo, error.mensaje)
  }
  return new ErrorApi(status, 'ERROR_INESPERADO', 'Ocurrió un error inesperado. Intente de nuevo.')
}

export async function solicitar(ruta, { metodo = 'GET', cuerpo } = {}) {
  const encabezados = { Accept: 'application/json' }
  if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json'
  const token = leerSesion()?.token ?? null
  if (token) encabezados.Authorization = `Bearer ${token}`

  let respuesta
  try {
    respuesta = await fetch(`${URL_BASE}${ruta}`, {
      method: metodo,
      headers: encabezados,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    })
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.')
  }

  if (respuesta.status === 204) return null

  let datos = null
  try {
    datos = await respuesta.json()
  } catch {
    datos = null
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
