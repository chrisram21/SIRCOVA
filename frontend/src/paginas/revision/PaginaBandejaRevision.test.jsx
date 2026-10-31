import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { listarMunicipios, listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { asignarRevisor, listarRevisores, obtenerBandeja } from '@/api/revision.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaBandejaRevision, { mesesDeLaDdriss, mesPorDefecto } from './PaginaBandejaRevision.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn(), listarMunicipios: vi.fn() }))
vi.mock('@/api/revision.js', () => ({
  obtenerBandeja: vi.fn(),
  listarRevisores: vi.fn(),
  asignarRevisor: vi.fn(),
  reasignarRevisor: vi.fn(),
}))

const YO = 2
const periodo = (id, mes, estado) => ({ id, anio: 2026, mes, estado, fechaInicio: '', fechaFin: '', fechaLimiteEnvio: null, cerradoEn: null })
// Agosto cerrado, septiembre y octubre abiertos y noviembre sin abrir en la DDRISS.
const PERIODOS = [periodo(8, 8, 'CERRADO'), periodo(9, 9, 'ABIERTO'), periodo(10, 10, 'ABIERTO'), periodo(11, 11, null)]
const MUNICIPIOS = [
  { id: 1, nombre: 'San Marcos' },
  { id: 9, nombre: 'Tajumulco' },
]

