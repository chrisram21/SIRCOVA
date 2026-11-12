import {
  barrasDeBrecha,
  barrasDeDesercion,
  barrasPorMunicipio,
  barrasPorVacuna,
  esFilaDeTotal,
  filaDeReferencia,
  filasVisibles,
  indicadoresDeLaVacuna,
  indicadoresDeLaVista,
  indicadoresDelPanel,
  municipiosDeLaCorrida,
  municipiosVisibles,
  nombreDeFila,
  puntosDeLinea,
  vacunaElegida,
  vacunasDeLaCorrida,
  VISTAS,
  vistaDeTipo,
  vistaElegida,
  vistaPorDefecto,
} from './panelIndicadores.js'

const HEXA = { codigo: 'HEXA', nombre: 'Hexavalente' }
const SPR = { codigo: 'SPR', nombre: 'SPR' }
const SAN_MARCOS = { id: 1, nombre: 'San Marcos' }
const COMITANCILLO = { id: 4, nombre: 'Comitancillo' }
const TAJUMULCO = { id: 9, nombre: 'Tajumulco' }
const TODOS = [COMITANCILLO, SAN_MARCOS, TAJUMULCO]

const fila = (indicadorCodigo, municipio, cambios = {}) => ({
  indicadorCodigo,
  municipio,
  vacuna: HEXA,
  valor: 50,
  meta: 95,
  color: 'rojo',
  calculable: true,
  brechaDosis: null,
  proyeccion: null,
  ...cambios,
})

const INDICADORES = [
  { codigo: 'COB_HEXA3', nombre: 'Cobertura Hexa 3', tipoCalculo: 'COBERTURA' },
  { codigo: 'AVANCE_HEXA3', nombre: 'Avance Hexa 3', tipoCalculo: 'AVANCE_META_MES' },
  { codigo: 'BRECHA_HEXA3', nombre: 'Brecha Hexa 3', tipoCalculo: 'BRECHA' },
  { codigo: 'DES_HEXA1_3', nombre: 'Deserción Hexa 1 a 3', tipoCalculo: 'DESERCION' },
  { codigo: 'PROY_COB_HEXA3', nombre: 'Proyección Hexa 3', tipoCalculo: 'PROYECCION' },
  { codigo: 'AVANCE_SPR1', nombre: 'Avance SPR 1', tipoCalculo: 'AVANCE_META_MES' },
]
const RESULTADOS = [
  fila('COB_HEXA3', null),
  fila('AVANCE_HEXA3', null),
  fila('BRECHA_HEXA3', null),
  fila('DES_HEXA1_3', null),
  fila('PROY_COB_HEXA3', null, { proyeccion: { indicadorBase: 'COB_HEXA3' } }),
  fila('AVANCE_SPR1', null, { vacuna: SPR }),
  fila('AVANCE_SPR1', SAN_MARCOS, { vacuna: SPR }),
]

