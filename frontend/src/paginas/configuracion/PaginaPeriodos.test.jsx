import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { abrirPeriodo, cambiarFechaLimite, crearAnioPeriodos, listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaPeriodos from './PaginaPeriodos.jsx'

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
}))

const dosDigitos = (n) => String(n).padStart(2, '0')
const finDeMes = (anio, mes) => `${anio}-${dosDigitos(mes)}-${dosDigitos(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`

let siguienteId = 1
// Los 12 meses de un año; `estados` da, por mes, [estado, fechaLimiteEnvio].
const anio = (numero, estados = {}) =>
  Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    const [estado, fechaLimiteEnvio] = estados[mes] ?? [null, null]
    return {
      id: siguienteId++,
      anio: numero,
      mes,
      fechaInicio: `${numero}-${dosDigitos(mes)}-01`,
      fechaFin: finDeMes(numero, mes),
      estado,
      fechaLimiteEnvio,
      cerradoEn: estado === 'CERRADO' ? `${numero}-${dosDigitos(mes + 1)}-20T22:00:00.000Z` : null,
    }
  })

const PERIODOS = [
  ...anio(2025),
  ...anio(2026, {
    8: ['CERRADO', '2026-09-10'],
    9: ['EN_CIERRE', '2026-10-10'],
    10: ['ABIERTO', '2026-11-10'],
  }),
  ...anio(2027),
]

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'PERIODO_CONSULTAR']
const PERMISOS_CREAR = [...PERMISOS, 'PERIODO_CREAR']
const PERMISOS_EDITAR = [...PERMISOS, 'PERIODO_EDITAR']
const PERMISOS_REVISOR = [
  'CONFIGURACION_CONSULTAR',
  'VACUNA_CONSULTAR',
  'VACUNA_CREAR',
  'VACUNA_EDITAR',
  'PERIODO_CONSULTAR',
  'PERIODO_CREAR',
  'PERIODO_EDITAR',
]

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'mlopez',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
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
        <PaginaPeriodos />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

async function abrir(ruta = '/administracion/periodos', permisos = PERMISOS) {
  montar(ruta, permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando periodos')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Periodos' })
const filas = () => within(tabla()).getAllByRole('row').slice(1)
const textoDe = (fila) => within(fila).getAllByRole('cell').map((c) => c.textContent)
const filaDe = (mes) => within(tabla()).getByRole('cell', { name: mes }).closest('tr')
const selectAnio = () => document.querySelector('select[name="anio"]')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  // Solo se finge la fecha: el "año actual" de la pestaña es 2026.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-23T18:00:00Z'))
  listarPeriodos.mockResolvedValue(PERIODOS)
})

afterEach(() => {
  vi.useRealTimers()
})

test('la tabla muestra los 12 meses del año actual con sus fechas y su estado, y pide la lista una vez', async () => {
  await abrir()

  expect(listarPeriodos).toHaveBeenCalledTimes(1)
  expect(listarPeriodos).toHaveBeenCalledWith()
  expect(screen.getByText('El calendario es común; el estado y la fecha límite son de su DDRISS.')).toBeTruthy()
  expect(filas()).toHaveLength(12)
  expect(textoDe(filas()[0])).toEqual(['Enero', '01/01/2026 – 31/01/2026', '—', 'Sin abrir'])
  expect(textoDe(filaDe('Febrero'))[1]).toBe('01/02/2026 – 28/02/2026')
  expect(textoDe(filaDe('Agosto'))).toEqual(['Agosto', '01/08/2026 – 31/08/2026', '10/09/2026', 'Cerrado'])
  expect(textoDe(filaDe('Septiembre')).slice(2)).toEqual(['10/10/2026', 'En cierre'])
  expect(textoDe(filaDe('Octubre')).slice(2)).toEqual(['10/11/2026', 'Abierto'])
  expect(textoDe(filaDe('Diciembre')).slice(2)).toEqual(['—', 'Sin abrir'])
})

test('el Select ofrece los años del más reciente al más antiguo, con el actual elegido', async () => {
  await abrir()

  expect([...selectAnio().options].map((o) => o.value)).toEqual(['2027', '2026', '2025'])
  expect(selectAnio().value).toBe('2026')
})

