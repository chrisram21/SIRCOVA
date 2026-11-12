import { render, screen } from '@testing-library/react'
import GraficaProduccion from './GraficaProduccion.jsx'

// Recharts no dibuja en jsdom: se revisan el título, el resumen, la leyenda y la marca.
const fila = (nombre, propia, otros, { establecimiento = false, fuera = false, id = propia } = {}) => ({
  municipio: { id, nombre: establecimiento ? 'San Marcos' : nombre },
  establecimiento: establecimiento ? { id, codigo: `E${id}`, nombre } : null,
  fueraDelConsolidado: fuera,
  porDosis: [],
  dosisPoblacionPropia: propia,
  dosisOtrosMunicipios: otros,
  dosisTotal: propia + otros,
})
const produccion = (cambios) => ({ agrupar: 'municipio', preliminar: false, filas: [], ...cambios })
const marca = () => document.querySelector('[data-marca="preliminar"]')

test('por municipio: título, resumen de mayor a menor y leyenda sin gris', () => {
  render(<GraficaProduccion produccion={produccion({ filas: [fila('Ayutla', 40, 2), fila('Tajumulco', 1200, 34)] })} />)

  expect(screen.getByText('Dosis por municipio de aplicación')).toBeTruthy()
  expect(screen.getByText('Mayor: Tajumulco (1,234 dosis). Menor: Ayutla (42 dosis).')).toBeTruthy()
  expect(screen.getByRole('img', { name: 'Dosis por municipio de aplicación' })).toBeTruthy()
  expect(screen.getByLabelText('Leyenda').textContent).toBe('Población propiaOtros municipios')
  expect(screen.queryByText('%')).toBeNull()
  expect(marca()).toBeNull()
})

test('por establecimiento, con uno que no suma: la leyenda trae el gris', () => {
  render(
    <GraficaProduccion
      produccion={produccion({
        agrupar: 'establecimiento',
        filas: [fila('Hospital de San Marcos', 20, 3, { establecimiento: true, fuera: true }), fila('CS', 5, 0)],
      })}
    />,
  )

  expect(screen.getByText('Dosis por establecimiento')).toBeTruthy()
  expect(screen.getByLabelText('Leyenda').textContent).toContain('No suma en el consolidado')
})

test('con preliminar lleva la marca, salvo si no hay dosis', () => {
  const conDosis = produccion({ preliminar: true, filas: [fila('Ayutla', 3, 0)] })
  const { unmount } = render(<GraficaProduccion produccion={conDosis} />)
  expect(marca()).not.toBeNull()
  unmount()

  render(<GraficaProduccion produccion={produccion({ preliminar: true, filas: [fila('Ayutla', 0, 0)] })} />)
  expect(screen.getByText('No hay dosis aplicadas con estos filtros.')).toBeTruthy()
  expect(marca()).toBeNull()
})
