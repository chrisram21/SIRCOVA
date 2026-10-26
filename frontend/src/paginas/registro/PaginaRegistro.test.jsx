import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { crearReporte, listarReportes, obtenerFormulario, obtenerReporte } from '@/api/produccion.js'
import PaginaRegistro from './PaginaRegistro.jsx'

vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn() }))
vi.mock('@/api/produccion.js', () => ({
  listarReportes: vi.fn(),
  obtenerReporte: vi.fn(),
  crearReporte: vi.fn(),
  obtenerFormulario: vi.fn(),
  guardarVacuna: vi.fn(),
}))

const SEPTIEMBRE = { id: 9, anio: 2026, mes: 9, estado: 'ABIERTO', fechaLimiteEnvio: '2026-10-10' }
const OCTUBRE = { id: 10, anio: 2026, mes: 10, estado: 'ABIERTO', fechaLimiteEnvio: '2026-11-10' }

const ESTABLECIMIENTO = { id: 1, codigo: 'CS-1201', nombre: 'Centro de Salud San Marcos' }
const resumen = (id, periodo, estado = 'BORRADOR') => ({
  id,
  establecimiento: ESTABLECIMIENTO,
  periodo: { id: periodo.id, anio: periodo.anio, mes: periodo.mes },
  estado,
  actualizadoEn: '2026-10-25T15:04:00.000Z',
})
const pagina = (...elementos) => ({ elementos, total: elementos.length, pagina: 1, porPagina: 20 })

const HEXAVALENTE = {
  id: 51,
  vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
  esquema: { id: 'e-hexa', version: 2 },
  dosis: [
    { codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true },
    { codigo: 'D2', nombre: '2.ª dosis', orden: 2, activa: true },
    { codigo: 'R1', nombre: 'Refuerzo', orden: 3, activa: false },
  ],
  dimensiones: [
    {
      codigo: 'grupo_edad',
      nombre: 'Grupo de edad',
      etiqueta: null,
      valores: [
        { codigo: 'MENOR_1', etiqueta: '< 1 año', orden: 1, activo: true },
        { codigo: '1_A_5', etiqueta: 'De 1 a < 6 años', orden: 4, activo: true },
      ],
    },
  ],
}
const TD = {
  id: 52,
  vacuna: { id: 4, codigo: 'TD', nombre: 'Td' },
  esquema: { id: 'e-td', version: 5 },
  dosis: [{ codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true }],
  dimensiones: [
    {
      codigo: 'condicion',
      nombre: 'Condición',
      etiqueta: 'Condición: embarazada o no',
      valores: [
        { codigo: 'EMBARAZADA', etiqueta: 'Embarazada', orden: 1, activo: true },
        { codigo: 'NO_EMBARAZADA', etiqueta: 'No embarazada', orden: 2, activo: true },
      ],
    },
  ],
}
const detalle = (id, periodo, estado = 'BORRADOR') => ({
  ...resumen(id, periodo, estado),
  periodo: { ...periodo },
  numeroRectificacion: 0,
  versionFila: 1,
  creadoEn: '2026-10-25T15:04:00.000Z',
  vacunas: [HEXAVALENTE, TD],
})

// La captura se prueba en CapturaReporte.test.jsx; aquí basta con que el formulario cargue (sin esquemas).
const formularioDe = (reporteId) => ({
  reporteId,
  versionFila: 1,
  editable: true,
  municipioPropio: { id: 1, nombre: 'San Marcos' },
  vacunas: [3, 4].map((vacunaId) => ({ vacunaId, esquema: null, celdas: [], datosAdicionales: null, totalDeclarado: null })),
})

