import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { consultarPoblacion, guardarPoblacion, listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarDistritos: vi.fn(),
  listarEstablecimientos: vi.fn(),
  listarVacunas: vi.fn(),
  listarPeriodos: vi.fn(),
  crearAnioPeriodos: vi.fn(),
  abrirPeriodo: vi.fn(),
  cambiarFechaLimite: vi.fn(),
  consultarPoblacion: vi.fn(),
  guardarPoblacion: vi.fn(),
}))

// Solo importan el año y el mes: la pestaña saca los años del calendario.
const mesesDe = (anio) => Array.from({ length: 12 }, (_, i) => ({ id: anio * 100 + i + 1, anio, mes: i + 1 }))
const PERIODOS = [...mesesDe(2025), ...mesesDe(2026), ...mesesDe(2027)]

const GRUPOS = [
  { codigo: 'NACIDOS_VIVOS', descripcion: 'Nacidos vivos (columna N/V del 5C)' },
  { codigo: 'MENOR_1', descripcion: 'Menores de 1 año' },
  { codigo: '1_A_MENOR_2', descripcion: 'De 1 a menos de 2 años' },
  { codigo: '4_ANIOS', descripcion: 'Niñas y niños de 4 años' },
  { codigo: '1_A_5', descripcion: 'De 1 a menos de 6 años' },
  { codigo: 'MEF_15_49', descripcion: 'Mujeres de 15 a 49 años' },
  { codigo: 'EMBARAZADAS', descripcion: 'Mujeres embarazadas esperadas' },
]

const registro = (cantidad) => ({ cantidad, fuente: 'Archivo MSPAS', actualizadoEn: '2026-01-05T15:00:00.000Z' })

const poblacionDe = (anio) => ({
  anio,
  grupos: GRUPOS,
  municipios: [
    {
      id: 1,
      codigoIne: '1201',
      nombre: 'San Marcos',
      poblacion: {
        NACIDOS_VIVOS: registro(anio === 2026 ? 1494 : 1400),
        MENOR_1: registro(1450),
        '1_A_MENOR_2': registro(1421),
        '4_ANIOS': registro(1378),
        '1_A_5': registro(6960),
        MEF_15_49: registro(16240),
        EMBARAZADAS: registro(0),
      },
    },
    { id: 12, codigoIne: '1212', nombre: 'Tacaná', poblacion: { MENOR_1: registro(980) } },
    { id: 20, codigoIne: '1220', nombre: 'Ayutla', poblacion: {} },
  ],
})

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'POBLACION_CONSULTAR', 'PERIODO_CONSULTAR']
const PERMISOS_REGISTRAR = [...PERMISOS, 'POBLACION_REGISTRAR']

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'admin',
      rol: 'ADMINISTRADOR',
      permisos,
      empleado: { nombres: 'Ana', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  return <output data-testid="ubicacion">{useLocation().search}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

function montar(ruta, permisos = PERMISOS) {
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

async function abrir(ruta = '/configuracion?pestana=poblacion', permisos = PERMISOS) {
  montar(ruta, permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando población')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Población' })
const encabezados = () => within(tabla()).getAllByRole('columnheader').map((c) => c.textContent)
const textoDe = (municipio) =>
  within(within(tabla()).getByRole('cell', { name: municipio }).closest('tr'))
    .getAllByRole('cell')
    .map((c) => c.textContent)
const selectAnio = () => document.querySelector('select[name="anio"]')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  // Solo se finge la fecha: el "año actual" de la pestaña es 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T18:00:00Z'))
  listarPeriodos.mockResolvedValue(PERIODOS)
  consultarPoblacion.mockImplementation(async (anio) => poblacionDe(anio))
})

afterEach(() => {
  vi.useRealTimers()
})

test('la tabla muestra una columna por grupo, las cantidades con separador de miles y "—" sin registrar', async () => {
  await abrir()

  expect(listarPeriodos).toHaveBeenCalledTimes(1)
  expect(consultarPoblacion).toHaveBeenCalledWith(2026)
  expect(
    screen.getByText(
      'Población anual que envía el MSPAS por municipio y grupo de edad; es el denominador de la cobertura.',
    ),
  ).toBeTruthy()
  expect(encabezados()).toEqual(['Municipio', ...GRUPOS.map((g) => g.descripcion)])
  expect(textoDe('San Marcos')).toEqual(['San Marcos', '1,494', '1,450', '1,421', '1,378', '6,960', '16,240', '0'])
  expect(textoDe('Tacaná')).toEqual(['Tacaná', '—', '980', '—', '—', '—', '—', '—'])
})