describe('pestañas por tipo', () => {
  const HEXA_INDICADORES = indicadoresDeLaVacuna(INDICADORES, RESULTADOS, 'HEXA')
  const COB_HEXA1 = { codigo: 'COB_HEXA1', nombre: 'Cobertura Hexa 1', tipoCalculo: 'COBERTURA' }
  const SOLO_COBERTURA = [{ codigo: 'COB_BCG', nombre: 'Cobertura BCG', tipoCalculo: 'COBERTURA' }]

  test('las seis pestañas van en orden y cada tipo tiene la suya; «Redes» no es de un tipo', () => {
    expect(Object.keys(VISTAS)).toEqual(['avance', 'brecha', 'cobertura', 'desercion', 'proyeccion', 'redes'])
    expect(vistaDeTipo(null)).toBeNull()
    expect(indicadoresDeLaVista([{ codigo: 'X', tipoCalculo: null }], 'redes')).toEqual([])
    expect(vistaDeTipo('AVANCE_META_MES')).toBe('avance')
    expect(vistaDeTipo('PROYECCION')).toBe('proyeccion')
    expect(vistaDeTipo('OTRO')).toBeNull()
    expect(vistaDeTipo(undefined)).toBeNull()
  })

  test('la vista de la URL manda si es válida', () => {
    expect(vistaElegida(HEXA_INDICADORES, { vista: 'brecha' })).toBe('brecha')
    expect(vistaElegida(HEXA_INDICADORES, { vista: 'brecha', indicador: 'COB_HEXA3' })).toBe('brecha')
    // Aunque la vacuna no tenga indicador de ese tipo: la pestaña muestra el aviso.
    expect(vistaElegida(SOLO_COBERTURA, { vista: 'desercion' })).toBe('desercion')
  })

  test('una vista inválida se ignora', () => {
    expect(vistaElegida(HEXA_INDICADORES, { vista: 'mapa' })).toBe('avance')
    expect(vistaElegida(HEXA_INDICADORES, { vista: 'toString' })).toBe('avance')
  })

  test('sin vista, una URL vieja con indicador abre la pestaña de su tipo', () => {
    expect(vistaElegida(HEXA_INDICADORES, { indicador: 'DES_HEXA1_3' })).toBe('desercion')
    expect(vistaElegida(HEXA_INDICADORES, { indicador: 'PROY_COB_HEXA3' })).toBe('proyeccion')
    // Un indicador de otra vacuna o que no está en la corrida no cuenta.
    expect(vistaElegida(HEXA_INDICADORES, { indicador: 'AVANCE_SPR1' })).toBe('avance')
    expect(vistaElegida(HEXA_INDICADORES, { indicador: 'NO_EXISTE' })).toBe('avance')
  })

  test('por defecto, la primera pestaña con indicador de la vacuna', () => {
    expect(vistaPorDefecto(HEXA_INDICADORES)).toBe('avance')
    expect(vistaPorDefecto(SOLO_COBERTURA)).toBe('cobertura')
    expect(vistaElegida(SOLO_COBERTURA, {})).toBe('cobertura')
    expect(vistaPorDefecto([])).toBe('avance')
    expect(vistaElegida([], {})).toBe('avance')
  })

  test('los indicadores de una vista son los de su tipo, en el orden de la corrida', () => {
    const conDos = [COB_HEXA1, ...HEXA_INDICADORES]
    expect(indicadoresDeLaVista(conDos, 'cobertura').map((i) => i.codigo)).toEqual(['COB_HEXA1', 'COB_HEXA3'])
    expect(indicadoresDeLaVista(conDos, 'brecha').map((i) => i.codigo)).toEqual(['BRECHA_HEXA3'])
    expect(indicadoresDeLaVista(SOLO_COBERTURA, 'desercion')).toEqual([])
    expect(indicadoresDeLaVista(conDos, 'otra')).toEqual([])
  })
})

