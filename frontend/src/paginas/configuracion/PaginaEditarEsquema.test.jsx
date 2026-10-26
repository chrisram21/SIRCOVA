import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { listarPeriodos, obtenerVacuna } from '@/api/catalogos.js'
import { editarEsquema, listarDimensiones, listarEsquemas, obtenerEsquema, publicarEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaEditarEsquema from './PaginaEditarEsquema.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ obtenerVacuna: vi.fn(), listarPeriodos: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarDimensiones: vi.fn(),
  obtenerEsquema: vi.fn(),
  editarEsquema: vi.fn(),
  listarEsquemas: vi.fn(),
  publicarEsquema: vi.fn(),
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

const EDITAR = ['ESQUEMA_CONSULTAR', 'ESQUEMA_EDITAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR']
const PUBLICAR = [...EDITAR, 'ESQUEMA_PUBLICAR', 'PERIODO_CONSULTAR']

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

function montar(id = 'b-1', permisos = EDITAR) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[`/configuracion/esquemas/${id}/editar`]}>
      <ProveedorSesion>
        <Routes>
          <Route path="/configuracion/esquemas/:id/editar" element={<PaginaEditarEsquema />} />
          <Route path="/configuracion" element={<Pestana />} />
        </Routes>
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

async function abrir(id, permisos) {
  montar(id, permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando borrador')).toBeNull())
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
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

test('al guardar reenvía la etiqueta de la desagregación tal como la recibió', async () => {
  const desagregacion = [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta: 'Edad del vacunado' }]
  obtenerEsquema.mockResolvedValue({ ...BORRADOR, desagregacion })
  await abrir()

  fireEvent.change(screen.getByRole('textbox', { name: 'Título de la sección 1' }), { target: { value: 'Menores de 1 año' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar borrador' }))

  await waitFor(() => expect(editarEsquema).toHaveBeenCalledTimes(1))
  expect(editarEsquema.mock.calls[0][1].desagregacion).toEqual(desagregacion)
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

describe('vista previa desde el editor', () => {
  test('muestra los cambios sin guardar y no guarda', async () => {
    await abrir('b-1', PUBLICAR)

    fireEvent.change(screen.getByRole('textbox', { name: 'Título de la sección 1' }), {
      target: { value: 'Menores de 1 año' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Vista previa' }))

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByRole('heading', { name: 'Vista previa · Vacuna de prueba, versión 3' })).toBeTruthy()
    expect(within(dialogo).getByRole('columnheader', { name: 'Menores de 1 año' })).toBeTruthy()
    // R1 tiene desagregación propia: va en su tabla, con su única sección encima.
    expect(within(dialogo).getByText('Primer refuerzo · De 1 a < 6 años')).toBeTruthy()
    expect(within(dialogo).getByLabelText('Primera dosis · Menores de 1 año').tagName).toBe('INPUT')
    expect(within(dialogo).queryByRole('list', { name: 'Problemas del borrador' })).toBeNull()

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(editarEsquema).not.toHaveBeenCalled()
    expect(listarEsquemas).not.toHaveBeenCalled()
    // Lo editado sigue sin guardar.
    expect(screen.getByRole('textbox', { name: 'Título de la sección 1' }).value).toBe('Menores de 1 año')
    expect(screen.getByRole('button', { name: 'Guardar y publicar' })).toBeTruthy()
  })

  test('con un problema de coherencia se abre igual y lo lista', async () => {
    await abrir()

    fireEvent.click(screen.getByRole('checkbox', { name: 'R1 en la sección 2' }))
    expect(screen.getByRole('button', { name: 'Guardar borrador' }).disabled).toBe(true)
    const boton = screen.getByRole('button', { name: 'Vista previa' })
    expect(boton.disabled).toBe(false)
    fireEvent.click(boton)

    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Este borrador tiene 1 problema; el formulario puede verse incompleto.')).toBeTruthy()
    const lista = within(dialogo).getByRole('list', { name: 'Problemas del borrador' })
    expect(within(lista).getByText('La dosis R1 no aparece en ninguna sección.')).toBeTruthy()
    // R1 ya no está en ninguna sección: no se arma su tabla.
    expect(within(dialogo).queryByText(/Primer refuerzo/)).toBeNull()
  })
})

describe('publicar desde el editor', () => {
  const FILA = {
    vacuna: { id: 2, codigo: 'ZVT', nombre: 'Vacuna de prueba', activa: true },
    vigente: { id: 'v-1', version: 2, territorio: { nivel: 'NACIONAL', ddrissCodigo: null }, vigenciaDesde: '2026-01-01' },
    borrador: { id: 'b-1', version: 3, creadoEn: '2026-10-15T15:00:00.000Z' },
  }
  const select = () => document.querySelector('select[name="vigenciaDesde"]')

  beforeEach(() => {
    // Solo la fecha: el "mes actual" del diálogo es octubre de 2026, sin falsear los temporizadores de waitFor.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T12:00:00-06:00'))
    listarEsquemas.mockResolvedValue([FILA])
    listarPeriodos.mockImplementation(async ({ anio }) =>
      anio === 2026 ? [{ id: 11, anio: 2026, mes: 11, fechaInicio: '2026-11-01' }] : [],
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('sin ESQUEMA_PUBLICAR no aparece el botón', async () => {
    await abrir('b-1', EDITAR)
    expect(screen.queryByRole('button', { name: /publicar/i })).toBeNull()
  })

  test('sin cambios, "Publicar" abre el diálogo sin guardar', async () => {
    await abrir('b-1', PUBLICAR)

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Publicar la versión 3 de Vacuna de prueba')).toBeTruthy()
    expect(within(dialogo).getByText(/en lugar de la nacional 2\./)).toBeTruthy()
    expect(editarEsquema).not.toHaveBeenCalled()
  })

  test('con cambios, "Guardar y publicar" guarda antes de abrir el diálogo', async () => {
    await abrir('b-1', PUBLICAR)

    fireEvent.change(screen.getByRole('textbox', { name: 'Título de la sección 1' }), {
      target: { value: 'Menores de 1 año' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }))

    await screen.findByRole('dialog')
    expect(editarEsquema).toHaveBeenCalledTimes(1)
    expect(editarEsquema.mock.calls[0][1].secciones[0].titulo).toBe('Menores de 1 año')
  })

  test('si guardar falla, muestra el error y no abre el diálogo', async () => {
    editarEsquema.mockRejectedValue(
      new ErrorApi(422, 'ESQUEMA_INVALIDO', 'La dosis R1 no aparece en ninguna sección.'),
    )
    await abrir('b-1', PUBLICAR)

    fireEvent.change(screen.getByRole('textbox', { name: 'Título de la sección 1' }), {
      target: { value: 'Menores de 1 año' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar y publicar' }))

    expect(await screen.findByText('La dosis R1 no aparece en ninguna sección.')).toBeTruthy()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(listarEsquemas).not.toHaveBeenCalled()
  })

  test('con un problema de coherencia el botón queda deshabilitado', async () => {
    await abrir('b-1', PUBLICAR)
    fireEvent.click(screen.getByRole('checkbox', { name: 'R1 en la sección 2' }))
    expect(screen.getByRole('button', { name: 'Guardar y publicar' }).disabled).toBe(true)
  })

  test('al publicar vuelve a la pestaña con el aviso', async () => {
    publicarEsquema.mockResolvedValue({
      ...BORRADOR,
      estado: 'VIGENTE',
      vigencia: { desde: '2026-11-01', hasta: null },
    })
    await abrir('b-1', PUBLICAR)

    fireEvent.click(screen.getByRole('button', { name: 'Publicar' }))
    const dialogo = await screen.findByRole('dialog')
    await waitFor(() => expect(select().disabled).toBe(false))
    fireEvent.change(select(), { target: { value: '2026-11-01' } })
    fireEvent.change(within(dialogo).getByLabelText('Motivo del cambio'), { target: { value: 'Cambio de prueba' } })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Publicar' }))

    await waitFor(() =>
      expect(screen.getByTestId('pestana').textContent).toBe(
        '?pestana=esquemas|Versión 3 de Vacuna de prueba publicada; vigente desde 01/11/2026.',
      ),
    )
    expect(publicarEsquema).toHaveBeenCalledWith('b-1', { vigenciaDesde: '2026-11-01', motivoCambio: 'Cambio de prueba' })
  })
})