test('el Select ofrece los años del calendario, del más reciente al más antiguo, con el actual elegido', async () => {
  await abrir()

  expect([...selectAnio().options].map((o) => o.value)).toEqual(['2027', '2026', '2025'])
  expect(selectAnio().value).toBe('2026')
})

test('cambiar el año pide la población de ese año y queda en la URL', async () => {
  await abrir()

  fireEvent.change(selectAnio(), { target: { value: '2025' } })

  await waitFor(() => expect(textoDe('San Marcos')[1]).toBe('1,400'))
  expect(consultarPoblacion).toHaveBeenLastCalledWith(2025)
  expect(ubicacion()).toBe('?pestana=poblacion&anio=2025')
  expect(listarPeriodos).toHaveBeenCalledTimes(1)
})

test('el año de la URL se aplica al abrir', async () => {
  await abrir('/configuracion?pestana=poblacion&anio=2027')
  expect(selectAnio().value).toBe('2027')
  expect(consultarPoblacion).toHaveBeenCalledWith(2027)
})

test('con un año de la URL que no está en el calendario se elige el actual', async () => {
  await abrir('/configuracion?pestana=poblacion&anio=2019')

  expect(selectAnio().value).toBe('2026')
  expect(consultarPoblacion).not.toHaveBeenCalledWith(2019)
})