describe('vacuna e indicadores del panel', () => {
  test('las vacunas de la corrida van por nombre y sin repetir', () => {
    expect(vacunasDeLaCorrida(RESULTADOS)).toEqual([HEXA, SPR])
  })

  test('la vacuna sale de la URL, del indicador de la URL o del primer avance', () => {
    expect(vacunaElegida(INDICADORES, RESULTADOS, { vacuna: 'SPR' })).toBe('SPR')
    expect(vacunaElegida(INDICADORES, RESULTADOS, { vacuna: 'OTRA', indicador: 'AVANCE_SPR1' })).toBe('SPR')
    expect(vacunaElegida(INDICADORES, RESULTADOS, {})).toBe('HEXA')
    expect(vacunaElegida([], [], {})).toBeNull()
  })

  test('elige un indicador por tipo de la vacuna; la cobertura es la elegida si es de cobertura o avance', () => {
    const panel = indicadoresDelPanel(INDICADORES, RESULTADOS, 'HEXA', 'COB_HEXA3')
    expect(Object.fromEntries(Object.entries(panel).map(([k, v]) => [k, v?.codigo ?? null]))).toEqual({
      cobertura: 'COB_HEXA3',
      brecha: 'BRECHA_HEXA3',
      desercion: 'DES_HEXA1_3',
      proyeccion: 'PROY_COB_HEXA3',
      base: 'COB_HEXA3',
    })
    expect(indicadoresDelPanel(INDICADORES, RESULTADOS, 'HEXA', 'BRECHA_HEXA3').cobertura.codigo).toBe('AVANCE_HEXA3')
    // La vacuna manda: un indicador elegido de otra vacuna no entra.
    expect(indicadoresDelPanel(INDICADORES, RESULTADOS, 'HEXA', 'AVANCE_SPR1').cobertura.codigo).toBe('AVANCE_HEXA3')
  })

  test('con varios del mismo tipo, la gráfica de ese tipo usa el elegido', () => {
    const otros = [
      { codigo: 'BRECHA_HEXA1', nombre: 'Brecha Hexa 1', tipoCalculo: 'BRECHA' },
      { codigo: 'DES_HEXA1_2', nombre: 'Deserción Hexa 1 a 2', tipoCalculo: 'DESERCION' },
      { codigo: 'PROY_COB_HEXA1', nombre: 'Proyección Hexa 1', tipoCalculo: 'PROYECCION' },
      { codigo: 'COB_HEXA1', nombre: 'Cobertura Hexa 1', tipoCalculo: 'COBERTURA' },
    ]
    const indicadores = [...INDICADORES, ...otros]
    const resultados = [
      ...RESULTADOS,
      fila('BRECHA_HEXA1', null),
      fila('DES_HEXA1_2', null),
      fila('PROY_COB_HEXA1', null, { proyeccion: { indicadorBase: 'COB_HEXA1' } }),
      fila('COB_HEXA1', null),
    ]
    const panel = (codigo) => indicadoresDelPanel(indicadores, resultados, 'HEXA', codigo)
    expect(panel('BRECHA_HEXA1').brecha.codigo).toBe('BRECHA_HEXA1')
    expect(panel('DES_HEXA1_2').desercion.codigo).toBe('DES_HEXA1_2')
    expect(panel('COB_HEXA1').cobertura.codigo).toBe('COB_HEXA1')
    // La proyección elegida trae su propia base para la línea.
    expect(panel('PROY_COB_HEXA1').proyeccion.codigo).toBe('PROY_COB_HEXA1')
    expect(panel('PROY_COB_HEXA1').base.codigo).toBe('COB_HEXA1')
    // Las de otro tipo siguen con la primera.
    expect(panel('BRECHA_HEXA1').desercion.codigo).toBe('DES_HEXA1_3')
    expect(panel('BRECHA_HEXA1').proyeccion.codigo).toBe('PROY_COB_HEXA3')
  })

  test('sin proyección, la base es la primera cobertura; sin indicadores del tipo, null', () => {
    const panel = indicadoresDelPanel(INDICADORES, RESULTADOS, 'SPR', undefined)
    expect(panel.cobertura.codigo).toBe('AVANCE_SPR1')
    expect(panel.base).toBeNull()
    expect(panel.brecha).toBeNull()
    expect(panel.desercion).toBeNull()
  })
})

