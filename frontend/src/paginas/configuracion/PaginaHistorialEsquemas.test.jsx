import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { historialEsquemas } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import PaginaHistorialEsquemas from './PaginaHistorialEsquemas.jsx'

vi.mock('@/api/configuracion.js', () => ({ historialEsquemas: vi.fn() }))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }
const version = (id, numero, territorio, estado, vigencia, extra = {}) => ({
  id,
  version: numero,
  territorio,
  estado,
  vigencia,
  versionAnteriorId: null,
  basadoEn: null,
  creadoEn: '2026-09-01T15:00:00.000Z',
  publicadoPor: null,
  publicadoEn: null,
  motivoCambio: null,
  reportes: 0,
  ...extra,
})

const HISTORIAL = {
  vacuna: { id: 2, codigo: 'HEXA', nombre: 'Hexavalente', activa: true },
  versiones: [
    version('b-3', 3, SAN_MARCOS, 'BORRADOR', null),
    version('v-2', 2, NACIONAL, 'VIGENTE', { desde: '2026-10-01', hasta: null }, {
      publicadoPor: { id: 1, nombreUsuario: 'admin.prueba' },
      // 23:30 en Guatemala: el día de la publicación es el 30, no el 1 de UTC.
      publicadoEn: '2026-10-01T05:30:00.000Z',
      motivoCambio: 'Se agrega la sección de 1 a < 6 años.',
    }),
    version('v-1', 1, NACIONAL, 'HISTORICO', { desde: '2026-01-01', hasta: '2026-09-30' }, { reportes: 6 }),
  ],
}

function Ubicacion() {
  const { pathname, search, state } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}|${state?.volverA ?? ''}`}</output>
}

function montar(vacunaId = '2') {
  render(
    <MemoryRouter initialEntries={[{ pathname: `/administracion/esquemas/historial/${vacunaId}`, state: { volverA: '' } }]}>
      <Routes>
        <Route path="/administracion/esquemas/historial/:vacunaId" element={<PaginaHistorialEsquemas />} />
        <Route path="*" element={<Ubicacion />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrir(vacunaId) {
  montar(vacunaId)
  await waitFor(() => expect(screen.queryByLabelText('Cargando historial')).toBeNull())
}

const filas = () => within(screen.getByRole('table', { name: 'Versiones del esquema' })).getAllByRole('row').slice(1)
const textos = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  historialEsquemas.mockResolvedValue(HISTORIAL)
})

test('muestra las versiones con su estado, su vigencia, su publicación y sus reportes', async () => {
  await abrir()

  expect(historialEsquemas).toHaveBeenCalledWith('2')
  expect(screen.getByRole('heading', { name: 'Historial de Hexavalente' })).toBeTruthy()
  expect(filas().map(textos)).toEqual([
    ['3', 'DDRISS_SM', 'Borrador', '—', '—', '—', '0', 'Ver'],
    ['2', 'Nacional', 'Vigente', 'Desde 01/10/2026', '30/09/2026 · admin.prueba', 'Se agrega la sección de 1 a < 6 años.', '0', 'Ver'],
    ['1', 'Nacional', 'Histórica', '01/01/2026 – 30/09/2026', '—', '—', '6', 'Ver'],
  ])
})

test('"Ver" lleva a la versión y conserva la pestaña de vuelta', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('link', { name: 'Ver la versión 1' }))
  await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/administracion/esquemas/v-1|'))
})

test('una vacuna inactiva lleva su insignia', async () => {
  historialEsquemas.mockResolvedValue({ ...HISTORIAL, vacuna: { ...HISTORIAL.vacuna, activa: false } })
  await abrir()
  expect(screen.getByText('Inactiva')).toBeTruthy()
})

test('sin versiones lo dice', async () => {
  historialEsquemas.mockResolvedValue({ ...HISTORIAL, versiones: [] })
  await abrir()
  expect(screen.getByText('Esta vacuna aún no tiene esquemas.')).toBeTruthy()
})

test('una vacuna que no existe muestra "La vacuna no existe."', async () => {
  historialEsquemas.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'La vacuna no existe.'))
  montar('999')

  expect(await screen.findByText(/La vacuna no existe\./)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Volver a los esquemas' }).getAttribute('href')).toBe('/administracion/esquemas')
})

test('si falla la carga muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  historialEsquemas.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  montar()

  expect(await screen.findByText('No se pudo cargar el historial: No se pudo conectar con el servidor.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(filas()).toHaveLength(3))
  expect(historialEsquemas).toHaveBeenCalledTimes(2)
})

test('"Volver" regresa a la pestaña de la que se llegó', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('link', { name: 'Volver' }))

  await waitFor(() => expect(screen.getByTestId('ubicacion').textContent).toBe('/administracion/esquemas|'))
})
