import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { cerrarSesion } from '@/api/auth.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import opcionesMenu from './opcionesMenu.js'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))

const TODOS_LOS_PERMISOS = opcionesMenu.map((opcion) => opcion.permiso).filter(Boolean)

function crearSesion({ permisos = [], rolNombre = 'Administrador' } = {}) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      ...(rolNombre && { rolNombre }),
      permisos,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrir(ruta, opciones) {
  guardarSesion(crearSesion(opciones))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const menu = () => within(screen.getByRole('navigation', { name: 'Menú principal' }))
const opcionesVisibles = () => menu().getAllByRole('link').map((enlace) => enlace.textContent)

beforeEach(() => {
  sessionStorage.clear()
  cerrarSesion.mockReset()
  cerrarSesion.mockResolvedValue(null)
})

test('una sesión sin permisos ve solo "Inicio"', () => {
  abrir('/inicio', { permisos: [] })

  expect(opcionesVisibles()).toEqual(['Inicio'])
})

test('con INDICADOR_CONSULTAR y BITACORA_CONSULTAR ve Inicio, Indicadores y Auditoría', () => {
  abrir('/inicio', { permisos: ['INDICADOR_CONSULTAR', 'BITACORA_CONSULTAR'] })

  expect(opcionesVisibles()).toEqual(['Inicio', 'Indicadores', 'Auditoría'])
  expect(menu().queryByRole('link', { name: 'Registro de producción' })).toBeNull()
})

test('con los 11 permisos ve las 12 opciones en el orden de la tabla', () => {
  abrir('/inicio', { permisos: TODOS_LOS_PERMISOS })

  expect(TODOS_LOS_PERMISOS).toHaveLength(11)
  expect(opcionesVisibles()).toEqual([
    'Inicio',
    'Registro de producción',
    'Reportes',
    'Revisión y cierre',
    'Indicadores',
    'Mapa territorial',
    'Informes',
    'Alertas',
    'Auditoría',
    'Usuarios',
    'Configuración',
    'Roles y permisos',
  ])
})

test('la opción de la ruta actual está marcada como activa', () => {
  abrir('/indicadores', { permisos: ['INDICADOR_CONSULTAR'] })

  const indicadores = menu().getByRole('link', { name: 'Indicadores' })
  const inicio = menu().getByRole('link', { name: 'Inicio' })
  expect(indicadores.getAttribute('data-active')).toBe('true')
  expect(indicadores.getAttribute('aria-current')).toBe('page')
  expect(inicio.getAttribute('data-active')).toBe('false')
})

test('"Usuarios" sigue activa en su subruta /usuarios/nuevo, que no aparece en el menú', () => {
  abrir('/usuarios/nuevo', { permisos: ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'] })

  expect(menu().getByRole('link', { name: 'Usuarios' }).getAttribute('data-active')).toBe('true')
  expect(opcionesVisibles()).toEqual(['Inicio', 'Usuarios'])
})

test('/usuarios muestra "Registrar personal" solo con EMPLEADO_CREAR', () => {
  abrir('/usuarios', { permisos: ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'] })
  expect(screen.getByRole('link', { name: 'Registrar personal' }).getAttribute('href')).toBe('/usuarios/nuevo')
})

test('/usuarios sin EMPLEADO_CREAR no muestra "Registrar personal"', () => {
  abrir('/usuarios', { permisos: ['USUARIO_CONSULTAR'] })

  expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Registrar personal' })).toBeNull()
})

test('el encabezado muestra nombre, apellidos y rolNombre', () => {
  abrir('/inicio', { rolNombre: 'Administrador del sistema' })

  const encabezado = within(screen.getByRole('banner'))
  expect(encabezado.getByText('Juan Pérez')).toBeTruthy()
  expect(encabezado.getByText('Administrador del sistema')).toBeTruthy()
})

test('sin rolNombre, el encabezado muestra el código del rol', () => {
  abrir('/inicio', { rolNombre: null })

  expect(within(screen.getByRole('banner')).getByText('ADMINISTRADOR')).toBeTruthy()
})

test('"Cerrar sesión" avisa al servidor con MANUAL, borra sircova.sesion y lleva a /login sin aviso', () => {
  abrir('/inicio')

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
  abrir('/inicio')

  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

  expect(sessionStorage.getItem('sircova.sesion')).toBeNull()
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
