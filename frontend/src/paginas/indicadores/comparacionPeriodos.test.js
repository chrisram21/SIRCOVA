import {
  MOTIVOS,
  aniosNecesarios,
  coberturaReal,
  diferencias,
  etiquetaDelMes,
  filasPorAnio,
  filasPorMes,
  leerPeriodos,
  periodosPorDefecto,
  produccionDelMes,
  puntosPorAnio,
  textoDeMeses,
} from './comparacionPeriodos.js'

const CALCULADOS = [
  { anio: 2026, meses: [6, 7, 8] },
  { anio: 2025, meses: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { anio: 2024, meses: [12] },
  { anio: 2023, meses: [12] },
  { anio: 2022, meses: [12] },
  { anio: 2021, meses: [12] },
]
const AGOSTO_2026 = { anio: 2026, mes: 8 }

const punto = (mes, numerador, { poblacionAnual = 1000, parcial = false } = {}) => ({
  mes, corridaId: mes, parcial, poblacionAnual, resultado: { indicadorCodigo: 'COB_HEXA3', numerador },
})

describe('periodosPorDefecto', () => {
  it('toma el año del corte y el anterior, y el mes de corte con el mismo del año anterior', () => {
    expect(periodosPorDefecto(CALCULADOS, AGOSTO_2026)).toEqual({
      anios: [2025, 2026],
      meses: [{ anio: 2025, mes: 8 }, AGOSTO_2026],
    })
  })

  it('sin el año anterior, deja solo el del corte y compara con el mes anterior al corte', () => {
    const soloEste = [{ anio: 2026, meses: [7, 8] }]
    expect(periodosPorDefecto(soloEste, AGOSTO_2026)).toEqual({
      anios: [2026],
      meses: [{ anio: 2026, mes: 7 }, AGOSTO_2026],
    })
  })

  it('en enero, el mes anterior al corte es diciembre del año pasado', () => {
    const calculados = [{ anio: 2026, meses: [1] }, { anio: 2025, meses: [12] }]
    expect(periodosPorDefecto(calculados, { anio: 2026, mes: 1 }).meses).toEqual([
      { anio: 2025, mes: 12 }, { anio: 2026, mes: 1 },
    ])
  })
})

describe('leerPeriodos', () => {
  it('lee el modo y los periodos de la URL en orden cronológico', () => {
    const leidos = leerPeriodos({ comparar: 'mes', anios: '2026,2024', meses: '2026-08,2025-03' }, CALCULADOS, AGOSTO_2026)
    expect(leidos).toEqual({
      modo: 'mes',
      anios: [2024, 2026],
      meses: [{ anio: 2025, mes: 3 }, AGOSTO_2026],
    })
  })

  it('ignora los periodos sin corrida y los repetidos, y recorta a los cinco primeros', () => {
    const leidos = leerPeriodos(
      { anios: '2019,2026,2026,2025,2024,2023,2022,2021', meses: '2026-01,2026-08,2025-13,x' },
      CALCULADOS,
      AGOSTO_2026,
    )
    expect(leidos.modo).toBe('anio')
    expect(leidos.anios).toEqual([2022, 2023, 2024, 2025, 2026])
    expect(leidos.meses).toEqual([AGOSTO_2026])
  })

  it('sin ningún periodo válido en la URL usa los de por defecto', () => {
    expect(leerPeriodos({ anios: '2019' }, CALCULADOS, AGOSTO_2026).anios).toEqual([2025, 2026])
  })

  it('arma el texto de la URL y los años que hay que pedir', () => {
    const meses = [{ anio: 2025, mes: 8 }, { anio: 2026, mes: 7 }, AGOSTO_2026]
    expect(textoDeMeses(meses)).toBe('2025-08,2026-07,2026-08')
    expect(aniosNecesarios({ modo: 'mes', anios: [2024], meses })).toEqual([2025, 2026])
    expect(aniosNecesarios({ modo: 'anio', anios: [2024, 2026], meses })).toEqual([2024, 2026])
    expect(etiquetaDelMes(AGOSTO_2026)).toBe('ago 2026')
  })
})

describe('puntosPorAnio', () => {
  it('da la cobertura real contra la población anual, con lo parcial', () => {
    const series = new Map([[2026, [punto(1, 100), punto(2, 250, { parcial: true })]]])
    const [linea] = puntosPorAnio(series, [2026])
    expect(linea.motivo).toBeNull()
    expect(linea.valores).toEqual([
      { mes: 1, dosis: 100, porcentaje: 10, parcial: false },
      { mes: 2, dosis: 250, porcentaje: 25, parcial: true },
    ])
    expect(coberturaReal(punto(3, 50, { poblacionAnual: 200 }))).toBe(25)
  })

  it('marca el año sin cálculo del indicador y el año sin población', () => {
    const series = new Map([[2025, [punto(1, 100, { poblacionAnual: null })]], [2024, []]])
    expect(puntosPorAnio(series, [2023, 2024, 2025]).map((l) => l.motivo)).toEqual([
      MOTIVOS.SIN_CALCULO, MOTIVOS.SIN_CALCULO, MOTIVOS.SIN_POBLACION,
    ])
  })
})

describe('filasPorAnio', () => {
  it('pone una fila por mes con datos en algún año y la diferencia del último contra el primero', () => {
    const series = new Map([
      [2025, [punto(1, 100), punto(2, 200)]],
      [2026, [punto(2, 230, { poblacionAnual: 1000 }), punto(3, 300)]],
    ])
    const filas = filasPorAnio(puntosPorAnio(series, [2025, 2026]))
    expect(filas.map((f) => f.mes)).toEqual([1, 2, 3])
    expect(filas[0].diferencia).toBeNull()
    expect(filas[1].porAnio[2025].porcentaje).toBe(20)
    expect(filas[1].diferencia).toMatchObject({ dosis: 30, sentido: 'sube' })
    expect(filas[1].diferencia.pp).toBeCloseTo(3)
    expect(filas[2].porAnio[2025]).toBeNull()
  })
})

describe('produccionDelMes', () => {
  const series = new Map([[2026, [punto(1, 120), punto(3, 400), punto(4, 520)]]])

  it('en enero es el acumulado, y en otro mes la resta contra el anterior', () => {
    expect(produccionDelMes(series, { anio: 2026, mes: 1 })).toMatchObject({ motivo: null, dosis: 120, porcentaje: 12 })
    expect(produccionDelMes(series, { anio: 2026, mes: 4 })).toMatchObject({ motivo: null, dosis: 120, porcentaje: 12 })
  })

  it('sin el mes anterior, sin el mes o sin población lo dice', () => {
    expect(produccionDelMes(series, { anio: 2026, mes: 3 }).motivo).toBe(MOTIVOS.SIN_MES_ANTERIOR)
    expect(produccionDelMes(series, { anio: 2026, mes: 6 }).motivo).toBe(MOTIVOS.SIN_CALCULO)
    expect(produccionDelMes(series, { anio: 2025, mes: 1 }).motivo).toBe(MOTIVOS.SIN_CALCULO)
    const sinPoblacion = new Map([[2026, [punto(1, 120, { poblacionAnual: null })]]])
    expect(produccionDelMes(sinPoblacion, { anio: 2026, mes: 1 }).motivo).toBe(MOTIVOS.SIN_POBLACION)
  })
})

describe('diferencias', () => {
  it('da la diferencia en pp y en dosis, positiva y negativa', () => {
    expect(diferencias({ porcentaje: 12, dosis: 120 }, { porcentaje: 15.5, dosis: 155 })).toEqual({
      pp: 3.5, dosis: 35, sentido: 'sube',
    })
    expect(diferencias({ porcentaje: 15.5, dosis: 155 }, { porcentaje: 12, dosis: 120 })).toEqual({
      pp: -3.5, dosis: -35, sentido: 'baja',
    })
    expect(diferencias({ porcentaje: 12, dosis: 120 }, { porcentaje: 12.01, dosis: 120 }).sentido).toBe('igual')
    expect(diferencias(null, { porcentaje: 12 })).toBeNull()
  })

  it('por mes compara cada mes contra el primero con datos', () => {
    const series = new Map([
      [2025, [punto(7, 700), punto(8, 790)]],
      [2026, [punto(8, 800)]],
    ])
    const filas = filasPorMes(series, [{ anio: 2025, mes: 8 }, { anio: 2026, mes: 7 }, AGOSTO_2026])
    expect(filas.map((f) => [f.dosis, f.motivo])).toEqual([[90, null], [null, MOTIVOS.SIN_CALCULO], [null, MOTIVOS.SIN_MES_ANTERIOR]])
    expect(filas.map((f) => f.diferencia)).toEqual([null, null, null])

    const conTodo = new Map([[2025, [punto(7, 700), punto(8, 790)]], [2026, [punto(7, 640), punto(8, 750)]]])
    const [base, otra] = filasPorMes(conTodo, [{ anio: 2025, mes: 8 }, AGOSTO_2026])
    expect(base.diferencia).toBeNull()
    expect(otra.diferencia).toMatchObject({ dosis: 20, sentido: 'sube' })
  })
})
