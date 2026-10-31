import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ErrorApi } from '@/api/cliente.js'
import { asignarRevisor, listarRevisores, reasignarRevisor } from '@/api/revision.js'
import DialogoAsignarRevisor from './DialogoAsignarRevisor.jsx'

vi.mock('@/api/revision.js', () => ({ asignarRevisor: vi.fn(), listarRevisores: vi.fn(), reasignarRevisor: vi.fn() }))

const YO = 2
const REVISORES = [
  { id: YO, nombre: 'Ana Pérez' },
  { id: 3, nombre: 'Luis Gómez' },
  { id: 7, nombre: 'Rosa Díaz' },
]
const FILA = {
  reporteId: 524,
  versionFila: 13,
  establecimiento: { id: 9, codigo: 'CS-1209', nombre: 'Centro de Salud Tajumulco' },
}
const props = { fila: FILA, usuarioId: YO, alHecho: vi.fn(), alRecargar: vi.fn(), alCerrar: vi.fn() }

async function abrir(modo = 'asignar') {
  render(<DialogoAsignarRevisor modo={modo} {...props} />)
  const dialogo = within(screen.getByRole('alertdialog'))
  await waitFor(() => expect(document.querySelector('select[name="revisor"]').disabled).toBe(false))
  return dialogo
}
const opciones = () => [...document.querySelectorAll('select[name="revisor"] option')].map((o) => o.textContent).filter(Boolean)
const elegir = (id) => fireEvent.change(document.querySelector('select[name="revisor"]'), { target: { value: String(id) } })

beforeEach(() => {
  vi.clearAllMocks()
  listarRevisores.mockResolvedValue(REVISORES)
})

test('al asignar ofrece «Asignármelo» y los otros revisores, sin el usuario', async () => {
  const dialogo = await abrir()

  expect(dialogo.getByText('Asignar el reporte')).toBeTruthy()
  expect(dialogo.getByRole('button', { name: 'Asignármelo' })).toBeTruthy()
  expect(opciones()).toEqual(['Luis Gómez', 'Rosa Díaz'])
})

test('«Asignármelo» asigna al usuario una sola vez con la versionFila', async () => {
  let responder
  asignarRevisor.mockReturnValue(new Promise((resolver) => (responder = resolver)))
  const dialogo = await abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Asignármelo' }))
  expect(dialogo.getByRole('button', { name: 'Guardando…' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(dialogo.getByRole('button', { name: 'Asignármelo' }))
  expect(asignarRevisor).toHaveBeenCalledTimes(1)
  expect(asignarRevisor).toHaveBeenCalledWith(524, { versionFila: 13, revisorId: YO })

  responder({ id: 524, estado: 'EN_REVISION' })
  await waitFor(() =>
    expect(props.alHecho).toHaveBeenCalledWith('El reporte de Centro de Salud Tajumulco quedó asignado a usted.'),
  )
})

test('«Asignar» sin elegir pide un revisor; con uno elegido, lo asigna', async () => {
  asignarRevisor.mockResolvedValue({ id: 524, estado: 'EN_REVISION' })
  const dialogo = await abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Asignar' }))
  expect(dialogo.getByText('Elija un revisor.')).toBeTruthy()
  expect(asignarRevisor).not.toHaveBeenCalled()

  elegir(7)
  fireEvent.click(dialogo.getByRole('button', { name: 'Asignar' }))
  await waitFor(() =>
    expect(props.alHecho).toHaveBeenCalledWith('El reporte de Centro de Salud Tajumulco quedó asignado a Rosa Díaz.'),
  )
  expect(asignarRevisor).toHaveBeenCalledWith(524, { versionFila: 13, revisorId: 7 })
})

test('al reasignar no ofrece «Asignármelo» ni al revisor actual, y llama a reasignar', async () => {
  reasignarRevisor.mockResolvedValue({ versionFila: 14, revisor: { id: 3, nombre: 'Luis Gómez' } })
  const dialogo = await abrir('reasignar')

  expect(dialogo.getByText('Pasar a otro revisor')).toBeTruthy()
  expect(dialogo.queryByRole('button', { name: 'Asignármelo' })).toBeNull()
  expect(opciones()).toEqual(['Luis Gómez', 'Rosa Díaz'])

  elegir(3)
  fireEvent.click(dialogo.getByRole('button', { name: 'Reasignar' }))
  await waitFor(() => expect(props.alHecho).toHaveBeenCalled())
  expect(reasignarRevisor).toHaveBeenCalledWith(524, { versionFila: 13, revisorId: 3 })
  expect(asignarRevisor).not.toHaveBeenCalled()
})

test('un 409 muestra el mensaje con «Recargar» y el diálogo sigue abierto', async () => {
  asignarRevisor.mockRejectedValue(new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'))
  const dialogo = await abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Asignármelo' }))

  expect(await dialogo.findByText('El reporte cambió desde que lo abrió; recárguelo.')).toBeTruthy()
  fireEvent.click(dialogo.getByRole('button', { name: 'Recargar' }))
  expect(props.alRecargar).toHaveBeenCalledOnce()
  expect(props.alHecho).not.toHaveBeenCalled()
  expect(props.alCerrar).not.toHaveBeenCalled()
})

test('un error que no es 409 se muestra sin «Recargar»', async () => {
  asignarRevisor.mockRejectedValue(
    new ErrorApi(422, 'REVISOR_INVALIDO', 'El revisor elegido no es un revisor activo de la DDRISS del reporte.'),
  )
  const dialogo = await abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Asignármelo' }))

  expect(await dialogo.findByText('El revisor elegido no es un revisor activo de la DDRISS del reporte.')).toBeTruthy()
  expect(dialogo.queryByRole('button', { name: 'Recargar' })).toBeNull()
})

test('si no cargan los revisores, se puede reintentar', async () => {
  listarRevisores.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  render(<DialogoAsignarRevisor modo="asignar" {...props} />)
  const dialogo = within(screen.getByRole('alertdialog'))

  expect(await dialogo.findByText(/No se pudieron cargar los revisores/)).toBeTruthy()
  fireEvent.click(dialogo.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(document.querySelector('select[name="revisor"]')).not.toBeNull())
  expect(listarRevisores).toHaveBeenCalledTimes(2)
})

test('«Cancelar» cierra sin llamar a la API', async () => {
  const dialogo = await abrir()
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(props.alCerrar).toHaveBeenCalled())
  expect(asignarRevisor).not.toHaveBeenCalled()
  expect(reasignarRevisor).not.toHaveBeenCalled()
})
