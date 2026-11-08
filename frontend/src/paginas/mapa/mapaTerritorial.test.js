import {
  archivoDeLimites,
  cifraDelModo,
  claseDeBrecha,
  clasesDeBrecha,
  COLOR_SIN_DATOS,
  estadoMasAtrasado,
  filasDelMapa,
  indicadorDelModo,
  lineasDelTooltip,
  ordenDeClasificacion,
  rotulosDeLeyenda,
  vacunaDelMapa,
} from './mapaTerritorial.js'

const UMBRALES = [
  { color: 'verde', desde: 90, hasta: null },
  { color: 'amarillo', desde: 80, hasta: 90 },
  { color: 'rojo', desde: 0, hasta: 80 },
]
const UMBRALES_DESERCION = [
  { color: 'verde', desde: null, hasta: 10 },
  { color: 'rojo', desde: 10, hasta: null },
]

const HEXA = { codigo: 'HEXA', nombre: 'Hexavalente' }
const BCG = { codigo: 'BCG', nombre: 'BCG' }

const indicador = (codigo, tipoCalculo, cambios = {}) => ({
  codigo, version: 1, nombre: codigo, tipoCalculo, esIndicadorMapa: false, umbrales: UMBRALES, umbralesProvisionales: false,
  ...cambios,
})

const SAN_MARCOS = { id: 1, nombre: 'San Marcos', codigoIne: '1201' }
const TACANA = { id: 7, nombre: 'Tacaná', codigoIne: '1207' }
const SIBINAL = { id: 8, nombre: 'Sibinal', codigoIne: '1208' }

const fila = (indicadorCodigo, vacuna, municipio, cambios = {}) => ({
  indicadorCodigo, vacuna, municipio, valor: 50, color: 'rojo', calculable: true, numerador: 10, denominador: 20,
  brechaDosis: 5, metaDosis: 15, ...cambios,
})

const conteos = (cambios = {}) => ({
  SIN_ENVIAR: 0, ENVIADO: 0, EN_REVISION: 0, CORRECCION_SOLICITADA: 0, APROBADO: 0, CERRADO: 0, ...cambios,
})

describe('indicadorDelModo y vacunaDelMapa', () => {
  const resultados = [
    fila('COB_BCG', BCG, null),
    fila('COB_HEXA3', HEXA, null),
    fila('AVANCE_HEXA3', HEXA, null),
    fila('BRECHA_HEXA3', HEXA, null),
    fila('DES_HEXA1_3', HEXA, null),
  ]
  const indicadores = [
    indicador('AVANCE_HEXA3', 'AVANCE_META_MES'),
    indicador('BRECHA_HEXA3', 'BRECHA', { umbrales: [] }),
    indicador('COB_BCG', 'COBERTURA'),
    indicador('COB_HEXA3', 'COBERTURA', { esIndicadorMapa: true }),
    indicador('DES_HEXA1_3', 'DESERCION', { umbrales: UMBRALES_DESERCION }),
  ]

  test('Cobertura toma el indicador del mapa; sin él, el avance, y sin avance, la cobertura', () => {
    expect(indicadorDelModo(indicadores, resultados, 'HEXA', 'cobertura').codigo).toBe('COB_HEXA3')
    const sinMarca = indicadores.map((i) => ({ ...i, esIndicadorMapa: false }))
    expect(indicadorDelModo(sinMarca, resultados, 'HEXA', 'cobertura').codigo).toBe('AVANCE_HEXA3')
    expect(indicadorDelModo(indicadores, resultados, 'BCG', 'cobertura').codigo).toBe('COB_BCG')
  })

  test('Brecha toma el BRECHA de la vacuna y, sin él, el de cobertura; Deserción y Estado, el suyo o null', () => {
    expect(indicadorDelModo(indicadores, resultados, 'HEXA', 'brecha').codigo).toBe('BRECHA_HEXA3')
    expect(indicadorDelModo(indicadores, resultados, 'BCG', 'brecha').codigo).toBe('COB_BCG')
    expect(indicadorDelModo(indicadores, resultados, 'HEXA', 'desercion').codigo).toBe('DES_HEXA1_3')
    expect(indicadorDelModo(indicadores, resultados, 'BCG', 'desercion')).toBeNull()
    expect(indicadorDelModo(indicadores, resultados, 'HEXA', 'estado')).toBeNull()
  })

  test('la vacuna es la de la URL si la corrida la tiene; si no, la del indicador del mapa', () => {
    expect(vacunaDelMapa(indicadores, resultados, 'BCG')).toBe('BCG')
    expect(vacunaDelMapa(indicadores, resultados, 'NO_EXISTE')).toBe('HEXA')
    expect(vacunaDelMapa(indicadores.map((i) => ({ ...i, esIndicadorMapa: false })), resultados, null)).toBe('HEXA')
    expect(vacunaDelMapa([], [], null)).toBeNull()
  })
})

