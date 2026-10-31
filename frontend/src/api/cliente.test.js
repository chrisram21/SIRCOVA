import { alPerderSesion, ErrorApi, ESPERA_MAXIMA_MS, leerUltimaPeticion, refrescar, solicitar } from './cliente.js'
import { borrarSesion, guardarSesion, leerSesion, leerTokenGuardado } from './sesion.js'

function crearToken(payload) {
  const codificar = (objeto) =>
    btoa(JSON.stringify(objeto)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar(payload)}.firma`
}

// `renovacion` distingue el token renovado de la misma cuenta.
function crearSesion(sub = '7', renovacion = 0) {
  return {
    token: crearToken({ sub, rol: 'ADMINISTRADOR', renovacion, exp: Math.floor(Date.now() / 1000) + 3600 }),
    usuario: { id: Number(sub), nombreUsuario: 'jperez', rol: 'ADMINISTRADOR', permisos: [], empleado: {} },
  }
}

function respuestaJson(status, cuerpo) {
  return { status, ok: status >= 200 && status < 300, json: async () => cuerpo }
}

const ERROR_401 = { error: { codigo: 'SESION_CERRADA', mensaje: 'Su sesión se cerró. Inicie sesión de nuevo.' } }
const ERROR_VENCIDA = { error: { codigo: 'SESION_VENCIDA', mensaje: 'Su sesión venció. Inicie sesión de nuevo.' } }

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
  expect(error).toMatchObject({ status: 401, codigo: 'SESION_CERRADA', mensaje: ERROR_401.error.mensaje })
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

test('un error con más datos que `error` los conserva en `datos`; sin ellos, no lo trae', async () => {
  const validacion = { errores: 1, advertencias: 0, corregidos: 0, resultados: [] }
  fetch.mockResolvedValueOnce(
    respuestaJson(422, { error: { codigo: 'REPORTE_CON_ERRORES', mensaje: 'Tiene errores.' }, validacion }),
  )
  fetch.mockResolvedValueOnce(respuestaJson(409, { error: { codigo: 'PERIODO_CERRADO', mensaje: 'El mes ya está cerrado.' } }))

  const conDatos = await solicitar('/reportes/1/transiciones', { metodo: 'POST', cuerpo: {} }).catch((e) => e)
  const sinDatos = await solicitar('/reportes/1/transiciones', { metodo: 'POST', cuerpo: {} }).catch((e) => e)

  expect(conDatos).toMatchObject({ status: 422, codigo: 'REPORTE_CON_ERRORES', datos: { validacion } })
  expect(sinDatos.datos).toBeUndefined()
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
    borrarSesion()
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

test('toda petición va con credentials: include, para guardar y mandar la cookie', async () => {
  fetch.mockResolvedValue(respuestaJson(200, {}))
  await solicitar('/roles')
  await refrescar().catch(() => {})
  expect(fetch.mock.calls.map(([, opciones]) => opciones.credentials)).toEqual(['include', 'include'])
})

describe('renovación con POST /auth/refrescar', () => {
  const vencida = crearSesion('7')
  const renovada = crearSesion('7', 1)

  // /auth/refrescar devuelve `refresco` (o lo lanza si es un Error); el resto responde 401 SESION_VENCIDA con el token
  // vencido y 200 con cualquier otro.
  function simularApi(refresco) {
    fetch.mockImplementation(async (url, { headers }) => {
      if (url.endsWith('/auth/refrescar')) {
        if (refresco instanceof Error) throw refresco
        return refresco
      }
      return headers.Authorization === `Bearer ${vencida.token}`
        ? respuestaJson(401, ERROR_VENCIDA)
        : respuestaJson(200, { ok: true })
    })
  }
  const llamadasA = (ruta) => fetch.mock.calls.filter(([url]) => url.endsWith(ruta))

  test('un 401 SESION_VENCIDA renueva, guarda la sesión nueva y repite la petición con el token nuevo', async () => {
    guardarSesion(vencida)
    simularApi(respuestaJson(200, renovada))

    expect(await solicitar('/reportes')).toEqual({ ok: true })
    expect(leerSesion()).toEqual(renovada)
    expect(llamadasA('/auth/refrescar')).toHaveLength(1)
    expect(llamadasA('/auth/refrescar')[0][1].headers.Authorization).toBeUndefined()
    expect(llamadasA('/reportes').map(([, opciones]) => opciones.headers.Authorization)).toEqual([
      `Bearer ${vencida.token}`,
      `Bearer ${renovada.token}`,
    ])
  })

  test('dos peticiones vencidas a la vez hacen un solo refresco', async () => {
    guardarSesion(vencida)
    simularApi(respuestaJson(200, renovada))

    await Promise.all([solicitar('/reportes'), solicitar('/roles')])
    expect(llamadasA('/auth/refrescar')).toHaveLength(1)
    expect(llamadasA('/reportes')).toHaveLength(2)
    expect(llamadasA('/roles')).toHaveLength(2)
  })

  test('si el token ya cambió (otra petición renovó), repite con el actual sin renovar', async () => {
    guardarSesion(vencida)
    fetch.mockImplementation(async (url, { headers }) => {
      if (headers.Authorization === `Bearer ${vencida.token}`) {
        guardarSesion(renovada)
        return respuestaJson(401, ERROR_VENCIDA)
      }
      return respuestaJson(200, { ok: true })
    })

    expect(await solicitar('/reportes')).toEqual({ ok: true })
    expect(llamadasA('/auth/refrescar')).toHaveLength(0)
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe(`Bearer ${renovada.token}`)
  })

  test('un refresco que falla con 401 no repite y llama al manejador con su error', async () => {
    guardarSesion(vencida)
    const manejador = vi.fn()
    quitarManejador = alPerderSesion(manejador)
    const jornada = { error: { codigo: 'JORNADA_TERMINADA', mensaje: 'Terminó su jornada. Inicie sesión de nuevo.' } }
    simularApi(respuestaJson(401, jornada))

    const error = await solicitar('/reportes').catch((e) => e)

    expect(error).toMatchObject({ status: 401, codigo: 'JORNADA_TERMINADA' })
    expect(manejador).toHaveBeenCalledTimes(1)
    expect(manejador).toHaveBeenCalledWith(error)
    expect(llamadasA('/reportes')).toHaveLength(1)
  })

  test('un refresco que falla por la red no repite ni llama al manejador', async () => {
    guardarSesion(vencida)
    const manejador = vi.fn()
    quitarManejador = alPerderSesion(manejador)
    simularApi(new TypeError('Failed to fetch'))

    await expect(solicitar('/reportes')).rejects.toMatchObject({ codigo: 'SIN_CONEXION' })
    expect(manejador).not.toHaveBeenCalled()
    expect(llamadasA('/reportes')).toHaveLength(1)
    expect(leerTokenGuardado()).toBe(vencida.token)
  })

  test('otro 401 no intenta renovar', async () => {
    guardarSesion(vencida)
    quitarManejador = alPerderSesion(vi.fn())
    fetch.mockResolvedValue(respuestaJson(401, ERROR_401))

    await expect(solicitar('/reportes')).rejects.toMatchObject({ codigo: 'SESION_CERRADA' })
    expect(llamadasA('/auth/refrescar')).toHaveLength(0)
  })

  test('un SESION_VENCIDA de /auth/login no intenta renovar', async () => {
    guardarSesion(vencida)
    quitarManejador = alPerderSesion(vi.fn())
    fetch.mockResolvedValue(respuestaJson(401, ERROR_VENCIDA))

    await expect(solicitar('/auth/login', { metodo: 'POST', cuerpo: {} })).rejects.toBeInstanceOf(ErrorApi)
    expect(llamadasA('/auth/refrescar')).toHaveLength(0)
  })

  test('un refresco que trae otra cuenta lanza SESION_OTRA_CUENTA y no cambia la sesión guardada', async () => {
    guardarSesion(vencida)
    fetch.mockResolvedValue(respuestaJson(200, crearSesion('8')))

    await expect(refrescar()).rejects.toMatchObject({ status: 401, codigo: 'SESION_OTRA_CUENTA' })
    expect(leerSesion()).toEqual(vencida)
  })

  test('sin sesión en memoria (al recargar), el refresco guarda la que llega', async () => {
    fetch.mockResolvedValue(respuestaJson(200, renovada))

    expect(await refrescar()).toEqual(renovada)
    expect(leerSesion()).toEqual(renovada)
  })

  test('un refresco correcto actualiza la hora de la última petición', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      vi.setSystemTime(new Date('2026-10-29T10:00:00Z'))
      fetch.mockResolvedValue(respuestaJson(200, renovada))
      await refrescar()
      expect(leerUltimaPeticion()).toBe(new Date('2026-10-29T10:00:00Z').getTime())
    } finally {
      vi.useRealTimers()
    }
  })
})
