import { leerSesion } from './sesion.js'

const URL_BASE = import.meta.env.VITE_API_URL

export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje)
    this.name = 'ErrorApi'
    this.status = status
    this.codigo = codigo
    this.mensaje = mensaje
  }
}

export async function solicitar(ruta, { metodo = 'GET', cuerpo } = {}) {
  const encabezados = { Accept: 'application/json' }
  if (cuerpo !== undefined) encabezados['Content-Type'] = 'application/json'
  const sesion = leerSesion()
  if (sesion) encabezados.Authorization = `Bearer ${sesion.token}`

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

  // Los 5xx no muestran el mensaje del backend, aunque venga en el formato común.
  const error = datos?.error
  if (respuesta.status < 500 && typeof error?.codigo === 'string' && typeof error?.mensaje === 'string') {
    throw new ErrorApi(respuesta.status, error.codigo, error.mensaje)
  }
  throw new ErrorApi(respuesta.status, 'ERROR_INESPERADO', 'Ocurrió un error inesperado. Intente de nuevo.')
}