describe('filasDelMapa', () => {
  const AVANCE = indicador('AVANCE_HEXA3', 'AVANCE_META_MES')
  const features = [SAN_MARCOS, TACANA, SIBINAL].map((m) => ({
    type: 'Feature', properties: { codigo_ine: m.codigoIne, nombre: m.nombre }, geometry: null,
  }))
  const resultados = [
    fila('AVANCE_HEXA3', HEXA, null, { valor: 70 }),
    fila('AVANCE_HEXA3', HEXA, SAN_MARCOS, { valor: 95, color: 'verde' }),
    fila('AVANCE_HEXA3', HEXA, TACANA, { valor: null, color: null, calculable: false, brechaDosis: null }),
    fila('COB_BCG', BCG, SIBINAL),
  ]
  const avance = {
    municipios: [
      { municipio: SAN_MARCOS, esperados: 3, conteos: conteos({ APROBADO: 2, CERRADO: 1 }) },
      { municipio: { id: 99, nombre: 'Coatepeque', codigoIne: '0920' }, esperados: 1, conteos: conteos({ SIN_ENVIAR: 1 }) },
    ],
  }

  test('une por codigoIne los polígonos, los resultados y el avance, y marca los que no tienen datos', () => {
    const { filas } = filasDelMapa({ resultados, indicador: AVANCE, avance, features, modo: 'cobertura' })
    const porNombre = Object.fromEntries(filas.map((f) => [f.nombre, f]))

    expect(filas.map((f) => f.nombre)).toEqual(['Coatepeque', 'San Marcos', 'Sibinal', 'Tacaná'])
    expect(porNombre['San Marcos']).toMatchObject({
      municipioId: 1, enMapa: true, sinDatos: null, color: 'var(--semaforo-verde)', estado: 'APROBADO',
    })
    expect(porNombre['San Marcos'].resultado.valor).toBe(95)
    expect(porNombre.Tacaná).toMatchObject({ sinDatos: 'Sin población', color: COLOR_SIN_DATOS })
    // Sibinal tiene resultados de otra vacuna, pero no del indicador del modo.
    expect(porNombre.Sibinal).toMatchObject({ municipioId: 8, resultado: null, sinDatos: 'Sin datos' })
    // Coatepeque solo viene en el avance y no tiene polígono.
    expect(porNombre.Coatepeque).toMatchObject({ enMapa: false, sinDatos: 'Sin datos' })
  })

  test('en Estado del reporte pinta el estado más atrasado, y sin reportes esperados no hay datos', () => {
    const { filas } = filasDelMapa({ resultados, indicador: null, avance, features, modo: 'estado' })
    const porNombre = Object.fromEntries(filas.map((f) => [f.nombre, f]))

    expect(porNombre['San Marcos'].color).toBe('var(--estado-aprobado)')
    expect(porNombre.Coatepeque).toMatchObject({ estado: 'SIN_ENVIAR', color: 'var(--mapa-sin-enviar)' })
    expect(porNombre.Tacaná).toMatchObject({ sinDatos: 'Sin reportes esperados', color: COLOR_SIN_DATOS })
  })

  test('en Brecha pinta la clase de cada municipio, y en Deserción un municipio sin primeras dosis lo dice', () => {
    const brecha = filasDelMapa({
      resultados: [fila('B', HEXA, SAN_MARCOS, { brechaDosis: 0 }), fila('B', HEXA, SIBINAL, { brechaDosis: 40 })],
      indicador: indicador('B', 'BRECHA'),
      features,
      modo: 'brecha',
    })
    expect(brecha.clases.map((c) => c.token)).toEqual([1, 5])
    expect(brecha.filas.find((f) => f.nombre === 'San Marcos').color).toBe('var(--mapa-brecha-1)')
    expect(brecha.filas.find((f) => f.nombre === 'Sibinal').color).toBe('var(--mapa-brecha-5)')

    const desercion = filasDelMapa({
      resultados: [fila('D', HEXA, TACANA, { valor: null, calculable: false, color: null })],
      indicador: indicador('D', 'DESERCION'),
      features,
      modo: 'desercion',
    })
    expect(desercion.filas.find((f) => f.nombre === 'Tacaná').sinDatos).toBe('Sin primeras dosis')
  })

  test('sin límites cargados, ningún municipio queda en el mapa pero todos siguen en las filas', () => {
    const { filas } = filasDelMapa({ resultados, indicador: AVANCE, avance, modo: 'cobertura' })
    expect(filas.map((f) => f.nombre)).toEqual(['Coatepeque', 'San Marcos', 'Sibinal', 'Tacaná'])
    expect(filas.some((f) => f.enMapa)).toBe(false)
  })
})

