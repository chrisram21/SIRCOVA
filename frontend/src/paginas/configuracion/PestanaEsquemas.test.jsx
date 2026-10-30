import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { listarPeriodos, listarVacunas, obtenerVacuna } from '@/api/catalogos.js'
import { descartarEsquema, listarDimensiones, listarEsquemas, obtenerEsquema, publicarEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarVacunas: vi.fn(), listarPeriodos: vi.fn(), obtenerVacuna: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarDimensiones: vi.fn(),
  listarEsquemas: vi.fn(),
  obtenerEsquema: vi.fn(),
  descartarEsquema: vi.fn(),
  publicarEsquema: vi.fn(),
}))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }
const fila = (id, codigo, nombre, vigente, borrador, activa = true) => ({
  vacuna: { id, codigo, nombre, activa },
  vigente,
  borrador,
})

const FILAS = [
  fila(2, 'HEXA', 'Hexavalente', { id: 'v-hexa', version: 2, territorio: NACIONAL, vigenciaDesde: '2026-10-01' }, { id: 'b-hexa', version: 3, creadoEn: '2026-10-15T15:00:00.000Z' }),
  fila(30, 'NUEVA', 'Nueva vacuna', null, null),
  fila(4, 'TD', 'Td', { id: 'v-td', version: 4, territorio: SAN_MARCOS, vigenciaDesde: '2026-11-01' }, null),
  fila(31, 'VIEJA', 'Vacuna retirada', null, { id: 'b-vieja', version: 1, creadoEn: '2026-10-20T15:00:00.000Z' }, false),
]

const CONSULTAR = ['CONFIGURACION_CONSULTAR', 'ESQUEMA_CONSULTAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR']
const TODOS = [...CONSULTAR, 'ESQUEMA_CREAR', 'ESQUEMA_EDITAR']

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

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

function montar(ruta, permisos) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <PaginaConfiguracion />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

async function abrir(permisos = CONSULTAR) {
  montar('/configuracion?pestana=esquemas', permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando esquemas')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Esquemas de captura' })
const filaDe = (nombre) => within(tabla()).getByText(nombre).closest('tr')
const celdasDe = (nombre) => within(filaDe(nombre)).getAllByRole('cell')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarEsquemas.mockResolvedValue(FILAS)
  // Sin la pestaña Esquemas (o al salir de ella) se abre la primera visible.
  listarVacunas.mockResolvedValue([])
  listarDimensiones.mockResolvedValue([])
})

test('la pestaña Esquemas aparece con sus tres permisos de consulta y pide la lista una vez', async () => {
  await abrir()

  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Vacunas', 'Dimensiones', 'Esquemas'])
  expect(listarEsquemas).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Esquemas de captura')).toBeTruthy()
  expect(within(tabla()).getAllByRole('row')).toHaveLength(FILAS.length + 1)
})

