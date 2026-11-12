import {
  columnasDeLaRed,
  esperadoDeLaTabla,
  etiquetaTrazadora,
  filasDeLaRed,
  gruposDeColumnas,
  redElegida,
  sinCoberturaAnual,
} from './tablaRed.js'

const vacuna = (codigo) => ({ id: codigo.length, codigo, nombre: codigo, activa: true })
const trazadora = (vacunaCodigo, codigo) => ({ dosisId: 0, codigo, nombre: codigo, activa: true, vacuna: vacuna(vacunaCodigo) })

const TACANA = { id: 7, codigoIne: '1207', nombre: 'Tacaná' }
const SIBINAL = { id: 8, codigoIne: '1208', nombre: 'Sibinal' }
const OTRO = { id: 1, nombre: 'San Marcos' }
const RED = {
  id: 3,
  nombre: 'Red No. 1',
  municipios: [TACANA, SIBINAL],
  // En el orden de la red: vacuna y dosis.
  trazadoras: [trazadora('BCG', 'UNICA'), trazadora('HEXA', 'D3'), trazadora('OPV', 'R2'), trazadora('SPR', 'D1')],
}

const anual = (codigo, clasificacionPoblacion, descripcionPoblacion) => ({
  codigo, tipoCalculo: 'COBERTURA', prorrateo: 'NINGUNO', clasificacionPoblacion, descripcionPoblacion,
})
const INDICADORES = [
  anual('COB_ANUAL_SPR1', '1_A_MENOR_2', 'De 1 a menos de 2 años'),
  anual('COB_ANUAL_BCGU', 'NACIDOS_VIVOS', 'Nacidos vivos'),
  anual('COB_ANUAL_HEXA3', 'MENOR_1', 'Menores de 1 año'),
  // La mensual de OPV R2 no cuenta: la tabla solo usa coberturas anuales.
  { codigo: 'COB_OPVR2', tipoCalculo: 'COBERTURA', prorrateo: 'MENSUAL_LINEAL', clasificacionPoblacion: '4_ANIOS' },
]

const fila = (indicadorCodigo, vacunaCodigo, dosis, municipio, cambios = {}) => ({
  indicadorCodigo, vacuna: vacuna(vacunaCodigo), dosis, municipio, red: null, valor: 50, esperado: 58.33, ...cambios,
})
const RESULTADOS = [
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', null),
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', null, { red: { id: 3, nombre: 'Red No. 1' }, valor: 61 }),
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', TACANA, { valor: 70 }),
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', SIBINAL, { valor: 52 }),
  fila('COB_ANUAL_BCGU', 'BCG', 'UNICA', OTRO, { valor: 99 }),
  fila('COB_ANUAL_HEXA3', 'HEXA', 'D3', null, { red: { id: 3, nombre: 'Red No. 1' }, valor: 45 }),
  fila('COB_ANUAL_HEXA3', 'HEXA', 'D3', TACANA, { valor: 40 }),
  fila('COB_ANUAL_SPR1', 'SPR', 'D1', SIBINAL, { valor: 30 }),
  fila('COB_OPVR2', 'OPV', 'R2', TACANA, { valor: 88, esperado: null }),
]

test('la red de la URL si está; si no, la primera por nombre; sin redes, null', () => {
  const redes = [{ id: 5, nombre: 'Red No. 2' }, { id: 3, nombre: 'Red No. 1' }]
  expect(redElegida(redes, 5).id).toBe(5)
  expect(redElegida(redes, 99).id).toBe(3)
  expect(redElegida(redes, undefined).id).toBe(3)
  expect(redElegida([], 3)).toBeNull()
  expect(redElegida(null, 3)).toBeNull()
})

test('la etiqueta de una trazadora es el código de la vacuna con la dosis corta', () => {
  expect(etiquetaTrazadora(trazadora('HEXA', 'D3'))).toBe('HEXA 3')
  expect(etiquetaTrazadora(trazadora('BCG', 'UNICA'))).toBe('BCG')
  expect(etiquetaTrazadora(trazadora('DPT', 'R1'))).toBe('DPT R1')
})

test('las columnas van agrupadas por población en el orden de la red, y las sin cobertura anual al final', () => {
  const columnas = columnasDeLaRed(RED, INDICADORES, RESULTADOS)
  expect(columnas.map((c) => [c.etiqueta, c.indicador?.codigo ?? null, c.grupo])).toEqual([
    ['BCG', 'COB_ANUAL_BCGU', 'Nacidos vivos'],
    ['HEXA 3', 'COB_ANUAL_HEXA3', 'Menores de 1 año'],
    ['SPR 1', 'COB_ANUAL_SPR1', 'De 1 a menos de 2 años'],
    ['OPV R2', null, 'Sin indicador'],
  ])
  expect(gruposDeColumnas(columnas)).toEqual([
    { grupo: 'Nacidos vivos', columnas: 1 },
    { grupo: 'Menores de 1 año', columnas: 1 },
    { grupo: 'De 1 a menos de 2 años', columnas: 1 },
    { grupo: 'Sin indicador', columnas: 1 },
  ])
  expect(sinCoberturaAnual(columnas)).toEqual(['OPV R2'])
})

test('dos trazadoras del mismo grupo comparten el encabezado, aunque en la red no vayan juntas', () => {
  const red = { ...RED, trazadoras: [trazadora('HEXA', 'D3'), trazadora('BCG', 'UNICA'), trazadora('POLIO', 'D3')] }
  const indicadores = [...INDICADORES, anual('COB_ANUAL_POLIO3', 'MENOR_1', 'Menores de 1 año')]
  const resultados = [...RESULTADOS, fila('COB_ANUAL_POLIO3', 'POLIO', 'D3', TACANA)]
  const columnas = columnasDeLaRed(red, indicadores, resultados)
  expect(columnas.map((c) => c.etiqueta)).toEqual(['HEXA 3', 'POLIO 3', 'BCG'])
  expect(gruposDeColumnas(columnas)).toEqual([
    { grupo: 'Menores de 1 año', columnas: 2 },
    { grupo: 'Nacidos vivos', columnas: 1 },
  ])
})

test('un indicador anual sin filas de la trazadora no cuenta como su cobertura', () => {
  const red = { ...RED, trazadoras: [trazadora('ROTA', 'D2')] }
  const columnas = columnasDeLaRed(red, [...INDICADORES, anual('COB_ANUAL_ROTA2', 'MENOR_1', 'Menores de 1 año')], RESULTADOS)
  expect(columnas[0].indicador).toBeNull()
})

test('las filas son los municipios de la red por nombre, con su celda por columna, y el total de la red', () => {
  const columnas = columnasDeLaRed(RED, INDICADORES, RESULTADOS)
  const { municipios, total } = filasDeLaRed(RED, columnas, RESULTADOS)
  const valores = (celdas) => celdas.map((c) => c?.valor ?? null)
  expect(municipios.map((m) => [m.municipio.nombre, valores(m.celdas)])).toEqual([
    ['Sibinal', [52, null, 30, null]],
    ['Tacaná', [70, 40, null, null]],
  ])
  // El total es la fila de la red, no la de la DDRISS; SPR no la tiene.
  expect(valores(total)).toEqual([61, 45, null, null])
  expect(esperadoDeLaTabla({ municipios, total })).toBe(58.33)
  expect(esperadoDeLaTabla({ municipios: [], total: [null] })).toBeNull()
})