// reportesPorMes: periodoId → resumen del reporte de ese mes (sin clave: el mes no tiene reporte).
function prepararApi({ periodos = [SEPTIEMBRE, OCTUBRE], reportesPorMes = {} } = {}) {
  obtenerFormulario.mockImplementation(async (id) => formularioDe(id))
  listarPeriodos.mockResolvedValue(periodos)
  listarReportes.mockImplementation(async ({ periodoId }) =>
    reportesPorMes[periodoId] ? pagina(reportesPorMes[periodoId]) : pagina(),
  )
  obtenerReporte.mockImplementation(async (id) => {
    const encontrado = Object.values(reportesPorMes).find((r) => r.id === id)
    const periodo = periodos.find((p) => p.id === encontrado.periodo.id)
    return detalle(id, periodo, encontrado.estado)
  })
}

function montar(ruta = '/registro') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <Routes>
        <Route path="/registro" element={<PaginaRegistro />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrir(ruta) {
  montar(ruta)
  await waitFor(() => expect(screen.queryByLabelText('Cargando registro')).toBeNull())
}

const titulo = () => screen.getByRole('heading', { level: 1 }).textContent
const mesElegido = () => document.querySelector('select[name="periodo"]').value

beforeEach(() => {
  vi.clearAllMocks()
})

test('sin meses abiertos muestra el mensaje y nada más', async () => {
  prepararApi({ periodos: [] })
  await abrir()

  expect(listarPeriodos).toHaveBeenCalledWith({ estado: 'ABIERTO' })
  expect(screen.getByText('No hay meses abiertos para reportar. La DDRISS abre cada mes en Configuración.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Crear reporte/ })).toBeNull()
  expect(document.querySelector('select[name="periodo"]')).toBeNull()
})

test('con septiembre enviado y octubre sin reporte, abre en octubre con el botón para crearlo', async () => {
  prepararApi({ reportesPorMes: { 9: resumen(7, SEPTIEMBRE, 'ENVIADO') } })
  await abrir()

  expect(listarReportes).toHaveBeenCalledWith({ periodoId: 9 })
  expect(listarReportes).toHaveBeenCalledWith({ periodoId: 10 })
  expect(titulo()).toBe('Reporte mensual de octubre de 2026')
  expect(mesElegido()).toBe('10')
  expect(screen.getByText('10/11/2026')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Crear reporte de octubre de 2026' })).toBeTruthy()
  expect(obtenerReporte).not.toHaveBeenCalled()
})

test('con los dos meses sin reporte abre en el más antiguo', async () => {
  prepararApi({ periodos: [OCTUBRE, SEPTIEMBRE] })
  await abrir()

  expect(titulo()).toBe('Reporte mensual de septiembre de 2026')
  expect(screen.getByRole('button', { name: 'Crear reporte de septiembre de 2026' })).toBeTruthy()
})

test('si todos los meses tienen el reporte enviado, abre en el más reciente', async () => {
  prepararApi({ reportesPorMes: { 9: resumen(7, SEPTIEMBRE, 'APROBADO'), 10: resumen(8, OCTUBRE, 'ENVIADO') } })
  await abrir()

  expect(titulo()).toBe('Reporte mensual de octubre de 2026')
  await waitFor(() => expect(obtenerReporte).toHaveBeenCalledWith(8))
})

test('?periodo= manda sobre el mes pendiente, y elegir otro mes lo cambia', async () => {
  prepararApi({ reportesPorMes: { 9: resumen(7, SEPTIEMBRE, 'ENVIADO') } })
  await abrir('/registro?periodo=9')

  expect(titulo()).toBe('Reporte mensual de septiembre de 2026')
  await waitFor(() => expect(screen.getByRole('list', { name: 'Estado del reporte' })).toBeTruthy())

  fireEvent.change(document.querySelector('select[name="periodo"]'), { target: { value: '10' } })
  await waitFor(() => expect(titulo()).toBe('Reporte mensual de octubre de 2026'))
  expect(screen.getByRole('button', { name: 'Crear reporte de octubre de 2026' })).toBeTruthy()
})

test('«Crear reporte» lo crea con el mes y muestra el encabezado, los pasos y las pestañas', async () => {
  prepararApi()
  crearReporte.mockResolvedValue(detalle(20, SEPTIEMBRE))
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Crear reporte de septiembre de 2026' }))

  await waitFor(() => expect(crearReporte).toHaveBeenCalledWith(9))
  await waitFor(() => expect(screen.getByRole('list', { name: 'Estado del reporte' })).toBeTruthy())
  expect(screen.getByText('Registro de producción · Centro de Salud San Marcos')).toBeTruthy()
  const pasos = within(screen.getByRole('list', { name: 'Estado del reporte' })).getAllByRole('listitem')
  expect(pasos.map((p) => p.textContent)).toEqual(['Borrador', 'Enviado', 'En revisión', 'Aprobado', 'Cerrado'])
  expect(pasos[0].getAttribute('aria-current')).toBe('step')
  expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['Hexavalente', 'Td'])
  expect(obtenerFormulario).toHaveBeenCalledWith(20)
  expect(screen.queryByRole('button', { name: /Crear reporte/ })).toBeNull()
  // El detalle llega con la respuesta del POST: no se vuelve a pedir.
  expect(obtenerReporte).not.toHaveBeenCalled()
})

test('con el reporte del mes, monta la captura: pide su formulario y muestra una pestaña por vacuna', async () => {
  prepararApi({ reportesPorMes: { 9: resumen(7, SEPTIEMBRE) } })
  await abrir()

  await waitFor(() => expect(obtenerFormulario).toHaveBeenCalledWith(7))
  expect((await screen.findAllByRole('tab')).map((t) => t.textContent)).toEqual(['Hexavalente', 'Td'])
  expect(screen.queryByText('La captura de esta vacuna se habilita con el formulario de registro.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Guardar borrador' })).toBeTruthy()
})

test('un 422 al crear muestra su mensaje', async () => {
  prepararApi()
  crearReporte.mockRejectedValue(
    new ErrorApi(422, 'SIN_ESQUEMAS', 'No hay formularios de captura publicados para este mes.'),
  )
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Crear reporte de septiembre de 2026' }))

  expect(await screen.findByText('No hay formularios de captura publicados para este mes.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Crear reporte de septiembre de 2026' }).disabled).toBe(false)
})

test('un 409 REPORTE_EXISTENTE carga el reporte que ya existe', async () => {
  prepararApi()
  crearReporte.mockRejectedValue(new ErrorApi(409, 'REPORTE_EXISTENTE', 'Ya existe el reporte de este mes.'))
  await abrir()
  // Otra sesión lo creó mientras tanto.
  const existente = resumen(30, SEPTIEMBRE)
  listarReportes.mockResolvedValue(pagina(existente))
  obtenerReporte.mockResolvedValue(detalle(30, SEPTIEMBRE))

  fireEvent.click(screen.getByRole('button', { name: 'Crear reporte de septiembre de 2026' }))

  await waitFor(() => expect(obtenerReporte).toHaveBeenCalledWith(30))
  expect(await screen.findByRole('list', { name: 'Estado del reporte' })).toBeTruthy()
  expect(screen.queryByText('Ya existe el reporte de este mes.')).toBeNull()
})

test('un reporte en corrección solicitada muestra la insignia junto a los pasos', async () => {
  prepararApi({ reportesPorMes: { 9: resumen(7, SEPTIEMBRE, 'CORRECCION_SOLICITADA') } })
  await abrir('/registro?periodo=9')

  const pasos = await screen.findByRole('list', { name: 'Estado del reporte' })
  expect(screen.getByText('Corrección solicitada')).toBeTruthy()
  expect(within(pasos).getByText('En revisión').getAttribute('aria-current')).toBe('step')
})

test('si falla la carga lo dice y permite reintentar', async () => {
  prepararApi({ periodos: [] })
  listarPeriodos.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  montar()

  expect(await screen.findByText('No se pudieron cargar los meses abiertos: No se pudo conectar con el servidor.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText(/No hay meses abiertos para reportar/)).toBeTruthy()
})
