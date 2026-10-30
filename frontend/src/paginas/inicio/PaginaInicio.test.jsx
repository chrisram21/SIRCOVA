import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { listarPeriodos } from '@/api/catalogos.js'
import { listarEsquemas } from '@/api/configuracion.js'
import { listarReportes } from '@/api/produccion.js'
import { listarUsuarios } from '@/api/usuarios.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn() }))
vi.mock('@/api/produccion.js', () => ({ listarReportes: vi.fn() }))
vi.mock('@/api/usuarios.js', () => ({ listarUsuarios: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({ listarEsquemas: vi.fn() }))

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
  // Sin respuesta, salvo en las pruebas de cada tarjeta con datos.
  for (const consulta of [listarPeriodos, listarReportes, listarUsuarios, listarEsquemas]) {
    consulta.mockReset()
    consulta.mockReturnValue(new Promise(() => {}))
  }
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
  expect(enlaces.map((enlace) => within(enlace).getByRole('heading', { level: 3 }).textContent)).toEqual(['Indicadores'])
  expect(enlaces[0].textContent).toContain('Cobertura, brecha, deserción y proyección por municipio y vacuna.')
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

describe('tarjetas con datos', () => {
  const tarjeta = (titulo) => screen.getByText(titulo).closest('[data-slot="card"]')

  test('ESTABLECIMIENTO ve el mes que le toca reportar, su estado, la fecha límite y el enlace al registro', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0, 0))
    listarPeriodos.mockResolvedValue([
      { id: 10, anio: 2026, mes: 10, fechaLimiteEnvio: '2026-11-10' },
      { id: 9, anio: 2026, mes: 9, fechaLimiteEnvio: '2026-10-10' },
    ])
    listarReportes.mockImplementation(async ({ periodoId }) => ({
      elementos: periodoId === 9 ? [{ id: 250, estado: 'EN_REVISION' }] : [],
    }))
    abrirInicio({ rol: 'ESTABLECIMIENTO', permisos: ['PERIODO_CONSULTAR', 'REPORTE_CONSULTAR'] })

    const miReporte = within(tarjeta('Estado y fecha límite de mi reporte'))
    expect(await miReporte.findByText('octubre de 2026')).toBeTruthy()
    expect(miReporte.getByText('Sin crear')).toBeTruthy()
    expect(miReporte.getByText(/Fecha límite:/).textContent).toBe('Fecha límite: 10/11/2026 · vence en 13 días')
    expect(miReporte.getByRole('link', { name: 'Ir al registro' }).getAttribute('href')).toBe('/registro?periodo=10')
    expect(screen.getAllByText('Sin datos todavía')).toHaveLength(3)
  })

  test('ESTABLECIMIENTO sin meses abiertos lo dice, sin enlace', async () => {
    listarPeriodos.mockResolvedValue([])
    abrirInicio({ rol: 'ESTABLECIMIENTO', permisos: ['PERIODO_CONSULTAR', 'REPORTE_CONSULTAR'] })

    const miReporte = within(tarjeta('Estado y fecha límite de mi reporte'))
    expect(await miReporte.findByText('No hay meses abiertos para reportar.')).toBeTruthy()
    expect(miReporte.queryByRole('link')).toBeNull()
  })

  test('si falla la consulta, la tarjeta muestra el error y «Reintentar» vuelve a pedir', async () => {
    const { ErrorApi } = await import('@/api/cliente.js')
    listarPeriodos.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
    listarPeriodos.mockResolvedValueOnce([])
    abrirInicio({ rol: 'ESTABLECIMIENTO', permisos: ['PERIODO_CONSULTAR', 'REPORTE_CONSULTAR'] })

    const miReporte = within(tarjeta('Estado y fecha límite de mi reporte'))
    expect(await miReporte.findByText('No se pudo conectar con el servidor.')).toBeTruthy()
    fireEvent.click(miReporte.getByRole('button', { name: 'Reintentar' }))
    expect(await miReporte.findByText('No hay meses abiertos para reportar.')).toBeTruthy()
    expect(listarPeriodos).toHaveBeenCalledTimes(2)
  })

  test('ADMINISTRADOR ve las cuentas activas y bloqueadas, y los esquemas vigentes y por publicar', async () => {
    listarUsuarios.mockImplementation(async ({ estado }) => ({ total: estado === 'ACTIVA' ? 42 : 1, elementos: [] }))
    listarEsquemas.mockResolvedValue([
      { vacuna: { activa: true }, vigente: { id: 'a' }, borrador: null },
      { vacuna: { activa: true }, vigente: null, borrador: { id: 'b' } },
      { vacuna: { activa: false }, vigente: null, borrador: { id: 'c' } },
    ])
    abrirInicio({ rol: 'ADMINISTRADOR', permisos: ['USUARIO_CONSULTAR', 'ESQUEMA_CONSULTAR'] })

    const usuarios = within(tarjeta('Usuarios activos'))
    expect(await usuarios.findByText('42')).toBeTruthy()
    expect(usuarios.getByText('1 bloqueada por intentos fallidos')).toBeTruthy()
    expect(listarUsuarios).toHaveBeenCalledWith({ estado: 'ACTIVA', porPagina: 1 })

    const esquemas = within(tarjeta('Esquemas de captura vigentes o por vencer'))
    expect((await esquemas.findByText('de 2')).parentElement.textContent).toBe('1 de 2')
    expect(esquemas.getByText('1 sin esquema vigente · 2 borradores por publicar')).toBeTruthy()
    expect(esquemas.getByRole('link', { name: 'Ver esquemas' }).getAttribute('href')).toBe('/administracion/esquemas')
  })

  test('REVISOR ve cuántos meses tiene abiertos y el plazo del más antiguo', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0, 0))
    listarPeriodos.mockResolvedValue([
      { id: 10, anio: 2026, mes: 10, fechaLimiteEnvio: '2026-11-10' },
      { id: 9, anio: 2026, mes: 9, fechaLimiteEnvio: '2026-10-10' },
    ])
    abrirInicio({ rol: 'REVISOR', permisos: ['PERIODO_CONSULTAR'] })

    const periodos = within(tarjeta('Periodos por cerrar'))
    expect(await periodos.findByText('2')).toBeTruthy()
    expect(
      periodos.getByText(/el más antiguo es/).textContent,
    ).toBe('Meses abiertos: el más antiguo es septiembre de 2026, envío hasta 10/10/2026 (venció hace 18 días).')
  })
})
