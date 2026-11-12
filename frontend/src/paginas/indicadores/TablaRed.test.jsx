import { render, screen, within } from '@testing-library/react'
import TablaRed from './TablaRed.jsx'
import { columnasDeLaRed } from './tablaRed.js'

const TACANA = { id: 7, nombre: 'Tacaná' }
const SIBINAL = { id: 8, nombre: 'Sibinal' }
const trazadora = (vacunaCodigo, codigo) => ({
  dosisId: 0, codigo, nombre: codigo, activa: true, vacuna: { id: 0, codigo: vacunaCodigo, nombre: vacunaCodigo, activa: true },
})
const RED = {
  id: 3,
  nombre: 'Red No. 1',
  municipios: [TACANA, SIBINAL],
  trazadoras: [trazadora('BCG', 'UNICA'), trazadora('HEXA', 'D3'), trazadora('OPV', 'R2')],
}
const anual = (codigo, clasificacionPoblacion, descripcionPoblacion) => ({
  codigo, tipoCalculo: 'COBERTURA', prorrateo: 'NINGUNO', clasificacionPoblacion, descripcionPoblacion,
})
const INDICADORES = [
  anual('COB_ANUAL_BCGU', 'NACIDOS_VIVOS', 'Nacidos vivos'),
  anual('COB_ANUAL_HEXA3', 'MENOR_1', 'Menores de 1 año'),
]
const fila = (indicadorCodigo, vacunaCodigo, dosis, municipio, cambios = {}) => ({
  indicadorCodigo,
  vacuna: { codigo: vacunaCodigo, nombre: vacunaCodigo },
  dosis,
  municipio,
  red: null,
  valor: 50,
  color: 'amarillo',
  calculable: true,
  esperado: 58.33,
  mayorACien: false,
  ...cambios,
})
const TOTAL = { red: { id: 3, nombre: 'Red No. 1' } }
const RESULTADOS = [
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', null, { valor: 99 }),
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', null, { ...TOTAL, valor: 61.2 }),
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', TACANA, { valor: 104.5, color: 'verde', mayorACien: true }),
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', SIBINAL, { valor: 52.7, color: 'verde' }),
  fila('COB_ANUAL_HEXA3', 'HEXA', 'D3', null, { ...TOTAL, valor: 43.56, color: 'rojo' }),
  fila('COB_ANUAL_HEXA3', 'HEXA', 'D3', TACANA, { valor: 40, color: 'rojo' }),
  fila('COB_ANUAL_HEXA3', 'HEXA', 'D3', SIBINAL, { valor: null, calculable: false, color: null }),
]

function montar() {
  render(<TablaRed red={RED} columnas={columnasDeLaRed(RED, INDICADORES, RESULTADOS)} resultados={RESULTADOS} mes={7} />)
  return within(screen.getByRole('table'))
}
const textos = (fila) => [...fila.querySelectorAll('th, td')].map((c) => c.textContent)

test('encabezado por grupo de población y trazadora; municipios por nombre y al final el total de la red', () => {
  const tabla = montar()
  const [grupos, trazadoras, ...cuerpo] = tabla.getAllByRole('row')
  expect(textos(grupos)).toEqual(['Municipio', 'Nacidos vivos', 'Menores de 1 año', 'Sin indicador'])
  expect(textos(trazadoras)).toEqual(['BCG', 'HEXA 3', 'OPV R2'])
  expect(cuerpo.map(textos)).toEqual([
    ['Sibinal', '52.7 %', 'Sin población', '—'],
    // El <title> de la marca de mayor al 100 % es parte del texto de la celda.
    ['Tacaná', '104.5 %Mayor al 100 %: revise la población (denominador) o los registros.', '40.0 %', '—'],
    ['Total de la red', '61.2 %', '43.6 %', '—'],
  ])
})

test('cada celda lleva el color del semáforo, lo esperado en el title y la marca de mayor al 100 %', () => {
  const tabla = montar()
  const tacana = tabla.getByText('Tacaná').closest('tr')
  expect(within(tacana).getByText('40.0 %').className).toContain('text-destructive')
  expect(within(tacana).getByText('40.0 %').closest('td').getAttribute('title')).toBe('Esperado a julio: 58.3 %')
  expect(within(tacana).getAllByRole('img')).toHaveLength(1)
})

test('avisa las trazadoras sin cobertura anual y dice lo esperado del mes', () => {
  montar()
  expect(screen.getByText('Sin indicador de cobertura anual para: OPV R2. Se configuran en Administración · Indicadores.'))
    .toBeTruthy()
  expect(screen.getByText('Lo esperado a julio es 58.3 % de la población anual (8.33 % por mes).')).toBeTruthy()
})
