import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ErrorApi } from '@/api/cliente.js'
import { aprobarReporte } from '@/api/revision.js'
import DialogoAprobarReporte from './DialogoAprobarReporte.jsx'

vi.mock('@/api/revision.js', () => ({ aprobarReporte: vi.fn() }))

const props = {
  reporteId: 524,
  establecimiento: 'Centro de Salud Tajumulco',
  versionFila: 21,
  alHecho: vi.fn(),
  alRecargar: vi.fn(),
  alCerrar: vi.fn(),
}

function abrir(advertencias = 0) {
  render(<DialogoAprobarReporte {...props} advertencias={advertencias} />)
  return within(screen.getByRole('alertdialog'))
}
const comentario = () => screen.getByLabelText('Comentario (opcional)')

beforeEach(() => {
  vi.clearAllMocks()
})

test('sin advertencias dice que el reporte queda aprobado y no cuenta nada más', () => {
  const dialogo = abrir()

  expect(dialogo.getByText('¿Aprobar el reporte?')).toBeTruthy()
  expect(dialogo.getByText('El reporte de Centro de Salud Tajumulco queda aprobado y ya no se puede editar.')).toBeTruthy()
  expect(dialogo.queryByText(/advertencia/)).toBeNull()
})

test.each([
  [1, 'Tiene 1 advertencia abierta; se aprueba igual.'],
  [3, 'Tiene 3 advertencias abiertas; se aprueba igual.'],
])('con %i advertencias abiertas las cuenta', (advertencias, texto) => {
  expect(abrir(advertencias).getByText(texto)).toBeTruthy()
})

test('confirmar aprueba una sola vez con la versionFila y el comentario recortado', async () => {
  let responder
  aprobarReporte.mockReturnValue(new Promise((resolver) => (responder = resolver)))
  const dialogo = abrir()
  const escrito = '  Cifras coherentes con septiembre.  '
  fireEvent.change(comentario(), { target: { value: escrito } })
  expect(document.getElementById('comentario-aprobacion-largo').textContent).toBe(`${escrito.length}/1000`)

  fireEvent.click(dialogo.getByRole('button', { name: 'Aprobar' }))
  expect(dialogo.getByRole('button', { name: 'Aprobando…' }).hasAttribute('disabled')).toBe(true)
  expect(dialogo.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(dialogo.getByRole('button', { name: 'Aprobando…' }))

  expect(aprobarReporte).toHaveBeenCalledTimes(1)
  expect(aprobarReporte).toHaveBeenCalledWith(524, { versionFila: 21, comentario: 'Cifras coherentes con septiembre.' })
  const aprobado = { id: 524, estado: 'APROBADO' }
  responder(aprobado)
  await waitFor(() => expect(props.alHecho).toHaveBeenCalledWith(aprobado))
})

test('con el comentario vacío o en blanco no lo manda', async () => {
  aprobarReporte.mockResolvedValue({ id: 524, estado: 'APROBADO' })
  const dialogo = abrir()
  fireEvent.change(comentario(), { target: { value: '   ' } })

  fireEvent.click(dialogo.getByRole('button', { name: 'Aprobar' }))

  await waitFor(() => expect(props.alHecho).toHaveBeenCalled())
  const [, cuerpo] = aprobarReporte.mock.calls[0]
  expect(cuerpo.comentario).toBeUndefined()
  expect(cuerpo.versionFila).toBe(21)
})

test.each([
  ['un 409', new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.')],
  ['un 422', new ErrorApi(422, 'TRANSICION_NO_PERMITIDA', 'El reporte no puede pasar de Aprobado a Aprobado.')],
])('%s muestra el mensaje con «Recargar» y el diálogo sigue abierto', async (_, err) => {
  aprobarReporte.mockRejectedValue(err)
  const dialogo = abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Aprobar' }))

  expect(await dialogo.findByText(err.message)).toBeTruthy()
  fireEvent.click(dialogo.getByRole('button', { name: 'Recargar' }))
  expect(props.alRecargar).toHaveBeenCalledOnce()
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(dialogo.getByRole('button', { name: 'Aprobar' }).hasAttribute('disabled')).toBe(false)
  expect(props.alHecho).not.toHaveBeenCalled()
})

test('otro error se muestra sin «Recargar»', async () => {
  aprobarReporte.mockRejectedValue(new ErrorApi(403, 'NO_ES_REVISOR_ASIGNADO', 'Solo el revisor asignado puede hacer esto con el reporte.'))
  const dialogo = abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Aprobar' }))

  expect(await dialogo.findByText('Solo el revisor asignado puede hacer esto con el reporte.')).toBeTruthy()
  expect(dialogo.queryByRole('button', { name: 'Recargar' })).toBeNull()
  expect(screen.getByRole('alertdialog')).toBeTruthy()
})

test('«Cancelar» cierra sin llamar a la API', () => {
  const dialogo = abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))

  expect(props.alCerrar).toHaveBeenCalledOnce()
  expect(aprobarReporte).not.toHaveBeenCalled()
})