test('cambiar el año cambia la tabla sin pedir de nuevo y queda en la URL', async () => {
  await abrir()

  fireEvent.change(selectAnio(), { target: { value: '2027' } })

  await waitFor(() => expect(textoDe(filas()[0])[1]).toBe('01/01/2027 – 31/01/2027'))
  expect(ubicacion()).toBe('?anio=2027')
  expect(listarPeriodos).toHaveBeenCalledTimes(1)
})

test('el año de la URL se aplica al abrir', async () => {
  await abrir('/administracion/periodos?anio=2025')
  expect(selectAnio().value).toBe('2025')
  expect(textoDe(filas()[1])[1]).toBe('01/02/2025 – 28/02/2025')
})

test('con un año de la URL que no está se elige el actual', async () => {
  await abrir('/administracion/periodos?anio=2019')

  expect(selectAnio().value).toBe('2026')
})

test('sin el año actual en el calendario se elige el más reciente', async () => {
  listarPeriodos.mockResolvedValue(anio(2024).concat(anio(2025)))

  await abrir()

  expect(selectAnio().value).toBe('2025')
})

test('sin años en el calendario muestra "No hay años en el calendario."', async () => {
  listarPeriodos.mockResolvedValue([])

  await abrir()

  expect(screen.getByText('No hay años en el calendario.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('si falla la petición muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarPeriodos.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))

  await abrir()

  expect(await screen.findByText('No se pudieron cargar los periodos: Ocurrió un error inesperado.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(listarPeriodos).toHaveBeenCalledTimes(2)
})

test('con los permisos del Revisor se ve la pantalla Periodos', async () => {
  await abrir('/administracion/periodos', PERMISOS_REVISOR)

  expect(screen.getByRole('heading', { level: 1, name: 'Periodos' })).toBeTruthy()
})

describe('Crear año', () => {
  // El de la tarjeta; con el calendario vacío hay otro junto al aviso.
  const boton = () => screen.getAllByRole('button', { name: 'Crear año' })[0]
  const selectNuevo = () => document.querySelector('select[name="anioNuevo"]')
  const dialogo = () => screen.getByRole('dialog', { name: 'Crear año' })

  test('el Select ofrece solo los años del rango que no tienen sus 12 meses, el incompleto incluido', async () => {
    // 2024 tiene solo 6 meses; 2025 a 2027 están completos.
    listarPeriodos.mockResolvedValue([...anio(2024).slice(0, 6), ...PERIODOS])
    await abrir(undefined, PERMISOS_CREAR)

    fireEvent.click(boton())

    expect(dialogo()).toBeTruthy()
    expect([...selectNuevo().options].map((o) => o.value)).toEqual(['2024', '2023', '2022', '2021', '2020'])
    expect(selectNuevo().value).toBe('2024')
  })

  test('confirmar llama a crearAnioPeriodos, muestra el aviso y deja elegido el año nuevo', async () => {
    crearAnioPeriodos.mockResolvedValue(anio(2023))
    await abrir(undefined, PERMISOS_CREAR)

    fireEvent.click(boton())
    fireEvent.change(selectNuevo(), { target: { value: '2023' } })
    fireEvent.click(within(dialogo()).getByRole('button', { name: 'Crear año' }))

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Año 2023 agregado al calendario. Abra cada mes cuando corresponda.'),
    )
    expect(crearAnioPeriodos).toHaveBeenCalledWith(2023)
    expect(screen.queryByRole('dialog')).toBeNull()
    // Radix actualiza su <select> nativo en un efecto, después del render.
    await waitFor(() => expect(selectAnio().value).toBe('2023'))
    expect(ubicacion()).toBe('?anio=2023')
    expect(textoDe(filas()[0])).toEqual(['Enero', '01/01/2023 – 31/01/2023', '—', 'Sin abrir'])
    expect(listarPeriodos).toHaveBeenCalledTimes(1)
  })

  test('un error de la API se muestra en el Dialog, que sigue abierto', async () => {
    crearAnioPeriodos.mockRejectedValue(
      new ErrorApi(409, 'PERIODO_ANIO_EXISTENTE', 'El año 2024 ya tiene sus 12 meses en el calendario.'),
    )
    await abrir(undefined, PERMISOS_CREAR)

    fireEvent.click(boton())
    fireEvent.click(within(dialogo()).getByRole('button', { name: 'Crear año' }))

    expect(await within(dialogo()).findByText('El año 2024 ya tiene sus 12 meses en el calendario.')).toBeTruthy()
    expect(selectAnio().value).toBe('2026')
  })

  test('con todos los años del rango completos el botón está deshabilitado', async () => {
    listarPeriodos.mockResolvedValue([2020, 2021, 2022, 2023, 2024, 2025, 2026, 2027].flatMap((n) => anio(n)))
    await abrir(undefined, PERMISOS_CREAR)

    expect(boton().disabled).toBe(true)
    expect(boton().getAttribute('title')).toBe('Todos los años del rango ya están en el calendario')
  })

  test('con el calendario vacío se puede crear un año', async () => {
    listarPeriodos.mockResolvedValue([])
    await abrir(undefined, PERMISOS_CREAR)

    expect(screen.getByText('No hay años en el calendario.')).toBeTruthy()
    expect(boton().disabled).toBe(false)
  })

  test('con el calendario vacío, el aviso trae su propio "Crear año", que abre el Dialog', async () => {
    listarPeriodos.mockResolvedValue([])
    await abrir(undefined, PERMISOS_CREAR)

    const vacio = screen.getByText('No hay años en el calendario.').parentElement
    fireEvent.click(within(vacio).getByRole('button', { name: 'Crear año' }))

    expect(dialogo()).toBeTruthy()
  })

  test('sin PERIODO_CREAR no aparece el botón', async () => {
    await abrir()

    expect(screen.queryByRole('button', { name: 'Crear año' })).toBeNull()
  })

  test('sin PERIODO_CREAR el calendario vacío no ofrece crear', async () => {
    listarPeriodos.mockResolvedValue([])
    await abrir()

    expect(screen.getByText('No hay años en el calendario.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Crear año' })).toBeNull()
  })
})

