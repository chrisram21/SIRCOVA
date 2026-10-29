import { consultarConCache, invalidarCache, vaciarCache } from './cache.js'
import { solicitar } from './cliente.js'
import { guardarSesion } from './sesion.js'

vi.mock('./cliente.js', () => ({ solicitar: vi.fn() }))

function crearSesion(sub, sid = Number(sub) * 10, exp = Math.floor(Date.now() / 1000) + 3600) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub, sid, exp })}.firma`,
    usuario: { id: Number(sub), nombreUsuario: `u${sub}`, rol: 'ADMINISTRADOR', permisos: [], empleado: {} },
  }
}

beforeEach(() => {
  sessionStorage.clear()
  vaciarCache()
  solicitar.mockReset()
  solicitar.mockImplementation(async (ruta) => [{ ruta }])
  guardarSesion(crearSesion('7'))
})

test('la segunda consulta de la misma ruta no vuelve a pedirla', async () => {
  await consultarConCache('/roles')
  await consultarConCache('/roles')
  expect(solicitar).toHaveBeenCalledTimes(1)
})

test('dos consultas a la vez comparten la misma petición', async () => {
  await Promise.all([consultarConCache('/roles'), consultarConCache('/roles')])
  expect(solicitar).toHaveBeenCalledTimes(1)
})

test('cada llamada recibe su copia: cambiarla no altera lo guardado', async () => {
  const primera = await consultarConCache('/roles')
  primera.push('otro')
  expect(await consultarConCache('/roles')).toEqual([{ ruta: '/roles' }])
})

test('con otra sesión (otro sid) se vuelve a pedir', async () => {
  await consultarConCache('/establecimientos')
  guardarSesion(crearSesion('8'))
  await consultarConCache('/establecimientos')
  expect(solicitar).toHaveBeenCalledTimes(2)
})

test('con otra sesión de la misma cuenta (otro login) se vuelve a pedir', async () => {
  await consultarConCache('/establecimientos')
  guardarSesion(crearSesion('7', 71))
  await consultarConCache('/establecimientos')
  expect(solicitar).toHaveBeenCalledTimes(2)
})

test('renovar el token (mismo sid, otro token) conserva la caché', async () => {
  await consultarConCache('/establecimientos')
  guardarSesion(crearSesion('7', 70, Math.floor(Date.now() / 1000) + 7200))
  await consultarConCache('/establecimientos')
  expect(solicitar).toHaveBeenCalledTimes(1)
})

test('un error no queda guardado', async () => {
  solicitar.mockRejectedValueOnce(new Error('sin conexión'))
  await expect(consultarConCache('/roles')).rejects.toThrow('sin conexión')
  await consultarConCache('/roles')
  expect(solicitar).toHaveBeenCalledTimes(2)
})

test('vence a los dos minutos', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    await consultarConCache('/roles')
    vi.setSystemTime(Date.now() + 2 * 60_000)
    await consultarConCache('/roles')
    expect(solicitar).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

test('invalidar un prefijo borra la ruta, sus consultas y sus subrutas, y nada más', async () => {
  await consultarConCache('/establecimientos')
  await consultarConCache('/establecimientos?activo=true')
  await consultarConCache('/establecimientos-otro')
  await consultarConCache('/roles')

  invalidarCache('/establecimientos')
  await consultarConCache('/establecimientos')
  await consultarConCache('/establecimientos?activo=true')
  await consultarConCache('/establecimientos-otro')
  await consultarConCache('/roles')

  expect(solicitar.mock.calls.map(([ruta]) => ruta)).toEqual([
    '/establecimientos',
    '/establecimientos?activo=true',
    '/establecimientos-otro',
    '/roles',
    '/establecimientos',
    '/establecimientos?activo=true',
  ])
})
