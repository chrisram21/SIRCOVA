import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { listarAlertas } from '@/api/alertas.js'
import TarjetaAlertas, { desgloseDeSeveridades } from './TarjetaAlertas.jsx'

vi.mock('@/api/alertas.js', () => ({ listarAlertas: vi.fn() }))

const alerta = (id, severidad, mensaje) => ({
  id,
  tipo: 'REPORTE_PENDIENTE',
  severidad,
  titulo: 'Reporte sin enviar',
  mensaje,
  generadaEn: '2026-11-06T06:00:00.000Z',
  periodo: { id: 322, anio: 2026, mes: 10 },
  estado: 'ACTIVA',
  municipio: null,
  establecimiento: null,
  reporteId: null,
  indicadorCodigo: null,
  atendidaPor: null,
  atendidaEn: null,
})

// La forma de GET /alertas: la página pedida y las activas sin filtros.
const respuesta = (porSeveridad, elementos) => ({
  elementos,
  total: porSeveridad.CRITICA + porSeveridad.ADVERTENCIA + porSeveridad.INFO,
  pagina: 1,
  porPagina: 1,
  activas: { total: porSeveridad.CRITICA + porSeveridad.ADVERTENCIA + porSeveridad.INFO, porSeveridad },
})

const abrir = () =>
  render(
    <MemoryRouter>
      <TarjetaAlertas titulo="Alertas de calidad y de proceso" />
    </MemoryRouter>,
  )

afterEach(() => {
  vi.clearAllMocks()
})

test('pide solo la primera activa y muestra el total, el desglose sin ceros y el enlace a las alertas', async () => {
  // La API ya las ordena por severidad y, en la misma severidad, de la más reciente a la más antigua.
  const primera = alerta(1, 'CRITICA', 'CS-1209 no envió el reporte de octubre.')
  listarAlertas.mockResolvedValue(respuesta({ CRITICA: 9, ADVERTENCIA: 3, INFO: 0 }, [primera]))
  abrir()

  const principal = await screen.findByRole('group', { name: 'Alerta más importante' })
  expect(screen.getByText('12')).toBeTruthy()
  expect(screen.getByText('9 críticas, 3 advertencias')).toBeTruthy()
  expect(within(principal).getByText('Crítica')).toBeTruthy()
  expect(within(principal).getByText('CS-1209 no envió el reporte de octubre.')).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Ver alertas' }).getAttribute('href')).toBe('/alertas')
  expect(listarAlertas).toHaveBeenCalledWith({ porPagina: 1 })
})

test('sin alertas dice que no hay alertas activas y conserva el enlace', async () => {
  listarAlertas.mockResolvedValue(respuesta({ CRITICA: 0, ADVERTENCIA: 0, INFO: 0 }, []))
  abrir()

  expect(await screen.findByText('No hay alertas activas.')).toBeTruthy()
  expect(screen.queryByRole('group', { name: 'Alerta más importante' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Ver alertas' })).toBeTruthy()
})

test('si falla muestra el error y reintenta', async () => {
  listarAlertas.mockRejectedValueOnce(new Error('Sin conexión.'))
  listarAlertas.mockResolvedValueOnce(
    respuesta({ CRITICA: 0, ADVERTENCIA: 0, INFO: 1 }, [alerta(5, 'INFO', 'Octubre vence el 10/11/2026.')]),
  )
  abrir()

  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

  expect(await screen.findByText('Octubre vence el 10/11/2026.')).toBeTruthy()
  expect(screen.getByText('Informativa')).toBeTruthy()
  expect(listarAlertas).toHaveBeenCalledTimes(2)
})

test('el desglose usa el singular con 1 y omite las severidades en cero', () => {
  expect(desgloseDeSeveridades({ CRITICA: 1, ADVERTENCIA: 0, INFO: 2 })).toBe('1 crítica, 2 informativas')
  expect(desgloseDeSeveridades({ CRITICA: 0, ADVERTENCIA: 1, INFO: 1 })).toBe('1 advertencia, 1 informativa')
})
