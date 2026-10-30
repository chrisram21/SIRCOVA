import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { desactivarRegla } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import DialogoEstadoRegla from './DialogoEstadoRegla.jsx'

vi.mock('@/api/configuracion.js', () => ({ desactivarRegla: vi.fn(), activarRegla: vi.fn() }))

const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }
const PROPIA = { codigo: 'RANGO_01', version: 2, nombre: 'Rango mensual', territorio: SAN_MARCOS, estado: 'VIGENTE' }
// Una regla solo de la DDRISS: al desactivarla no vuelve ninguna nacional.
const FILA = { codigo: 'RANGO_01', tipo: 'RANGO', aplica: PROPIA, ultimaDdriss: PROPIA, vigenteNacional: null }

const props = { alDesactivar: vi.fn(), alActivar: vi.fn(), alRecargar: vi.fn(), alCerrar: vi.fn() }

function abrir(accion = 'desactivar') {
  render(<DialogoEstadoRegla fila={FILA} accion={accion} {...props} />)
  return within(screen.getByRole('alertdialog'))
}

beforeEach(() => vi.clearAllMocks())

test('sin versión nacional, avisa que ninguna versión revisará los reportes de la DDRISS', () => {
  const dialogo = abrir()
  expect(dialogo.getByText('Ninguna versión de esta regla revisará los reportes de DDRISS_SM.')).toBeTruthy()
})

test('un motivo demasiado largo se avisa al escribir', () => {
  const dialogo = abrir()
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'a'.repeat(301) } })
  expect(dialogo.getByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  expect(dialogo.getByLabelText('Motivo del cambio').getAttribute('aria-invalid')).toBe('true')
})

test('un error que no es 409 se muestra sin «Recargar» y el diálogo sigue abierto', async () => {
  desactivarRegla.mockRejectedValue(new ErrorApi(422, 'REGLA_INVALIDA', 'La vacuna BCG no existe o está inactiva.'))
  const dialogo = abrir()
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'Motivo' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))

  expect(await dialogo.findByText('La vacuna BCG no existe o está inactiva.')).toBeTruthy()
  expect(dialogo.queryByRole('button', { name: 'Recargar' })).toBeNull()
  expect(props.alDesactivar).not.toHaveBeenCalled()
  expect(props.alCerrar).not.toHaveBeenCalled()
  await waitFor(() => expect(dialogo.getByRole('button', { name: 'Desactivar' }).hasAttribute('disabled')).toBe(false))
})

test('«Cancelar» cierra sin llamar a la API', async () => {
  const dialogo = abrir('activar')
  fireEvent.click(dialogo.getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(props.alCerrar).toHaveBeenCalled())
  expect(desactivarRegla).not.toHaveBeenCalled()
})