describe('municipios visibles', () => {
  const resultados = [fila('A', null), fila('A', TAJUMULCO), fila('A', SAN_MARCOS), fila('B', COMITANCILLO)]

  test('los municipios de la corrida van por nombre y sin repetir', () => {
    expect(municipiosDeLaCorrida(resultados)).toEqual(TODOS)
  })

  test('el distrito recorta y los elegidos recortan dentro del distrito', () => {
    expect(municipiosVisibles(TODOS)).toEqual(TODOS)
    expect(municipiosVisibles(TODOS, { delDistrito: [1, 9] })).toEqual([SAN_MARCOS, TAJUMULCO])
    expect(municipiosVisibles(TODOS, { delDistrito: [1, 9], elegidos: [9] })).toEqual([TAJUMULCO])
    // Un elegido fuera del distrito no cuenta; si ninguno cuenta, quedan los del distrito.
    expect(municipiosVisibles(TODOS, { delDistrito: [1, 9], elegidos: [4] })).toEqual([SAN_MARCOS, TAJUMULCO])
    expect(municipiosVisibles(TODOS, { elegidos: [4, 1] })).toEqual([COMITANCILLO, SAN_MARCOS])
  })

  test('las tablas conservan la DDRISS; la fila de referencia es la del único municipio visible', () => {
    const filas = filasDe3()
    expect(filasVisibles(filas, [SAN_MARCOS]).map((r) => r.municipio?.nombre ?? 'DDRISS')).toEqual(['DDRISS', 'San Marcos'])
    expect(filaDeReferencia(filas, [SAN_MARCOS]).municipio).toEqual(SAN_MARCOS)
    expect(filaDeReferencia(filas, [SAN_MARCOS, TAJUMULCO]).municipio).toBeNull()
    expect(filaDeReferencia(filas, TODOS).municipio).toBeNull()
  })
})

describe('red (SPEC 60)', () => {
  const RED = { id: 3, nombre: 'Red No. 1' }
  const totalRed = (codigo, cambios = {}) => fila(codigo, null, { red: RED, valor: 45, ...cambios })

  test('la red recorta como el distrito y manda sobre él; los elegidos recortan dentro de la red', () => {
    expect(municipiosVisibles(TODOS, { deLaRed: [4, 9] })).toEqual([COMITANCILLO, TAJUMULCO])
    expect(municipiosVisibles(TODOS, { deLaRed: [4, 9], delDistrito: [1] })).toEqual([COMITANCILLO, TAJUMULCO])
    expect(municipiosVisibles(TODOS, { deLaRed: [4, 9], elegidos: [9, 1] })).toEqual([TAJUMULCO])
  })

  test('con red, las tablas llevan «Total de la red» en lugar de la DDRISS; sin red, solo la DDRISS', () => {
    const filas = [fila('A', null), totalRed('A'), fila('A', COMITANCILLO), fila('A', SAN_MARCOS)]
    expect(filasVisibles(filas, [COMITANCILLO], RED).map(nombreDeFila)).toEqual(['Total de la red', 'Comitancillo'])
    expect(filasVisibles(filas, [COMITANCILLO]).map(nombreDeFila)).toEqual(['Total de la DDRISS', 'Comitancillo'])
    // Una fila de otra red no se confunde con la elegida.
    expect(filasVisibles([totalRed('A', { red: { id: 8, nombre: 'Otra' } })], [], RED)).toEqual([])
  })

  test('la fila de referencia es la de la red con varios visibles y la del municipio con uno solo', () => {
    const filas = [fila('A', null), totalRed('A'), fila('A', COMITANCILLO), fila('A', TAJUMULCO)]
    expect(filaDeReferencia(filas, [COMITANCILLO, TAJUMULCO], RED).red).toEqual(RED)
    expect(filaDeReferencia(filas, [COMITANCILLO, TAJUMULCO]).red).toBeUndefined()
    expect(filaDeReferencia(filas, [TAJUMULCO], RED).municipio).toEqual(TAJUMULCO)
    // La proyección no tiene fila de la red: no hay referencia.
    const proyeccion = [fila('P', null), fila('P', COMITANCILLO), fila('P', TAJUMULCO)]
    expect(filaDeReferencia(proyeccion, [COMITANCILLO, TAJUMULCO], RED)).toBeNull()
  })

  test('esFilaDeTotal acepta filas sin el campo red, y la barra por vacuna usa la fila de la red', () => {
    expect(esFilaDeTotal(fila('A', null))).toBe(true)
    expect(esFilaDeTotal(fila('A', null), RED)).toBe(false)
    expect(esFilaDeTotal(fila('A', SAN_MARCOS))).toBe(false)
    const resultados = [fila('COB_HEXA3', null, { valor: 80 }), totalRed('COB_HEXA3')]
    const { barras } = barrasPorVacuna(INDICADORES, resultados, 'COBERTURA', TODOS, 'HEXA', RED)
    expect(barras.map((b) => b.valor)).toEqual([45])
  })
})

