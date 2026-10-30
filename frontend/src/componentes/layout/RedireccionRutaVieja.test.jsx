import { render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '@/App.jsx'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import { destinoDeRutaVieja } from './RedireccionRutaVieja.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
// Las pantallas piden sus datos al montar; aquí solo importa a dónde se llega.
const { pendientes } = vi.hoisted(() => ({
  pendientes: async (importarOriginal) =>
    Object.fromEntries(Object.keys(await importarOriginal()).map((nombre) => [nombre, vi.fn(() => new Promise(() => {}))])),
}))
vi.mock('@/api/usuarios.js', pendientes)
vi.mock('@/api/catalogos.js', pendientes)
vi.mock('@/api/configuracion.js', pendientes)

const todos = () => true
const REVISOR = ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR', 'ESQUEMA_CONSULTAR', 'PERIODO_CONSULTAR']
const conPermisos = (permisos) => (permiso) => permisos.includes(permiso)

describe('destinoDeRutaVieja', () => {
  test.each([
    ['/configuracion', '?pestana=vacunas&q=hexa&estado=activas', '/administracion/vacunas?q=hexa&estado=activas'],
    ['/configuracion', '?pestana=periodos', '/administracion/periodos'],
    ['/configuracion', '?pestana=poblacion&anio=2026', '/administracion/poblacion?anio=2026'],
    ['/configuracion', '', '/administracion'],
    ['/configuracion', '?pestana=otra', '/administracion'],
    ['/configuracion/vacunas/nueva', '', '/administracion/vacunas/nueva'],
    ['/configuracion/esquemas/nuevo', '?vacuna=2&origen=VACIO', '/administracion/esquemas/nuevo?vacuna=2&origen=VACIO'],
    ['/usuarios', '?estado=ACTIVA&pagina=2', '/administracion/usuarios?estado=ACTIVA&pagina=2'],
    ['/usuarios/5/editar', '', '/administracion/usuarios/5/editar'],
    ['/permisos', '', '/administracion/permisos'],
  ])('%s%s → %s', (pathname, search, destino) => {
    expect(destinoDeRutaVieja(pathname, search, todos)).toBe(destino)
  })

  test('/administracion lleva al primer hijo visible, o a /inicio si no hay ninguno', () => {
    expect(destinoDeRutaVieja('/administracion', '', todos)).toBe('/administracion/usuarios')
    expect(destinoDeRutaVieja('/administracion', '', conPermisos(REVISOR))).toBe('/administracion/vacunas')
    expect(destinoDeRutaVieja('/administracion', '', conPermisos(['VACUNA_CONSULTAR']))).toBe('/inicio')
  })
})

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

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}

function abrir(ruta, permisos) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const ubicacion = () => screen.getByTestId('ubicacion').textContent

test('un enlace viejo a una pestaña abre su pantalla con los mismos filtros', async () => {
  abrir('/configuracion?pestana=vacunas&q=hexa', REVISOR)

  expect(await screen.findByRole('heading', { level: 1, name: 'Vacunas' }, { timeout: 5000 })).toBeTruthy()
  expect(ubicacion()).toBe('/administracion/vacunas?q=hexa')
})

test('/usuarios sin USUARIO_CONSULTAR termina en /inicio', () => {
  abrir('/usuarios', REVISOR)

  expect(ubicacion()).toBe('/inicio')
})

test('/administracion sin ningún hijo visible termina en /inicio', () => {
  abrir('/administracion', ['REPORTE_CONSULTAR', 'VACUNA_CONSULTAR'])

  expect(ubicacion()).toBe('/inicio')
})