test('sin años en el calendario lo dice y no pide la población', async () => {
  listarPeriodos.mockResolvedValue([])

  await abrir()

  expect(screen.getByText('No hay años en el calendario. Créelos en la pestaña Periodos.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
  expect(consultarPoblacion).not.toHaveBeenCalled()
})

test('sin años y con PERIODO_CREAR, el aviso lleva a la pestaña Periodos', async () => {
  listarPeriodos.mockResolvedValue([])

  await abrir(undefined, [...PERMISOS, 'PERIODO_CREAR'])

  const vacio = screen.getByText('No hay años en el calendario. Créelos en la pestaña Periodos.').parentElement
  expect(within(vacio).getByRole('link', { name: 'Ir a Periodos' }).getAttribute('href')).toBe(
    '/configuracion?pestana=periodos',
  )
})

test('sin PERIODO_CREAR, el aviso de vacío no lleva a Periodos', async () => {
  listarPeriodos.mockResolvedValue([])

  await abrir()

  expect(screen.queryByRole('link', { name: 'Ir a Periodos' })).toBeNull()
})

test('si falla la lista de periodos muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarPeriodos.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))

  await abrir()

  expect(await screen.findByText('No se pudo cargar la población: Ocurrió un error inesperado.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(listarPeriodos).toHaveBeenCalledTimes(2)
})

test('si falla la petición muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  consultarPoblacion.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))

  await abrir()

  expect(await screen.findByText('No se pudo cargar la población: Ocurrió un error inesperado.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(consultarPoblacion).toHaveBeenCalledTimes(2)
})

test('sin POBLACION_CONSULTAR no aparece la pestaña', () => {
  montar('/configuracion?pestana=poblacion', ['CONFIGURACION_CONSULTAR', 'PERIODO_CONSULTAR'])

  expect(screen.queryByRole('tab', { name: 'Población' })).toBeNull()
  expect(consultarPoblacion).not.toHaveBeenCalled()
})

test('sin PERIODO_CONSULTAR tampoco aparece, porque los años salen del calendario', () => {
  montar('/configuracion?pestana=poblacion', ['CONFIGURACION_CONSULTAR', 'POBLACION_CONSULTAR'])

  expect(screen.queryByRole('tab', { name: 'Población' })).toBeNull()
  expect(consultarPoblacion).not.toHaveBeenCalled()
})

test('la pestaña Población va después de Periodos', async () => {
  await abrir()

  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Periodos', 'Población'])
  expect(screen.getByRole('tab', { name: 'Población' }).getAttribute('aria-selected')).toBe('true')
})

describe('Editar la población de un municipio', () => {
  const editar = (municipio) =>
    fireEvent.click(
      within(within(tabla()).getByRole('cell', { name: municipio }).closest('tr')).getByRole('button', {
        name: 'Editar',
      }),
    )
  const dialogo = () => screen.getByRole('dialog')
  const campo = (etiqueta) => within(dialogo()).getByLabelText(etiqueta)
  const escribir = (etiqueta, valor) => fireEvent.change(campo(etiqueta), { target: { value: valor } })
  const confirmar = () => fireEvent.click(within(dialogo()).getByRole('button', { name: 'Guardar' }))

  test('el Dialog viene con las cantidades y la fuente actuales', async () => {
    await abrir(undefined, PERMISOS_REGISTRAR)

    editar('San Marcos')

    expect(screen.getByRole('dialog', { name: 'Población de San Marcos 2026' })).toBeTruthy()
    expect(campo('Nacidos vivos (columna N/V del 5C)').value).toBe('1494')
    expect(campo('Mujeres embarazadas esperadas').value).toBe('0')
    expect(campo(/^Fuente/).value).toBe('Archivo MSPAS')
  })

  test('guardar manda solo los grupos con número, reemplaza la fila y muestra el aviso', async () => {
    guardarPoblacion.mockResolvedValue({
      id: 12,
      codigoIne: '1212',
      nombre: 'Tacaná',
      poblacion: { NACIDOS_VIVOS: registro(1000), MENOR_1: registro(985) },
    })
    await abrir(undefined, PERMISOS_REGISTRAR)

    editar('Tacaná')
    expect(campo('Nacidos vivos (columna N/V del 5C)').value).toBe('')
    escribir('Nacidos vivos (columna N/V del 5C)', '1000')
    escribir('Menores de 1 año', ' 985 ')
    escribir(/^Fuente/, '  Archivo MSPAS 2026 ')
    confirmar()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(guardarPoblacion).toHaveBeenCalledWith(12, 2026, {
      fuente: 'Archivo MSPAS 2026',
      grupos: { NACIDOS_VIVOS: 1000, MENOR_1: 985 },
    })
    expect(textoDe('Tacaná').slice(0, 3)).toEqual(['Tacaná', '1,000', '985'])
    expect(toast.success).toHaveBeenCalledWith('Población de Tacaná guardada.')
    expect(consultarPoblacion).toHaveBeenCalledTimes(1)
  })

  test('con la fuente vacía no la manda, para que las filas conserven la suya', async () => {
    guardarPoblacion.mockResolvedValue(poblacionDe(2026).municipios[0])
    await abrir(undefined, PERMISOS_REGISTRAR)

    editar('San Marcos')
    escribir(/^Fuente/, '   ')
    escribir('Menores de 1 año', '1460')
    confirmar()

    await waitFor(() => expect(guardarPoblacion).toHaveBeenCalled())
    expect(guardarPoblacion.mock.calls[0][2]).not.toHaveProperty('fuente')
    expect(guardarPoblacion.mock.calls[0][2].grupos.MENOR_1).toBe(1460)
  })

  test('una cantidad inválida muestra su error y no llama a la API', async () => {
    await abrir(undefined, PERMISOS_REGISTRAR)

    editar('San Marcos')
    escribir('Menores de 1 año', '12a')
    confirmar()

    expect(
      await within(dialogo()).findByText('La cantidad debe ser un número entero entre 0 y 9,999,999.'),
    ).toBeTruthy()
    expect(guardarPoblacion).not.toHaveBeenCalled()
  })

  test('un grupo ya registrado que se vacía muestra su error y no llama a la API', async () => {
    await abrir(undefined, PERMISOS_REGISTRAR)

    editar('Tacaná')
    escribir('Menores de 1 año', '')
    confirmar()

    expect(await within(dialogo()).findByText('Un grupo ya registrado no se puede dejar vacío.')).toBeTruthy()
    expect(guardarPoblacion).not.toHaveBeenCalled()
  })

  test('sin ningún grupo con número pide al menos uno y no llama a la API', async () => {
    await abrir(undefined, PERMISOS_REGISTRAR)

    editar('Ayutla')
    confirmar()

    expect(await within(dialogo()).findByText('Debe registrar al menos un grupo.')).toBeTruthy()
    expect(guardarPoblacion).not.toHaveBeenCalled()
  })

  test('un 409 de la API se muestra en el Dialog, que conserva lo escrito', async () => {
    guardarPoblacion.mockRejectedValue(
      new ErrorApi(
        409,
        'POBLACION_EN_CONFLICTO',
        'Otra persona guardó esta población al mismo tiempo. Vuelva a intentarlo.',
      ),
    )
    await abrir(undefined, PERMISOS_REGISTRAR)

    editar('San Marcos')
    escribir('Menores de 1 año', '1460')
    confirmar()

    expect(
      await within(dialogo()).findByText('Otra persona guardó esta población al mismo tiempo. Vuelva a intentarlo.'),
    ).toBeTruthy()
    expect(campo('Menores de 1 año').value).toBe('1460')
    expect(within(dialogo()).getByRole('button', { name: 'Guardar' }).disabled).toBe(false)
  })

  test('sin POBLACION_REGISTRAR no hay columna de acciones', async () => {
    await abrir()

    expect(encabezados()).not.toContain('Acciones')
    expect(within(tabla()).queryByRole('button', { name: 'Editar' })).toBeNull()
  })
})