function filasDe3() {
  return [fila('A', null), fila('A', SAN_MARCOS), fila('A', TAJUMULCO)]
}

describe('línea de avance y proyección', () => {
  // valor: el del indicador base, que puede estar prorrateado al mes; numerador: las dosis acumuladas.
  const punto = (mes, valor, numerador, parcial = false) => ({
    mes, corridaId: mes, parcial, resultado: { calculable: true, valor, numerador },
  })
  const PUNTOS = [punto(1, 77.1, 450), punto(2, 79.8, 1050), punto(8, 68.6, 4000), punto(9, 70, 4400, true)]
  // Corte a agosto: 4,000 dosis, 300 por mes, 7,000 de población anual → agosto 57.14 %, septiembre 61.43 %,
  // noviembre 70 % y diciembre el valor de la fila.
  const PROYECCION = {
    mes: 8, calculable: true, denominador: 7000, valor: 74.29, meta: 96,
    proyeccion: { dosisAcumuladas: 4000, ritmoMensual: 300 },
  }
  const redondear = (v) => (v === null ? null : Math.round(v * 100) / 100)

  test('sin proyección, lo real es el valor del indicador base de enero al corte, con su meta plana', () => {
    const linea = puntosDeLinea({ puntos: PUNTOS, mesCorte: 8, metaBase: 100, filaProyeccion: null })
    expect(linea.map((p) => p.real)).toEqual([77.1, 79.8, null, null, null, null, null, 68.6, null, null, null, null])
    expect(linea.every((p) => p.proyeccion === null && p.meta === 100)).toBe(true)
  })

  test('con proyección, lo real va contra la población anual y la meta es la de la proyección, proporcional al mes', () => {
    const linea = puntosDeLinea({ puntos: PUNTOS, mesCorte: 8, metaBase: 100, filaProyeccion: PROYECCION })
    expect(linea.map((p) => redondear(p.real))).toEqual([6.43, 15, null, null, null, null, null, 57.14, null, null, null, null])
    expect([linea[0].meta, linea[5].meta, linea[11].meta]).toEqual([8, 48, 96])
  })

  test('la proyección empieza en el corte con las dosis acumuladas y termina en el valor de la fila en diciembre', () => {
    const linea = puntosDeLinea({ puntos: PUNTOS, mesCorte: 8, metaBase: 100, filaProyeccion: PROYECCION })
    expect(linea.map((p) => redondear(p.proyeccion))).toEqual([null, null, null, null, null, null, null, 57.14, 61.43, 65.71, 70, 74.29])
    expect(redondear(linea[7].proyeccion)).toBe(redondear(linea[7].real))
  })

  test('una proyección no calculable no se dibuja: vuelve al valor del indicador base, y un punto parcial se marca', () => {
    const linea = puntosDeLinea({
      puntos: PUNTOS, mesCorte: 9, metaBase: 100, filaProyeccion: { ...PROYECCION, calculable: false, denominador: null },
    })
    expect(linea.every((p) => p.proyeccion === null && p.meta === 100)).toBe(true)
    expect(linea[8]).toMatchObject({ real: 70, parcial: true })
  })
})