describe('Abrir y cambiar la fecha límite', () => {
  const periodoDe = (anioBuscado, mes) => PERIODOS.find((p) => p.anio === anioBuscado && p.mes === mes)
  const accionDe = (mes) => within(filaDe(mes)).queryByRole('button')
  const campoFecha = () => screen.getByLabelText('Fecha límite de envío')
  const confirmar = (nombre) => fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: nombre }))

  test('"Abrir" en noviembre viene con el 10 de diciembre, llama a abrirPeriodo y la fila queda Abierto', async () => {
    const noviembre = periodoDe(2026, 11)
    abrirPeriodo.mockResolvedValue({ ...noviembre, estado: 'ABIERTO', fechaLimiteEnvio: '2026-12-10' })
    await abrir(undefined, PERMISOS_EDITAR)

    fireEvent.click(accionDe('Noviembre'))

    expect(screen.getByRole('dialog', { name: 'Abrir Noviembre 2026' })).toBeTruthy()
    expect(campoFecha().value).toBe('2026-12-10')
    confirmar('Abrir mes')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(abrirPeriodo).toHaveBeenCalledWith(noviembre.id, '2026-12-10')
    expect(textoDe(filaDe('Noviembre')).slice(2)).toEqual(['10/12/2026', 'Abierto', 'Cambiar fecha límite'])
    expect(toast.success).toHaveBeenCalledWith('Noviembre 2026 abierto; fecha límite 10/12/2026.')
  })

  test('en diciembre la fecha sugerida es el 10 de enero del año siguiente', async () => {
    await abrir(undefined, PERMISOS_EDITAR)

    fireEvent.click(accionDe('Diciembre'))

    expect(campoFecha().value).toBe('2027-01-10')
  })

  test('una fecha igual al fin del mes muestra el error y no llama a la API', async () => {
    await abrir(undefined, PERMISOS_EDITAR)

    fireEvent.click(accionDe('Noviembre'))
    fireEvent.change(campoFecha(), { target: { value: '2026-11-30' } })
    confirmar('Abrir mes')

    expect(await screen.findByText('La fecha límite debe ser posterior al 2026-11-30.')).toBeTruthy()
    expect(abrirPeriodo).not.toHaveBeenCalled()
  })

  test('en un mes en cierre muestra el aviso de reapertura y la fila toma el estado de la respuesta', async () => {
    const septiembre = periodoDe(2026, 9)
    cambiarFechaLimite.mockResolvedValue({ ...septiembre, estado: 'ABIERTO', fechaLimiteEnvio: '2026-10-30' })
    await abrir(undefined, PERMISOS_EDITAR)

    expect(accionDe('Septiembre').textContent).toBe('Cambiar fecha límite')
    fireEvent.click(accionDe('Septiembre'))

    expect(screen.getByRole('dialog', { name: 'Cambiar la fecha límite de Septiembre 2026' })).toBeTruthy()
    expect(campoFecha().value).toBe('2026-10-10')
    expect(
      screen.getByText(
        'Si la nueva fecha es hoy o posterior, el mes vuelve a Abierto y los establecimientos pueden enviar de nuevo.',
      ),
    ).toBeTruthy()
    fireEvent.change(campoFecha(), { target: { value: '2026-10-30' } })
    confirmar('Guardar')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(cambiarFechaLimite).toHaveBeenCalledWith(septiembre.id, '2026-10-30')
    expect(textoDe(filaDe('Septiembre')).slice(2, 4)).toEqual(['30/10/2026', 'Abierto'])
    expect(toast.success).toHaveBeenCalledWith(
      'Fecha límite de Septiembre 2026 cambiada al 30/10/2026. El mes volvió a Abierto.',
    )
  })

  test('cambiar la fecha de un mes abierto lo avisa sin mencionar la reapertura', async () => {
    const octubre = periodoDe(2026, 10)
    cambiarFechaLimite.mockResolvedValue({ ...octubre, fechaLimiteEnvio: '2026-11-15' })
    await abrir(undefined, PERMISOS_EDITAR)

    fireEvent.click(accionDe('Octubre'))
    fireEvent.change(campoFecha(), { target: { value: '2026-11-15' } })
    confirmar('Guardar')

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(toast.success).toHaveBeenCalledWith('Fecha límite de Octubre 2026 cambiada al 15/11/2026.')
  })

  test('en un mes abierto no muestra el aviso de reapertura', async () => {
    await abrir(undefined, PERMISOS_EDITAR)

    fireEvent.click(accionDe('Octubre'))

    expect(campoFecha().value).toBe('2026-11-10')
    expect(screen.queryByText(/el mes vuelve a Abierto/)).toBeNull()
  })

  test('un 409 de la API se muestra en el Dialog, que conserva la fecha', async () => {
    abrirPeriodo.mockRejectedValue(new ErrorApi(409, 'PERIODO_YA_ABIERTO', 'El mes ya fue abierto en su DDRISS.'))
    await abrir(undefined, PERMISOS_EDITAR)

    fireEvent.click(accionDe('Noviembre'))
    fireEvent.change(campoFecha(), { target: { value: '2026-12-15' } })
    confirmar('Abrir mes')

    expect(await within(screen.getByRole('dialog')).findByText('El mes ya fue abierto en su DDRISS.')).toBeTruthy()
    expect(campoFecha().value).toBe('2026-12-15')

    // Con el Dialog abierto, Radix deja el resto de la página aria-hidden.
    confirmar('Cancelar')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(textoDe(filaDe('Noviembre')).slice(2, 4)).toEqual(['—', 'Sin abrir'])
  })

  test('un mes cerrado no tiene acciones', async () => {
    await abrir(undefined, PERMISOS_EDITAR)

    expect(accionDe('Agosto')).toBeNull()
    expect(accionDe('Enero').textContent).toBe('Abrir')
  })

  test('sin PERIODO_EDITAR no hay columna de acciones', async () => {
    await abrir()

    expect(within(tabla()).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(within(tabla()).queryAllByRole('button')).toHaveLength(0)
  })
})