describe('clasesDeBrecha', () => {
  test('con 30 valores: la clase 1 para los ceros y los cuartiles de los demás en cuatro clases', () => {
    const valores = [0, 0, ...Array.from({ length: 28 }, (_, i) => (i + 1) * 10)]
    const clases = clasesDeBrecha(valores)

    expect(clases).toEqual([
      { token: 1, desde: 0, hasta: 0 },
      { token: 2, desde: 10, hasta: 70 },
      { token: 3, desde: 71, hasta: 140 },
      { token: 4, desde: 141, hasta: 210 },
      { token: 5, desde: 211, hasta: 280 },
    ])
    expect(claseDeBrecha(clases, 140).token).toBe(3)
    expect(claseDeBrecha(clases, 141).token).toBe(4)
    expect(claseDeBrecha(clases, null)).toBeNull()
  })

  test('sin ceros no hay clase 1, y los nulos no cuentan', () => {
    expect(clasesDeBrecha([null, 5, 6, 7, 8]).map((c) => c.token)).toEqual([2, 3, 4, 5])
    expect(clasesDeBrecha([null, undefined])).toEqual([])
    expect(clasesDeBrecha([0, 0])).toEqual([{ token: 1, desde: 0, hasta: 0 }])
  })

  test('con menos de cuatro valores distintos, una clase por valor y con los tonos más intensos', () => {
    expect(clasesDeBrecha([0, 120, 120, 300])).toEqual([
      { token: 1, desde: 0, hasta: 0 },
      { token: 4, desde: 120, hasta: 120 },
      { token: 5, desde: 300, hasta: 300 },
    ])
  })

  test('si los cortes se repiten, las clases vacías se quitan', () => {
    const clases = clasesDeBrecha([10, 10, 10, 10, 10, 10, 20, 30, 40])
    expect(clases.every((c) => c.desde <= c.hasta)).toBe(true)
    expect(new Set(clases.map((c) => c.token)).size).toBe(clases.length)
    for (const valor of [10, 20, 30, 40]) expect(claseDeBrecha(clases, valor)).not.toBeNull()
  })
})

test('estadoMasAtrasado devuelve el estado menos avanzado con reportes', () => {
  expect(estadoMasAtrasado(conteos({ CERRADO: 3, SIN_ENVIAR: 1 }))).toBe('SIN_ENVIAR')
  expect(estadoMasAtrasado(conteos({ CERRADO: 3, CORRECCION_SOLICITADA: 1, ENVIADO: 2 }))).toBe('CORRECCION_SOLICITADA')
  expect(estadoMasAtrasado(conteos({ EN_REVISION: 1, APROBADO: 4 }))).toBe('EN_REVISION')
  expect(estadoMasAtrasado(conteos())).toBeNull()
  expect(estadoMasAtrasado(null)).toBeNull()
})