describe('barras', () => {
  test('por vacuna: solo el tipo pedido, de mayor a menor, la vacuna resaltada y la meta común', () => {
    const resultados = [
      fila('AVANCE_HEXA3', null, { valor: 60 }),
      fila('AVANCE_SPR1', null, { vacuna: SPR, valor: 70 }),
      fila('AVANCE_SPR1', SAN_MARCOS, { vacuna: SPR, valor: 40 }),
      fila('COB_HEXA3', null, { valor: 99 }),
    ]
    const porVacuna = barrasPorVacuna(INDICADORES, resultados, 'AVANCE_META_MES', TODOS, 'HEXA')
    expect(porVacuna.barras.map((b) => [b.codigo, b.valor, b.resaltada])).toEqual([
      ['AVANCE_SPR1', 70, false],
      ['AVANCE_HEXA3', 60, true],
    ])
    expect(porVacuna.metaComun).toBe(95)
    // Con un solo municipio visible, la fila de ese municipio (Hexa no la tiene: no hay barra).
    expect(barrasPorVacuna(INDICADORES, resultados, 'AVANCE_META_MES', [SAN_MARCOS], 'HEXA').barras.map((b) => b.valor)).toEqual([40])
  })

  test('por vacuna: metas distintas no dan meta común y las no calculables se nombran aparte', () => {
    const resultados = [
      fila('AVANCE_HEXA3', null, { valor: 60, meta: 100 }),
      fila('AVANCE_SPR1', null, { vacuna: SPR, valor: 70, meta: 90 }),
    ]
    expect(barrasPorVacuna(INDICADORES, resultados, 'AVANCE_META_MES', TODOS, 'HEXA').metaComun).toBeNull()
    const sinPoblacion = [fila('AVANCE_HEXA3', null, { valor: null, calculable: false })]
    expect(barrasPorVacuna(INDICADORES, sinPoblacion, 'AVANCE_META_MES', TODOS, 'HEXA')).toEqual({
      barras: [], sinPoblacion: ['Avance Hexa 3'], metaComun: null,
    })
  })

  test('por municipio: los visibles calculables de mayor a menor, sin la DDRISS', () => {
    const filas = [
      fila('A', null, { valor: 55 }),
      fila('A', SAN_MARCOS, { valor: 70 }),
      fila('A', COMITANCILLO, { valor: 70 }),
      fila('A', TAJUMULCO, { valor: null, calculable: false }),
    ]
    const { barras, sinPoblacion } = barrasPorMunicipio(filas, TODOS)
    expect(barras.map((r) => r.municipio.nombre)).toEqual(['Comitancillo', 'San Marcos'])
    expect(sinPoblacion).toEqual(['Tajumulco'])
    expect(barrasPorMunicipio(filas, [SAN_MARCOS]).barras.map((r) => r.municipio.nombre)).toEqual(['San Marcos'])
  })

  test('brecha: las mayores sin las de 0, y el total de los visibles', () => {
    const filas = [
      fila('B', null, { brechaDosis: 100, sumaBrechasMunicipales: 500 }),
      fila('B', SAN_MARCOS, { brechaDosis: 0 }),
      fila('B', COMITANCILLO, { brechaDosis: 400 }),
      fila('B', TAJUMULCO, { brechaDosis: 100 }),
    ]
    const todos = barrasDeBrecha(filas, TODOS)
    expect(todos.barras.map((r) => [r.municipio.nombre, r.brechaDosis])).toEqual([['Comitancillo', 400], ['Tajumulco', 100]])
    expect(todos.total).toBe(500)
    expect(barrasDeBrecha(filas, [SAN_MARCOS, TAJUMULCO]).total).toBe(100)
  })

  test('brecha: solo las 8 mayores', () => {
    const muchos = Array.from({ length: 10 }, (_, i) => fila('B', { id: i + 1, nombre: `M${i}` }, { brechaDosis: i + 1 }))
    const visibles = muchos.map((r) => r.municipio)
    expect(barrasDeBrecha(muchos, visibles).barras).toHaveLength(8)
    expect(barrasDeBrecha(muchos, visibles).total).toBe(55)
  })

  test('deserción: de mayor a menor, con la negativa al final', () => {
    const filas = [
      fila('D', null, { valor: 3 }),
      fila('D', SAN_MARCOS, { valor: -12.5 }),
      fila('D', COMITANCILLO, { valor: 15 }),
      fila('D', TAJUMULCO, { valor: null, calculable: false }),
    ]
    expect(barrasDeDesercion(filas, TODOS).map((r) => [r.municipio.nombre, r.valor])).toEqual([
      ['Comitancillo', 15],
      ['San Marcos', -12.5],
    ])
  })
})
