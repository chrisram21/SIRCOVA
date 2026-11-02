import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ErrorApi } from '@/api/cliente.js'
import { listarRectificaciones } from '@/api/rectificaciones.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaRectificaciones from './PaginaRectificaciones.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/rectificaciones.js', () => ({ listarRectificaciones: vi.fn() }))

const SOLICITUDES = [
  {
    id: 7,
    reporte: {
      id: 412,
      establecimiento: { id: 1, codigo: 'CS-1201', nombre: 'Centro de Salud San Marcos' },
      periodo: { id: 8, anio: 2026, mes: 8 },
      estado: 'CERRADO',
    },
    estado: 'PENDIENTE',
    motivo: 'Faltó sumar la jornada del 28 de agosto.',
    solicitadoPor: { id: 13, nombre: 'Marta López' },
    solicitadoEn: '2026-10-31T16:00:00.000Z',
    cambios: 2,
  },
  {
    id: 3,
    reporte: {
      id: 190,
      establecimiento: { id: 2, codigo: 'CS-1202', nombre: 'Centro de Salud San Pedro' },
      periodo: { id: 7, anio: 2026, mes: 7 },
      estado: 'CERRADO',
    },
    estado: 'APLICADA',
    motivo: 'Se digitó Hexavalente D2 de otro municipio como propia.',
    solicitadoPor: { id: 10, nombre: 'Juan Pérez' },
    solicitadoEn: '2026-10-16T15:45:00.000Z',
    cambios: 1,
  },
]

const respuesta = (elementos = SOLICITUDES, extra = {}) => ({
  elementos,
  total: elementos.length,
  pagina: 1,
  porPagina: 20,
  ...extra,
})

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '13', exp })}.firma`,
    usuario: {
      id: 13,
      nombreUsuario: 'cs1201',
      rol: 'ESTABLECIMIENTO',
      permisos,
      empleado: { nombres: 'Marta', apellidos: 'López', ddrissId: 1, establecimientoId: 1, municipioId: 1 },
    },
  }
}

async function montar({ url = '/rectificaciones', permisos = ['RECTIFICACION_CONSULTAR', 'RECTIFICACION_SOLICITAR'] } = {}) {
  guardarSesion(crearSesion(permisos))
  const router = createMemoryRouter(
    [
      {
        path: '/rectificaciones',
        element: (
          <ProveedorSesion>
            <PaginaRectificaciones />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.queryByLabelText('Cargando solicitudes')).toBeNull())
  return router
}

const fila = (texto) => screen.getByText(texto).closest('tr')
const nativo = () => document.querySelector('select[name="estado"]')

beforeEach(() => {
  vi.clearAllMocks()
  listarRectificaciones.mockResolvedValue(respuesta())
})

test('muestra cada solicitud con su mes, establecimiento, estado, solicitante y celdas', async () => {
  await montar()

  expect(listarRectificaciones).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 })
  expect(screen.getAllByRole('row')).toHaveLength(SOLICITUDES.length + 1)
  const agosto = within(fila('Agosto de 2026'))
  expect(agosto.getByText('Centro de Salud San Marcos')).toBeTruthy()
  expect(agosto.getByText('Pendiente')).toBeTruthy()
  expect(agosto.getByText('Marta López')).toBeTruthy()
  expect(agosto.getByText('2')).toBeTruthy()
  expect(within(fila('Julio de 2026')).getByText('Aplicada')).toBeTruthy()
  const ver = agosto.getByRole('link', { name: 'Ver la solicitud de Agosto de 2026, Centro de Salud San Marcos' })
  expect(ver.getAttribute('href')).toBe('/rectificaciones/7')
})

test('«Nueva solicitud» aparece solo con RECTIFICACION_SOLICITAR', async () => {
  await montar()
  expect(screen.getByRole('link', { name: 'Nueva solicitud' }).getAttribute('href')).toBe('/rectificaciones/nueva')
})

test('sin RECTIFICACION_SOLICITAR no aparece «Nueva solicitud»', async () => {
  await montar({ permisos: ['RECTIFICACION_CONSULTAR'] })
  expect(screen.queryByRole('link', { name: 'Nueva solicitud' })).toBeNull()
})

test('el filtro de estado y la página van en la URL y en la consulta', async () => {
  const router = await montar({ url: '/rectificaciones?estado=PENDIENTE&pagina=2' })
  expect(listarRectificaciones).toHaveBeenLastCalledWith({ estado: 'PENDIENTE', pagina: 2, porPagina: 20 })

  fireEvent.change(nativo(), { target: { value: 'APLICADA' } })
  await waitFor(() => expect(router.state.location.search).toBe('?estado=APLICADA'))
  await waitFor(() => expect(listarRectificaciones).toHaveBeenLastCalledWith({ estado: 'APLICADA', pagina: 1, porPagina: 20 }))

  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  await waitFor(() => expect(router.state.location.search).toBe(''))
})

test('un estado inválido en la URL se ignora', async () => {
  await montar({ url: '/rectificaciones?estado=ABIERTA' })
  expect(listarRectificaciones).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 })
})

test('sin solicitudes muestra un mensaje, y con filtro, otro', async () => {
  listarRectificaciones.mockResolvedValue(respuesta([]))
  await montar()
  expect(screen.getByText('Todavía no hay solicitudes de rectificación.')).toBeTruthy()
})

test('con filtro y sin resultados dice que no hay solicitudes con ese estado', async () => {
  listarRectificaciones.mockResolvedValue(respuesta([]))
  await montar({ url: '/rectificaciones?estado=RECHAZADA' })
  expect(screen.getByText('No hay solicitudes con este estado.')).toBeTruthy()
})

test('una carga fallida muestra el error y «Reintentar» vuelve a pedir la lista', async () => {
  listarRectificaciones.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error interno.'))
  await montar()

  expect(screen.getByText(/No se pudieron cargar las solicitudes/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getByText('Agosto de 2026')).toBeTruthy())
  expect(listarRectificaciones).toHaveBeenCalledTimes(2)
})

describe('quien resuelve (SPEC 41)', () => {
  const RESUELVE = ['RECTIFICACION_CONSULTAR', 'RECTIFICACION_RESOLVER']

  test('sin estado en la URL pide las PENDIENTE, y «Todos los estados» guarda estado=todos', async () => {
    const router = await montar({ permisos: RESUELVE })
    expect(listarRectificaciones).toHaveBeenCalledWith({ estado: 'PENDIENTE', pagina: 1, porPagina: 20 })
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull()

    fireEvent.change(nativo(), { target: { value: 'todos' } })
    await waitFor(() => expect(router.state.location.search).toBe('?estado=todos'))
    await waitFor(() => expect(listarRectificaciones).toHaveBeenLastCalledWith({ pagina: 1, porPagina: 20 }))

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await waitFor(() =>
      expect(listarRectificaciones).toHaveBeenLastCalledWith({ estado: 'PENDIENTE', pagina: 1, porPagina: 20 }),
    )
  })

  test('elegir PENDIENTE no escribe el estado en la URL, y otro estado sí', async () => {
    const router = await montar({ url: '/rectificaciones?estado=APLICADA', permisos: RESUELVE })
    expect(listarRectificaciones).toHaveBeenLastCalledWith({ estado: 'APLICADA', pagina: 1, porPagina: 20 })
    fireEvent.change(nativo(), { target: { value: 'PENDIENTE' } })
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  test('sin RECTIFICACION_RESOLVER, «todos» en la URL es lo mismo que no filtrar', async () => {
    await montar({ url: '/rectificaciones?estado=todos' })
    expect(listarRectificaciones).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 })
  })
})
