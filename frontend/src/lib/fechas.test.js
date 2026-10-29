import { aDiaMesAnio, diasHasta, nombreDelMes, textoPlazo } from './fechas.js'

const hoy = new Date(2026, 9, 28, 18, 30)

test('nombreDelMes y aDiaMesAnio', () => {
  expect(nombreDelMes({ anio: 2026, mes: 10 })).toBe('octubre de 2026')
  expect(aDiaMesAnio('2026-11-10')).toBe('10/11/2026')
  expect(aDiaMesAnio(null)).toBe('—')
})

test('diasHasta cuenta días de calendario, sin importar la hora', () => {
  expect(diasHasta('2026-10-28', hoy)).toBe(0)
  expect(diasHasta('2026-11-10', hoy)).toBe(13)
  expect(diasHasta('2026-10-27', hoy)).toBe(-1)
})

test.each([
  ['2026-10-26', 'venció hace 2 días'],
  ['2026-10-27', 'venció ayer'],
  ['2026-10-28', 'vence hoy'],
  ['2026-10-29', 'vence mañana'],
  ['2026-11-10', 'vence en 13 días'],
])('textoPlazo(%s) es «%s»', (fecha, esperado) => {
  expect(textoPlazo(fecha, hoy)).toBe(esperado)
})
