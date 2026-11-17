import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { historialEsquemas, listarDimensiones, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import PaginaCompararEsquemas from './PaginaCompararEsquemas.jsx'

vi.mock('@/api/configuracion.js', () => ({
  historialEsquemas: vi.fn(),
  listarDimensiones: vi.fn(),
  obtenerEsquema: vi.fn(),
}))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }

const esquema = (id, version, territorio, estado, cambios = {}) => ({
  id,
  vacuna: { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' },
  version,
  territorio,
  estado,
  vigencia: estado === 'BORRADOR' ? null : { desde: '2026-01-01', hasta: null },
  versionAnteriorId: null,
  basadoEn: null,
  procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: true },
  dosis: [{ codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null }],
  desagregacion: [{ dimension: 'sexo', valores: ['M', 'F'], etiqueta: null }],
  secciones: [{ codigo: 'GENERAL', titulo: 'General', orden: 1, grupoEdad: null, dosis: ['D1'] }],
  incluirPorDefecto: true,
  publicadoPor: estado === 'BORRADOR' ? null : { id: 1, nombreUsuario: 'admin.prueba' },
  publicadoEn: estado === 'BORRADOR' ? null : '2026-09-01T16:00:00.000Z',
  motivoCambio: estado === 'BORRADOR' ? null : `Motivo de la versión ${version}`,
  ...cambios,
})

