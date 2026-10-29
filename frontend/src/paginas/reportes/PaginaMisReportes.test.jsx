import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { listarReportes } from '@/api/produccion.js'
import PaginaMisReportes from './PaginaMisReportes.jsx'

vi.mock('@/api/produccion.js', () => ({ listarReportes: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn() }))

const ESTABLECIMIENTO = { id: 1, codigo: 'CS-1201', nombre: 'Centro de Salud San Marcos' }
const PERIODOS = [
  { id: 20, anio: 2025, mes: 12 },
  { id: 29, anio: 2026, mes: 9 },
  { id: 30, anio: 2026, mes: 10 },
]

function reporte(id, mes, estado, periodoEstado, extra = {}) {
  return {
    id,
    establecimiento: ESTABLECIMIENTO,
    periodo: { id: 20 + mes, anio: 2026, mes, estado: periodoEstado },
    estado,
    actualizadoEn: '2026-10-20T15:00:00.000Z',
    estadoDesde: '2026-10-12T20:05:00.000Z',
    correccion: null,
    ...extra,
  }
}

const REPORTES = [
  reporte(287, 10, 'BORRADOR', 'ABIERTO'),
  reporte(255, 9, 'CORRECCION_SOLICITADA', 'EN_CIERRE', {
    correccion: { comentario: 'Revisar Hexavalente D1.', fecha: '2026-10-12T20:05:00.000Z' },
  }),
  reporte(240, 8, 'APROBADO', 'CERRADO'),
]

const respuesta = (elementos, extra = {}) => ({ elementos, total: elementos.length, pagina: 1, porPagina: 20, ...extra })

function Ubicacion() {
  return <output data-testid="ubicacion">{useLocation().search}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

async function abrir(ruta = '/reportes') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <PaginaMisReportes />
      <Ubicacion />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByLabelText('Cargando reportes')).toBeNull())
}

const fila = (mes) => screen.getByText(mes).closest('tr')
const nativo = (nombre) => document.querySelector(`select[name="${nombre}"]`)
const elegirFiltro = (nombre, valor) => fireEvent.change(nativo(nombre), { target: { value: String(valor) } })

beforeEach(() => {
  vi.clearAllMocks()
  listarReportes.mockResolvedValue(respuesta(REPORTES))
  listarPeriodos.mockResolvedValue(PERIODOS)
})

