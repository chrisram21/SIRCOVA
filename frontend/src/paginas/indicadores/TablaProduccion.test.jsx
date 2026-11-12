import { render, screen } from '@testing-library/react'
import TablaProduccion from './TablaProduccion.jsx'

const SAN_MARCOS = { id: 1, codigoIne: '1201', nombre: 'San Marcos' }
const SAN_PEDRO = { id: 4, codigoIne: '1202', nombre: 'San Pedro Sacatepéquez' }

const cantidades = (propia, otros, porDosis = []) => ({
  porDosis: porDosis.map(([dosisId, dosisTotal]) => ({ dosisId, dosisTotal })),
  dosisPoblacionPropia: propia,
  dosisOtrosMunicipios: otros,
  dosisTotal: propia + otros,
})
const produccion = (cambios = {}) => ({
  anio: 2026,
  mes: 8,
  acumulado: true,
  agrupar: 'municipio',
  vacuna: null,
  filas: [],
  total: cantidades(0, 0),
  dosisFueraDelConsolidado: 0,
  preliminar: false,
  mesesSinCerrar: [],
  ...cambios,
})
const porMunicipio = (municipio, valores) => ({
  municipio, establecimiento: null, fueraDelConsolidado: false, ...valores,
})
const celdas = (fila) => [...fila.querySelectorAll('td')].map((c) => c.textContent)
const nombreDe = (fila) => {
  const celda = fila.querySelector('td')
  return celda?.querySelector('span')?.textContent ?? celda?.textContent
}
const filaDe = (texto) => screen.getAllByRole('row').find((fila) => nombreDe(fila) === texto)

test('por municipio con una vacuna: una columna por dosis, propia, otros, total y la fila de total', () => {
  render(
    <TablaProduccion
      produccion={produccion({
        vacuna: {
          codigo: 'HEXA',
          nombre: 'Hexavalente',
          dosis: [{ id: 7, codigo: 'D1', activa: true }, { id: 8, codigo: 'R1', activa: false }],
        },
        filas: [
          porMunicipio(SAN_MARCOS, cantidades(1200, 34, [[7, 1230], [8, 4]])),
          porMunicipio(SAN_PEDRO, cantidades(0, 0, [[7, 0], [8, 0]])),
        ],
        total: cantidades(1200, 34, [[7, 1230], [8, 4]]),
      })}
    />,
  )

  expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
    'Municipio de aplicación', 'D1', 'R1', 'Población propia', 'Otros municipios', 'Total',
  ])
  expect(screen.getByRole('columnheader', { name: 'R1' }).getAttribute('title')).toBe('Dosis inactiva')
  expect(celdas(filaDe('San Marcos'))).toEqual(['San Marcos', '1,230', '4', '1,200', '34', '1,234'])
  expect(celdas(filaDe('San Pedro Sacatepéquez'))).toEqual(['San Pedro Sacatepéquez', '0', '0', '0', '0', '0'])
  expect(celdas(filaDe('Total'))).toEqual(['Total', '1,230', '4', '1,200', '34', '1,234'])
  expect(screen.queryByText(/%/)).toBeNull()
  expect(screen.queryByText(/no suman en el consolidado/)).toBeNull()
})

test('con todas las vacunas no hay columnas de dosis', () => {
  render(
    <TablaProduccion
      produccion={produccion({
        filas: [porMunicipio(SAN_MARCOS, cantidades(10, 2))],
        total: cantidades(10, 2),
      })}
    />,
  )

  expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
    'Municipio de aplicación', 'Población propia', 'Otros municipios', 'Total',
  ])
  expect(celdas(filaDe('Total'))).toEqual(['Total', '10', '2', '12'])
})

test('por establecimiento: su municipio como detalle, la insignia y la línea de lo que no suma', () => {
  render(
    <TablaProduccion
      produccion={produccion({
        agrupar: 'establecimiento',
        filas: [
          {
            municipio: SAN_MARCOS,
            establecimiento: { id: 2, codigo: 'CS-1201', nombre: 'Centro de Salud San Marcos' },
            fueraDelConsolidado: false,
            ...cantidades(500, 20),
          },
          {
            municipio: SAN_MARCOS,
            establecimiento: { id: 31, codigo: 'HOSP-SM', nombre: 'Hospital de San Marcos' },
            fueraDelConsolidado: true,
            ...cantidades(1300, 13),
          },
        ],
        total: cantidades(500, 20),
        dosisFueraDelConsolidado: 1313,
      })}
    />,
  )

  expect(screen.getAllByRole('columnheader')[0].textContent).toBe('Establecimiento')
  expect(celdas(filaDe('Centro de Salud San Marcos'))[0]).toBe('Centro de Salud San MarcosSan Marcos')
  const hospital = filaDe('Hospital de San Marcos')
  expect(hospital.textContent).toContain('No suma en el consolidado')
  expect(filaDe('Centro de Salud San Marcos').textContent).not.toContain('No suma en el consolidado')
  expect(celdas(filaDe('Total'))).toEqual(['Total', '500', '20', '520'])
  expect(screen.getByText('Además, 1,313 dosis de establecimientos que no suman en el consolidado.')).toBeTruthy()
})
