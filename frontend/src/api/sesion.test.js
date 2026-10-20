import { borrarSesion, guardarSesion, leerSesion } from './sesion.js'

const CLAVE = 'sircova.sesion'

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

beforeEach(() => {
  sessionStorage.clear()
})

test('guardar y leer devuelven el mismo objeto', () => {
  const sesion = crearSesion(3600)
  guardarSesion(sesion)
  expect(leerSesion()).toEqual(sesion)
})

test('sin sesión guardada devuelve null', () => {
  expect(leerSesion()).toBeNull()
})

test('un token con exp en el pasado da null y borra la clave', () => {
  guardarSesion(crearSesion(-60))
  expect(leerSesion()).toBeNull()
  expect(sessionStorage.getItem(CLAVE)).toBeNull()
})

test('un token mal formado da null y borra la clave', () => {
  guardarSesion({ ...crearSesion(3600), token: 'no-es-un-jwt' })
  expect(leerSesion()).toBeNull()
  expect(sessionStorage.getItem(CLAVE)).toBeNull()
})

test('un JSON mal formado da null y borra la clave', () => {
  sessionStorage.setItem(CLAVE, '{no es json')
  expect(leerSesion()).toBeNull()
  expect(sessionStorage.getItem(CLAVE)).toBeNull()
})

test('borrarSesion elimina la clave', () => {
  guardarSesion(crearSesion(3600))
  borrarSesion()
  expect(sessionStorage.getItem(CLAVE)).toBeNull()
})
