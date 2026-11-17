import { atenderAlerta, EVENTO_ALERTAS_CAMBIARON } from './alertas.js'
import { solicitar } from './cliente.js'

vi.mock('./cliente.js', () => ({ solicitar: vi.fn() }))

test('atenderAlerta avisa a la campana solo si la API la atendió', async () => {
  const escuchar = vi.fn()
  window.addEventListener(EVENTO_ALERTAS_CAMBIARON, escuchar)

  solicitar.mockResolvedValueOnce({ id: 5, estado: 'ATENDIDA' })
  expect(await atenderAlerta(5)).toEqual({ id: 5, estado: 'ATENDIDA' })
  expect(solicitar).toHaveBeenCalledWith('/alertas/5/atender', { metodo: 'POST' })
  expect(escuchar).toHaveBeenCalledTimes(1)

  solicitar.mockRejectedValueOnce(new Error('409'))
  await expect(atenderAlerta(5)).rejects.toThrow('409')
  expect(escuchar).toHaveBeenCalledTimes(1)

  window.removeEventListener(EVENTO_ALERTAS_CAMBIARON, escuchar)
})