describe('rotulosDeLeyenda', () => {
  const textos = (leyenda) => leyenda.franjas.map((f) => f.texto)

  test('ascendente, con tres franjas leídas de los umbrales, del mejor color al peor', () => {
    const leyenda = rotulosDeLeyenda('cobertura', {
      indicador: indicador('AVANCE_HEXA3', 'AVANCE_META_MES', { umbralesProvisionales: true }),
    })
    expect(leyenda.titulo).toBe('Avance contra la meta del mes')
    expect(textos(leyenda)).toEqual(['90 % o más', '80 a 89.9 %', 'Menos de 80 %', 'Sin datos'])
    expect(leyenda.franjas.map((f) => f.color)).toEqual([
      'var(--semaforo-verde)', 'var(--semaforo-amarillo)', 'var(--semaforo-rojo)', COLOR_SIN_DATOS,
    ])
    expect(leyenda.provisional).toBe(true)
    expect(rotulosDeLeyenda('cobertura', { indicador: indicador('C', 'COBERTURA') }).titulo).toBe('Cobertura')
  })

  test('descendente, con dos franjas (como DES_HEXA1_3)', () => {
    const leyenda = rotulosDeLeyenda('desercion', {
      indicador: indicador('DES_HEXA1_3', 'DESERCION', { umbrales: UMBRALES_DESERCION }),
    })
    expect(leyenda.titulo).toBe('Deserción')
    expect(textos(leyenda)).toEqual(['10 % o menos', 'Más de 10 %', 'Sin datos'])
    expect(leyenda.provisional).toBe(false)
  })

  test('brecha con el rango de cada clase, y estado con los seis estados', () => {
    const clases = [{ token: 1, desde: 0, hasta: 0 }, { token: 4, desde: 1, hasta: 120 }, { token: 5, desde: 1500, hasta: 1500 }]
    expect(textos(rotulosDeLeyenda('brecha', { clases }))).toEqual([
      'Meta alcanzada', '1 a 120', '1,500 dosis', 'Sin datos',
    ])
    const estado = rotulosDeLeyenda('estado', { mesNombre: 'septiembre de 2026' })
    expect(estado.titulo).toBe('Estado de los reportes de septiembre de 2026')
    expect(textos(estado)).toEqual([
      'Sin enviar', 'Corrección solicitada', 'Enviado', 'En revisión', 'Aprobado', 'Cerrado', 'Sin datos',
    ])
  })

  test('un indicador sin umbrales deja solo «Sin datos»', () => {
    expect(textos(rotulosDeLeyenda('cobertura', { indicador: indicador('C', 'COBERTURA', { umbrales: [] }) })))
      .toEqual(['Sin datos'])
  })
})

describe('ordenDeClasificacion', () => {
  const conResultado = (nombre, resultado) => ({ nombre, resultado, sinDatos: null })
  const nombres = (filas) => filas.map((f) => f.nombre)

  test('Cobertura de menor a mayor, Brecha y Deserción de mayor a menor; empates por nombre y sin datos al final', () => {
    const filas = [
      conResultado('Tacaná', { valor: 40, brechaDosis: 400 }),
      conResultado('Ayutla', { valor: 70, brechaDosis: 100 }),
      conResultado('Sibinal', { valor: 40, brechaDosis: 400 }),
      { nombre: 'Ocós', resultado: null, sinDatos: 'Sin datos' },
      { nombre: 'Catarina', resultado: null, sinDatos: 'Sin datos' },
    ]
    expect(nombres(ordenDeClasificacion(filas, 'cobertura'))).toEqual(['Sibinal', 'Tacaná', 'Ayutla', 'Catarina', 'Ocós'])
    expect(nombres(ordenDeClasificacion(filas, 'brecha'))).toEqual(['Sibinal', 'Tacaná', 'Ayutla', 'Catarina', 'Ocós'])
    expect(nombres(ordenDeClasificacion(filas, 'desercion'))).toEqual(['Ayutla', 'Sibinal', 'Tacaná', 'Catarina', 'Ocós'])
  })

  test('Estado por el estado más atrasado y luego por los reportes sin enviar', () => {
    const conEstado = (nombre, estado, sinEnviar) => ({
      nombre, estado, sinDatos: null, avance: { conteos: conteos({ SIN_ENVIAR: sinEnviar }) },
    })
    const filas = [
      conEstado('Ayutla', 'CERRADO', 0),
      conEstado('Tacaná', 'SIN_ENVIAR', 1),
      conEstado('Sibinal', 'SIN_ENVIAR', 3),
      conEstado('Ocós', 'EN_REVISION', 0),
    ]
    expect(nombres(ordenDeClasificacion(filas, 'estado'))).toEqual(['Sibinal', 'Tacaná', 'Ocós', 'Ayutla'])
  })
})

