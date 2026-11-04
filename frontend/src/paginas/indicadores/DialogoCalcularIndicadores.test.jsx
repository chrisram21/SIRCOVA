import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { calcularIndicadores } from '@/api/indicadores.js'
import DialogoCalcularIndicadores, { avisoDeMesesSinCerrar, mesesSinCerrar } from './DialogoCalcularIndicadores.jsx'

vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn() }))
vi.mock('@/api/indicadores.js', () => ({ calcularIndicadores: vi.fn() }))

const periodo = (anio, mes, estado) => ({ id: anio * 100 + mes, anio, mes, estado })
// 2026: enero a agosto cerrados, septiembre en cierre, octubre abierto; 2025 completo y cerrado.
const PERIODOS = [
  ...Array.from({ length: 8 }, (_, i) => periodo(2026, i + 1, 'CERRADO')),
  periodo(2026, 9, 'EN_CIERRE'),
  periodo(2026, 10, 'ABIERTO'),
  ...Array.from({ length: 12 }, (_, i) => periodo(2025, i + 1, 'CERRADO')),
]
const props = { alHecho: vi.fn(), alCerrar: vi.fn() }

async function abrir(anio = 2026, mes = 8) {
  render(<DialogoCalcularIndicadores anio={anio} mes={mes} {...props} />)
  const dialogo = within(screen.getByRole('alertdialog'))
  await waitFor(() => expect(document.querySelector('select[name="mes"]')).toBeTruthy())
  return dialogo
}
const boton = (dialogo, nombre = 'Calcular') => dialogo.getByRole('button', { name: nombre })

beforeEach(() => {
  vi.clearAllMocks()
  listarPeriodos.mockResolvedValue(PERIODOS)
})

test('mesesSinCerrar y su aviso', () => {
  expect(mesesSinCerrar(PERIODOS, 2026, 8)).toEqual([])
  expect(mesesSinCerrar(PERIODOS, 2026, 10)).toEqual([9, 10])
  expect(mesesSinCerrar([], 2027, 2)).toEqual([1, 2])
  expect(avisoDeMesesSinCerrar([])).toBeNull()
  expect(avisoDeMesesSinCerrar([9])).toBe('Septiembre no está cerrado: solo se cuentan los reportes ya cerrados.')
  expect(avisoDeMesesSinCerrar([8, 9, 10])).toBe(
    'Agosto, septiembre y octubre no están cerrados: solo se cuentan los reportes ya cerrados.',
  )
})

test('abre con el año y el mes de la pantalla y, con el mes cerrado, no avisa', async () => {
  const dialogo = await abrir()

  expect(document.querySelector('select[name="anio"]').value).toBe('2026')
  expect(document.querySelector('select[name="mes"]').value).toBe('8')
  const meses = [...document.querySelectorAll('select[name="mes"] option')].map((o) => o.value).filter(Boolean)
  expect(meses).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  expect(dialogo.queryByText(/solo se cuentan/)).toBeNull()
  expect(boton(dialogo).hasAttribute('disabled')).toBe(false)
})

test('con un mes sin cerrar avisa que solo cuentan los reportes cerrados', async () => {
  const dialogo = await abrir()

  fireEvent.change(document.querySelector('select[name="mes"]'), { target: { value: '10' } })
  expect(
    await dialogo.findByText('Septiembre y octubre no están cerrados: solo se cuentan los reportes ya cerrados.'),
  ).toBeTruthy()
  expect(boton(dialogo).getAttribute('aria-describedby')).toBe('aviso-calculo')
})

test('calcular llama una sola vez, avisa con el número de resultados y entrega la corrida', async () => {
  let responder
  calcularIndicadores.mockReturnValue(new Promise((resolver) => (responder = resolver)))
  const dialogo = await abrir()

  fireEvent.change(document.querySelector('select[name="anio"]'), { target: { value: '2025' } })
  fireEvent.click(boton(dialogo))
  expect(boton(dialogo, 'Calculando…').hasAttribute('disabled')).toBe(true)
  fireEvent.click(boton(dialogo, 'Calculando…'))

  expect(calcularIndicadores).toHaveBeenCalledTimes(1)
  expect(calcularIndicadores).toHaveBeenCalledWith({ anio: 2025, mesHasta: 8 })
  const corrida = { id: 4, anio: 2025, mesHasta: 8, totalResultados: 62 }
  responder(corrida)
  await waitFor(() => expect(props.alHecho).toHaveBeenCalledWith(corrida))
  expect(toast.success).toHaveBeenCalledWith('Indicadores de agosto de 2025 calculados: 62 resultados.')
})

test('un error de la API se muestra en el diálogo y deja volver a intentar', async () => {
  calcularIndicadores.mockRejectedValue(new ErrorApi(422, 'CORRIDA_INVALIDA', 'El mes 8 de 2031 no está en el calendario.'))
  const dialogo = await abrir()

  fireEvent.click(boton(dialogo))
  expect(await dialogo.findByText('El mes 8 de 2031 no está en el calendario.')).toBeTruthy()
  expect(boton(dialogo).hasAttribute('disabled')).toBe(false)
  expect(props.alHecho).not.toHaveBeenCalled()
})

test('si no carga el calendario, «Reintentar» lo vuelve a pedir', async () => {
  listarPeriodos.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error interno. Intente de nuevo.'))
  render(<DialogoCalcularIndicadores anio={2026} mes={8} {...props} />)
  const dialogo = within(screen.getByRole('alertdialog'))

  fireEvent.click(await dialogo.findByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(listarPeriodos).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(document.querySelector('select[name="mes"]')).toBeTruthy())
})
