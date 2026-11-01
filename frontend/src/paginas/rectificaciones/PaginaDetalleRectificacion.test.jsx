import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { ErrorApi } from '@/api/cliente.js'
import { obtenerRectificacion } from '@/api/rectificaciones.js'
import PaginaDetalleRectificacion from './PaginaDetalleRectificacion.jsx'

vi.mock('@/api/rectificaciones.js', () => ({ obtenerRectificacion: vi.fn() }))

const SOLICITUD = {
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
  resueltoPor: null,
  comentarioResolucion: null,
  resueltoEn: null,
  aplicadoEn: null,
  cambios: [
    {
      vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
      dosis: { codigo: 'D3', nombre: '3.ª dosis' },
      municipioProcedencia: { id: 1, nombre: 'San Marcos' },
      dimensiones: [
        { codigo: 'grupo_edad', nombre: 'Grupo de edad', valor: 'MENOR_1', etiqueta: '< 1 año' },
        { codigo: 'sexo', nombre: 'Sexo', valor: 'F', etiqueta: 'Femenino' },
      ],
      claveCombinacion: 'grupo_edad=MENOR_1|sexo=F',
      celdaNueva: false,
      cantidadAnterior: 87,
      cantidadNueva: 93,
    },
    {
      vacuna: { id: 5, codigo: 'BCG', nombre: 'BCG' },
      dosis: { codigo: 'UNICA', nombre: 'Dosis única' },
      municipioProcedencia: { id: 2, nombre: 'San Pedro Sacatepéquez' },
      dimensiones: [],
      claveCombinacion: '',
      celdaNueva: true,
      cantidadAnterior: 0,
      cantidadNueva: 4,
    },
    {
      vacuna: { id: 5, codigo: 'BCG', nombre: 'BCG' },
      dosis: { codigo: 'UNICA', nombre: 'Dosis única' },
      municipioProcedencia: { id: 1, nombre: 'San Marcos' },
      dimensiones: [],
      claveCombinacion: '',
      celdaNueva: false,
      cantidadAnterior: 10,
      cantidadNueva: 7,
    },
  ],
}

function montar({ state } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/rectificaciones/:id', element: <PaginaDetalleRectificacion /> },
      { path: '/rectificaciones', element: <p>Lista</p> },
    ],
    { initialEntries: [{ pathname: '/rectificaciones/7', state }] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const filaDe = (texto) => within(screen.getByRole('table', { name: 'Cambios' })).getAllByText(texto)[0].closest('tr')

beforeEach(() => {
  vi.clearAllMocks()
  obtenerRectificacion.mockResolvedValue(SOLICITUD)
})

test('muestra la solicitud con su estado, la justificación y la tabla de cambios', async () => {
  montar()

  expect(await screen.findByRole('heading', { name: 'Rectificación de agosto de 2026' })).toBeTruthy()
  expect(obtenerRectificacion).toHaveBeenCalledWith('7')
  expect(screen.getByText('Centro de Salud San Marcos')).toBeTruthy()
  expect(screen.getByText('Pendiente')).toBeTruthy()
  expect(screen.getByText(/^Marta López · /)).toBeTruthy()
  expect(screen.getByText('Faltó sumar la jornada del 28 de agosto.')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Cambios (3)' })).toBeTruthy()
  expect(screen.queryByText('Resuelta por')).toBeNull()

  const hexa = filaDe('Hexavalente')
  expect([...hexa.querySelectorAll('td')].map((celda) => celda.textContent)).toEqual([
    'Hexavalente',
    '3.ª dosis',
    'San Marcos',
    '< 1 año · Femenino',
    '87',
    '93',
    '+6',
  ])
  const filasBcg = within(screen.getByRole('table', { name: 'Cambios' }))
    .getAllByText('BCG')
    .map((celda) => [...celda.closest('tr').querySelectorAll('td')].map((td) => td.textContent))
  expect(filasBcg).toEqual([
    ['BCG', 'Dosis única', 'San Pedro Sacatepéquez', 'Sin desagregación', 'Vacía', '4', '+4'],
    ['BCG', 'Dosis única', 'San Marcos', 'Sin desagregación', '10', '7', '−3'],
  ])
})

test('una solicitud resuelta muestra quién la resolvió y su comentario', async () => {
  obtenerRectificacion.mockResolvedValue({
    ...SOLICITUD,
    estado: 'RECHAZADA',
    resueltoPor: { id: 2, nombre: 'Ana Pérez' },
    resueltoEn: '2026-11-02T15:00:00.000Z',
    comentarioResolucion: 'No coincide con el libro de vacunación.',
  })
  montar()

  expect(await screen.findByText('Rechazada')).toBeTruthy()
  expect(screen.getByText(/^Ana Pérez · /)).toBeTruthy()
  expect(screen.getByText('No coincide con el libro de vacunación.')).toBeTruthy()
})

test('«Volver a las solicitudes» conserva los filtros de la lista', async () => {
  montar({ state: { volverA: '?estado=PENDIENTE' } })

  const volver = await screen.findByRole('link', { name: 'Volver a las solicitudes' })
  expect(volver.getAttribute('href')).toBe('/rectificaciones?estado=PENDIENTE')
})

test('un error muestra el mensaje y «Reintentar» vuelve a pedir la solicitud', async () => {
  obtenerRectificacion.mockRejectedValueOnce(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  montar()

  expect(await screen.findByText(/No se pudo cargar la solicitud: El recurso solicitado no existe\./)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Rectificación de agosto de 2026' })).toBeTruthy())
  expect(obtenerRectificacion).toHaveBeenCalledTimes(2)
})
