import { act, render, renderHook, screen } from '@testing-library/react'
import PantallaCargaSesion, { CONTINUIDAD_MS, RETRASO_MS, usePrimeraCarga, VISIBLE_MINIMO } from './PantallaCargaSesion.jsx'

// El reloj solo avanza entre pruebas: así ninguna pantalla de carga de la prueba anterior cuenta como recién vista.
let reloj = Date.UTC(2030, 0, 1)

beforeEach(() => {
  vi.useFakeTimers()
  reloj += 60_000
  vi.setSystemTime(reloj)
})

afterEach(() => {
  vi.useRealTimers()
})

const estado = (nombre) => screen.queryByRole('status', { name: nombre })

test('no se ve antes de los 300 ms y después sí, con la etiqueta de la sesión por defecto', () => {
  render(<PantallaCargaSesion />)

  act(() => vi.advanceTimersByTime(RETRASO_MS - 1))
  expect(estado('Recuperando la sesión')).toBeNull()

  act(() => vi.advanceTimersByTime(1))
  expect(estado('Recuperando la sesión')).toBeTruthy()
})

test('usa la etiqueta recibida', () => {
  render(<PantallaCargaSesion etiqueta="Cargando el mapa" />)
  act(() => vi.advanceTimersByTime(RETRASO_MS))

  expect(estado('Cargando el mapa')).toBeTruthy()
})

test('si otra se veía hace un instante, aparece sin esperar', () => {
  const { unmount } = render(<PantallaCargaSesion etiqueta="Cargando pantalla" />)
  act(() => vi.advanceTimersByTime(RETRASO_MS))
  unmount()

  act(() => vi.advanceTimersByTime(CONTINUIDAD_MS - 50))
  render(<PantallaCargaSesion etiqueta="Cargando indicadores" />)

  expect(estado('Cargando indicadores')).toBeTruthy()
})

test('pasado el margen de continuidad, vuelve a esperar', () => {
  const { unmount } = render(<PantallaCargaSesion etiqueta="Cargando pantalla" />)
  act(() => vi.advanceTimersByTime(RETRASO_MS))
  unmount()

  act(() => vi.advanceTimersByTime(CONTINUIDAD_MS + 1))
  render(<PantallaCargaSesion etiqueta="Cargando indicadores" />)

  expect(estado('Cargando indicadores')).toBeNull()
})

test('una que nunca se vio no adelanta a la siguiente', () => {
  const { unmount } = render(<PantallaCargaSesion etiqueta="Cargando pantalla" />)
  act(() => vi.advanceTimersByTime(RETRASO_MS - 100))
  unmount()

  render(<PantallaCargaSesion etiqueta="Cargando indicadores" />)

  expect(estado('Cargando indicadores')).toBeNull()
})

test('inmediata se ve desde el primer momento, sin esperar el retraso', () => {
  render(<PantallaCargaSesion etiqueta="Cargando indicadores" inmediata />)

  expect(estado('Cargando indicadores')).toBeTruthy()
})

test('se pinta en el body, fija sobre toda la pantalla y con el fondo de la marca', () => {
  const { container } = render(
    <main style={{ transform: 'translateY(4px)' }}>
      <PantallaCargaSesion etiqueta="Cargando pantalla" />
    </main>,
  )
  act(() => vi.advanceTimersByTime(RETRASO_MS))
  const pantalla = estado('Cargando pantalla')

  // Fuera del contenedor que la monta: un transform ahí volvería relativa a él la capa fija.
  expect(container.contains(pantalla)).toBe(false)
  expect(pantalla.parentElement).toBe(document.body)
  expect(pantalla.className).toContain('fixed')
  expect(pantalla.className).toContain('inset-0')
  expect(pantalla.className).toContain('z-50')
  expect(pantalla.querySelector('.bg-primary')).toBeTruthy()
})

test('con movimiento reducido cambia la barra por el texto «Cargando…»', () => {
  render(<PantallaCargaSesion />)
  act(() => vi.advanceTimersByTime(RETRASO_MS))
  const pantalla = estado('Recuperando la sesión')

  expect(pantalla.querySelector('.animate-barra-carga').parentElement.className).toContain('motion-reduce:hidden')
  const texto = [...pantalla.querySelectorAll('p')].find((p) => p.textContent === 'Cargando…')
  expect(texto.className).toContain('hidden')
  expect(texto.className).toContain('motion-reduce:block')
})

test('usePrimeraCarga queda en false desde la primera vez que está lista', () => {
  const { result, rerender } = renderHook(({ lista }) => usePrimeraCarga(lista), { initialProps: { lista: false } })
  expect(result.current).toBe(true)

  rerender({ lista: true })
  expect(result.current).toBe(false)

  rerender({ lista: false })
  expect(result.current).toBe(false)
})

test('usePrimeraCarga ya lista desde el inicio no muestra la carga', () => {
  const { result } = renderHook(() => usePrimeraCarga(true))
  expect(result.current).toBe(false)
})

describe('usePrimeraCarga con el mínimo visible', () => {
  beforeEach(() => {
    VISIBLE_MINIMO.ms = 1000
  })

  afterEach(() => {
    VISIBLE_MINIMO.ms = 0
  })

  test('si los datos llegan antes, sigue en true hasta cumplir el mínimo', () => {
    const { result, rerender } = renderHook(({ lista }) => usePrimeraCarga(lista, { conMinimo: true }), {
      initialProps: { lista: false },
    })

    act(() => vi.advanceTimersByTime(200))
    rerender({ lista: true })
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(799))
    expect(result.current).toBe(true)

    act(() => vi.advanceTimersByTime(1))
    expect(result.current).toBe(false)
  })

  test('si los datos tardan más que el mínimo, termina al llegar', () => {
    const { result, rerender } = renderHook(({ lista }) => usePrimeraCarga(lista, { conMinimo: true }), {
      initialProps: { lista: false },
    })

    act(() => vi.advanceTimersByTime(1500))
    expect(result.current).toBe(true)

    rerender({ lista: true })
    expect(result.current).toBe(false)
  })

  test('sin conMinimo termina en cuanto llegan los datos', () => {
    const { result, rerender } = renderHook(({ lista }) => usePrimeraCarga(lista), { initialProps: { lista: false } })

    rerender({ lista: true })
    expect(result.current).toBe(false)
  })
})
