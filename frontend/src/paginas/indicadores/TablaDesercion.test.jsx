import { render, screen, within } from '@testing-library/react'
import TablaDesercion, { dosisFinales, ordenarPorDesercion } from './TablaDesercion.jsx'

// numerador = pérdida (iniciales − finales) y denominador = iniciales, como los guarda el motor.
const fila = (municipio, cambios = {}) => ({
  indicadorCodigo: 'DES_HEXA1_3',
  tipoCalculo: 'DESERCION',
  municipio,
  numerador: 10,
  denominador: 100,
  valor: 10,
  meta: 10,
  brechaDosis: null,
  cumpleMeta: true,
  calculable: true,
  color: 'verde',
  ...cambios,
})
const municipio = (id, nombre) => ({ id, nombre })
const SIN_PRIMERAS = { numerador: -3, denominador: 0, valor: null, meta: null, cumpleMeta: null, calculable: false, color: null }
const celdas = (nombre) => [...screen.getByText(nombre).closest('tr').querySelectorAll('td')].map((c) => c.textContent)

test('las dosis finales son las iniciales menos la pérdida', () => {
  expect(dosisFinales(fila(null, { numerador: 76, denominador: 1051 }))).toBe(975)
  expect(dosisFinales(fila(null, { numerador: -5, denominador: 4 }))).toBe(9)
})

test('ordena la DDRISS primero, luego de mayor a menor deserción (por nombre si empatan) y al final sin primeras dosis', () => {
  const orden = ordenarPorDesercion([
    fila(municipio(3, 'Ocós'), { valor: 5 }),
    fila(municipio(4, 'Ayutla'), SIN_PRIMERAS),
    fila(null, { valor: 7 }),
    fila(municipio(1, 'Tacaná'), { valor: 12 }),
    fila(municipio(2, 'Catarina'), { valor: 5 }),
    fila(municipio(5, 'El Quetzal'), { valor: -20 }),
  ])

  expect(orden.map((r) => r.municipio?.nombre ?? 'DDRISS')).toEqual([
    'DDRISS', 'Tacaná', 'Catarina', 'Ocós', 'El Quetzal', 'Ayutla',
  ])
})

test('muestra iniciales, finales, pérdida, la deserción con su semáforo y la meta con el comparador', () => {
  render(
    <TablaDesercion
      resultados={[
        fila(null, { numerador: 76, denominador: 1051, valor: 7.2312 }),
        fila(municipio(1, 'Tacaná'), { numerador: 15, denominador: 100, valor: 15, cumpleMeta: false, color: 'rojo' }),
        fila(municipio(2, 'Ayutla'), SIN_PRIMERAS),
      ]}
    />,
  )

  const encabezados = screen.getAllByRole('columnheader').map((c) => c.textContent)
  expect(encabezados).toEqual(['Municipio', 'Dosis iniciales', 'Dosis finales', 'Pérdida', 'Deserción', 'Meta', 'Cumple'])
  expect(celdas('Total de la DDRISS')).toEqual(['Total de la DDRISS', '1,051', '975', '76', '7.2 %', '≤ 10 %', 'Sí'])
  expect(celdas('Tacaná')).toEqual(['Tacaná', '100', '85', '15', '15.0 %', '≤ 10 %', 'No'])
  expect(within(screen.getByText('Tacaná').closest('tr')).getByText('15.0 %').className).toContain('text-destructive')
  expect(celdas('Ayutla')).toEqual(['Ayutla', '0', '3', '-3', 'Sin primeras dosis', '—', '—'])
  expect(screen.queryByText('Deserción negativa')).toBeNull()
  expect(screen.queryByText(/Una deserción negativa/)).toBeNull()
})

test('una deserción negativa lleva su marca y la línea que la explica', () => {
  render(
    <TablaDesercion
      resultados={[fila(null), fila(municipio(1, 'San Pedro Sacatepéquez'), { numerador: -5, denominador: 4, valor: -125 })]}
    />,
  )

  expect(celdas('San Pedro Sacatepéquez')).toEqual([
    'San Pedro Sacatepéquez', '4', '9', '-5', '-125.0 %Deserción negativa', '≤ 10 %', 'Sí',
  ])
  expect(screen.getByText(/Una deserción negativa/).textContent).toBe(
    'Una deserción negativa indica que en el año se aplicaron más dosis finales que iniciales: esquemas empezados el '
      + 'año anterior o niños que llegaron de otro municipio. Conviene revisar el registro.',
  )
})
