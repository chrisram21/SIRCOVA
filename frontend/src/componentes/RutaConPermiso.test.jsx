import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { guardarSesion } from '@/api/sesion.js'
import opcionesMenu from './layout/opcionesMenu.js'
import { ProveedorSesion } from './ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
// Las pantallas piden sus datos al montar; aquí solo importa la ruta, así que toda función de la API queda pendiente.
const { pendientes } = vi.hoisted(() => ({
  pendientes: async (importarOriginal) =>
    Object.fromEntries(Object.keys(await importarOriginal()).map((nombre) => [nombre, vi.fn(() => new Promise(() => {}))])),
}))
vi.mock('@/api/usuarios.js', pendientes)
vi.mock('@/api/catalogos.js', pendientes)
vi.mock('@/api/configuracion.js', pendientes)

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

// La primera pantalla con lazy de la corrida puede tardar más de 1 s en descargarse.
const ESPERA_LAZY = { timeout: 5000 }
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
  expect(screen.getByText('Usuarios activos')).toBeTruthy()
})

test('sin EMPLEADO_CREAR, la subruta /administracion/usuarios/nuevo lleva a /inicio', () => {
  abrir('/administracion/usuarios/nuevo', ['USUARIO_CONSULTAR'])

  expect(screen.queryByRole('heading', { name: 'Registrar personal' })).toBeNull()
  expect(screen.getByText('Usuarios activos')).toBeTruthy()
})

// Las pantallas se cargan al entrar en ellas (lazy): se esperan con findBy.
test('con EMPLEADO_CREAR, la subruta /administracion/usuarios/nuevo muestra su página', async () => {
  abrir('/administracion/usuarios/nuevo', ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'])

  expect(await screen.findByRole('heading', { name: 'Registrar personal' }, ESPERA_LAZY)).toBeTruthy()
})

test('sin USUARIO_EDITAR, la subruta /administracion/usuarios/5/editar lleva a /inicio', () => {
  abrir('/administracion/usuarios/5/editar', ['USUARIO_CONSULTAR'])

  expect(screen.queryByRole('heading', { name: 'Editar usuario' })).toBeNull()
  expect(screen.getByText('Usuarios activos')).toBeTruthy()
})

test('con USUARIO_EDITAR, la subruta /administracion/usuarios/5/editar muestra su página', async () => {
  abrir('/administracion/usuarios/5/editar', ['USUARIO_CONSULTAR', 'USUARIO_EDITAR'])

  expect(await screen.findByRole('heading', { name: 'Editar usuario' }, ESPERA_LAZY)).toBeTruthy()
})

test('sin sesión, /indicadores lleva a /login', async () => {
  abrir('/indicadores')

  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
})

test('una ruta inexistente lleva a /inicio', () => {
  abrir('/no-existe', [])

  expect(screen.getByText('Usuarios activos')).toBeTruthy()
})

// Los hijos de «Administración» con pantalla: cada uno pide todos sus permisos (antes, la pestaña de /configuracion).
const HIJOS = opcionesMenu
  .flatMap((opcion) => opcion.hijos ?? [])
  .filter((hijo) => hijo.pagina)
  .map((hijo) => [hijo.titulo, hijo.ruta, hijo.permisos])

test.each(HIJOS)('con sus permisos, %s muestra su pantalla con el antetítulo «Administración»', async (titulo, ruta, permisos) => {
  abrir(ruta, permisos)

  expect(await screen.findByRole('heading', { level: 1, name: titulo }, ESPERA_LAZY)).toBeTruthy()
  expect(screen.getAllByText('Administración').length).toBeGreaterThan(0)
})

test.each(HIJOS.flatMap(([titulo, ruta, permisos]) => permisos.map((falta) => [titulo, falta, ruta, permisos])))(
  'sin %s · %s, lleva a /inicio',
  (_, falta, ruta, permisos) => {
    abrir(ruta, permisos.filter((permiso) => permiso !== falta))

    expect(screen.getByText('Usuarios activos')).toBeTruthy()
  },
)
