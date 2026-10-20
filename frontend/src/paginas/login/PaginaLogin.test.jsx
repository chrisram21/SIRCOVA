import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { iniciarSesion } from '@/api/auth.js'
import { ErrorApi } from '@/api/cliente.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn() }))

const MENSAJE_CREDENCIALES = 'Usuario o contraseña incorrectos.'

function crearRespuestaLogin() {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos: [],
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrirLogin() {
  render(
    <MemoryRouter initialEntries={['/login']}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const campoUsuario = () => screen.getByLabelText('Usuario')
const campoContrasena = () => screen.getByLabelText('Contraseña')
const botonIngresar = () => screen.getByRole('button', { name: /Ingres/ })

function llenarYEnviar(usuario = 'jperez', contrasena = 'secreta123') {
  fireEvent.change(campoUsuario(), { target: { value: usuario } })
  fireEvent.change(campoContrasena(), { target: { value: contrasena } })
  fireEvent.click(botonIngresar())
}

beforeEach(() => {
  sessionStorage.clear()
  iniciarSesion.mockReset()
})

test('"Ingresar" está deshabilitado si falta el usuario o la contraseña', () => {
  abrirLogin()
  expect(botonIngresar().disabled).toBe(true)

  fireEvent.change(campoUsuario(), { target: { value: 'jperez' } })
  expect(botonIngresar().disabled).toBe(true)

  fireEvent.change(campoContrasena(), { target: { value: 'secreta123' } })
  expect(botonIngresar().disabled).toBe(false)

  fireEvent.change(campoUsuario(), { target: { value: '   ' } })
  expect(botonIngresar().disabled).toBe(true)
})

test('con una respuesta correcta se guarda la sesión y se muestra /inicio', async () => {
  const respuesta = crearRespuestaLogin()
  iniciarSesion.mockResolvedValue(respuesta)
  abrirLogin()

  llenarYEnviar()

  expect(await screen.findByText('Hola, Juan Pérez')).toBeTruthy()
  expect(iniciarSesion).toHaveBeenCalledWith('jperez', 'secreta123')
  expect(JSON.parse(sessionStorage.getItem('sircova.sesion'))).toEqual(respuesta)
  expect(sessionStorage.getItem('sircova.sesion')).not.toContain('secreta123')
})

test('con un 401 se muestra su mensaje y se puede volver a enviar', async () => {
  iniciarSesion.mockRejectedValueOnce(new ErrorApi(401, 'CREDENCIALES_INVALIDAS', MENSAJE_CREDENCIALES))
  abrirLogin()

  llenarYEnviar('jperez', 'incorrecta')

  const alerta = await screen.findByRole('alert')
  expect(alerta.textContent).toContain(MENSAJE_CREDENCIALES)
  expect(campoContrasena().value).toBe('')
  expect(document.activeElement).toBe(campoContrasena())
  expect(campoUsuario().getAttribute('aria-invalid')).toBe('true')
  expect(campoContrasena().getAttribute('aria-invalid')).toBe('true')

  iniciarSesion.mockResolvedValueOnce(crearRespuestaLogin())
  fireEvent.change(campoContrasena(), { target: { value: 'secreta123' } })
  fireEvent.click(botonIngresar())

  expect(await screen.findByText('Hola, Juan Pérez')).toBeTruthy()
  expect(iniciarSesion).toHaveBeenCalledTimes(2)
})

test.each([
  [423, 'CUENTA_BLOQUEADA', 'Su cuenta está bloqueada por 15 minutos por intentos fallidos.'],
  [403, 'CUENTA_DESACTIVADA', 'Su cuenta está desactivada; contacte al administrador.'],
])('con un %i se muestra su mensaje', async (status, codigo, mensaje) => {
  iniciarSesion.mockRejectedValueOnce(new ErrorApi(status, codigo, mensaje))
  abrirLogin()

  llenarYEnviar()

  expect((await screen.findByRole('alert')).textContent).toContain(mensaje)
})

test('sin conexión se muestra el texto de falta de conexión', async () => {
  const mensaje = 'No se pudo conectar con el servidor. Revise su conexión e intente de nuevo.'
  iniciarSesion.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', mensaje))
  abrirLogin()

  llenarYEnviar()

  expect((await screen.findByRole('alert')).textContent).toContain(mensaje)
})

test('mientras la petición está en curso el botón dice "Ingresando…" y está deshabilitado', async () => {
  let resolver
  iniciarSesion.mockReturnValueOnce(new Promise((resolve) => (resolver = resolve)))
  abrirLogin()

  llenarYEnviar()

  expect(botonIngresar().textContent).toBe('Ingresando…')
  expect(botonIngresar().disabled).toBe(true)

  resolver(crearRespuestaLogin())
  expect(await screen.findByText('Hola, Juan Pérez')).toBeTruthy()
})
