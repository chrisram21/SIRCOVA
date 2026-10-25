import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { obtenerVacuna } from '@/api/catalogos.js'
import { crearEsquema, listarDimensiones, listarEsquemas, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import PaginaRegistrarEsquema from './PaginaRegistrarEsquema.jsx'
import { MENSAJES_COHERENCIA as M } from './coherenciaEsquema.js'

vi.mock('@/api/catalogos.js', () => ({ obtenerVacuna: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarDimensiones: vi.fn(),
  listarEsquemas: vi.fn(),
  obtenerEsquema: vi.fn(),
  crearEsquema: vi.fn(),
}))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const VACUNA = {
  id: 2,
  codigo: 'ZVT',
  nombre: 'Vacuna de prueba',
  activa: true,
  dosis: [
    { id: 1, codigo: 'D1', nombre: 'Primera dosis', orden: 1, activa: true },
    { id: 2, codigo: 'D2', nombre: 'Segunda dosis', orden: 2, activa: true },
    { id: 3, codigo: 'D3', nombre: 'Tercera dosis', orden: 3, activa: false },
    { id: 4, codigo: 'R1', nombre: 'Primer refuerzo', orden: 4, activa: true },
  ],
}
const valor = (codigo, etiqueta, orden, activo = true) => ({ codigo, etiqueta, orden, activo })
const DIMENSIONES = [
  {
    codigo: 'grupo_edad',
    nombre: 'Grupo de edad',
    activa: true,
    valores: [valor('MENOR_1', '< 1 año', 1), valor('1_A_5', 'De 1 a < 6 años', 2), valor('2_4', '2 a 4 años', 3, false)],
  },
  { codigo: 'sexo', nombre: 'Sexo', activa: true, valores: [valor('F', 'Mujeres', 1), valor('M', 'Hombres', 2)] },
]
const fila = (cambios = {}) => ({
  vacuna: { id: 2, codigo: 'ZVT', nombre: 'Vacuna de prueba', activa: true },
  vigente: { id: 'v-1', version: 2, territorio: NACIONAL },
  borrador: null,
  ...cambios,
})
// El vigente usa la dosis D3, el valor 2_4 y la dimensión pueblo, que ya no están activos.
const VIGENTE = {
  id: 'v-1',
  vacuna: { id: 2, codigo: 'ZVT', nombre: 'Vacuna de prueba' },
  version: 2,
  territorio: NACIONAL,
  estado: 'VIGENTE',
  procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: false },
  dosis: [
    { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
    { codigo: 'D3', etiqueta: 'Tercera dosis', desagregacion: null },
    { codigo: 'R1', etiqueta: 'Primer refuerzo', desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '2_4'] }] },
  ],
  desagregacion: [
    { dimension: 'grupo_edad', valores: ['MENOR_1', '2_4'] },
    { dimension: 'pueblo', valores: ['MAYA'] },
  ],
  secciones: [{ codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1', 'D3', 'R1'] }],
  camposAdicionales: [{ clave: 'total_dosis_declarado' }],
  reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: 1 }, { codigo: 'NO_NEGATIVO', version: 1 }],
}

function Pestana() {
  const { search, state } = useLocation()
  return (
    <output data-testid="pestana">
      {search}|{state?.aviso}
    </output>
  )
}

function montar(ruta) {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/configuracion/esquemas/nuevo', search: ruta, state: { volverA: '?pestana=esquemas' } }]}>
      <Routes>
        <Route path="/configuracion/esquemas/nuevo" element={<PaginaRegistrarEsquema />} />
        <Route path="/configuracion" element={<Pestana />} />
      </Routes>
    </MemoryRouter>,
  )
}

async function abrir(ruta) {
  montar(ruta)
  await waitFor(() => expect(screen.queryByLabelText('Cargando borrador')).toBeNull())
}

const marcada = (nombre) => screen.getByRole('checkbox', { name: nombre }).getAttribute('aria-checked')

beforeEach(() => {
  vi.clearAllMocks()
  obtenerVacuna.mockResolvedValue(VACUNA)
  listarDimensiones.mockResolvedValue(DIMENSIONES)
  listarEsquemas.mockResolvedValue([fila()])
  obtenerEsquema.mockResolvedValue(VIGENTE)
  crearEsquema.mockResolvedValue({ ...VIGENTE, id: 'b-1', version: 3, estado: 'BORRADOR' })
})

