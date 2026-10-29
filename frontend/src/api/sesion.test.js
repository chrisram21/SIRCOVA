import { borrarSesion, guardarSesion, leerSesion, leerSid, leerTokenGuardado, leerVencimiento } from './sesion.js'

function crearToken(payload) {
  const codificar = (objeto) =>
    btoa(JSON.stringify(objeto)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar(payload)}.firma`
}

function crearSesion(expEnSegundos) {
  return {
    token: crearToken({ sub: '7', rol: 'ADMINISTRADOR', exp: Math.floor(Date.now() / 1000) + expEnSegundos }),
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos: ['POBLACION_REGISTRAR'],
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

test('guardar y leer devuelven el mismo objeto', () => {
  const sesion = crearSesion(3600)
  guardarSesion(sesion)
  expect(leerSesion()).toEqual(sesion)
  expect(leerTokenGuardado()).toBe(sesion.token)
})

test('sin sesión guardada devuelve null', () => {
  expect(leerSesion()).toBeNull()
  expect(leerTokenGuardado()).toBeNull()
})

test('un token vencido no se descarta: se renueva con la API', () => {
  const sesion = crearSesion(-60)
  guardarSesion(sesion)
  expect(leerSesion()).toEqual(sesion)
})

test('la sesión no queda en sessionStorage', () => {
  guardarSesion(crearSesion(3600))
  expect(sessionStorage.length).toBe(0)
})

test('borrarSesion la elimina', () => {
  guardarSesion(crearSesion(3600))
  borrarSesion()
  expect(leerSesion()).toBeNull()
})

test('leerSid devuelve el sid del token guardado', () => {
  guardarSesion({ ...crearSesion(3600), token: crearToken({ sub: '7', sid: 42, exp: 9999999999 }) })
  expect(leerSid()).toBe(42)
})

test('leerSid da null sin sesión, sin sid o con un token mal formado', () => {
  expect(leerSid()).toBeNull()
  guardarSesion(crearSesion(3600))
  expect(leerSid()).toBeNull()
  guardarSesion({ ...crearSesion(3600), token: 'no-es-un-jwt' })
  expect(leerSid()).toBeNull()
})

test('al cargar el módulo borra la sesión que dejó la versión anterior en sessionStorage', async () => {
  sessionStorage.setItem('sircova.sesion', JSON.stringify(crearSesion(3600)))
  vi.resetModules()
  const modulo = await import('./sesion.js')
  expect(sessionStorage.getItem('sircova.sesion')).toBeNull()
  expect(modulo.leerSesion()).toBeNull()
})

test('leerVencimiento devuelve el exp del token en milisegundos', () => {
  const exp = Math.floor(Date.now() / 1000) + 3600
  expect(leerVencimiento(crearToken({ sub: '7', exp }))).toBe(exp * 1000)
})

test('leerVencimiento da null con un token mal formado o sin exp', () => {
  expect(leerVencimiento('no-es-un-jwt')).toBeNull()
  expect(leerVencimiento(crearToken({ sub: '7' }))).toBeNull()
})