test.each([
  ['ESQUEMA_CONSULTAR', ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR']],
  ['DIMENSION_CONSULTAR', ['CONFIGURACION_CONSULTAR', 'ESQUEMA_CONSULTAR', 'VACUNA_CONSULTAR']],
])('sin %s no aparece la pestaña', (_, permisos) => {
  montar('/configuracion?pestana=esquemas', permisos)

  expect(screen.queryByRole('tab', { name: 'Esquemas' })).toBeNull()
  expect(listarEsquemas).not.toHaveBeenCalled()
})

test('la tabla muestra el vigente que aplica con su territorio y su inicio, "Sin esquema", el borrador y las vacunas inactivas', async () => {
  await abrir()

  const hexa = celdasDe('Hexavalente')
  expect(hexa[1].textContent).toBe('Versión 2 · Nacional · desde 01/10/2026')
  expect(hexa[2].textContent).toBe('Versión 3')

  const td = celdasDe('Td')
  expect(td[1].textContent).toBe('Versión 4 · DDRISS_SM · desde 01/11/2026')
  expect(td[2].textContent).toBe('—')

  expect(celdasDe('Nueva vacuna')[1].textContent).toBe('Sin esquema')
  expect(within(celdasDe('Vacuna retirada')[0]).getByText('Inactiva')).toBeTruthy()
})

// Con solo los permisos de consulta, la columna de acciones solo trae el historial (SPEC 20).
test('sin ESQUEMA_CREAR ni ESQUEMA_EDITAR las acciones son solo el historial', async () => {
  await abrir()

  const acciones = within(filaDe('Hexavalente')).getAllByRole('link')
  expect(acciones.map((enlace) => enlace.textContent)).toEqual(['Historial'])
  expect(screen.queryByRole('button', { name: /Publicar/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Crear borrador/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Descartar/ })).toBeNull()
})

test('con solo ESQUEMA_CREAR se puede crear pero no editar ni descartar', async () => {
  await abrir([...CONSULTAR, 'ESQUEMA_CREAR'])

  expect(screen.getByRole('button', { name: 'Crear borrador de TD' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Editar borrador de HEXA' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Descartar borrador de HEXA' })).toBeNull()
})

describe('crear un borrador', () => {
  async function elegir(codigo, opcion) {
    fireEvent.keyDown(screen.getByRole('button', { name: `Crear borrador de ${codigo}` }), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Copiar la versión vigente',
      'Empezar vacío',
    ])
    fireEvent.click(within(menu).getByRole('menuitem', { name: opcion }))
  }

  test('con vigente, "Copiar la versión vigente" va al editor con origen=copia', async () => {
    await abrir(TODOS)
    await elegir('TD', 'Copiar la versión vigente')
    await waitFor(() => expect(ubicacion()).toBe('/configuracion/esquemas/nuevo?vacuna=4&origen=copia'))
  })

  test('con vigente, "Empezar vacío" va al editor con origen=vacio', async () => {
    await abrir(TODOS)
    await elegir('TD', 'Empezar vacío')
    await waitFor(() => expect(ubicacion()).toBe('/configuracion/esquemas/nuevo?vacuna=4&origen=vacio'))
  })

  test('sin vigente, "Crear borrador" va directo a vacío', async () => {
    await abrir(TODOS)
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador de NUEVA' }))
    await waitFor(() => expect(ubicacion()).toBe('/configuracion/esquemas/nuevo?vacuna=30&origen=vacio'))
  })

  test('una vacuna con borrador no ofrece crear otro, y una inactiva solo ofrece descartar el suyo', async () => {
    await abrir(TODOS)

    expect(screen.queryByRole('button', { name: 'Crear borrador de HEXA' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Editar borrador de HEXA' }).getAttribute('href')).toBe(
      '/configuracion/esquemas/b-hexa/editar',
    )
    expect(screen.queryByRole('link', { name: 'Editar borrador de VIEJA' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Descartar borrador de VIEJA' })).toBeTruthy()
  })
})

describe('descartar un borrador', () => {
  test('pide confirmación, llama a la API, quita el borrador de la fila y muestra el aviso', async () => {
    descartarEsquema.mockResolvedValue(null)
    await abrir(TODOS)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador de HEXA' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Descartar el borrador versión 3 de Hexavalente?')).toBeTruthy()
    expect(within(dialogo).getByText('No se puede deshacer.')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Borrador versión 3 de Hexavalente descartado.'))
    expect(descartarEsquema).toHaveBeenCalledWith('b-hexa')
    expect(celdasDe('Hexavalente')[2].textContent).toBe('—')
    expect(screen.getByRole('button', { name: 'Crear borrador de HEXA' })).toBeTruthy()
    expect(listarEsquemas).toHaveBeenCalledTimes(1)
  })

  test('un 409 de la API se muestra en un Alert y la fila no cambia', async () => {
    descartarEsquema.mockRejectedValue(
      new ErrorApi(
        409,
        'ESQUEMA_NO_EDITABLE',
        'Solo se edita un borrador de su DDRISS; para cambiar un esquema publicado, cree un borrador nuevo.',
      ),
    )
    await abrir(TODOS)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador de HEXA' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }))

    expect(
      await screen.findByText('Solo se edita un borrador de su DDRISS; para cambiar un esquema publicado, cree un borrador nuevo.'),
    ).toBeTruthy()
    expect(celdasDe('Hexavalente')[2].textContent).toBe('Versión 3')
  })
})

test('si falla la carga muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarEsquemas.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  montar('/configuracion?pestana=esquemas', CONSULTAR)

  expect(await screen.findByText('No se pudieron cargar los esquemas: No se pudo conectar con el servidor.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(listarEsquemas).toHaveBeenCalledTimes(2)
})

describe('historial', () => {
  test('cada vacuna con vigente o borrador lleva a su historial, y una sin esquema no', async () => {
    await abrir()

    expect(screen.getByRole('link', { name: 'Historial de HEXA' }).getAttribute('href')).toBe(
      '/configuracion/esquemas/historial/2',
    )
    expect(screen.getByRole('link', { name: 'Historial de TD' }).getAttribute('href')).toBe(
      '/configuracion/esquemas/historial/4',
    )
    expect(screen.getByRole('link', { name: 'Historial de VIEJA' })).toBeTruthy()
    expect(screen.queryByRole('link', { name: 'Historial de NUEVA' })).toBeNull()
  })
})

describe('publicar un borrador', () => {
  const PUBLICAR = [...TODOS, 'ESQUEMA_PUBLICAR', 'PERIODO_CONSULTAR']
  const mes = (anio, numero) => ({
    id: anio * 100 + numero,
    anio,
    mes: numero,
    fechaInicio: `${anio}-${String(numero).padStart(2, '0')}-01`,
  })

  beforeEach(() => {
    // Solo la fecha: el "mes actual" del diálogo es octubre de 2026, sin falsear los temporizadores de waitFor.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-24T12:00:00-06:00'))
    listarPeriodos.mockImplementation(async ({ anio }) =>
      anio === 2026 ? [9, 10, 11, 12].map((n) => mes(2026, n)) : [1, 2].map((n) => mes(2027, n)),
    )
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  test('"Publicar" aparece en el borrador de una vacuna activa solo con ESQUEMA_PUBLICAR y PERIODO_CONSULTAR', async () => {
    await abrir([...TODOS, 'ESQUEMA_PUBLICAR'])
    expect(screen.queryByRole('button', { name: /^Publicar/ })).toBeNull()
  })

  test('con los dos permisos, "Publicar" aparece en Hexavalente y no en la vacuna inactiva', async () => {
    await abrir(PUBLICAR)
    expect(screen.getByRole('button', { name: 'Publicar borrador de HEXA' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Publicar borrador de VIEJA' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Publicar borrador de TD' })).toBeNull()
  })

  test('publica con el mes y el motivo elegidos, recarga la tabla y muestra el aviso', async () => {
    publicarEsquema.mockResolvedValue({
      id: 'b-hexa',
      version: 3,
      vacuna: { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' },
      estado: 'VIGENTE',
      vigencia: { desde: '2026-12-01', hasta: null },
    })
    // Lo que carga «Continuar» para la vista previa.
    obtenerEsquema.mockResolvedValue({
      id: 'b-hexa',
      version: 3,
      vacuna: { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' },
      territorio: SAN_MARCOS,
      estado: 'BORRADOR',
      vigencia: null,
      procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: false },
      dosis: [{ codigo: 'D1', desagregacion: null }],
      desagregacion: [],
      secciones: [{ titulo: 'Hexavalente', grupoEdad: null, dosis: ['D1'] }],
      camposAdicionales: [],
      reglas: [],
    })
    obtenerVacuna.mockResolvedValue({
      id: 2,
      codigo: 'HEXA',
      nombre: 'Hexavalente',
      dosis: [{ codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true }],
    })
    await abrir(PUBLICAR)

    fireEvent.click(screen.getByRole('button', { name: 'Publicar borrador de HEXA' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByText('Publicar la versión 3 de Hexavalente')).toBeTruthy()
    const select = () => document.querySelector('select[name="vigenciaDesde"]')
    await waitFor(() => expect(select().disabled).toBe(false))

    fireEvent.change(select(), { target: { value: '2026-12-01' } })
    fireEvent.change(within(dialogo).getByLabelText('Motivo del cambio'), {
      target: { value: 'Se agrega la dimensión pueblo.' },
    })
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Continuar' }))
    const confirmar = await screen.findByRole('button', { name: 'Confirmar publicación' })
    expect(obtenerEsquema).toHaveBeenCalledWith('b-hexa')
    expect(publicarEsquema).not.toHaveBeenCalled()
    fireEvent.click(confirmar)

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Versión 3 de Hexavalente publicada; vigente desde 01/12/2026.'))
    expect(publicarEsquema).toHaveBeenCalledWith('b-hexa', {
      vigenciaDesde: '2026-12-01',
      motivoCambio: 'Se agrega la dimensión pueblo.',
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    await waitFor(() => expect(listarEsquemas).toHaveBeenCalledTimes(2))
  })
})