const fila = (id, estado, cambios = {}) => ({
  reporteId: estado ? 500 + id : null,
  versionFila: estado ? 3 : null,
  establecimiento: { id, codigo: `CS-12${id}`, nombre: `Centro de Salud ${id}` },
  municipio: { id: 1, nombre: `Municipio ${id}` },
  estado,
  enviadoEn: estado && estado !== 'BORRADOR' ? '2026-09-22T16:00:00.000Z' : null,
  revisor: null,
  advertencias: 0,
  dosisTotales: estado ? 100 : null,
  ...cambios,
})
const FILAS = [
  fila(1, 'ENVIADO', { advertencias: 1, dosisTotales: 1184 }),
  fila(2, 'EN_REVISION', { revisor: { id: YO, nombre: 'Ana Pérez' } }),
  fila(3, 'EN_REVISION', { revisor: { id: 3, nombre: 'Luis Gómez' }, advertencias: 2 }),
  fila(4, null),
]
const CONTEOS = {
  POR_ATENDER: 3,
  ASIGNADOS_A_MI: 1,
  EN_REVISION: 2,
  ENVIADO: 1,
  CORRECCION_SOLICITADA: 0,
  SIN_ENVIAR: 1,
  APROBADO: 0,
  CERRADO: 0,
  TODOS: 4,
}
const bandeja = (elementos = FILAS) => ({ elementos, total: elementos.length, pagina: 1, porPagina: 20, conteos: CONTEOS })

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: String(YO), exp })}.firma`,
    usuario: {
      id: YO,
      nombreUsuario: 'estadigrafa',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'Ana', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

async function montar({ url = '/revision', permisos = ['REPORTE_REVISAR', 'REPORTE_ASIGNAR'] } = {}) {
  guardarSesion(crearSesion(permisos))
  const router = createMemoryRouter(
    [
      {
        path: '/revision',
        element: (
          <ProveedorSesion>
            <PaginaBandejaRevision />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.queryByLabelText('Cargando bandeja')).toBeNull())
  await waitFor(() => expect(obtenerBandeja).toHaveBeenCalled())
  return router
}

const tabla = () => within(screen.getByRole('table'))
const filaDe = (nombre) => tabla().getByText(nombre).closest('tr')
const chip = (nombre) => within(screen.getByRole('group', { name: 'Estado de los reportes' })).getByRole('button', { name: new RegExp(`^${nombre}`) })

beforeEach(() => {
  vi.clearAllMocks()
  listarPeriodos.mockResolvedValue(PERIODOS)
  listarMunicipios.mockResolvedValue(MUNICIPIOS)
  obtenerBandeja.mockResolvedValue(bandeja())
  listarRevisores.mockResolvedValue([{ id: YO, nombre: 'Ana Pérez' }, { id: 3, nombre: 'Luis Gómez' }])
})

test('los meses son los de la DDRISS; por defecto, el abierto más antiguo, y sin abiertos, el más reciente', () => {
  const meses = mesesDeLaDdriss(PERIODOS)
  expect(meses.map((p) => p.id)).toEqual([10, 9, 8])
  expect(mesPorDefecto(meses).id).toBe(9)
  expect(mesPorDefecto(mesesDeLaDdriss([periodo(7, 7, 'CERRADO'), periodo(8, 8, 'CERRADO')])).id).toBe(8)
  expect(mesPorDefecto([])).toBeNull()
})

test('abre el mes por defecto en «Por atender», con los conteos en los chips', async () => {
  await montar()

  expect(obtenerBandeja).toHaveBeenCalledWith({ periodoId: 9, municipioId: undefined, grupo: 'POR_ATENDER', pagina: 1, porPagina: 20 })
  expect(screen.getByText('Revisión y cierre · Periodo septiembre de 2026')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Bandeja de revisión' })).toBeTruthy()
  await waitFor(() => expect(chip('Por atender').textContent).toBe('Por atender3'))
  expect(chip('Por atender').getAttribute('aria-pressed')).toBe('true')
  expect(chip('Sin enviar').textContent).toBe('Sin enviar1')
  const opciones = [...document.querySelectorAll('select[name="periodo"] option')].map((o) => o.textContent)
  expect(opciones).toEqual(['octubre de 2026', 'septiembre de 2026', 'agosto de 2026 · cerrado'])
})

test('un chip, el mes y el municipio cambian la URL y lo que se pide', async () => {
  const router = await montar()

  fireEvent.click(chip('Sin enviar'))
  await waitFor(() => expect(router.state.location.search).toBe('?periodo=9&grupo=SIN_ENVIAR'))
  await waitFor(() => expect(obtenerBandeja).toHaveBeenLastCalledWith(expect.objectContaining({ grupo: 'SIN_ENVIAR' })))

  fireEvent.change(document.querySelector('select[name="periodo"]'), { target: { value: '8' } })
  await waitFor(() => expect(router.state.location.search).toBe('?periodo=8&grupo=SIN_ENVIAR'))
  fireEvent.change(document.querySelector('select[name="municipio"]'), { target: { value: '9' } })
  await waitFor(() => expect(router.state.location.search).toBe('?periodo=8&municipio=9&grupo=SIN_ENVIAR'))
  await waitFor(() =>
    expect(obtenerBandeja).toHaveBeenLastCalledWith({ periodoId: 8, municipioId: 9, grupo: 'SIN_ENVIAR', pagina: 1, porPagina: 20 }),
  )
})

test('respeta el mes de la URL, también uno cerrado', async () => {
  await montar({ url: '/revision?periodo=8&grupo=TODOS' })
  expect(obtenerBandeja).toHaveBeenCalledWith(expect.objectContaining({ periodoId: 8, grupo: 'TODOS' }))
  expect(screen.getByText('Revisión y cierre · Periodo agosto de 2026')).toBeTruthy()
})

test('las columnas muestran el envío, el estado, la validación, las dosis y el revisor; una fila sin reporte, guiones', async () => {
  await montar()
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

  const enviada = within(filaDe('Centro de Salud 1'))
  expect(enviada.getByText('Municipio 1')).toBeTruthy()
  expect(enviada.getByText('Enviado')).toBeTruthy()
  expect(enviada.getByText('1 advertencia')).toBeTruthy()
  expect(enviada.getByText('1,184')).toBeTruthy()
  expect(within(filaDe('Centro de Salud 2')).getByText('Ana Pérez (usted)')).toBeTruthy()
  expect(within(filaDe('Centro de Salud 2')).getByText('Sin advertencias')).toBeTruthy()
  expect(within(filaDe('Centro de Salud 3')).getByText('2 advertencias')).toBeTruthy()
  const sinReporte = within(filaDe('Centro de Salud 4'))
  expect(sinReporte.getByText('Sin reporte')).toBeTruthy()
  expect(sinReporte.getAllByText('—')).toHaveLength(4)
})

test('«Asignar» solo en los enviados y «Reasignar» solo en los propios en revisión', async () => {
  await montar()
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

  expect(within(filaDe('Centro de Salud 1')).getByRole('button', { name: 'Asignar' })).toBeTruthy()
  expect(within(filaDe('Centro de Salud 2')).getByRole('button', { name: 'Reasignar' })).toBeTruthy()
  expect(within(filaDe('Centro de Salud 3')).queryByRole('button')).toBeNull()
  expect(within(filaDe('Centro de Salud 4')).queryByRole('button')).toBeNull()
})

test('sin REPORTE_ASIGNAR no hay acciones', async () => {
  await montar({ permisos: ['REPORTE_REVISAR'] })
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
  expect(tabla().queryByRole('button', { name: 'Asignar' })).toBeNull()
  expect(tabla().queryByRole('button', { name: 'Reasignar' })).toBeNull()
})

test('asignar avisa con un toast y vuelve a cargar la bandeja', async () => {
  asignarRevisor.mockResolvedValue({ id: 501, estado: 'EN_REVISION' })
  await montar()
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())

  fireEvent.click(within(filaDe('Centro de Salud 1')).getByRole('button', { name: 'Asignar' }))
  const dialogo = within(await screen.findByRole('alertdialog'))
  await waitFor(() => expect(document.querySelector('select[name="revisor"]').disabled).toBe(false))
  fireEvent.click(dialogo.getByRole('button', { name: 'Asignármelo' }))

  await waitFor(() =>
    expect(toast.success).toHaveBeenCalledWith('El reporte de Centro de Salud 1 quedó asignado a usted.'),
  )
  expect(asignarRevisor).toHaveBeenCalledWith(501, { versionFila: 3, revisorId: YO })
  await waitFor(() => expect(obtenerBandeja).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
})

test('un grupo vacío lo dice', async () => {
  obtenerBandeja.mockResolvedValue(bandeja([]))
  await montar()
  expect(await screen.findByText('No hay reportes en este grupo.')).toBeTruthy()
})

test('si falla la carga se muestra el error y «Reintentar» vuelve a pedir', async () => {
  obtenerBandeja.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  await montar()

  expect(await screen.findByText(/No se pudo cargar la bandeja/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getByRole('table')).toBeTruthy())
  expect(obtenerBandeja).toHaveBeenCalledTimes(2)
})
