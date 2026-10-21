import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from './ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrir(ruta, permisos) {
  if (permisos) guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const enConstruccion = () => screen.queryByText('Esta pantalla está en construcción.')

beforeEach(() => {
  sessionStorage.clear()
})

test('con el permiso, /indicadores muestra su página', () => {
  abrir('/indicadores', ['INDICADOR_CONSULTAR'])

  expect(screen.getByRole('heading', { name: 'Indicadores' })).toBeTruthy()
  expect(enConstruccion()).toBeTruthy()
})

test('sin el permiso, /indicadores lleva a /inicio', () => {
  abrir('/indicadores', ['BITACORA_CONSULTAR'])

  expect(enConstruccion()).toBeNull()
  expect(screen.getByText('Hola, Juan Pérez')).toBeTruthy()
})

test('sin sesión, /indicadores lleva a /login', () => {
  abrir('/indicadores')

  expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
})

test('una ruta inexistente lleva a /inicio', () => {
  abrir('/no-existe', [])

  expect(screen.getByText('Hola, Juan Pérez')).toBeTruthy()
})
