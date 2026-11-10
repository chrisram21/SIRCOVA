import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { listarDdriss, listarPeriodos } from '@/api/catalogos.js'
import { listarEsquemas } from '@/api/configuracion.js'
import { listarCorridas, listarResultados } from '@/api/indicadores.js'
import { listarReportes, obtenerValidacionGuardada } from '@/api/produccion.js'
import { listarRectificaciones } from '@/api/rectificaciones.js'
import { obtenerAvance, obtenerBandeja } from '@/api/revision.js'
import { listarUsuarios } from '@/api/usuarios.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn(), listarDdriss: vi.fn() }))
vi.mock('@/api/produccion.js', () => ({ listarReportes: vi.fn(), obtenerValidacionGuardada: vi.fn() }))
vi.mock('@/api/indicadores.js', () => ({
  listarCorridas: vi.fn(),
  listarResultados: vi.fn(),
  // SPEC 51: «Indicadores» la pide al abrir.
  obtenerMesesCalculados: vi.fn(() => Promise.resolve({ anios: [] })),
}))
vi.mock('@/api/revision.js', () => ({ obtenerAvance: vi.fn(), obtenerBandeja: vi.fn() }))
vi.mock('@/api/rectificaciones.js', () => ({ listarRectificaciones: vi.fn() }))
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