const V1 = esquema('v-1', 1, NACIONAL, 'HISTORICO')
const V2 = esquema('v-2', 2, NACIONAL, 'VIGENTE', {
  dosis: [
    { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
    { codigo: 'D2', etiqueta: 'Segunda dosis', desagregacion: null },
  ],
})
const B3 = esquema('b-3', 3, SAN_MARCOS, 'BORRADOR', {
  dosis: V2.dosis,
  procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
  desagregacion: [],
})
const ESQUEMAS = { 'v-1': V1, 'v-2': V2, 'b-3': B3 }
const HISTORIAL = {
  vacuna: { id: 2, codigo: 'HEXA', nombre: 'Hexavalente', activa: true },
  versiones: [B3, V2, V1].map(({ id, version, territorio, estado, vigencia, publicadoPor, publicadoEn, motivoCambio }) => ({
    id,
    version,
    territorio,
    estado,
    vigencia,
    publicadoPor,
    publicadoEn,
    motivoCambio,
    reportes: 0,
  })),
}
const DIMENSIONES = [
  {
    codigo: 'sexo',
    nombre: 'Sexo',
    valores: [
      { codigo: 'M', etiqueta: 'Masculino' },
      { codigo: 'F', etiqueta: 'Femenino' },
    ],
  },
]

function Ubicacion() {
  const { search } = useLocation()
  return <output data-testid="busqueda">{search}</output>
}

function montar(busqueda = '') {
  render(
    <MemoryRouter initialEntries={[`/administracion/esquemas/historial/2/comparar${busqueda}`]}>
      <Routes>
        <Route
          path="/administracion/esquemas/historial/:vacunaId/comparar"
          element={
            <>
              <PaginaCompararEsquemas />
              <Ubicacion />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrir(busqueda) {
  montar(busqueda)
  await waitFor(() => expect(screen.queryByLabelText('Cargando versiones')).toBeNull())
}

const nativo = (nombre) => document.querySelector(`select[name="${nombre}"]`)
const opcionesDe = (nombre) => [...nativo(nombre).options].map((o) => o.value).filter(Boolean)
const datos = (titulo) => within(screen.getByRole('region', { name: titulo }))
const grupo = (titulo) => within(screen.getByRole('region', { name: titulo }))
const diferencias = (titulo) => grupo(titulo).getAllByRole('listitem').map((li) => li.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  historialEsquemas.mockResolvedValue(HISTORIAL)
  listarDimensiones.mockResolvedValue(DIMENSIONES)
  obtenerEsquema.mockImplementation(async (id) => ESQUEMAS[id])
})

test('sin a ni b compara la versión más reciente con su anterior', async () => {
  await abrir()

  expect(historialEsquemas).toHaveBeenCalledWith('2')
  expect(listarDimensiones).toHaveBeenCalledWith()
  await screen.findByText('Diferencias en la captura')
  expect(obtenerEsquema).toHaveBeenCalledWith('v-2')
  expect(obtenerEsquema).toHaveBeenCalledWith('b-3')
  expect(nativo('a').value).toBe('v-2')
  expect(nativo('b').value).toBe('b-3')
  expect(screen.getByText('Esquema de captura de Hexavalente')).toBeTruthy()
})

test('con solo b, «Desde» es la anterior de b', async () => {
  await abrir('?b=v-2')

  await screen.findByText('Diferencias en la captura')
  expect(nativo('a').value).toBe('v-1')
  expect(nativo('b').value).toBe('v-2')
})

test('muestra los datos de las dos versiones', async () => {
  await abrir('?a=v-1&b=v-2')

  await screen.findByText('Diferencias en la captura')
  const desde = datos('Desde')
  expect(desde.getByText('Histórica')).toBeTruthy()
  expect(desde.getByText('Desde 01/01/2026')).toBeTruthy()
  expect(desde.getByText('01/09/2026 · admin.prueba')).toBeTruthy()
  expect(desde.getByText('Motivo de la versión 1')).toBeTruthy()
  expect(datos('Hasta').getByText('Vigente')).toBeTruthy()
})

test('las diferencias salen agrupadas, con su insignia y sus etiquetas', async () => {
  await abrir('?a=v-1&b=b-3')

  await screen.findByText('Diferencias en la captura')
  expect(diferencias('Procedencia')).toEqual([
    'CambiadoModo de procedenciaPropio y otros, como el 5CPor municipio de procedencia',
  ])
  expect(diferencias('Desagregación')).toEqual(['QuitadoDimensión SexoMasculino, Femenino'])
  expect(diferencias('Dosis')).toEqual(['AgregadoDosis D2Segunda dosis'])
  expect(screen.queryByRole('region', { name: 'Secciones' })).toBeNull()
})

test('sin diferencias de captura lo dice', async () => {
  obtenerEsquema.mockImplementation(async (id) => ({ ...V1, id }))
  await abrir('?a=v-1&b=v-2')

  expect(await screen.findByText('Las dos versiones capturan lo mismo.')).toBeTruthy()
})

test('cada selector escribe en la URL y no ofrece la versión elegida en el otro', async () => {
  await abrir('?a=v-1&b=v-2')
  await screen.findByText('Diferencias en la captura')

  expect(opcionesDe('a')).toEqual(['b-3', 'v-1'])
  expect(opcionesDe('b')).toEqual(['b-3', 'v-2'])

  fireEvent.change(nativo('b'), { target: { value: 'b-3' } })
  await waitFor(() => expect(screen.getByTestId('busqueda').textContent).toBe('?a=v-1&b=b-3'))
  await waitFor(() => expect(obtenerEsquema).toHaveBeenCalledWith('b-3'))

  fireEvent.change(nativo('a'), { target: { value: 'v-2' } })
  await waitFor(() => expect(screen.getByTestId('busqueda').textContent).toBe('?a=v-2&b=b-3'))
})

test('un id que no es de la vacuna muestra el aviso y deja elegir otra', async () => {
  await abrir('?a=otro&b=v-2')

  expect(screen.getByText('La versión elegida no es de esta vacuna.')).toBeTruthy()
  expect(obtenerEsquema).not.toHaveBeenCalled()
  expect(nativo('a')).toBeTruthy()
})

test('la misma versión en los dos pide elegir dos distintas', async () => {
  await abrir('?a=v-2&b=v-2')

  expect(screen.getByText('Elija dos versiones distintas para compararlas.')).toBeTruthy()
  expect(obtenerEsquema).not.toHaveBeenCalled()
})

test('una vacuna con una sola versión lo dice', async () => {
  historialEsquemas.mockResolvedValue({ ...HISTORIAL, versiones: [HISTORIAL.versiones[2]] })
  await abrir()

  expect(screen.getByText('Esta vacuna tiene una sola versión: no hay con qué compararla.')).toBeTruthy()
  expect(obtenerEsquema).not.toHaveBeenCalled()
})

test('si falla la carga del historial, «Reintentar» lo vuelve a pedir', async () => {
  historialEsquemas.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Falló.'))
  montar()

  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
  await screen.findByText('Diferencias en la captura')
  expect(historialEsquemas).toHaveBeenCalledTimes(2)
})

test('si falla la carga de una versión, «Reintentar» vuelve a pedir las dos', async () => {
  obtenerEsquema.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Falló.'))
  await abrir('?a=v-1&b=v-2')

  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
  await screen.findByText('Diferencias en la captura')
  expect(obtenerEsquema).toHaveBeenCalledTimes(4)
})

test('una vacuna que no existe lo dice y enlaza a los esquemas', async () => {
  historialEsquemas.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'No existe.'))
  montar()

  expect(await screen.findByText(/La vacuna no existe/)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Volver a los esquemas' }).getAttribute('href')).toBe('/administracion/esquemas')
})

test('«Volver al historial» lleva al historial de la vacuna', async () => {
  await abrir()
  expect(screen.getByRole('link', { name: 'Volver al historial' }).getAttribute('href')).toBe(
    '/administracion/esquemas/historial/2',
  )
})