test('con origen=copia precarga el vigente sin lo inactivo, lo avisa y guarda con copiaDe', async () => {
  await abrir('?vacuna=2&origen=copia')

  expect(obtenerVacuna).toHaveBeenCalledWith(2)
  expect(listarDimensiones).toHaveBeenCalledWith({ activa: true })
  expect(obtenerEsquema).toHaveBeenCalledWith('v-1')
  expect(
    screen.getByText('Se quitaron de la copia: la dosis D3, el valor 2_4 de grupo_edad, la dimensión pueblo.'),
  ).toBeTruthy()
  expect(screen.getByText('Copia de la versión 2 · Nacional')).toBeTruthy()
  expect(
    screen.getByText('Las reglas de validación y los campos adicionales se copian de la base: 2 reglas y 1 campos adicionales.'),
  ).toBeTruthy()
  expect(marcada('Primera dosis (D1)')).toBe('true')
  expect(marcada('Segunda dosis (D2)')).toBe('false')
  expect(screen.queryByRole('checkbox', { name: 'Tercera dosis (D3)' })).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

  await waitFor(() => expect(crearEsquema).toHaveBeenCalledTimes(1))
  expect(crearEsquema).toHaveBeenCalledWith({
    vacunaId: 2,
    copiaDe: 'v-1',
    procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: false },
    dosis: [
      { codigo: 'D1', desagregacion: null },
      { codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }] },
    ],
    desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }],
    secciones: [{ titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1', 'R1'] }],
  })
  await waitFor(() =>
    expect(screen.getByTestId('pestana').textContent).toBe('?pestana=esquemas|Borrador de Vacuna de prueba guardado (versión 3).'),
  )
})

test('con origen=vacio empieza con las dosis activas marcadas y una sección vacía, y guarda sin copiaDe', async () => {
  await abrir('?vacuna=2&origen=vacio')

  expect(obtenerEsquema).not.toHaveBeenCalled()
  expect(screen.getByText('Esquema nuevo')).toBeTruthy()
  expect(['Primera dosis (D1)', 'Segunda dosis (D2)', 'Primer refuerzo (R1)'].map(marcada)).toEqual(['true', 'true', 'true'])
  expect(screen.queryByRole('checkbox', { name: 'Tercera dosis (D3)' })).toBeNull()
  expect(screen.getAllByRole('textbox', { name: /Título de la sección/ })).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Guardar borrador' }).disabled).toBe(true)

  fireEvent.change(screen.getByRole('textbox', { name: 'Título de la sección 1' }), { target: { value: 'General' } })
  for (const codigo of ['D1', 'D2', 'R1']) fireEvent.click(screen.getByRole('checkbox', { name: `${codigo} en la sección 1` }))
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

  await waitFor(() => expect(crearEsquema).toHaveBeenCalledTimes(1))
  expect(crearEsquema.mock.calls[0][0]).toMatchObject({
    vacunaId: 2,
    copiaDe: null,
    desagregacion: [],
    secciones: [{ titulo: 'General', grupoEdad: null, dosis: ['D1', 'D2', 'R1'] }],
  })
})

test('un 422 al guardar se muestra en el Alert y conserva lo editado', async () => {
  crearEsquema.mockRejectedValue(new ErrorApi(422, 'ESQUEMA_INVALIDO', M.dosisInactiva('R1', 'ZVT')))
  await abrir('?vacuna=2&origen=copia')

  fireEvent.change(screen.getByRole('textbox', { name: 'Título de la sección 1' }), { target: { value: 'Menores de 1 año' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

  expect(await screen.findByText(M.dosisInactiva('R1', 'ZVT'))).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Título de la sección 1' }).value).toBe('Menores de 1 año')
  expect(screen.queryByTestId('pestana')).toBeNull()
})

test.each([
  ['la vacuna está inactiva', () => obtenerVacuna.mockResolvedValue({ ...VACUNA, activa: false }), '?vacuna=2&origen=vacio'],
  ['la vacuna no existe', () => obtenerVacuna.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'La vacuna no existe.')), '?vacuna=2&origen=vacio'],
  ['la copia no tiene vigente', () => listarEsquemas.mockResolvedValue([fila({ vigente: null })]), '?vacuna=2&origen=copia'],
  ['la vacuna ya tiene borrador', () => listarEsquemas.mockResolvedValue([fila({ borrador: { id: 'b-0', version: 3 } })]), '?vacuna=2&origen=vacio'],
  ['el origen no es válido', () => {}, '?vacuna=2&origen=otro'],
])('si %s muestra "No se puede crear el borrador de esta vacuna."', async (_, preparar, ruta) => {
  preparar()
  await abrir(ruta)

  expect(screen.getByText(/No se puede crear el borrador de esta vacuna\./)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Volver a los esquemas' }).getAttribute('href')).toBe('/configuracion?pestana=esquemas')
  expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull()
})
