import { beforeEach, describe, expect, it, vi } from 'vitest'
import { listarCorridas, listarResultados } from '@/api/indicadores.js'
import {
  cargarIndicadoresDelInicio,
  indicadorDelTipo,
  menorAvance,
  mesDeCorte,
  municipiosEnMeta,
  puntosContraMeta,
} from './indicadoresDelInicio.js'

vi.mock('@/api/indicadores.js', () => ({ listarCorridas: vi.fn(), listarResultados: vi.fn() }))

const corrida = (mesHasta, { vigente = true, estado = 'COMPLETADA' } = {}) => ({ id: mesHasta, mesHasta, vigente, estado })

const fila = (codigo, municipio, { valor = 50, meta = 100, cumpleMeta = false, calculable = true } = {}) => ({
  indicadorCodigo: codigo,
  municipio: municipio && { id: municipio.length, nombre: municipio },
  valor: calculable ? valor : null,
  meta,
  cumpleMeta: calculable ? cumpleMeta : null,
  calculable,
})

describe('mesDeCorte', () => {
  it('toma el mayor mes con una corrida vigente y completada', () => {
    const corridas = [corrida(8), corrida(9, { vigente: false }), corrida(10, { estado: 'FALLIDA', vigente: false }), corrida(3)]
    expect(mesDeCorte(corridas)).toBe(8)
  })

  it('sin corridas vigentes da null', () => {
    expect(mesDeCorte([])).toBeNull()
    expect(mesDeCorte([corrida(5, { vigente: false })])).toBeNull()
  })
})

describe('cargarIndicadoresDelInicio', () => {
  const hoy = new Date(2026, 10, 5)

  beforeEach(() => {
    vi.mocked(listarCorridas).mockReset()
    vi.mocked(listarResultados).mockReset()
  })

  it('lee los resultados del último mes con corrida vigente del año en curso', async () => {
    vi.mocked(listarCorridas).mockResolvedValue({ elementos: [corrida(9), corrida(8)] })
    vi.mocked(listarResultados).mockResolvedValue({ corrida: { id: 9 }, resultados: [] })

    const datos = await cargarIndicadoresDelInicio({ ddrissId: 1, hoy })

    expect(listarCorridas).toHaveBeenCalledWith({ anio: 2026, ddrissId: 1 })
    expect(listarResultados).toHaveBeenCalledWith({ anio: 2026, mes: 9, ddrissId: 1 })
    expect(datos).toEqual({ anio: 2026, mes: 9, corrida: { id: 9 }, resultados: [] })
  })

  it('sin corridas en el año en curso busca en el anterior', async () => {
    vi.mocked(listarCorridas).mockResolvedValueOnce({ elementos: [] }).mockResolvedValueOnce({ elementos: [corrida(12)] })
    vi.mocked(listarResultados).mockResolvedValue({ corrida: { id: 12 }, resultados: [] })

    const datos = await cargarIndicadoresDelInicio({ hoy })

    expect(listarCorridas).toHaveBeenNthCalledWith(2, { anio: 2025, ddrissId: undefined })
    expect(datos).toMatchObject({ anio: 2025, mes: 12 })
  })

  it('sin corridas en los dos años da null', async () => {
    vi.mocked(listarCorridas).mockResolvedValue({ elementos: [] })

    expect(await cargarIndicadoresDelInicio({ hoy })).toBeNull()
    expect(listarResultados).not.toHaveBeenCalled()
  })
})

describe('indicadorDelTipo', () => {
  const datos = {
    corrida: {
      indicadores: [
        { codigo: 'COB_BCG', tipoCalculo: 'COBERTURA' },
        { codigo: 'AV_SIN_FILAS', tipoCalculo: 'AVANCE_META_MES' },
        { codigo: 'AVANCE_HEXA3', tipoCalculo: 'AVANCE_META_MES' },
        { codigo: 'AVANCE_SPR', tipoCalculo: 'AVANCE_META_MES' },
      ],
    },
    resultados: [
      fila('COB_BCG', null),
      fila('AVANCE_HEXA3', null, { valor: 90 }),
      fila('AVANCE_HEXA3', 'Tacaná'),
      fila('AVANCE_HEXA3', 'Ocós'),
      fila('AVANCE_SPR', null),
    ],
  }

  it('elige el primer indicador del tipo que tiene resultados, con su fila departamental y sus municipios', () => {
    const elegido = indicadorDelTipo(datos, 'AVANCE_META_MES')

    expect(elegido.indicador.codigo).toBe('AVANCE_HEXA3')
    expect(elegido.departamental.valor).toBe(90)
    expect(elegido.municipios.map((r) => r.municipio.nombre)).toEqual(['Tacaná', 'Ocós'])
  })

  it('sin indicador del tipo o sin datos da null', () => {
    expect(indicadorDelTipo(datos, 'PROYECCION')).toBeNull()
    expect(indicadorDelTipo(null, 'AVANCE_META_MES')).toBeNull()
  })
})

describe('municipiosEnMeta', () => {
  it('cuenta en meta y con brecha entre los calculables, y aparte los que no tienen población', () => {
    const municipios = [
      fila('A', 'San Marcos', { cumpleMeta: true }),
      fila('A', 'Tacaná'),
      fila('A', 'Ocós'),
      fila('A', 'Sibinal', { calculable: false }),
    ]
    expect(municipiosEnMeta(municipios)).toEqual({ enMeta: 1, total: 4, conBrecha: 2, sinPoblacion: 1 })
  })
})

describe('menorAvance', () => {
  it('da los n calculables de menor valor, de menor a mayor y por nombre si empatan', () => {
    const municipios = [
      fila('A', 'San Marcos', { valor: 90 }),
      fila('A', 'Tacaná', { valor: 40 }),
      fila('A', 'Sibinal', { valor: 40 }),
      fila('A', 'Ocós', { calculable: false }),
      fila('A', 'Malacatán', { valor: 70 }),
    ]
    expect(menorAvance(municipios, 3).map((r) => r.municipio.nombre)).toEqual(['Sibinal', 'Tacaná', 'Malacatán'])
  })

  it('por defecto da 5', () => {
    const municipios = Array.from({ length: 8 }, (_, i) => fila('A', `M${i}`, { valor: i }))
    expect(menorAvance(municipios)).toHaveLength(5)
  })
})

describe('puntosContraMeta', () => {
  it('resta la meta al valor; null si la fila no se calculó', () => {
    expect(puntosContraMeta(fila('A', null, { valor: 93.8, meta: 100 }))).toBeCloseTo(-6.2)
    expect(puntosContraMeta(fila('A', null, { calculable: false }))).toBeNull()
    expect(puntosContraMeta(null)).toBeNull()
  })
})
