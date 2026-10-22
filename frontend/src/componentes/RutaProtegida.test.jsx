import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from './ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn(), cambiarContrasena: vi.fn() }))
// /usuarios pide la lista al montar; aquí solo importa la ruta, no la API.
vi.mock('@/api/usuarios.js', () => ({ listarUsuarios: vi.fn(() => new Promise(() => {})) }))

function crearSesion(debeCambiarContrasena) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos: ['USUARIO_CONSULTAR'],
      debeCambiarContrasena,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrir(ruta, debeCambiar) {
  guardarSesion(crearSesion(debeCambiar))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

test.each([['/inicio'], ['/usuarios'], ['/ruta-que-no-existe']])(
  'con debeCambiarContrasena, %s lleva a la pantalla de cambio sin menú',
  (ruta) => {
    abrir(ruta, true)

    expect(screen.getByLabelText('Contraseña actual')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Menú principal' })).toBeNull()
  },
)

test.each([['/inicio'], ['/usuarios']])('sin debeCambiarContrasena, %s abre normal', (ruta) => {
  abrir(ruta, false)

  expect(screen.queryByLabelText('Contraseña actual')).toBeNull()
  expect(screen.getByRole('navigation', { name: 'Menú principal' })).toBeTruthy()
})
