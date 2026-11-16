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

test('al agrupar, la segunda fila del encabezado es el valor y abarca sus dosis (SPEC 63)', () => {
  const VPH = { codigo: 'VPH', nombre: 'VPH' }
  const agrupada = (codigo, etiqueta, dosis, id) => ({
    vacuna: VPH, seccion: null, valor: { codigo, etiqueta }, dosis: { id, codigo: dosis },
  })
  const columnas = [
    agrupada('M', 'Masculino', 'D1', 31), agrupada('M', 'Masculino', 'D2', 32), agrupada('F', 'Femenino', 'D1', 31),
  ]
  render(
    <TablaInforme
      informe={informe({
        columnas,
        agrupacion: { codigo: 'sexo', nombre: 'Sexo' },
        filas: [fila(1, 'San Marcos', [4, 0, 14])],
        total: { cantidades: [4, 0, 14] },
      })}
    />,
  )
  const [vacunas, valores, dosis] = screen.getAllByRole('row').slice(0, 3)
  expect(celdasDe(vacunas, 'th').map((th) => [th.textContent, th.getAttribute('colspan')])).toEqual([
    ['Municipio de aplicación', null], ['VPH', '3'],
  ])
  expect(celdasDe(valores, 'th').map((th) => [th.textContent, th.getAttribute('colspan')])).toEqual([
    ['Masculino', '2'], ['Femenino', '1'],
  ])
  expect(celdasDe(dosis, 'th').map((th) => th.textContent)).toEqual(['D1', 'D2', 'D1'])
  expect(celdasDe(filaDe('San Marcos'), 'td').map((td) => td.textContent)).toEqual(['San Marcos', '4', '0', '14'])
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

describe('acumulado anual (SPEC 66)', () => {
  const COLUMNAS_ANUAL = [
    { vacuna: HEXA, seccion: { grupoEdad: 'MENOR_1', titulo: '< 1 año' }, dosis: { id: 9, codigo: 'D3' },
      meta: { valor: 95, indicador: 'COB_HEXA3' } },
    { vacuna: BCG, seccion: null, dosis: { id: 20, codigo: 'UNICA' }, meta: { valor: 90.5, indicador: null } },
  ]
  const cifras = (dosis, poblacion, cobertura, brecha) => ({ dosis, poblacion, cobertura, brecha })
  const anual = (cambios = {}) => ({
    informe: 'acumulado-anual',
    nivel: 'municipio',
    anio: 2026,
    incluirAprobados: false,
    columnas: COLUMNAS_ANUAL,
    filas: [{ id: 1, codigo: '1201', nombre: 'San Marcos', municipio: null,
      ...cifras([1300, 7], [1450, null], [89.66, null], [78, null]) }],
    total: cifras([1300, 7], [1450, null], [89.66, null], [78, null]),
    mesesSinCerrar: [],
    preliminar: false,
    ...cambios,
  })
  const textosDe = (tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)

  test('el encabezado lleva «Cifra» y una cuarta fila con la meta de cada columna', () => {
    render(<TablaInforme informe={anual()} acumulado />)
    const [vacunas, , dosis, metas] = screen.getAllByRole('row').slice(0, 4)
    expect(celdasDe(vacunas, 'th').map((th) => [th.textContent, th.getAttribute('rowspan')])).toEqual([
      ['Municipio de residencia', '4'], ['Cifra', '4'], ['Hexavalente', null], ['BCG', null],
    ])
    expect(celdasDe(dosis, 'th').map((th) => th.textContent)).toEqual(['D3', 'UNICA'])
    expect(celdasDe(metas, 'th').map((th) => th.textContent)).toEqual(['Meta 95 %', 'Meta 90.5 %'])
  })

  test('cada unidad ocupa cuatro filas, con «—» sin valor y la cobertura con un decimal', () => {
    render(<TablaInforme informe={anual()} acumulado />)
    const filas = screen.getAllByRole('row').slice(4)
    expect(filas.map(textosDe)).toEqual([
      ['San Marcos', 'Dosis', '1,300', '7'],
      ['Población', '1,450', '—'],
      ['Cobertura %', '89.7 %', '—'],
      ['Brecha', '78', '—'],
      ['Total', 'Dosis', '1,300', '7'],
      ['Población', '1,450', '—'],
      ['Cobertura %', '89.7 %', '—'],
      ['Brecha', '78', '—'],
    ])
    expect(filas[0].querySelector('td').getAttribute('rowspan')).toBe('4')
  })

  test('la cobertura y la brecha que alcanzan su meta (brecha 0) van en verde, con su leyenda', () => {
    render(
      <TablaInforme
        informe={anual({
          filas: [{ id: 1, codigo: '1201', nombre: 'San Marcos', municipio: null,
            ...cifras([1400, 7], [1450, 100], [96.6, 7], [0, 88]) }],
        })}
        acumulado
      />,
    )
    const filas = screen.getAllByRole('row').slice(4, 8)
    const celdas = (tr) => [...tr.querySelectorAll('td')].filter((td) => td.className.includes('font-mono'))
    const verdes = (tr) => celdas(tr).map((td) => td.hasAttribute('data-cumple'))
    expect(verdes(filas[2])).toEqual([true, false])
    expect(verdes(filas[3])).toEqual([true, false])
    expect(verdes(filas[0])).toEqual([false, false])
    expect(celdas(filas[2])[0].className).toContain('bg-exito')
    expect(celdas(filas[3])[1].className).toContain('bg-advertencia')
    expect(screen.getByText('En verde, las coberturas que alcanzan su meta (brecha 0).')).toBeTruthy()
  })

  test('la tabla aísla sus columnas fijas y se desplaza en su propio contenedor con el encabezado fijo', () => {
    const { container } = render(<TablaInforme informe={anual()} acumulado />)
    const contenedor = screen.getByTestId('contenedor-informe')
    expect(contenedor.className).toContain('isolate')
    // jsdom no mide: se comprueba que el contenedor limita la altura y desplaza, y que el de shadcn deja de hacerlo.
    expect(contenedor.className).toContain('max-h-[calc(100svh-9rem)]')
    expect(contenedor.className).toContain('overflow-auto')
    expect(contenedor.className).toContain('[&>[data-slot=table-container]]:overflow-visible')
    expect(container.querySelector('thead').className).toContain('sticky top-0')
  })

  test('por distrito, el nombre lleva su municipio', () => {
    render(
      <TablaInforme
        informe={anual({
          nivel: 'distrito',
          filas: [{ ...anual().filas[0], id: 3, nombre: 'Distrito San Marcos', municipio: SAN_MARCOS }],
        })}
        acumulado
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'Distrito' })).toBeTruthy()
    expect(screen.getAllByRole('row')[4].querySelector('td p').textContent).toBe('San Marcos')
  })
})