test('muestra cada reporte con su mes, su estado y la fecha de su último cambio de estado', async () => {
  await abrir()

  expect(screen.getByText('Mis reportes · Centro de Salud San Marcos')).toBeTruthy()
  expect(screen.getAllByRole('row')).toHaveLength(REPORTES.length + 1)
  const fecha = new Date('2026-10-12T20:05:00.000Z')
  const dos = (n) => String(n).padStart(2, '0')
  const esperada = `${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
  expect(within(fila('Octubre de 2026')).getByText('Borrador')).toBeTruthy()
  expect(within(fila('Octubre de 2026')).getByText(esperada)).toBeTruthy()
  expect(within(fila('Agosto de 2026')).getByText('Aprobado')).toBeTruthy()
  expect(listarReportes).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 })
})

test('un reporte devuelto para corrección se destaca con el comentario del revisor', async () => {
  listarReportes.mockResolvedValue(
    respuesta([
      ...REPORTES,
      reporte(230, 7, 'CORRECCION_SOLICITADA', 'CERRADO', { correccion: { comentario: null, fecha: '2026-08-10T15:00:00.000Z' } }),
    ]),
  )
  await abrir()

  const devuelto = fila('Septiembre de 2026')
  expect(within(devuelto).getByText('Corrección solicitada')).toBeTruthy()
  expect(within(devuelto).getByText('Devuelto para corrección: Revisar Hexavalente D1.')).toBeTruthy()
  expect(devuelto.className).toContain('bg-advertencia')
  expect(within(fila('Julio de 2026')).getByText('Devuelto para corrección')).toBeTruthy()
  expect(fila('Octubre de 2026').className).not.toContain('bg-advertencia')
  expect(within(fila('Octubre de 2026')).queryByText(/Devuelto para corrección/)).toBeNull()
})

test('«Abrir» solo aparece en los reportes de meses abiertos y lleva a /registro con ese mes', async () => {
  await abrir()

  const abrirOctubre = within(fila('Octubre de 2026')).getByRole('link', { name: 'Abrir' })
  expect(abrirOctubre.getAttribute('href')).toBe('/registro?periodo=30')
  expect(within(fila('Septiembre de 2026')).queryByRole('link', { name: 'Abrir' })).toBeNull()
  expect(within(fila('Agosto de 2026')).queryByRole('link', { name: 'Abrir' })).toBeNull()
})

test('elegir un año y un estado pide la página 1 con esos filtros y los pone en la URL', async () => {
  await abrir('/reportes?pagina=2')
  await waitFor(() => expect(nativo('anio').querySelector('option[value="2026"]')).toBeTruthy())

  elegirFiltro('anio', 2026)
  await waitFor(() => expect(ubicacion()).toBe('?anio=2026'))
  elegirFiltro('estado', 'ENVIADO')
  await waitFor(() => expect(ubicacion()).toBe('?anio=2026&estado=ENVIADO'))
  await waitFor(() =>
    expect(listarReportes).toHaveBeenLastCalledWith({ anio: 2026, estado: 'ENVIADO', pagina: 1, porPagina: 20 }),
  )

  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  await waitFor(() => expect(ubicacion()).toBe(''))
})

test('los años salen del calendario, sin repetir y del más reciente al más antiguo', async () => {
  await abrir()
  await waitFor(() => expect(nativo('anio').querySelector('option[value="2026"]')).toBeTruthy())

  const valores = [...nativo('anio').querySelectorAll('option')].map((o) => o.value)
  expect(valores.filter((v) => v !== 'todos')).toEqual(['2026', '2025'])
})

test('al cargar con filtros en la URL, los Select los muestran y se piden a la API', async () => {
  await abrir('/reportes?anio=2026&estado=ENVIADO')

  expect(listarReportes).toHaveBeenCalledWith({ anio: 2026, estado: 'ENVIADO', pagina: 1, porPagina: 20 })
  await waitFor(() => expect(screen.getByLabelText('Filtrar por año').textContent).toBe('2026'))
  expect(screen.getByLabelText('Filtrar por estado').textContent).toBe('Enviado')
})

test('un filtro inválido en la URL se ignora', async () => {
  await abrir('/reportes?anio=1999&estado=OTRO')

  expect(listarReportes).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 })
})

test('una página fuera de rango va a la última', async () => {
  listarReportes.mockImplementation(async ({ pagina }) =>
    pagina === 5 ? respuesta([], { total: 25, pagina: 5 }) : respuesta(REPORTES.slice(0, 1), { total: 25, pagina }),
  )
  await abrir('/reportes?pagina=5')

  await waitFor(() => expect(ubicacion()).toBe('?pagina=2'))
  expect(listarReportes).toHaveBeenLastCalledWith({ pagina: 2, porPagina: 20 })
})

test('sin reportes y sin filtros invita a crear el del mes en Registro', async () => {
  listarReportes.mockResolvedValue(respuesta([]))
  await abrir()

  expect(screen.getByText(/Todavía no tiene reportes/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Registro de producción' }).getAttribute('href')).toBe('/registro')
  expect(screen.getByRole('link', { name: 'Ir al registro' }).getAttribute('href')).toBe('/registro')
  expect(screen.getByText('Mis reportes')).toBeTruthy()
})

test('sin resultados con filtros lo dice', async () => {
  listarReportes.mockResolvedValue(respuesta([]))
  await abrir('/reportes?estado=CERRADO')

  expect(screen.getByText('No hay reportes con estos filtros.')).toBeTruthy()
  expect(screen.queryByText(/Todavía no tiene reportes/)).toBeNull()
})

test('si la carga falla muestra el mensaje y «Reintentar» vuelve a pedir la lista', async () => {
  listarReportes.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Error interno del servidor.'))
  await abrir()

  expect(screen.getByText(/Error interno del servidor\./)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getAllByRole('row')).toHaveLength(REPORTES.length + 1))
  expect(listarReportes).toHaveBeenCalledTimes(2)
})

test('si fallan los años, el filtro de año queda deshabilitado y «Reintentar» los vuelve a pedir', async () => {
  listarPeriodos.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  await abrir()

  expect(await screen.findByText('No se pudieron cargar los años: No se pudo conectar con el servidor.')).toBeTruthy()
  expect(nativo('anio').disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.queryByText(/No se pudieron cargar los años/)).toBeNull())
  expect(listarPeriodos).toHaveBeenCalledTimes(2)
})
