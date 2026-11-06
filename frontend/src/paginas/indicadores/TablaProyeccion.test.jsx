import { render, screen } from '@testing-library/react'
import TablaProyeccion, { motivoNoCalculable, notaDelMetodo, ordenarPorProyeccion } from './TablaProyeccion.jsx'

// numerador = dosis proyectadas a diciembre y denominador = población anual, como los guarda el motor.
const datosProyeccion = (cambios = {}) => ({
  indicadorBase: 'COB_HEXA3', mesesVentana: 3, mesesUsados: [6, 7, 8], dosisAcumuladas: 100, ritmoMensual: 30, ...cambios,
})
const fila = (municipio, cambios = {}) => ({
  indicadorCodigo: 'PROY_COB_HEXA3',
  tipoCalculo: 'PROYECCION',
  municipio,
  mes: 8,
  numerador: 220,
  denominador: 400,
  valor: 55,
  meta: 95,
  brechaDosis: 160,
  cumpleMeta: false,
  calculable: true,
  color: null,
  esProyeccion: true,
  proyeccion: datosProyeccion(),
  ...cambios,
})
const municipio = (id, nombre) => ({ id, nombre })
const SIN_POBLACION = { denominador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null, calculable: false }
const SIN_MESES = {
  numerador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null, calculable: false,
  proyeccion: datosProyeccion({ mesesUsados: [], ritmoMensual: null }),
}
const celdas = (nombre) => [...screen.getByText(nombre).closest('tr').querySelectorAll('td')].map((c) => c.textContent)

test('ordena la DDRISS primero, luego de menor a mayor cobertura proyectada (por nombre si empatan) y al final los no calculables', () => {
  const orden = ordenarPorProyeccion([
    fila(municipio(3, 'Ocós'), { valor: 90 }),
    fila(municipio(4, 'Ayutla'), SIN_POBLACION),
    fila(null, { valor: 70 }),
    fila(municipio(1, 'Tacaná'), { valor: 40 }),
    fila(municipio(2, 'Catarina'), { valor: 90 }),
    fila(municipio(5, 'El Quetzal'), { valor: 120 }),
  ])

  expect(orden.map((r) => r.municipio?.nombre ?? 'DDRISS')).toEqual([
    'DDRISS', 'Tacaná', 'Catarina', 'Ocós', 'El Quetzal', 'Ayutla',
  ])
})

test('distingue una fila sin población de una sin meses cerrados', () => {
  expect(motivoNoCalculable(fila(null))).toBeNull()
  expect(motivoNoCalculable(fila(null, SIN_POBLACION))).toBe('Sin población')
  expect(motivoNoCalculable(fila(null, SIN_MESES))).toBe('Sin meses cerrados')
})

test('la nota del método dice qué meses se usaron, si fueron menos que la ventana y qué pasa en diciembre', () => {
  expect(notaDelMetodo({ mes: 8, mesesVentana: 3, mesesUsados: [6, 7, 8] })).toBe(
    'La proyección suma a las dosis acumuladas el promedio de los últimos 3 meses cerrados (junio, julio y agosto) por '
      + 'cada mes que falta hasta diciembre. Es una estimación, no un dato registrado.',
  )
  expect(notaDelMetodo({ mes: 2, mesesVentana: 3, mesesUsados: [1, 2] })).toBe(
    'La proyección suma a las dosis acumuladas el promedio de los últimos 3 meses cerrados (enero y febrero) por cada '
      + 'mes que falta hasta diciembre. Solo hay 2 meses cerrados, así que el promedio usa esos. Es una estimación, no un '
      + 'dato registrado.',
  )
  expect(notaDelMetodo({ mes: 1, mesesVentana: 3, mesesUsados: [1] })).toContain(
    '(enero) por cada mes que falta hasta diciembre. Solo hay 1 mes cerrado, así que el promedio usa ese.',
  )
  expect(notaDelMetodo({ mes: 1, mesesVentana: 3, mesesUsados: [] })).toBe(
    'No hay meses cerrados de enero a enero, así que todavía no hay ritmo para proyectar. Es una estimación, no un dato '
      + 'registrado.',
  )
  expect(notaDelMetodo({ mes: 12, mesesVentana: 3, mesesUsados: [10, 11, 12] })).toBe(
    'Con corte a diciembre ya no quedan meses por estimar: la proyección es el dato real del año.',
  )
})

test('muestra la insignia «Estimación», las columnas y los motivos de las filas no calculables', () => {
  render(
    <TablaProyeccion
      resultados={[
        fila(null, { numerador: 1500.5, denominador: 2000, valor: 75.025, brechaDosis: 400 }),
        fila(municipio(1, 'Tacaná'), { proyeccion: datosProyeccion({ ritmoMensual: 12.5 }) }),
        fila(municipio(2, 'Ayutla'), SIN_POBLACION),
        fila(municipio(3, 'Ocós'), { ...SIN_MESES, denominador: 300 }),
      ]}
    />,
  )

  expect(screen.getByText('Estimación')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Cobertura estimada a diciembre' })).toBeTruthy()
  expect(celdas('Total de la DDRISS')).toEqual([
    'Total de la DDRISS', '100', '30', '1,501', '2,000', '75.0 %', '> 95 %', 'No', '400',
  ])
  expect(celdas('Tacaná')).toEqual(['Tacaná', '100', '13', '220', '400', '55.0 %', '> 95 %', 'No', '160'])
  expect(celdas('Ayutla')).toEqual(['Ayutla', '100', '30', '220', '—', 'Sin población', '—', '—', '—'])
  expect(celdas('Ocós')).toEqual(['Ocós', '100', '—', '—', '300', 'Sin meses cerrados', '—', '—', '—'])
  expect(screen.getByText(/La proyección suma/)).toBeTruthy()
})
