import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { desactivarIndicador } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import DialogoEstadoIndicador from './DialogoEstadoIndicador.jsx'

vi.mock('@/api/configuracion.js', () => ({ desactivarIndicador: vi.fn(), activarIndicador: vi.fn() }))

const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }
const PROPIO = {
  codigo: 'COB_SPR1', version: 2, nombre: 'Cobertura de SPR 1', territorio: SAN_MARCOS, estado: 'VIGENTE',
}
// Un indicador solo de la DDRISS: al desactivarlo no vuelve ninguno nacional.
const FILA = {
  codigo: 'COB_SPR1', tipoCalculo: 'COBERTURA', aplica: PROPIO, ultimaDdriss: PROPIO, vigenteNacional: null,
}

const props = { alDesactivar: vi.fn(), alActivar: vi.fn(), alRecargar: vi.fn(), alCerrar: vi.fn() }

function abrir(accion = 'desactivar') {
  render(<DialogoEstadoIndicador fila={FILA} accion={accion} {...props} />)
  return within(screen.getByRole('alertdialog'))
}

beforeEach(() => vi.clearAllMocks())

test('sin versión nacional, avisa que el indicador dejará de calcularse', () => {
  const dialogo = abrir()
  expect(dialogo.getByText('Este indicador dejará de calcularse para su DDRISS.')).toBeTruthy()
})

test('un motivo demasiado largo se avisa al escribir', () => {
  const dialogo = abrir()
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'a'.repeat(301) } })
  expect(dialogo.getByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  expect(dialogo.getByLabelText('Motivo del cambio').getAttribute('aria-invalid')).toBe('true')
})

test('un error que no es 409 se muestra sin «Recargar» y el diálogo sigue abierto', async () => {
  desactivarIndicador.mockRejectedValue(
    new ErrorApi(422, 'INDICADOR_INVALIDO', 'La vacuna SPR no existe o está inactiva.'),
  )
  const dialogo = abrir()
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'Motivo' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))

  expect(await dialogo.findByText('La vacuna SPR no existe o está inactiva.')).toBeTruthy()
  expect(dialogo.queryByRole('button', { name: 'Recargar' })).toBeNull()
  expect(props.alDesactivar).not.toHaveBeenCalled()
  expect(props.alCerrar).not.toHaveBeenCalled()
  await waitFor(() => expect(dialogo.getByRole('button', { name: 'Desactivar' }).hasAttribute('disabled')).toBe(false))
})

test('«Cancelar» cierra sin llamar a la API', async () => {
  const dialogo = abrir('activar')
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(props.alCerrar).toHaveBeenCalled())
  expect(desactivarIndicador).not.toHaveBeenCalled()
})
