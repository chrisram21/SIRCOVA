import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { obtenerVacuna } from '@/api/catalogos.js'
import { editarEsquema, listarDimensiones, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import PaginaEditarEsquema from './PaginaEditarEsquema.jsx'

vi.mock('@/api/catalogos.js', () => ({ obtenerVacuna: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarDimensiones: vi.fn(),
  obtenerEsquema: vi.fn(),
  editarEsquema: vi.fn(),
}))

const VACUNA = {
  id: 2,
  codigo: 'ZVT',
  nombre: 'Vacuna de prueba',
  activa: true,
  dosis: [
    { id: 1, codigo: 'D1', nombre: 'Primera dosis', orden: 1, activa: true },
    { id: 4, codigo: 'R1', nombre: 'Primer refuerzo', orden: 4, activa: true },
  ],
}
const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const DIMENSIONES = [
  { codigo: 'grupo_edad', nombre: 'Grupo de edad', activa: true, valores: [valor('MENOR_1', '< 1 año', 1), valor('1_A_5', 'De 1 a < 6 años', 2)] },
]
const BORRADOR = {
  id: 'b-1',
  vacuna: { id: 2, codigo: 'ZVT', nombre: 'Vacuna de prueba' },
  version: 3,
  territorio: { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' },
  estado: 'BORRADOR',
  vigencia: null,
  basadoEn: { esquemaId: 'v-1', version: 2 },
  procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
  dosis: [
    { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
    { codigo: 'R1', etiqueta: 'Primer refuerzo', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
  ],
  desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
  secciones: [
    { codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1'] },
    { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: 2, grupoEdad: '1_A_5', dosis: ['D1', 'R1'] },
  ],
  camposAdicionales: [],
  reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: 1 }],
}

function Pestana() {
  const { search, state } = useLocation()
  return (
    <output data-testid="pestana">
      {search}|{state?.aviso}
    </output>
  )
}

function montar(id = 'b-1') {
  render(
    <MemoryRouter initialEntries={[`/configuracion/esquemas/${id}/editar`]}>
      <Routes>
        <Route path="/configuracion/esquemas/:id/editar" element={<PaginaEditarEsquema />} />
        <Route path="/configuracion" element={<Pestana />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrir(id) {
  montar(id)
  await waitFor(() => expect(screen.queryByLabelText('Cargando borrador')).toBeNull())
}

beforeEach(() => {
  vi.clearAllMocks()
  obtenerEsquema.mockResolvedValue(BORRADOR)
  obtenerVacuna.mockResolvedValue(VACUNA)
  listarDimensiones.mockResolvedValue(DIMENSIONES)
  editarEsquema.mockResolvedValue(BORRADOR)
})

test('carga el borrador, guarda con editarEsquema y vuelve a la pestaña con el aviso', async () => {
  await abrir()

  expect(obtenerEsquema).toHaveBeenCalledWith('b-1')
  expect(obtenerVacuna).toHaveBeenCalledWith(2)
  expect(screen.getByText('Borrador versión 3 · DDRISS_SM')).toBeTruthy()
  expect(screen.getByText(/Basado en la versión 2 nacional/)).toBeTruthy()
  const titulo = screen.getByRole('textbox', { name: 'Título de la sección 1' })
  expect(titulo.value).toBe('< 1 año')

  fireEvent.change(titulo, { target: { value: 'Menores de 1 año' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

  await waitFor(() => expect(editarEsquema).toHaveBeenCalledTimes(1))
  expect(editarEsquema).toHaveBeenCalledWith('b-1', {
    procedencia: BORRADOR.procedencia,
    dosis: [
      { codigo: 'D1', desagregacion: null },
      { codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
    ],
    desagregacion: BORRADOR.desagregacion,
    secciones: [
      { titulo: 'Menores de 1 año', grupoEdad: 'MENOR_1', dosis: ['D1'] },
      { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D1', 'R1'] },
    ],
  })
  await waitFor(() =>
    expect(screen.getByTestId('pestana').textContent).toBe('?pestana=esquemas|Borrador de Vacuna de prueba guardado (versión 3).'),
  )
})

test.each([
  ['vigente', { ...BORRADOR, estado: 'VIGENTE' }],
  ['nacional', { ...BORRADOR, territorio: { nivel: 'NACIONAL', ddrissCodigo: null } }],
])('un esquema %s muestra "Este esquema no se puede editar."', async (_, esquema) => {
  obtenerEsquema.mockResolvedValue(esquema)
  await abrir()

  expect(screen.getByText(/Este esquema no se puede editar\./)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull()
  expect(obtenerVacuna).not.toHaveBeenCalled()
})

test('un id que no existe muestra "El esquema no existe."', async () => {
  obtenerEsquema.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  await abrir('no-existe')

  expect(screen.getByText(/El esquema no existe\./)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Volver a los esquemas' }).getAttribute('href')).toBe('/configuracion?pestana=esquemas')
})

test('si falla la carga por otra razón lo dice', async () => {
  obtenerEsquema.mockRejectedValue(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  await abrir()

  expect(screen.getByText('No se pudo cargar el esquema: No se pudo conectar con el servidor.')).toBeTruthy()
})
