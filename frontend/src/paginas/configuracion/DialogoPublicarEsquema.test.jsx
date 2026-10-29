import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { listarPeriodos } from '@/api/catalogos.js'
import { publicarEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import DialogoPublicarEsquema, { mesesValidos } from './DialogoPublicarEsquema.jsx'

vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({ publicarEsquema: vi.fn() }))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }
const VACUNA = { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' }
const BORRADOR = { id: 'b-hexa', version: 5 }
const VIGENTE_DDRISS = { id: 'v-sm', version: 4, territorio: SAN_MARCOS, vigenciaDesde: '2026-11-01' }
const VIGENTE_NACIONAL = { id: 'v-nac', version: 2, territorio: NACIONAL, vigenciaDesde: '2026-01-01' }

const mes = (anio, numero) => ({
  id: anio * 100 + numero,
  anio,
  mes: numero,
  fechaInicio: `${anio}-${String(numero).padStart(2, '0')}-01`,
})
const CALENDARIO = {
  2026: [8, 9, 10, 11, 12].map((n) => mes(2026, n)),
  2027: [1, 2, 3].map((n) => mes(2027, n)),
}

const alPublicar = vi.fn()
const alCerrar = vi.fn()

function montar(vigente) {
  render(
    <DialogoPublicarEsquema
      vacuna={VACUNA}
      borrador={BORRADOR}
      vigente={vigente}
      alPublicar={alPublicar}
      alCerrar={alCerrar}
    />,
  )
}

const dialogo = () => screen.getByRole('dialog')
const select = () => document.querySelector('select[name="vigenciaDesde"]')
const opciones = () => [...select().querySelectorAll('option')].filter((o) => o.value !== '').map((o) => o.value)
const botonPublicar = () => within(dialogo()).getByRole('button', { name: 'Publicar' })
const motivo = () => within(dialogo()).getByLabelText('Motivo del cambio')

async function montarConMeses(vigente) {
  montar(vigente)
  await waitFor(() => expect(select().disabled).toBe(false))
}

beforeEach(() => {
  vi.clearAllMocks()
  // Solo la fecha: el "mes actual" es octubre de 2026, sin falsear los temporizadores de waitFor.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-24T12:00:00-06:00'))
  listarPeriodos.mockImplementation(async ({ anio }) => CALENDARIO[anio] ?? [])
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mesesValidos', () => {
  const todos = [...CALENDARIO[2027], ...CALENDARIO[2026]]

  test('desde el mes actual y en orden', () => {
    expect(mesesValidos(todos, VIGENTE_NACIONAL, '2026-10-24').map((p) => p.fechaInicio)).toEqual([
      '2026-10-01', '2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01',
    ])
  })

  test('con un vigente de la DDRISS, solo los meses posteriores a su inicio', () => {
    expect(mesesValidos(todos, VIGENTE_DDRISS, '2026-10-24').map((p) => p.fechaInicio)).toEqual([
      '2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01',
    ])
  })

  test('sin vigente, desde el mes actual', () => {
    expect(mesesValidos(todos, null, '2026-12-31')[0].fechaInicio).toBe('2026-12-01')
  })
})

test('pide el calendario del año actual y del siguiente, y ofrece solo los meses válidos', async () => {
  await montarConMeses(VIGENTE_DDRISS)

  expect(listarPeriodos).toHaveBeenCalledWith({ anio: 2026 })
  expect(listarPeriodos).toHaveBeenCalledWith({ anio: 2027 })
  expect(opciones()).toEqual(['2026-12-01', '2027-01-01', '2027-02-01', '2027-03-01'])
  expect(within(dialogo()).getByText('Publicar la versión 5 de Hexavalente')).toBeTruthy()
})

test('con un vigente de la DDRISS, el aviso dice cuándo deja de usarse', async () => {
  await montarConMeses(VIGENTE_DDRISS)
  expect(within(dialogo()).getByText(/La versión 4 dejará de usarse el día anterior a la vigencia\./)).toBeTruthy()

  fireEvent.change(select(), { target: { value: '2027-01-01' } })
  expect(await within(dialogo()).findByText(/La versión 4 dejará de usarse el 31\/12\/2026\./)).toBeTruthy()
  expect(within(dialogo()).getByText(/Los reportes ya capturados conservan su versión\./)).toBeTruthy()
  expect(within(dialogo()).getByText(/Una versión publicada no se puede editar ni descartar\./)).toBeTruthy()
})

test('con un vigente nacional, el aviso dice que la DDRISS deja de usar la nacional', async () => {
  await montarConMeses(VIGENTE_NACIONAL)
  expect(
    within(dialogo()).getByText(/Desde esa fecha, su DDRISS usará esta versión en lugar de la nacional 2\./),
  ).toBeTruthy()
  expect(opciones()[0]).toBe('2026-10-01')
})

test('sin vigente, el aviso dice que la DDRISS empezará a usar esta versión', async () => {
  await montarConMeses(null)
  expect(within(dialogo()).getByText(/^Desde esa fecha, su DDRISS usará esta versión\. Los reportes/)).toBeTruthy()
})

test('sin meses disponibles, lo avisa y no deja publicar', async () => {
  listarPeriodos.mockResolvedValue([mes(2026, 9)])
  montar(VIGENTE_NACIONAL)

  expect(
    await within(dialogo()).findByText('No hay meses disponibles en el calendario; agréguelos en la pestaña «Periodos».'),
  ).toBeTruthy()
  fireEvent.change(motivo(), { target: { value: 'Cambio' } })
  fireEvent.click(botonPublicar())
  expect(publicarEsquema).not.toHaveBeenCalled()
})

test('si falla la carga del calendario, lo avisa, y "Reintentar" vuelve a pedir los meses', async () => {
  listarPeriodos.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  montar(VIGENTE_NACIONAL)

  expect(
    await within(dialogo()).findByText('No se pudieron cargar los meses: No se pudo conectar con el servidor.'),
  ).toBeTruthy()
  fireEvent.click(within(dialogo()).getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(select().disabled).toBe(false))
  expect(opciones()[0]).toBe('2026-10-01')
  expect(within(dialogo()).queryByText(/No se pudieron cargar los meses/)).toBeNull()
})

test('"Publicar" pide un mes y un motivo válido: muestra los errores y lleva el foco al primero', async () => {
  await montarConMeses(VIGENTE_NACIONAL)
  expect(botonPublicar().disabled).toBe(false)

  fireEvent.click(botonPublicar())
  expect(within(dialogo()).getByText('Elija el mes desde el que rige la versión.')).toBeTruthy()
  expect(within(dialogo()).getByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(within(dialogo()).getByRole('combobox', { name: 'Vigente desde' })))

  fireEvent.change(select(), { target: { value: '2026-11-01' } })
  await waitFor(() => expect(select().value).toBe('2026-11-01'))
  fireEvent.change(motivo(), { target: { value: '   ' } })
  fireEvent.click(botonPublicar())
  await waitFor(() => expect(document.activeElement).toBe(motivo()))
  expect(within(dialogo()).queryByText('Elija el mes desde el que rige la versión.')).toBeNull()

  // Uno demasiado largo se avisa al escribir.
  fireEvent.change(motivo(), { target: { value: 'a'.repeat(301) } })
  expect(within(dialogo()).getByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  expect(publicarEsquema).not.toHaveBeenCalled()

  fireEvent.change(motivo(), { target: { value: '  Cambio del esquema nacional  ' } })
  expect(within(dialogo()).queryByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeNull()
})

test('publica con el mes y el motivo recortado y entrega el esquema publicado', async () => {
  const publicado = { id: 'b-hexa', version: 5, estado: 'VIGENTE' }
  publicarEsquema.mockResolvedValue(publicado)
  await montarConMeses(VIGENTE_NACIONAL)

  fireEvent.change(select(), { target: { value: '2026-11-01' } })
  fireEvent.change(motivo(), { target: { value: '  Cambio del esquema nacional  ' } })
  fireEvent.click(botonPublicar())

  await waitFor(() => expect(alPublicar).toHaveBeenCalledWith(publicado))
  expect(publicarEsquema).toHaveBeenCalledWith('b-hexa', {
    vigenciaDesde: '2026-11-01',
    motivoCambio: 'Cambio del esquema nacional',
  })
})

test('un 422 se muestra en un Alert dentro del diálogo, que sigue abierto', async () => {
  publicarEsquema.mockRejectedValue(
    new ErrorApi(422, 'ESQUEMA_INVALIDO', 'La dosis D3 no es una dosis activa de HEXA.'),
  )
  await montarConMeses(VIGENTE_NACIONAL)

  fireEvent.change(select(), { target: { value: '2026-11-01' } })
  fireEvent.change(motivo(), { target: { value: 'Cambio' } })
  fireEvent.click(botonPublicar())

  expect(await within(dialogo()).findByText('La dosis D3 no es una dosis activa de HEXA.')).toBeTruthy()
  expect(alPublicar).not.toHaveBeenCalled()
  expect(motivo().value).toBe('Cambio')
  expect(botonPublicar().disabled).toBe(false)
})

test('"Cancelar" cierra el diálogo', async () => {
  await montarConMeses(VIGENTE_NACIONAL)
  fireEvent.click(within(dialogo()).getByRole('button', { name: 'Cancelar' }))
  expect(alCerrar).toHaveBeenCalled()
})
