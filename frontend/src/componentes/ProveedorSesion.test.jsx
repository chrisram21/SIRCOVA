import { act, fireEvent, render, screen } from '@testing-library/react'
import { cerrarSesion } from '@/api/auth.js'
import { refrescar, solicitar } from '@/api/cliente.js'
import { guardarSesion, leerSesion } from '@/api/sesion.js'
import { ProveedorSesion, useSesion } from './ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ cerrarSesion: vi.fn() }))

const MINUTO = 60_000
const AVISO_INACTIVIDAD = 'Su sesión se cerró por inactividad. Inicie sesión de nuevo.'

function crearSesion(minutosHastaExp, id = 7) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor((Date.now() + minutosHastaExp * MINUTO) / 1000)
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: String(id), exp })}.firma`,
    usuario: { id, nombreUsuario: 'jperez', rol: 'ADMINISTRADOR', permisos: [], empleado: {} },
  }
}

function Sonda() {
  const { sesion, cargando, aviso, iniciar } = useSesion()
  return (
    <div>
      <p data-testid="estado">{cargando ? 'cargando' : sesion ? 'abierta' : 'cerrada'}</p>
      <p data-testid="aviso">{aviso ?? ''}</p>
      <button onClick={() => iniciar(crearSesion(120))}>iniciar</button>
    </div>
  )
}

function montar() {
  render(
    <ProveedorSesion>
      <Sonda />
    </ProveedorSesion>,
  )
}

function montarConSesion(minutosHastaExp = 120) {
  guardarSesion(crearSesion(minutosHastaExp))
  montar()
}

const respuesta = (status, cuerpo) => ({ status, ok: status >= 200 && status < 300, json: async () => cuerpo })

// /auth/refrescar responde `resultado` (o lo lanza si es un Error). Devuelve cuántas veces se llamó.
function simularRefresco(resultado) {
  const fetchFalso = vi.fn(async () => {
    if (resultado instanceof Error) throw resultado
    return resultado
  })
  vi.stubGlobal('fetch', fetchFalso)
  return () => fetchFalso.mock.calls.filter(([url]) => url.endsWith('/auth/refrescar')).length
}

// Deja que terminen las promesas de refrescar() sin mover el reloj falso.
const terminarPromesas = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve()
  })

const estado = () => screen.getByTestId('estado').textContent
const aviso = () => screen.getByTestId('aviso').textContent
const avanzar = (minutos) => act(() => vi.advanceTimersByTime(minutos * MINUTO))

beforeEach(() => {
  vi.useFakeTimers()
  sessionStorage.clear()
  cerrarSesion.mockReset()
  cerrarSesion.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('tras 30 minutos sin actividad cierra la sesión, avisa al servidor y muestra el aviso de inactividad', () => {
  montarConSesion()

  avanzar(29)
  expect(estado()).toBe('abierta')

  avanzar(1)
  expect(estado()).toBe('cerrada')
  expect(leerSesion()).toBeNull()
  expect(cerrarSesion).toHaveBeenCalledTimes(1)
  expect(cerrarSesion).toHaveBeenCalledWith('INACTIVIDAD')
  expect(aviso()).toBe(AVISO_INACTIVIDAD)
})

test('la actividad reinicia la cuenta de inactividad', () => {
  montarConSesion()

  avanzar(29)
  fireEvent.keyDown(window, { key: 'a' })
  avanzar(1)
  expect(estado()).toBe('abierta')

  avanzar(28)
  expect(estado()).toBe('abierta')

  avanzar(1)
  expect(estado()).toBe('cerrada')
  expect(cerrarSesion).toHaveBeenCalledWith('INACTIVIDAD')
})

test.each(['mouseMove', 'pointerDown', 'wheel', 'touchStart', 'scroll'])('el evento %s también cuenta como actividad', (evento) => {
  montarConSesion()

  avanzar(20)
  fireEvent[evento](window)
  avanzar(20)
  expect(estado()).toBe('abierta')
})

test('renueva el token cinco minutos antes de que venza, sin cerrar la sesión', async () => {
  const renovada = crearSesion(120)
  const refrescos = simularRefresco(respuesta(200, renovada))
  montarConSesion(10)

  avanzar(4)
  expect(refrescos()).toBe(0)

  avanzar(1)
  await terminarPromesas()
  expect(refrescos()).toBe(1)
  expect(leerSesion()).toEqual(renovada)
  expect(estado()).toBe('abierta')
  expect(cerrarSesion).not.toHaveBeenCalled()

  // El token renovado vence en 2 h: no se vuelve a renovar enseguida.
  fireEvent.keyDown(window, { key: 'a' })
  avanzar(5)
  await terminarPromesas()
  expect(refrescos()).toBe(1)
})

test('si la renovación responde 401, cierra la sesión con su mensaje y sin logout', async () => {
  const mensaje = 'Terminó su jornada. Inicie sesión de nuevo.'
  simularRefresco(respuesta(401, { error: { codigo: 'JORNADA_TERMINADA', mensaje } }))
  montarConSesion(10)

  avanzar(5)
  await terminarPromesas()

  expect(estado()).toBe('cerrada')
  expect(leerSesion()).toBeNull()
  expect(aviso()).toBe(mensaje)
  expect(cerrarSesion).not.toHaveBeenCalled()
})

test('si la renovación trae otra cuenta, cierra con SESION_OTRA_CUENTA y sin logout', async () => {
  simularRefresco(respuesta(200, crearSesion(120, 8)))
  montarConSesion(10)

  avanzar(5)
  await terminarPromesas()

  expect(estado()).toBe('cerrada')
  expect(aviso()).toBe('Se inició sesión con otra cuenta en este navegador. Inicie sesión de nuevo.')
  expect(cerrarSesion).not.toHaveBeenCalled()
})

test('un fallo de red en la renovación no cierra la sesión', async () => {
  const refrescos = simularRefresco(new TypeError('Failed to fetch'))
  montarConSesion(10)

  avanzar(5)
  await terminarPromesas()

  expect(refrescos()).toBe(1)
  expect(estado()).toBe('abierta')
  expect(leerSesion()).not.toBeNull()
})

test('latido: con actividad y sin peticiones durante 10 minutos, renueva para que el servidor no la dé por inactiva', async () => {
  const refrescos = simularRefresco(respuesta(200, crearSesion(120)))
  montarConSesion(120)
  // La hora de la última petición es del módulo: se fija aquí con una petición, la 1.ª llamada a /auth/refrescar.
  await act(() => refrescar())

  for (let minuto = 0; minuto < 9; minuto += 1) {
    fireEvent.keyDown(window, { key: 'a' })
    avanzar(1)
  }
  await terminarPromesas()
  expect(refrescos()).toBe(1)

  fireEvent.keyDown(window, { key: 'a' })
  avanzar(2)
  await terminarPromesas()
  expect(refrescos()).toBe(2)
  expect(estado()).toBe('abierta')
})

test('latido: sin actividad no renueva', async () => {
  const refrescos = simularRefresco(respuesta(200, crearSesion(120)))
  montarConSesion(120)
  await act(() => refrescar())

  avanzar(25)
  await terminarPromesas()

  expect(refrescos()).toBe(1)
})

test('con actividad reciente en otra pestaña (sircova.actividad), no cierra por inactividad', () => {
  montarConSesion()

  avanzar(29)
  localStorage.setItem('sircova.actividad', String(Date.now()))
  avanzar(1)
  expect(estado()).toBe('abierta')
  expect(cerrarSesion).not.toHaveBeenCalled()

  avanzar(28)
  expect(estado()).toBe('abierta')
  avanzar(1)
  expect(estado()).toBe('cerrada')
  expect(cerrarSesion).toHaveBeenCalledWith('INACTIVIDAD')
})

test('la actividad de esta pestaña se anota en sircova.actividad para las otras', () => {
  montarConSesion()

  avanzar(10)
  fireEvent.keyDown(window, { key: 'a' })

  expect(Number(localStorage.getItem('sircova.actividad'))).toBe(Date.now())
})

describe('arranque sin sesión en memoria (recarga u otra pestaña)', () => {
  test('con la cookie vigente recupera la sesión, mostrando antes que está cargando', async () => {
    const recuperada = crearSesion(120)
    simularRefresco(respuesta(200, recuperada))
    montar()
    expect(estado()).toBe('cargando')

    await terminarPromesas()

    expect(estado()).toBe('abierta')
    expect(leerSesion()).toEqual(recuperada)
    expect(aviso()).toBe('')
  })

  test('sin cookie (401 NO_AUTENTICADO) queda cerrada y sin aviso', async () => {
    simularRefresco(respuesta(401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debe iniciar sesión.' } }))
    montar()

    await terminarPromesas()

    expect(estado()).toBe('cerrada')
    expect(aviso()).toBe('')
  })

  test('con otro 401 queda cerrada con su mensaje como aviso', async () => {
    const mensaje = 'Se inició sesión con su cuenta en otro equipo. Si no fue usted, cambie su contraseña.'
    simularRefresco(respuesta(401, { error: { codigo: 'SESION_REEMPLAZADA', mensaje } }))
    montar()

    await terminarPromesas()

    expect(estado()).toBe('cerrada')
    expect(aviso()).toBe(mensaje)
  })

  test('sin conexión queda cerrada y avisa que no se pudo conectar', async () => {
    simularRefresco(new TypeError('Failed to fetch'))
    montar()

    await terminarPromesas()

    expect(estado()).toBe('cerrada')
    expect(aviso()).toBe('No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.')
  })

  test('con sesión en memoria no llama a /auth/refrescar al montar', async () => {
    const refrescos = simularRefresco(respuesta(200, crearSesion(120)))
    montarConSesion()

    await terminarPromesas()

    expect(estado()).toBe('abierta')
    expect(refrescos()).toBe(0)
  })
})

test('un 401 de una petición con token cierra la sesión y muestra el mensaje del backend', async () => {
  const mensaje = 'Debe iniciar sesión.'
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ status: 401, ok: false, json: async () => ({ error: { codigo: 'NO_AUTENTICADO', mensaje } }) })),
  )
  montarConSesion()

  await act(() => solicitar('/algo').catch(() => {}))

  expect(estado()).toBe('cerrada')
  expect(leerSesion()).toBeNull()
  expect(aviso()).toBe(mensaje)
  expect(cerrarSesion).not.toHaveBeenCalled()
})

test('iniciar() borra el aviso', () => {
  montarConSesion()
  avanzar(30)
  expect(aviso()).toBe(AVISO_INACTIVIDAD)

  fireEvent.click(screen.getByText('iniciar'))

  expect(estado()).toBe('abierta')
  expect(aviso()).toBe('')
})

function SondaPermiso({ codigo }) {
  const { tienePermiso } = useSesion()
  return <p data-testid="permiso">{String(tienePermiso(codigo))}</p>
}

function montarPermiso(codigo, permisos) {
  if (permisos) {
    const sesion = crearSesion(120)
    guardarSesion({ ...sesion, usuario: { ...sesion.usuario, permisos } })
  }
  render(
    <ProveedorSesion>
      <SondaPermiso codigo={codigo} />
    </ProveedorSesion>,
  )
  return screen.getByTestId('permiso').textContent
}

test('tienePermiso: sin sesión devuelve false', () => {
  expect(montarPermiso('POBLACION_REGISTRAR')).toBe('false')
})

test('tienePermiso: devuelve true si la sesión incluye el código', () => {
  expect(montarPermiso('POBLACION_REGISTRAR', ['POBLACION_REGISTRAR', 'USUARIO_CREAR'])).toBe('true')
})

test('tienePermiso: devuelve false si la sesión no incluye el código', () => {
  expect(montarPermiso('USUARIO_DESACTIVAR', ['POBLACION_REGISTRAR', 'USUARIO_CREAR'])).toBe('false')
})

test('sin sesión ni cookie no revisa nada ni avisa al servidor', async () => {
  montar()
  await terminarPromesas()

  avanzar(60)

  expect(estado()).toBe('cerrada')
  expect(aviso()).toBe('')
  expect(cerrarSesion).not.toHaveBeenCalled()
})
