import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { cambiarEstadoReporte } from '@/api/revision.js'
import { ErrorApi } from '@/api/cliente.js'
import DialogoEnviarReporte from './DialogoEnviarReporte.jsx'

vi.mock('@/api/revision.js', () => ({ cambiarEstadoReporte: vi.fn() }))

const props = { reporteId: 41, versionFila: 7, alEnviar: vi.fn(), alFallar: vi.fn(), alCerrar: vi.fn() }

function abrir(advertencias = 0) {
  render(<DialogoEnviarReporte {...props} advertencias={advertencias} />)
  return within(screen.getByRole('alertdialog'))
}

beforeEach(() => vi.clearAllMocks())

test('cuenta las advertencias que se envían', () => {
  const dialogo = abrir(2)
  expect(dialogo.getByText('¿Enviar a revisión?')).toBeTruthy()
  expect(dialogo.getByText('Después de enviarlo ya no podrá editar el reporte.')).toBeTruthy()
  expect(dialogo.getByText('Se enviará con 2 advertencias; la estadígrafa las verá.')).toBeTruthy()
})

test('sin advertencias no muestra esa línea', () => {
  const dialogo = abrir(0)
  expect(dialogo.queryByText(/Se enviará con/)).toBeNull()
})

test('«Enviar» llama una vez con la versionFila, queda deshabilitado mientras espera y entrega el reporte', async () => {
  let responder
  cambiarEstadoReporte.mockReturnValue(new Promise((resolver) => (responder = resolver)))
  const dialogo = abrir(1)

  fireEvent.click(dialogo.getByRole('button', { name: 'Enviar' }))
  const boton = await dialogo.findByRole('button', { name: 'Enviando…' })
  expect(boton.hasAttribute('disabled')).toBe(true)
  expect(dialogo.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true)
  fireEvent.click(boton)
  expect(cambiarEstadoReporte).toHaveBeenCalledTimes(1)
  expect(cambiarEstadoReporte).toHaveBeenCalledWith(41, { estadoDestino: 'ENVIADO', versionFila: 7 })

  const reporte = { id: 41, estado: 'ENVIADO' }
  responder(reporte)
  await waitFor(() => expect(props.alEnviar).toHaveBeenCalledWith(reporte))
  expect(props.alFallar).not.toHaveBeenCalled()
})

test('un error se entrega a quien lo abrió', async () => {
  const error = new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.')
  cambiarEstadoReporte.mockRejectedValue(error)
  const dialogo = abrir()

  fireEvent.click(dialogo.getByRole('button', { name: 'Enviar' }))

  await waitFor(() => expect(props.alFallar).toHaveBeenCalledWith(error))
  expect(props.alEnviar).not.toHaveBeenCalled()
})

test('«Cancelar» cierra sin llamar a la API', async () => {
  const dialogo = abrir()
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(props.alCerrar).toHaveBeenCalled())
  expect(cambiarEstadoReporte).not.toHaveBeenCalled()
})
