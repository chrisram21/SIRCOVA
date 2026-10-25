import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { obtenerVacuna } from '@/api/catalogos.js'
import { listarDimensiones, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaVerEsquema from './PaginaVerEsquema.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ obtenerVacuna: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({ listarDimensiones: vi.fn(), obtenerEsquema: vi.fn() }))

const VACUNA = {
  id: 2,
  codigo: 'HEXA',
  nombre: 'Hexavalente',
  activa: true,
  dosis: [
    { id: 1, codigo: 'D1', nombre: 'Primera dosis', orden: 1, activa: true },
    { id: 2, codigo: 'D2', nombre: 'Segunda dosis', orden: 2, activa: true },
  ],
}
const valor = (codigo, etiqueta, orden, activo = true) => ({ codigo, etiqueta, orden, activo })
// pueblo ya está inactiva: la versión histórica la usaba, y se ve con su nombre y la insignia.
const DIMENSIONES = [
  { codigo: 'grupo_edad', nombre: 'Grupo de edad', activa: true, valores: [valor('MENOR_1', '< 1 año', 1)] },
  { codigo: 'pueblo', nombre: 'Pueblo', activa: false, valores: [valor('MAYA', 'Maya', 1)] },
]
const HISTORICA = {
  id: 'v-1',
  vacuna: { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' },
  version: 1,
  territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
  estado: 'HISTORICO',
  vigencia: { desde: '2026-01-01', hasta: '2026-09-30' },
  versionAnteriorId: null,
  basadoEn: null,
  procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: true },
  dosis: [
    { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
    { codigo: 'D2', etiqueta: 'Segunda dosis', desagregacion: null },
  ],
  desagregacion: [
    { dimension: 'grupo_edad', valores: ['MENOR_1'] },
    { dimension: 'pueblo', valores: ['MAYA'] },
  ],
  secciones: [{ codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1', 'D2'] }],
  camposAdicionales: [],
  reglas: [],
  presentacion: { filas: 'dosis', columnas: ['pueblo'] },
  creadoPor: 1,
  creadoEn: '2025-12-01T15:00:00.000Z',
  publicadoPor: { id: 1, nombreUsuario: 'admin.prueba' },
  publicadoEn: '2025-12-15T15:00:00.000Z',
  motivoCambio: 'Primera versión.',
}
const BORRADOR = {
  ...HISTORICA,
  id: 'b-3',
  version: 3,
  territorio: { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' },
  estado: 'BORRADOR',
  vigencia: null,
  basadoEn: { esquemaId: 'v-2', version: 2 },
  publicadoPor: null,
  publicadoEn: null,
  motivoCambio: null,
}

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'mlopez',
      rol: 'ADMINISTRADOR',
      permisos,
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function montar(id = 'v-1', permisos = ['ESQUEMA_CONSULTAR', 'ESQUEMA_EDITAR']) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[`/configuracion/esquemas/${id}`]}>
      <ProveedorSesion>
        <Routes>
          <Route path="/configuracion/esquemas/:id" element={<PaginaVerEsquema />} />
        </Routes>
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

async function abrir(id, permisos) {
  montar(id, permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando esquema')).toBeNull())
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  obtenerEsquema.mockImplementation(async (id) => (id === 'b-3' ? BORRADOR : HISTORICA))
  obtenerVacuna.mockResolvedValue(VACUNA)
  listarDimensiones.mockResolvedValue(DIMENSIONES)
})

test('muestra los datos de la versión y su contenido sin dejar editarlo', async () => {
  await abrir()

  expect(obtenerEsquema).toHaveBeenCalledWith('v-1')
  // Todas las dimensiones, también las inactivas, para mostrar sus nombres.
  expect(listarDimensiones).toHaveBeenCalledWith({})
  expect(screen.getByRole('heading', { name: 'Hexavalente · versión 1' })).toBeTruthy()
  expect(screen.getByText('Histórica')).toBeTruthy()
  expect(screen.getByText('01/01/2026 – 30/09/2026')).toBeTruthy()
  expect(screen.getByText('15/12/2025 · admin.prueba')).toBeTruthy()
  expect(screen.getByText('Primera versión.')).toBeTruthy()
  expect(screen.getByText('Esquema nuevo')).toBeTruthy()
  expect(screen.getByText('Pueblo')).toBeTruthy()

  for (const casilla of screen.getAllByRole('checkbox')) expect(casilla.matches(':disabled')).toBe(true)
  expect(screen.getByRole('textbox', { name: 'Título de la sección 1' }).matches(':disabled')).toBe(true)
  expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull()
  expect(screen.queryByText('Problemas')).toBeNull()
  expect(screen.queryByRole('link', { name: 'Editar borrador' })).toBeNull()
})

test('un borrador de la DDRISS ofrece "Editar borrador" con ESQUEMA_EDITAR', async () => {
  await abrir('b-3')

  expect(screen.getByRole('link', { name: 'Editar borrador' }).getAttribute('href')).toBe('/configuracion/esquemas/b-3/editar')
  expect(screen.getByText('Basado en la versión 2 nacional')).toBeTruthy()
})

test('sin ESQUEMA_EDITAR un borrador no ofrece editarlo', async () => {
  await abrir('b-3', ['ESQUEMA_CONSULTAR'])
  expect(screen.queryByRole('link', { name: 'Editar borrador' })).toBeNull()
})

test('"Vista previa" muestra el contenido guardado, con su vigencia y las etiquetas de lo inactivo', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }))
  const dialogo = await screen.findByRole('dialog')
  expect(within(dialogo).getByRole('heading', { name: 'Vista previa · Hexavalente, versión 1' })).toBeTruthy()
  expect(within(dialogo).getByText('Histórica')).toBeTruthy()
  expect(
    within(dialogo).getByText('Formulario generado por el esquema de captura: Hexavalente, versión 1, vigente desde 01/01/2026'),
  ).toBeTruthy()
  expect(within(dialogo).getByText('Dimensiones de este esquema:').textContent).toBe(
    'Dimensiones de este esquema: Dosis · Grupo de edad · Pueblo',
  )
  expect(within(dialogo).getByRole('columnheader', { name: 'Maya' })).toBeTruthy()
  expect(within(dialogo).getByRole('textbox', { name: 'Segunda dosis · Maya' })).toBeTruthy()
  expect(within(dialogo).queryByRole('list', { name: 'Problemas del borrador' })).toBeNull()

  fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(obtenerEsquema).toHaveBeenCalledTimes(1)
})

test('un id que no existe muestra "El esquema no existe."', async () => {
  obtenerEsquema.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  montar('no-existe')
  expect(await screen.findByText(/El esquema no existe\./)).toBeTruthy()
})
