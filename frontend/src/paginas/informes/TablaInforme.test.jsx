import { render, screen } from '@testing-library/react'
import TablaInforme from './TablaInforme.jsx'

const HEXA = { codigo: 'HEXA', nombre: 'Hexavalente' }
const BCG = { codigo: 'BCG', nombre: 'BCG' }
const COLUMNAS = [
  { vacuna: HEXA, seccion: { grupoEdad: 'MENOR_1', titulo: '< 1 año' }, dosis: { id: 7, codigo: 'D1' } },
  { vacuna: HEXA, seccion: { grupoEdad: 'MENOR_1', titulo: '< 1 año' }, dosis: { id: 8, codigo: 'D2' } },
  { vacuna: HEXA, seccion: { grupoEdad: '1_A_5', titulo: 'De 1 a < 6 años' }, dosis: { id: 7, codigo: 'D1' } },
  { vacuna: BCG, seccion: null, dosis: { id: 20, codigo: 'UNICA' } },
]
const SAN_MARCOS = { id: 1, nombre: 'San Marcos' }

const informe = (cambios = {}) => ({
  informe: 'poblacion-propia',
  nivel: 'municipio',
  desde: { anio: 2026, mes: 1 },
  hasta: { anio: 2026, mes: 8 },
  incluirAprobados: false,
  columnas: COLUMNAS,
  filas: [],
  total: { cantidades: [0, 0, 0, 0] },
  dosisFueraDelConsolidado: 0,
  mesesSinCerrar: [],
  preliminar: false,
  ...cambios,
})
const fila = (id, nombre, cantidades, extra = {}) => ({
  id, codigo: String(id), nombre, municipio: null, fueraDelConsolidado: false, cantidades, ...extra,
})

const celdasDe = (tr, selector) => [...tr.querySelectorAll(selector)]
const nombreDe = (tr) => tr.querySelector('td span')?.textContent ?? tr.querySelector('td')?.textContent
const filaDe = (texto) => screen.getAllByRole('row').find((tr) => nombreDe(tr) === texto)

test('el encabezado tiene vacuna, sección y dosis, cada una sobre sus columnas', () => {
  render(<TablaInforme informe={informe()} />)
  const [vacunas, secciones, dosis] = screen.getAllByRole('row').slice(0, 3)
  expect(celdasDe(vacunas, 'th').map((th) => [th.textContent, th.getAttribute('colspan')])).toEqual([
    ['Municipio de aplicación', null], ['Hexavalente', '3'], ['BCG', '1'],
  ])
  expect(celdasDe(vacunas, 'th')[0].getAttribute('rowspan')).toBe('3')
  expect(celdasDe(secciones, 'th').map((th) => [th.textContent, th.getAttribute('colspan')])).toEqual([
    ['< 1 año', '2'], ['De 1 a < 6 años', '1'], ['', '1'],
  ])
  expect(celdasDe(dosis, 'th').map((th) => th.textContent)).toEqual(['D1', 'D2', 'D1', 'UNICA'])
})

test('cada fila lleva sus cantidades con separador de miles, y al final la fila «Total»', () => {
  render(
    <TablaInforme
      informe={informe({
        filas: [fila(1, 'San Marcos', [1234, 0, 5, 12]), fila(4, 'San Pedro', [10, 2, 0, 0])],
        total: { cantidades: [1244, 2, 5, 12] },
      })}
    />,
  )
  const textos = (texto) => celdasDe(filaDe(texto), 'td').map((td) => td.textContent)
  expect(textos('San Marcos')).toEqual(['San Marcos', '1,234', '0', '5', '12'])
  expect(textos('Total')).toEqual(['Total', '1,244', '2', '5', '12'])
  expect(screen.queryByText(/%/)).toBeNull()
})

test('por establecimiento, el hospital lleva la insignia y su municipio, y debajo va lo que no suma', () => {
  render(
    <TablaInforme
      informe={informe({
        nivel: 'establecimiento',
        filas: [
          fila(31, 'Hospital de San Marcos', [20, 0, 0, 3], { municipio: SAN_MARCOS, fueraDelConsolidado: true }),
          fila(2, 'Centro de Salud San Marcos', [10, 6, 5, 0], { municipio: SAN_MARCOS }),
        ],
        total: { cantidades: [10, 6, 5, 0] },
        dosisFueraDelConsolidado: 1523,
      })}
    />,
  )
  expect(screen.getByRole('columnheader', { name: 'Establecimiento' })).toBeTruthy()
  const hospital = filaDe('Hospital de San Marcos')
  expect(hospital.textContent).toContain('No suma en el consolidado')
  expect(hospital.textContent).toContain('San Marcos')
  expect(filaDe('Centro de Salud San Marcos').textContent).not.toContain('No suma en el consolidado')
  expect(screen.getByText(/Además, 1,523 dosis de establecimientos que no suman en el consolidado\./)).toBeTruthy()
})

test('sin dosis fuera del consolidado no hay línea debajo; el informe por residencia nombra el municipio así', () => {
  render(<TablaInforme informe={informe({ informe: 'residencia' })} />)
  expect(screen.queryByText(/Además,/)).toBeNull()
  expect(screen.getByRole('columnheader', { name: 'Municipio de residencia' })).toBeTruthy()
})

test('por distrito, «Sin distrito» no lleva municipio y cada distrito sí', () => {
  render(
    <TablaInforme
      informe={informe({
        nivel: 'distrito',
        filas: [
          fila(3, 'Distrito San Marcos', [1, 0, 0, 0], { municipio: SAN_MARCOS }),
          fila(null, 'Sin distrito', [2, 0, 0, 0], { codigo: null }),
        ],
        total: { cantidades: [3, 0, 0, 0] },
      })}
    />,
  )
  expect(screen.getByRole('columnheader', { name: 'Distrito' })).toBeTruthy()
  expect(filaDe('Distrito San Marcos').querySelector('p').textContent).toBe('San Marcos')
  expect(filaDe('Sin distrito').querySelector('p')).toBeNull()
})
