import { act, fireEvent, render, screen } from '@testing-library/react'
import { cerrarSesion } from '@/api/auth.js'
import { solicitar } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion, useSesion } from './ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ cerrarSesion: vi.fn() }))

const CLAVE = 'sircova.sesion'
const MINUTO = 60_000
const AVISO_INACTIVIDAD = 'Su sesión se cerró por inactividad. Inicie sesión de nuevo.'
const AVISO_VENCIDA = 'Su sesión venció; inicie sesión de nuevo.'

function crearSesion(minutosHastaExp) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor((Date.now() + minutosHastaExp * MINUTO) / 1000)
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: { id: 7, nombreUsuario: 'jperez', rol: 'ADMINISTRADOR', permisos: [], empleado: {} },
  }
}

function Sonda() {
  const { sesion, aviso, iniciar } = useSesion()
  return (
    <div>
      <p data-testid="estado">{sesion ? 'abierta' : 'cerrada'}</p>
      <p data-testid="aviso">{aviso ?? ''}</p>
      <button onClick={() => iniciar(crearSesion(120))}>iniciar</button>
    </div>
  )
}

function montarConSesion(minutosHastaExp = 120) {
  guardarSesion(crearSesion(minutosHastaExp))
  render(
    <ProveedorSesion>
      <Sonda />
    </ProveedorSesion>,
  )
}

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
  expect(sessionStorage.getItem(CLAVE)).toBeNull()
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

test('al llegar al vencimiento del token cierra la sesión sin llamar a la API', () => {
  montarConSesion(10)

  avanzar(9)
  fireEvent.keyDown(window, { key: 'a' })
  expect(estado()).toBe('abierta')

  avanzar(1)
  expect(estado()).toBe('cerrada')
  expect(sessionStorage.getItem(CLAVE)).toBeNull()
  expect(cerrarSesion).not.toHaveBeenCalled()
  expect(aviso()).toBe(AVISO_VENCIDA)
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
  expect(sessionStorage.getItem(CLAVE)).toBeNull()
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

test('sin sesión no revisa nada ni llama a la API', () => {
  render(
    <ProveedorSesion>
      <Sonda />
    </ProveedorSesion>,
  )

  avanzar(60)

  expect(estado()).toBe('cerrada')
  expect(aviso()).toBe('')
  expect(cerrarSesion).not.toHaveBeenCalled()
})
