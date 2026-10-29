import { alPerderSesion, ErrorApi, ESPERA_MAXIMA_MS, solicitar } from './cliente.js'
import { guardarSesion } from './sesion.js'

function crearToken(payload) {
  const codificar = (objeto) =>
    btoa(JSON.stringify(objeto)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar(payload)}.firma`
}

function crearSesion(sub = '7') {
  return {
    token: crearToken({ sub, rol: 'ADMINISTRADOR', exp: Math.floor(Date.now() / 1000) + 3600 }),
    usuario: { id: Number(sub), nombreUsuario: 'jperez', rol: 'ADMINISTRADOR', permisos: [], empleado: {} },
  }
}

function respuestaJson(status, cuerpo) {
  return { status, ok: status >= 200 && status < 300, json: async () => cuerpo }
}

const ERROR_401 = { error: { codigo: 'SESION_VENCIDA', mensaje: 'Su sesión venció; inicie sesión de nuevo.' } }

let quitarManejador

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  quitarManejador?.()
  quitarManejador = undefined
  vi.unstubAllGlobals()
})

test('un 401 con sesión guardada llama al manejador con el ErrorApi y lo lanza', async () => {
  guardarSesion(crearSesion())
  const manejador = vi.fn()
  quitarManejador = alPerderSesion(manejador)
  fetch.mockResolvedValue(respuestaJson(401, ERROR_401))

  const error = await solicitar('/algo').catch((e) => e)

  expect(error).toBeInstanceOf(ErrorApi)
  expect(error).toMatchObject({ status: 401, codigo: 'SESION_VENCIDA', mensaje: ERROR_401.error.mensaje })
  expect(manejador).toHaveBeenCalledTimes(1)
  expect(manejador).toHaveBeenCalledWith(error)
})

test('un 401 sin sesión guardada (como el de /auth/login) no llama al manejador', async () => {
  const manejador = vi.fn()
  quitarManejador = alPerderSesion(manejador)
  fetch.mockResolvedValue(
    respuestaJson(401, { error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Usuario o contraseña incorrectos.' } }),
  )

  await expect(solicitar('/auth/login', { metodo: 'POST', cuerpo: {} })).rejects.toMatchObject({
    status: 401,
    codigo: 'CREDENCIALES_INVALIDAS',
  })
  expect(manejador).not.toHaveBeenCalled()
})

test('un 401 cuando el token guardado ya no es el que se envió no llama al manejador', async () => {
  guardarSesion(crearSesion('7'))
  const manejador = vi.fn()
  quitarManejador = alPerderSesion(manejador)
  fetch.mockImplementation(async () => {
    // Mientras la petición está en curso, la sesión se cierra o se reemplaza.
    guardarSesion(crearSesion('8'))
    return respuestaJson(401, ERROR_401)
  })

  await expect(solicitar('/algo')).rejects.toBeInstanceOf(ErrorApi)
  expect(manejador).not.toHaveBeenCalled()
})

test('un 401 después de borrar la sesión no llama al manejador', async () => {
  guardarSesion(crearSesion())
  const manejador = vi.fn()
  quitarManejador = alPerderSesion(manejador)
  fetch.mockImplementation(async () => {
    sessionStorage.clear()
    return respuestaJson(401, ERROR_401)
  })

  await expect(solicitar('/auth/logout', { metodo: 'POST', cuerpo: { motivo: 'MANUAL' } })).rejects.toBeInstanceOf(
    ErrorApi,
  )
  expect(manejador).not.toHaveBeenCalled()
})

test.each([
  [403, 'SIN_PERMISO'],
  [422, 'REGLA_NEGOCIO'],
])('un %i no llama al manejador', async (status, codigo) => {
  guardarSesion(crearSesion())
  const manejador = vi.fn()
  quitarManejador = alPerderSesion(manejador)
  fetch.mockResolvedValue(respuestaJson(status, { error: { codigo, mensaje: 'No permitido.' } }))

  await expect(solicitar('/algo')).rejects.toMatchObject({ status, codigo })
  expect(manejador).not.toHaveBeenCalled()
})

describe('403 CAMBIO_CONTRASENA_REQUERIDO (contraseña restablecida por el administrador)', () => {
  const ERROR_CAMBIO = {
    error: { codigo: 'CAMBIO_CONTRASENA_REQUERIDO', mensaje: 'Debe cambiar su contraseña temporal antes de continuar.' },
  }

  test('con sesión guardada llama al manejador con el ErrorApi y lo lanza', async () => {
    guardarSesion(crearSesion())
    const manejador = vi.fn()
    quitarManejador = alPerderSesion(manejador)
    fetch.mockResolvedValue(respuestaJson(403, ERROR_CAMBIO))

    const error = await solicitar('/usuarios').catch((e) => e)

    expect(error).toMatchObject({ status: 403, codigo: 'CAMBIO_CONTRASENA_REQUERIDO' })
    expect(manejador).toHaveBeenCalledTimes(1)
    expect(manejador).toHaveBeenCalledWith(error)
  })

  test('sin sesión guardada no llama al manejador', async () => {
    const manejador = vi.fn()
    quitarManejador = alPerderSesion(manejador)
    fetch.mockResolvedValue(respuestaJson(403, ERROR_CAMBIO))

    await expect(solicitar('/usuarios')).rejects.toMatchObject({ status: 403 })
    expect(manejador).not.toHaveBeenCalled()
  })

  test('cuando el token guardado ya no es el que se envió no llama al manejador', async () => {
    guardarSesion(crearSesion('7'))
    const manejador = vi.fn()
    quitarManejador = alPerderSesion(manejador)
    fetch.mockImplementation(async () => {
      guardarSesion(crearSesion('8'))
      return respuestaJson(403, ERROR_CAMBIO)
    })

    await expect(solicitar('/usuarios')).rejects.toBeInstanceOf(ErrorApi)
    expect(manejador).not.toHaveBeenCalled()
  })
})

test('la función que devuelve alPerderSesion quita el registro', async () => {
  guardarSesion(crearSesion())
  const manejador = vi.fn()
  alPerderSesion(manejador)()
  fetch.mockResolvedValue(respuestaJson(401, ERROR_401))

  await expect(solicitar('/algo')).rejects.toBeInstanceOf(ErrorApi)
  expect(manejador).not.toHaveBeenCalled()
})

test('envía el token de la sesión en Authorization', async () => {
  const sesion = crearSesion()
  guardarSesion(sesion)
  fetch.mockResolvedValue({ status: 204, ok: true, json: async () => null })

  await solicitar('/auth/logout', { metodo: 'POST', cuerpo: { motivo: 'MANUAL' } })

  const [, opciones] = fetch.mock.calls[0]
  expect(opciones.headers.Authorization).toBe(`Bearer ${sesion.token}`)
  expect(JSON.parse(opciones.body)).toEqual({ motivo: 'MANUAL' })
})

test('sin respuesta en ESPERA_MAXIMA_MS cancela la petición y lo dice', async () => {
  vi.useFakeTimers()
  try {
    fetch.mockImplementation(
      (url, { signal }) =>
        new Promise((resolver, rechazar) => signal.addEventListener('abort', () => rechazar(new DOMException('', 'AbortError')))),
    )
    const pedido = solicitar('/reportes')
    const resultado = expect(pedido).rejects.toMatchObject({
      codigo: 'SIN_RESPUESTA',
      mensaje: 'El servidor tardó demasiado en responder. Intente de nuevo.',
    })
    await vi.advanceTimersByTimeAsync(ESPERA_MAXIMA_MS)
    await resultado
  } finally {
    vi.useRealTimers()
  }
})

test('un fallo de red antes del límite sigue siendo SIN_CONEXION', async () => {
  fetch.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(solicitar('/reportes')).rejects.toMatchObject({ codigo: 'SIN_CONEXION' })
})
