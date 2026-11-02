import { render, screen, within } from '@testing-library/react'
import HistorialEstadosReporte from './HistorialEstadosReporte.jsx'

const PERSONAL = { id: 14, nombre: 'Ana Pérez', rol: { codigo: 'ESTABLECIMIENTO', nombre: 'Personal del establecimiento' } }
const REVISORA = { id: 2, nombre: 'María López', rol: { codigo: 'REVISOR', nombre: 'Estadígrafa / revisor DDRISS' } }
const CAMBIOS = [
  { id: 1, estadoAnterior: null, estadoNuevo: 'BORRADOR', usuario: PERSONAL, fecha: '2026-10-02T15:10:00.000Z', comentario: null },
  { id: 2, estadoAnterior: 'BORRADOR', estadoNuevo: 'ENVIADO', usuario: PERSONAL, fecha: '2026-10-05T21:42:00.000Z', comentario: null },
  {
    id: 3,
    estadoAnterior: 'ENVIADO',
    estadoNuevo: 'CORRECCION_SOLICITADA',
    usuario: REVISORA,
    fecha: '2026-10-06T14:05:00.000Z',
    comentario: 'Revise el total de octubre.',
  },
]

test('muestra cada cambio en el orden recibido, con usuario, rol, fecha y hora de Guatemala y comentario', () => {
  render(<HistorialEstadosReporte cambios={CAMBIOS} />)

  const filas = within(screen.getByRole('list', { name: 'Historial de estados' })).getAllByRole('listitem')
  expect(filas).toHaveLength(3)
  const [creacion, envio, devolucion] = filas

  expect(creacion.textContent).toContain('Borrador')
  expect(creacion.textContent).toContain('Reporte creado')
  expect(creacion.textContent).toContain('Ana Pérez · Personal del establecimiento')
  // 15:10 UTC son las 09:10 en Guatemala (UTC-6).
  expect(creacion.querySelector('time').textContent).toBe('02/10/2026 09:10')
  expect(creacion.querySelector('time').getAttribute('datetime')).toBe('2026-10-02T15:10:00.000Z')

  expect(envio.textContent).toContain('Enviado')
  expect(envio.textContent).toContain('desde Borrador')
  expect(envio.querySelector('time').textContent).toBe('05/10/2026 15:42')

  expect(devolucion.textContent).toContain('Corrección solicitada')
  expect(devolucion.textContent).toContain('desde Enviado')
  expect(devolucion.textContent).toContain('María López · Estadígrafa / revisor DDRISS')
  expect(devolucion.textContent).toContain('Revise el total de octubre.')
})

test('el comentario solo aparece si hay', () => {
  render(<HistorialEstadosReporte cambios={CAMBIOS.slice(0, 1)} />)
  const [fila] = screen.getAllByRole('listitem')
  expect(fila.querySelectorAll('p')).toHaveLength(1)
})

test('sin cambios muestra «Sin cambios de estado.»', () => {
  render(<HistorialEstadosReporte cambios={[]} />)
  expect(screen.getByText('Sin cambios de estado.')).toBeTruthy()
  expect(screen.queryByRole('list')).toBeNull()
})