describe('lineasDelTooltip', () => {
  const resultado = {
    valor: 63.24, meta: 100, numerador: 712, denominador: 1126.5, metaDosis: 1127, brechaDosis: 415,
  }
  const conResultado = { nombre: 'Tacaná', sinDatos: null, resultado }

  test('Cobertura dice dosis, meta, avance y brecha', () => {
    expect(lineasDelTooltip('cobertura', conResultado, indicador('A', 'AVANCE_META_MES'))).toEqual([
      ['Avance', '63.2 %'],
      ['Dosis aplicadas', '712'],
      ['Meta en dosis', '1,127'],
      ['Meta', '100.0 %'],
      ['Dosis por aplicar', '415'],
    ])
    expect(lineasDelTooltip('cobertura', conResultado, indicador('C', 'COBERTURA'))[0][0]).toBe('Cobertura')
  })

  test('Brecha empieza por las dosis por aplicar, y Deserción da las dosis iniciales y finales', () => {
    expect(lineasDelTooltip('brecha', conResultado)[0]).toEqual(['Dosis por aplicar', '415'])
    const desercion = { ...conResultado, resultado: { valor: 7.9, numerador: 15, denominador: 190 } }
    expect(lineasDelTooltip('desercion', desercion)).toEqual([
      ['Deserción', '7.9 %'],
      ['Dosis iniciales', '190'],
      ['Dosis finales', '175'],
    ])
  })

  test('con mayorACien, Cobertura y Brecha agregan «Revisar»; Deserción no (SPEC 52)', () => {
    const revisar = ['Revisar', 'Mayor al 100 %: revise la población (denominador) o los registros.']
    const marcada = { ...conResultado, resultado: { ...resultado, valor: 102.8, mayorACien: true } }
    expect(lineasDelTooltip('cobertura', marcada, indicador('A', 'AVANCE_META_MES')).at(-1)).toEqual(revisar)
    expect(lineasDelTooltip('brecha', marcada).at(-1)).toEqual(revisar)
    expect(lineasDelTooltip('desercion', marcada)).not.toContainEqual(revisar)
    expect(lineasDelTooltip('cobertura', conResultado)).not.toContainEqual(revisar)
  })

  test('Estado da los esperados y solo los estados con reportes; sin datos, el motivo', () => {
    const fila = { sinDatos: null, avance: { esperados: 4, conteos: conteos({ SIN_ENVIAR: 1, APROBADO: 3 }) } }
    expect(lineasDelTooltip('estado', fila)).toEqual([
      ['Reportes esperados', '4'],
      ['Sin enviar', '1'],
      ['Aprobado', '3'],
    ])
    expect(lineasDelTooltip('cobertura', { sinDatos: 'Sin población' })).toEqual([['Sin población', '']])
  })
})

test('cifraDelModo da el valor de cada modo, o el motivo sin datos', () => {
  const fila = { sinDatos: null, estado: 'EN_REVISION', resultado: { valor: 82.1186, brechaDosis: 1204 } }
  expect(cifraDelModo('cobertura', fila)).toBe('82.1 %')
  expect(cifraDelModo('desercion', fila)).toBe('82.1 %')
  expect(cifraDelModo('brecha', fila)).toBe('1,204 dosis')
  expect(cifraDelModo('estado', fila)).toBe('En revisión')
  expect(cifraDelModo('cobertura', { sinDatos: 'Sin población' })).toBe('Sin población')
})

test('archivoDeLimites elige el archivo por el departamento del código INE', () => {
  expect(archivoDeLimites(['1207'])).toBe('geo/san-marcos.geojson')
  expect(archivoDeLimites(['0920', '1201'])).toBe('geo/san-marcos.geojson')
  expect(archivoDeLimites(['0920'])).toBeNull()
  expect(archivoDeLimites([])).toBeNull()
})
