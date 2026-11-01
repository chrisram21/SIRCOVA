import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente.js'
import { cerrarPeriodo, obtenerBandeja } from '@/api/revision.js'
import DialogoCerrarPeriodo from './DialogoCerrarPeriodo.jsx'

vi.mock('@/api/revision.js', () => ({ cerrarPeriodo: vi.fn(), obtenerBandeja: vi.fn() }))

const periodo = { id: 10, anio: 2026, mes: 10 }
const props = { periodo, alHecho: vi.fn(), alRecargar: vi.fn(), alCerrar: vi.fn() }
const cierre = (cambios = {}) => ({
  estado: 'EN_CIERRE',
  fechaLimiteEnvio: '2026-11-10',
  establecimientos: 30,
  aprobados: 19,
  cerrados: 0,
  faltanPorAprobar: 0,
  ...cambios,
})

async function abrir(resumen = cierre()) {
  obtenerBandeja.mockResolvedValue({ elementos: [], conteos: {}, cierre: resumen })
  render(<DialogoCerrarPeriodo {...props} />)
  const dialogo = within(screen.getByRole('alertdialog'))
  await dialogo.findByText(/aprobad/)
  return dialogo
}
const boton = (dialogo, nombre = 'Cerrar periodo') => dialogo.getByRole('button', { name: nombre })

beforeEach(() => {
  vi.clearAllMocks()
})

test('pide el resumen fresco del mes y, sin pendientes, deja cerrar', async () => {
  const dialogo = await abrir()

  expect(obtenerBandeja).toHaveBeenCalledWith({ periodoId: 10, porPagina: 1 })
  expect(dialogo.getByText('¿Cerrar el periodo de octubre de 2026?')).toBeTruthy()
  expect(
    dialogo.getByText('Los 19 reportes aprobados pasan a Cerrado y el mes ya no admite cambios, solo rectificaciones.'),
  ).toBeTruthy()
  expect(dialogo.queryByText(/por aprobar/)).toBeNull()
  expect(boton(dialogo).hasAttribute('disabled')).toBe(false)
})

test.each([
  [cierre({ faltanPorAprobar: 1 }), 'Falta 1 reporte por aprobar.'],
  [cierre({ faltanPorAprobar: 3 }), 'Faltan 3 reportes por aprobar.'],
  [cierre({ estado: 'ABIERTO' }), 'Se puede cerrar cuando venza la fecha límite (10/11/2026).'],
])('si no se puede cerrar lo dice y deshabilita «Cerrar periodo» (%#)', async (resumen, texto) => {
  const dialogo = await abrir(resumen)

  expect(dialogo.getByText(texto)).toBeTruthy()
  expect(boton(dialogo).hasAttribute('disabled')).toBe(true)
  expect(boton(dialogo).getAttribute('aria-describedby')).toBe('motivo-cierre')
})

test('confirmar cierra una sola vez, avisa y entrega el periodo', async () => {
  let responder
  cerrarPeriodo.mockReturnValue(new Promise((resolver) => (responder = resolver)))
  const dialogo = await abrir()

  fireEvent.click(boton(dialogo))
  expect(boton(dialogo, 'Cerrando…').hasAttribute('disabled')).toBe(true)
  expect(boton(dialogo, 'Cancelar').hasAttribute('disabled')).toBe(true)
  fireEvent.click(boton(dialogo, 'Cerrando…'))

  expect(cerrarPeriodo).toHaveBeenCalledTimes(1)
  expect(cerrarPeriodo).toHaveBeenCalledWith(10)
  const cerrado = { ...periodo, estado: 'CERRADO', reportesCerrados: 19 }
  responder(cerrado)
  await waitFor(() => expect(props.alHecho).toHaveBeenCalledWith(cerrado))
  expect(toast.success).toHaveBeenCalledWith('Periodo de octubre de 2026 cerrado: 19 reportes cerrados.')
})

test('un 409 muestra el mensaje con «Recargar», que vuelve a pedir el resumen', async () => {
  cerrarPeriodo.mockRejectedValue(new ErrorApi(409, 'PERIODO_CON_PENDIENTES', 'Faltan 2 reportes por aprobar.'))
  const dialogo = await abrir()

  fireEvent.click(boton(dialogo))

  expect(await dialogo.findByText('Faltan 2 reportes por aprobar.')).toBeTruthy()
  obtenerBandeja.mockResolvedValue({ cierre: cierre({ faltanPorAprobar: 2 }) })
  fireEvent.click(boton(dialogo, 'Recargar'))
  expect(props.alRecargar).toHaveBeenCalledOnce()
  await waitFor(() => expect(obtenerBandeja).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(boton(dialogo).hasAttribute('disabled')).toBe(true))
  expect(screen.getByRole('alertdialog')).toBeTruthy()
  expect(props.alHecho).not.toHaveBeenCalled()
})

test('otro error se muestra sin «Recargar» y el diálogo sigue abierto', async () => {
  cerrarPeriodo.mockRejectedValue(new ErrorApi(403, 'SIN_PERMISO', 'No tiene permiso para realizar esta acción.'))
  const dialogo = await abrir()

  fireEvent.click(boton(dialogo))

  expect(await dialogo.findByText('No tiene permiso para realizar esta acción.')).toBeTruthy()
  expect(dialogo.queryByRole('button', { name: 'Recargar' })).toBeNull()
  expect(screen.getByRole('alertdialog')).toBeTruthy()
})

test('si el resumen no carga, lo dice con «Reintentar» y no deja cerrar', async () => {
  obtenerBandeja.mockRejectedValueOnce(new ErrorApi(0, 'SIN_RESPUESTA', 'El servidor no respondió.'))
  render(<DialogoCerrarPeriodo {...props} />)
  const dialogo = within(screen.getByRole('alertdialog'))

  expect(await dialogo.findByText('El servidor no respondió.')).toBeTruthy()
  expect(boton(dialogo).hasAttribute('disabled')).toBe(true)
  obtenerBandeja.mockResolvedValue({ cierre: cierre() })
  fireEvent.click(dialogo.getByRole('button', { name: /Reintentar/ }))
  await waitFor(() => expect(boton(dialogo).hasAttribute('disabled')).toBe(false))
})

test('«Cancelar» cierra sin llamar a la API', async () => {
  const dialogo = await abrir()

  fireEvent.click(boton(dialogo, 'Cancelar'))

  expect(props.alCerrar).toHaveBeenCalledOnce()
  expect(cerrarPeriodo).not.toHaveBeenCalled()
})
