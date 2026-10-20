import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { cerrarSesion } from '@/api/auth.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))

function crearSesion() {
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

function abrirInicio() {
  guardarSesion(crearSesion())
  render(
    <MemoryRouter initialEntries={['/inicio']}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
  cerrarSesion.mockReset()
})

test('"Cerrar sesión" avisa al servidor con MANUAL, borra la sesión y muestra /login sin aviso', () => {
  cerrarSesion.mockResolvedValue(null)
  abrirInicio()
  expect(screen.getByText('Hola, Juan Pérez')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

  expect(cerrarSesion).toHaveBeenCalledTimes(1)
  expect(cerrarSesion).toHaveBeenCalledWith('MANUAL')
  expect(sessionStorage.getItem('sircova.sesion')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

test('si POST /auth/logout falla, la sesión se cierra igual', async () => {
  cerrarSesion.mockRejectedValue(new Error('sin conexión'))
  abrirInicio()

  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

  expect(sessionStorage.getItem('sircova.sesion')).toBeNull()
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
