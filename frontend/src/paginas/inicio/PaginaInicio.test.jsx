import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))

const TARJETAS_POR_ROL = {
  ESTABLECIMIENTO: [
    'Estado y fecha límite de mi reporte',
    'Validaciones pendientes',
    'Cobertura de mi municipio',
    'Tendencia mensual',
  ],
  REVISOR: [
    'Estado de los reportes del periodo',
    'Bandeja de pendientes',
    'Alertas de calidad y de proceso',
    'Periodos por cerrar',
    'Solicitudes de rectificación',
  ],
  EPIDEMIOLOGIA: ['Cobertura departamental', 'Municipios en meta', 'Reportes cerrados del mes', 'Alertas activas'],
  AUTORIDAD: ['Indicadores clave', 'Avance y proyección', 'Ranking de municipios'],
  ADMINISTRADOR: [
    'Usuarios activos',
    'Esquemas de captura vigentes o por vencer',
    'Cambios en catálogos',
    'Actividad de la bitácora',
  ],
}

function crearSesion({ rol = 'ADMINISTRADOR', permisos = [] } = {}) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol,
      rolNombre: 'Nombre del rol',
      permisos,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrirInicio(opciones) {
  guardarSesion(crearSesion(opciones))
  render(
    <MemoryRouter initialEntries={['/inicio']}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const saludo = () => screen.getByRole('heading', { level: 1 }).textContent

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

test.each(Object.keys(TARJETAS_POR_ROL))('%s ve sus tarjetas sin datos y no las de otro rol', (rol) => {
  abrirInicio({ rol })

  for (const titulo of TARJETAS_POR_ROL[rol]) expect(screen.getByText(titulo)).toBeTruthy()
  const ajenas = Object.entries(TARJETAS_POR_ROL)
    .filter(([otro]) => otro !== rol)
    .flatMap(([, titulos]) => titulos)
    .filter((titulo) => !TARJETAS_POR_ROL[rol].includes(titulo))
  for (const titulo of ajenas) expect(screen.queryByText(titulo)).toBeNull()
  expect(screen.getAllByText('Sin datos todavía')).toHaveLength(TARJETAS_POR_ROL[rol].length)
})

test('un código de rol desconocido muestra solo el saludo', () => {
  abrirInicio({ rol: 'OTRO' })

  expect(saludo()).toMatch(/^Buen/)
  expect(screen.queryByText('Sin datos todavía')).toBeNull()
  expect(screen.queryByRole('region', { name: 'Accesos rápidos' })).toBeNull()
})

test('sin permisos no aparece "Accesos rápidos"', () => {
  abrirInicio({ permisos: [] })

  expect(screen.queryByRole('region', { name: 'Accesos rápidos' })).toBeNull()
})

test('con INDICADOR_CONSULTAR aparece un acceso a Indicadores que lleva a /indicadores', () => {
  abrirInicio({ permisos: ['INDICADOR_CONSULTAR'] })

  const accesos = within(screen.getByRole('region', { name: 'Accesos rápidos' }))
  const enlaces = accesos.getAllByRole('link')
  expect(enlaces.map((enlace) => enlace.textContent)).toEqual(['Indicadores'])
  expect(enlaces[0].getAttribute('href')).toBe('/indicadores')

  fireEvent.click(enlaces[0])

  expect(screen.getByText('Esta pantalla está en construcción.')).toBeTruthy()
})

test.each([
  [8, 'Buenos días'],
  [15, 'Buenas tardes'],
  [21, 'Buenas noches'],
  [3, 'Buenas noches'],
])('a las %i h el saludo es "%s"', (hora, esperado) => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 20, hora, 0, 0))
  abrirInicio()

  expect(saludo()).toBe(esperado)
})

test('la pantalla inicial no contiene gráficas', () => {
  abrirInicio({ permisos: ['INDICADOR_CONSULTAR'] })

  expect(document.querySelector('svg.recharts-surface, canvas')).toBeNull()
})
