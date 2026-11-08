import { render, screen, within } from '@testing-library/react'
import TablaBrecha, { ordenarPorBrecha } from './TablaBrecha.jsx'

const fila = (municipio, cambios = {}) => ({
  indicadorCodigo: 'BRECHA_HEXA3',
  municipio,
  numerador: 100,
  metaDosis: 200,
  brechaDosis: 100,
  excedenteDosis: 0,
  cumpleMeta: false,
  calculable: true,
  sumaBrechasMunicipales: null,
  ...cambios,
})
const municipio = (id, nombre) => ({ id, nombre })
const SIN_POBLACION = { calculable: false, metaDosis: null, brechaDosis: null, excedenteDosis: null, cumpleMeta: null }

test('ordena la DDRISS primero, luego de mayor a menor brecha (por nombre si empatan) y al final las no calculables', () => {
  const orden = ordenarPorBrecha([
    fila(municipio(3, 'Ocós'), { brechaDosis: 10 }),
    fila(municipio(4, 'Ayutla'), SIN_POBLACION),
    fila(null, { brechaDosis: 50 }),
    fila(municipio(1, 'Tacaná'), { brechaDosis: 40 }),
    fila(municipio(2, 'Catarina'), { brechaDosis: 10 }),
    fila(municipio(5, 'Esquipulas Palo Gordo'), { brechaDosis: 0, excedenteDosis: 5 }),
  ])

  expect(orden.map((r) => r.municipio?.nombre ?? 'DDRISS')).toEqual([
    'DDRISS', 'Tacaná', 'Catarina', 'Ocós', 'Esquipulas Palo Gordo', 'Ayutla',
  ])
})

test('resalta lo que falta y el excedente con los colores del tema, y muestra la suma municipal', () => {
  render(
    <TablaBrecha
      resultados={[
        fila(null, { numerador: 300, metaDosis: 320, brechaDosis: 20, sumaBrechasMunicipales: 1801 }),
        fila(municipio(1, 'Tacaná'), { numerador: 100, metaDosis: 140, brechaDosis: 40 }),
        fila(municipio(2, 'San Marcos'), { numerador: 200, metaDosis: 180, brechaDosis: 0, excedenteDosis: 20, cumpleMeta: true }),
      ]}
    />,
  )

  const tacana = within(screen.getByText('Tacaná').closest('tr'))
  expect(tacana.getByText('40').className).toContain('bg-advertencia')
  const sanMarcos = within(screen.getByText('San Marcos').closest('tr'))
  expect(sanMarcos.getByText('20').className).toContain('bg-exito')
  expect(screen.getByText(/Suma de lo que falta en los municipios:/).textContent).toBe(
    'Suma de lo que falta en los municipios: 1,801 dosis. Los municipios que pasaron la meta no compensan a los demás.',
  )
})

test('sin suma municipal (la DDRISS no es calculable) no muestra la línea', () => {
  render(<TablaBrecha resultados={[fila(null, { ...SIN_POBLACION, numerador: 50 }), fila(municipio(1, 'Tacaná'), SIN_POBLACION)]} />)

  expect(screen.queryByText(/Suma de lo que falta/)).toBeNull()
  expect(screen.getAllByText('Sin población')).toHaveLength(2)
})

test('marca junto al nombre los municipios y la DDRISS con cobertura mayor al 100 %, y el aviso los nombra (SPEC 52)', () => {
  const texto = 'Mayor al 100 %: revise la población (denominador) o los registros.'
  render(
    <TablaBrecha
      resultados={[
        fila(null, { mayorACien: true }),
        fila(municipio(1, 'Tacaná')),
        fila(municipio(2, 'El Rodeo'), { brechaDosis: 0, excedenteDosis: 30, mayorACien: true }),
      ]}
    />,
  )

  const tabla = within(screen.getByRole('table'))
  const marcas = (nombre) => within(tabla.getByText(nombre).closest('td')).queryAllByRole('img', { name: texto })
  expect(marcas('El Rodeo')).toHaveLength(1)
  expect(marcas('Total de la DDRISS')).toHaveLength(1)
  expect(marcas('Tacaná')).toHaveLength(0)
  expect(screen.getByText(
    'Cobertura mayor al 100 %: Total de la DDRISS, El Rodeo. Revise la población (denominador) o los registros.',
  )).toBeTruthy()
})

test('sin filas marcadas, la tabla de brecha no tiene aviso', () => {
  render(<TablaBrecha resultados={[fila(null), fila(municipio(1, 'Tacaná'))]} />)

  expect(screen.queryByText(/mayor al 100 %/)).toBeNull()
})