function crearSesion({ rol = 'ADMINISTRADOR', permisos = [], ddrissId = 1 } = {}) {
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
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId, establecimientoId: null, municipioId: null },
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
  const consultas = [
    listarPeriodos,
    listarDdriss,
    listarReportes,
    obtenerValidacionGuardada,
    listarUsuarios,
    listarEsquemas,
    listarCorridas,
    listarResultados,
    obtenerAvance,
    obtenerBandeja,
    listarRectificaciones,
  ]
  for (const consulta of consultas) {
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

test('con INDICADOR_CONSULTAR aparece un acceso a Indicadores que lleva a /indicadores', async () => {
  abrirInicio({ permisos: ['INDICADOR_CONSULTAR'] })

  const accesos = within(screen.getByRole('region', { name: 'Accesos rápidos' }))
  const enlaces = accesos.getAllByRole('link')
  expect(enlaces.map((enlace) => within(enlace).getByRole('heading', { level: 3 }).textContent)).toEqual(['Indicadores'])
  expect(enlaces[0].textContent).toContain('Cobertura, brecha, deserción y proyección por municipio y vacuna.')
  expect(enlaces[0].getAttribute('href')).toBe('/indicadores')

  fireEvent.click(enlaces[0])

  // La pantalla se carga al entrar (lazy).
  expect(await screen.findByRole('heading', { level: 1, name: 'Indicadores' }, { timeout: 5000 })).toBeTruthy()
})

const titulosDeAccesos = () =>
  within(screen.getByRole('region', { name: 'Accesos rápidos' }))
    .getAllByRole('link')
    .map((enlace) => within(enlace).getByRole('heading', { level: 3 }).textContent)

test('los hijos de «Administración» van como accesos propios, en su lugar, y no hay un acceso al padre', () => {
  abrirInicio({ permisos: ['BITACORA_CONSULTAR', 'USUARIO_CONSULTAR', 'CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR'] })

  expect(titulosDeAccesos()).toEqual(['Auditoría', 'Usuarios', 'Vacunas'])
  const vacunas = screen.getByRole('link', { name: /^Vacunas/ })
  expect(vacunas.getAttribute('href')).toBe('/administracion/vacunas')
  expect(vacunas.textContent).toContain('Las vacunas y sus dosis.')
  expect(screen.queryByRole('heading', { level: 3, name: 'Administración' })).toBeNull()
})

test('un hijo sin todos sus permisos no lleva acceso', () => {
  // Personal del establecimiento: lee vacunas para capturar, sin CONFIGURACION_CONSULTAR.
  abrirInicio({ rol: 'ESTABLECIMIENTO', permisos: ['REPORTE_CREAR', 'REPORTE_CONSULTAR', 'VACUNA_CONSULTAR'] })

  expect(titulosDeAccesos()).toEqual(['Registro de producción', 'Mis reportes'])
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
      { id: 10, anio: 2026, mes: 10, estado: 'ABIERTO', fechaLimiteEnvio: '2026-11-10' },
      { id: 9, anio: 2026, mes: 9, estado: 'ABIERTO', fechaLimiteEnvio: '2026-10-10' },
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
    const validaciones = within(tarjeta('Validaciones pendientes'))
    expect(validaciones.getByText('Todavía no ha creado el reporte de octubre de 2026.')).toBeTruthy()
    expect(obtenerValidacionGuardada).not.toHaveBeenCalled()
    expect(screen.getAllByText('Sin datos todavía')).toHaveLength(2)
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

describe('resumen por rol (SPEC 48)', () => {
  const tarjeta = (titulo) => screen.getByText(titulo).closest('[data-slot="card"]')
  const AVANCE = {
    periodo: { id: 9, anio: 2026, mes: 9, estado: 'EN_CIERRE', fechaLimiteEnvio: '2026-10-10' },
    esperados: 31,
    conteos: { SIN_ENVIAR: 9, ENVIADO: 5, EN_REVISION: 5, CORRECCION_SOLICITADA: 1, APROBADO: 11, CERRADO: 0 },
  }
  const fila = (codigo, municipio, valores) => ({
    indicadorCodigo: codigo,
    municipio,
    valor: null,
    meta: 100,
    cumpleMeta: null,
    calculable: true,
    color: null,
    ...valores,
  })
  const municipio = (id, nombre) => ({ id, nombre })
  const corridaDe = (indicadores, extra = {}) => ({
    id: 95,
    parcial: false,
    finalizadaEn: '2026-10-27T16:00:00.000Z',
    indicadores,
    ...extra,
  })
  const AVANCE_HEXA3 = { codigo: 'AVANCE_HEXA3', nombre: 'Avance de Hexavalente 3.ª dosis', tipoCalculo: 'AVANCE_META_MES' }
  const PROY = { codigo: 'PROY_COB_HEXA3', nombre: 'Proyección', tipoCalculo: 'PROYECCION' }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(2026, 9, 28, 10, 0, 0))
    listarCorridas.mockResolvedValue({ elementos: [{ id: 95, mesHasta: 9, vigente: true, estado: 'COMPLETADA' }] })
  })

  test('EPIDEMIOLOGIA ve la cobertura con su semáforo, los municipios en meta, los reportes cerrados y el avance del cierre', async () => {
    listarResultados.mockResolvedValue({
      corrida: corridaDe([AVANCE_HEXA3], { parcial: true }),
      resultados: [
        fila('AVANCE_HEXA3', null, { valor: 93.8, cumpleMeta: false, color: 'amarillo' }),
        fila('AVANCE_HEXA3', municipio(1, 'San Marcos'), { valor: 104, cumpleMeta: true, color: 'verde' }),
        fila('AVANCE_HEXA3', municipio(2, 'Tacaná'), { valor: 60, cumpleMeta: false, color: 'rojo' }),
        fila('AVANCE_HEXA3', municipio(3, 'Sibinal'), { calculable: false }),
      ],
    })
    obtenerAvance.mockResolvedValue(AVANCE)
    abrirInicio({ rol: 'EPIDEMIOLOGIA', permisos: ['INDICADOR_CONSULTAR', 'REPORTE_AVANCE_CONSULTAR'] })

    const cobertura = within(tarjeta('Cobertura departamental'))
    const valor = await cobertura.findByText('93.8 %')
    expect(valor.className).toContain('bg-advertencia')
    expect(cobertura.getByText('6.2 puntos bajo la meta del mes de 100 %')).toBeTruthy()
    expect(cobertura.getByText('Avance de Hexavalente 3.ª dosis')).toBeTruthy()
    expect(cobertura.getByRole('link', { name: 'Ver indicadores' }).getAttribute('href')).toBe('/indicadores?anio=2026&mes=9')
    expect(listarCorridas).toHaveBeenCalledWith({ anio: 2026, ddrissId: undefined })
    expect(listarResultados).toHaveBeenCalledWith({ anio: 2026, mes: 9, ddrissId: undefined })

    const enMeta = within(tarjeta('Municipios en meta'))
    expect(enMeta.getByText('de 3').parentElement.textContent).toBe('1 de 3')
    expect(enMeta.getByText('1 municipio con brecha · 1 sin población')).toBeTruthy()

    expect(screen.getByText('Datos con corte a septiembre de 2026 · calculado 27/10/2026')).toBeTruthy()
    expect(screen.getByText('Parcial')).toBeTruthy()

    const cerrados = within(tarjeta('Reportes cerrados del mes'))
    expect((await cerrados.findByText('de 31')).parentElement.textContent).toBe('0 de 31')
    expect(cerrados.getByText('Septiembre de 2026 · envío hasta 10/10/2026')).toBeTruthy()

    const cierre = within(tarjeta('Avance del cierre de septiembre de 2026'))
    expect(cierre.getByRole('img', { name: 'Reportes del mes por estado' })).toBeTruthy()
    expect(cierre.getByLabelText('Aprobado: 11')).toBeTruthy()
    expect(cierre.queryByLabelText('Cerrado: 0')).toBeNull()
    const leyenda = within(cierre.getByRole('list', { name: 'Leyenda del avance' })).getAllByRole('listitem')
    expect(leyenda.map((item) => item.textContent)).toEqual([
      'Cerrado0',
      'Aprobado11',
      'En revisión5',
      'Corrección solicitada1',
      'Enviado5',
      'Sin enviar9',
    ])
    // Sin REPORTE_REVISAR no lleva a la bandeja.
    expect(cierre.queryByRole('link', { name: 'Ir a revisión' })).toBeNull()
    expect(screen.getAllByText('Sin datos todavía')).toHaveLength(1)
    expect(document.querySelector('svg.recharts-surface, canvas')).toBeNull()
  })

  test('sin corridas en el año ni en el anterior, las tarjetas de indicadores lo dicen', async () => {
    listarCorridas.mockResolvedValue({ elementos: [] })
    obtenerAvance.mockResolvedValue(AVANCE)
    abrirInicio({ rol: 'EPIDEMIOLOGIA', permisos: ['INDICADOR_CONSULTAR', 'REPORTE_AVANCE_CONSULTAR'] })

    expect(await screen.findAllByText('Todavía no hay indicadores calculados.')).toHaveLength(2)
    expect(listarCorridas).toHaveBeenCalledWith({ anio: 2025, ddrissId: undefined })
    expect(listarResultados).not.toHaveBeenCalled()
  })

  test('AUTORIDAD nacional ve el avance, la proyección como estimación y el ranking, y elige la DDRISS', async () => {
    listarDdriss.mockResolvedValue([
      { id: 1, nombre: 'DDRISS San Marcos' },
      { id: 2, nombre: 'DDRISS Otra' },
    ])
    listarResultados.mockResolvedValue({
      corrida: corridaDe([AVANCE_HEXA3, PROY]),
      resultados: [
        fila('AVANCE_HEXA3', null, { valor: 80, cumpleMeta: false }),
        ...[
          ['Ocós', 70],
          ['Tacaná', 40],
          ['Sibinal', 40],
          ['Malacatán', 95],
          ['Tajumulco', 55],
          ['San Pablo', 62],
        ].map(([nombre, valor], i) => fila('AVANCE_HEXA3', municipio(i + 1, nombre), { valor })),
        fila('AVANCE_HEXA3', municipio(9, 'Ixchiguán'), { calculable: false }),
        fila('PROY_COB_HEXA3', null, { valor: 85, meta: 95, cumpleMeta: false }),
      ],
    })
    abrirInicio({ rol: 'AUTORIDAD', ddrissId: null, permisos: ['INDICADOR_CONSULTAR', 'DDRISS_CONSULTAR'] })

    const ranking = within(tarjeta('Ranking de municipios'))
    const lista = await ranking.findByRole('list', { name: 'Municipios de menor avance' })
    expect(within(lista).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'Sibinal40.0 %',
      'Tacaná40.0 %',
      'Tajumulco55.0 %',
      'San Pablo62.0 %',
      'Ocós70.0 %',
    ])
    expect(ranking.getByRole('link', { name: 'Ver indicadores' }).getAttribute('href')).toBe(
      '/indicadores?anio=2026&mes=9&ddriss=1',
    )
    expect(listarCorridas).toHaveBeenCalledWith({ anio: 2026, ddrissId: 1 })

    const proyeccion = within(tarjeta('Avance y proyección'))
    expect(proyeccion.getByText('Estimación')).toBeTruthy()
    expect(proyeccion.getByText('85.0 %')).toBeTruthy()
    expect(proyeccion.getByText('No llega a la meta de 95 %')).toBeTruthy()

    const clave = within(tarjeta('Indicadores clave'))
    expect(clave.getByText('20.0 puntos bajo la meta del mes de 100 %')).toBeTruthy()
    expect(clave.getByText(/municipios en meta/).textContent).toBe('0 de 7 municipios en meta')

    fireEvent.change(document.querySelector('select[name="ddriss"]'), { target: { value: '2' } })
    await vi.waitFor(() => expect(listarCorridas).toHaveBeenCalledWith({ anio: 2026, ddrissId: 2 }))
  })

  test('AUTORIDAD con DDRISS ve la suya, sin selector', async () => {
    listarResultados.mockResolvedValue({ corrida: corridaDe([AVANCE_HEXA3]), resultados: [fila('AVANCE_HEXA3', null, { valor: 90 })] })
    abrirInicio({ rol: 'AUTORIDAD', permisos: ['INDICADOR_CONSULTAR', 'DDRISS_CONSULTAR'] })

    expect(await within(tarjeta('Indicadores clave')).findByText('90.0 %')).toBeTruthy()
    expect(document.querySelector('select[name="ddriss"]')).toBeNull()
    expect(listarDdriss).not.toHaveBeenCalled()
    expect(listarCorridas).toHaveBeenCalledWith({ anio: 2026, ddrissId: undefined })
  })

  test('AUTORIDAD nacional con una sola DDRISS la nombra en la línea del corte, sin selector', async () => {
    listarDdriss.mockResolvedValue([{ id: 1, nombre: 'DDRISS San Marcos' }])
    listarResultados.mockResolvedValue({ corrida: corridaDe([AVANCE_HEXA3]), resultados: [fila('AVANCE_HEXA3', null, { valor: 90 })] })
    abrirInicio({ rol: 'AUTORIDAD', ddrissId: null, permisos: ['INDICADOR_CONSULTAR', 'DDRISS_CONSULTAR'] })

    expect(await screen.findByText('DDRISS San Marcos · Datos con corte a septiembre de 2026 · calculado 27/10/2026')).toBeTruthy()
    expect(document.querySelector('select[name="ddriss"]')).toBeNull()
  })

  test('REVISOR ve el estado del mes que se cierra, su bandeja, las rectificaciones pendientes y el avance', async () => {
    obtenerAvance.mockResolvedValue(AVANCE)
    obtenerBandeja.mockResolvedValue({ conteos: { POR_ATENDER: 10, ASIGNADOS_A_MI: 1 } })
    listarRectificaciones.mockResolvedValue({ total: 2, elementos: [] })
    listarPeriodos.mockResolvedValue([])
    abrirInicio({
      rol: 'REVISOR',
      permisos: ['REPORTE_AVANCE_CONSULTAR', 'REPORTE_REVISAR', 'RECTIFICACION_CONSULTAR', 'PERIODO_CONSULTAR'],
    })

    const estado = within(tarjeta('Estado de los reportes del periodo'))
    expect((await estado.findByText('de 31')).parentElement.textContent).toBe('0 de 31')
    expect(estado.getByText('Cerrados de septiembre de 2026, mes en cierre.')).toBeTruthy()

    const bandeja = within(tarjeta('Bandeja de pendientes'))
    expect(await bandeja.findByText('10')).toBeTruthy()
    expect(bandeja.getByText('Por atender en septiembre de 2026 · 1 asignado a mí')).toBeTruthy()
    expect(bandeja.getByRole('link', { name: 'Ir a revisión' }).getAttribute('href')).toBe('/revision?periodo=9')
    expect(obtenerBandeja).toHaveBeenCalledWith({ periodoId: 9, porPagina: 1 })
    expect(obtenerAvance).toHaveBeenCalledTimes(1)

    const rectificaciones = within(tarjeta('Solicitudes de rectificación'))
    expect(await rectificaciones.findByText('Solicitudes por resolver')).toBeTruthy()
    expect(listarRectificaciones).toHaveBeenCalledWith({ estado: 'PENDIENTE', porPagina: 1 })

    const cierre = within(tarjeta('Avance del cierre de septiembre de 2026'))
    expect(cierre.getByRole('link', { name: 'Ir a revisión' }).getAttribute('href')).toBe('/revision?periodo=9')
    expect(screen.getAllByText('Sin datos todavía')).toHaveLength(1)
  })

  test('si falla una tarjeta, muestra «Reintentar» y las demás cargan', async () => {
    const { ErrorApi } = await import('@/api/cliente.js')
    obtenerAvance.mockResolvedValue(AVANCE)
    obtenerBandeja.mockResolvedValue({ conteos: { POR_ATENDER: 10, ASIGNADOS_A_MI: 0 } })
    listarRectificaciones
      .mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
      .mockResolvedValueOnce({ total: 1, elementos: [] })
    abrirInicio({ rol: 'REVISOR', permisos: ['REPORTE_AVANCE_CONSULTAR', 'REPORTE_REVISAR', 'RECTIFICACION_CONSULTAR'] })

    const rectificaciones = within(tarjeta('Solicitudes de rectificación'))
    expect(await rectificaciones.findByText('No se pudo conectar con el servidor.')).toBeTruthy()
    expect(await within(tarjeta('Bandeja de pendientes')).findByText('10')).toBeTruthy()
    fireEvent.click(rectificaciones.getByRole('button', { name: 'Reintentar' }))
    expect(await rectificaciones.findByText('Solicitud por resolver')).toBeTruthy()
  })

  test('REVISOR sin meses en la DDRISS lo dice y no pide la bandeja', async () => {
    obtenerAvance.mockResolvedValue({ periodo: null, esperados: 0, conteos: AVANCE.conteos })
    abrirInicio({ rol: 'REVISOR', permisos: ['REPORTE_AVANCE_CONSULTAR', 'REPORTE_REVISAR'] })

    expect(await within(tarjeta('Bandeja de pendientes')).findByText('No hay meses abiertos ni cerrados.')).toBeTruthy()
    expect(within(tarjeta('Estado de los reportes del periodo')).getByText('No hay meses abiertos ni cerrados.')).toBeTruthy()
    expect(obtenerBandeja).not.toHaveBeenCalled()
  })

  test.each([
    [
      'con errores y advertencias abiertas',
      {
        validadoEn: '2026-10-20T10:00:00.000Z',
        resultados: [
          { estado: 'ABIERTO', severidad: 'ERROR' },
          { estado: 'ABIERTO', severidad: 'ADVERTENCIA' },
          { estado: 'JUSTIFICADO', severidad: 'ADVERTENCIA' },
        ],
      },
      '1 error · 1 advertencia',
    ],
    ['sin validar', { validadoEn: null, resultados: [] }, 'Sin validar todavía.'],
    [
      'con todo justificado',
      { validadoEn: '2026-10-20T10:00:00.000Z', resultados: [{ estado: 'JUSTIFICADO', severidad: 'ADVERTENCIA' }] },
      'Sin observaciones pendientes.',
    ],
  ])('ESTABLECIMIENTO ve las validaciones de su reporte del mes %s', async (_, validacion, texto) => {
    listarPeriodos.mockResolvedValue([{ id: 10, anio: 2026, mes: 10, estado: 'ABIERTO', fechaLimiteEnvio: '2026-11-10' }])
    listarReportes.mockResolvedValue({ elementos: [{ id: 250, estado: 'BORRADOR' }] })
    obtenerValidacionGuardada.mockResolvedValue(validacion)
    abrirInicio({ rol: 'ESTABLECIMIENTO', permisos: ['PERIODO_CONSULTAR', 'REPORTE_CONSULTAR'] })

    const validaciones = within(tarjeta('Validaciones pendientes'))
    expect(await validaciones.findByText(texto)).toBeTruthy()
    expect(obtenerValidacionGuardada).toHaveBeenCalledWith(250)
    expect(listarPeriodos).toHaveBeenCalledTimes(1)
  })
})
