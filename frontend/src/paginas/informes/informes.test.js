import { describe, it, expect } from 'vitest'
import {
  aTextoDeMes,
  avisoDeMeses,
  encabezadosDeTabla,
  filtrosDeInforme,
  nivelPermitido,
  parametrosDeInforme,
  rangoPorDefecto,
  textoMesesSinCerrar,
  textoRango,
} from './informes.js'

// Del más reciente al más antiguo, como GET /informes/opciones.
const MESES = [
  { anio: 2026, mes: 9, estado: 'EN_CIERRE' },
  { anio: 2026, mes: 8, estado: 'CERRADO' },
  { anio: 2026, mes: 2, estado: 'CERRADO' },
  { anio: 2025, mes: 12, estado: 'CERRADO' },
]
const OPCIONES = {
  meses: MESES,
  vacunas: [{ codigo: 'HEXA' }, { codigo: 'BCG' }],
  municipios: [{ id: 1 }, { id: 4 }, { id: 7 }],
}
const url = (texto) => new URLSearchParams(texto)

describe('rangoPorDefecto', () => {
  it('va del primer mes habilitado del año al último cerrado', () => {
    expect(rangoPorDefecto(MESES)).toEqual({ desde: { anio: 2026, mes: 2 }, hasta: { anio: 2026, mes: 8 } })
  })

  it('sin meses cerrados usa el último; sin meses, nada', () => {
    expect(rangoPorDefecto([{ anio: 2026, mes: 3, estado: 'ABIERTO' }])).toEqual({
      desde: { anio: 2026, mes: 3 }, hasta: { anio: 2026, mes: 3 },
    })
    expect(rangoPorDefecto([])).toEqual({ desde: null, hasta: null })
  })
})

describe('filtrosDeInforme', () => {
  it('sin URL: población propia por municipio, todas las vacunas y el rango por defecto, sin generar', () => {
    expect(filtrosDeInforme(url(''), OPCIONES)).toEqual({
      informe: 'poblacion-propia',
      desde: { anio: 2026, mes: 2 },
      hasta: { anio: 2026, mes: 8 },
      nivel: 'municipio',
      vacuna: null,
      red: null,
      municipios: [],
      aprobados: false,
      generado: false,
    })
  })

  it('lee todos los filtros de la URL y sabe que pide un informe', () => {
    const texto =
      'informe=total&desde=2025-12&hasta=2026-09&nivel=distrito&vacuna=BCG&red=3&municipios=7,1&aprobados=si'
    expect(filtrosDeInforme(url(texto), OPCIONES)).toEqual({
      informe: 'total',
      desde: { anio: 2025, mes: 12 },
      hasta: { anio: 2026, mes: 9 },
      nivel: 'distrito',
      vacuna: 'BCG',
      red: 3,
      municipios: [7, 1],
      aprobados: true,
      generado: true,
    })
  })

  it('descarta valores inválidos, meses no habilitados y municipios que no están', () => {
    const texto = 'informe=otro&desde=2026-05&hasta=2030-01&nivel=pais&vacuna=OPV&red=abc&municipios=1,1,99,x,4'
    expect(filtrosDeInforme(url(texto), OPCIONES)).toMatchObject({
      informe: 'poblacion-propia',
      desde: { anio: 2026, mes: 2 },
      hasta: { anio: 2026, mes: 8 },
      nivel: 'municipio',
      vacuna: null,
      red: null,
      municipios: [1, 4],
    })
  })

  it('un mes inicial posterior al final se iguala al final', () => {
    expect(filtrosDeInforme(url('desde=2026-09&hasta=2026-02'), OPCIONES)).toMatchObject({
      desde: { anio: 2026, mes: 2 }, hasta: { anio: 2026, mes: 2 },
    })
  })

  it('el informe por residencia no tiene nivel establecimiento', () => {
    expect(filtrosDeInforme(url('informe=residencia&nivel=establecimiento'), OPCIONES).nivel).toBe('municipio')
    expect(filtrosDeInforme(url('informe=total&nivel=establecimiento'), OPCIONES).nivel).toBe('establecimiento')
    expect(nivelPermitido('residencia', 'distrito')).toBe('distrito')
  })

  it('sin opciones no hay rango', () => {
    expect(filtrosDeInforme(url(''), undefined)).toMatchObject({ desde: null, hasta: null })
  })
})

describe('parametrosDeInforme', () => {
  const BASE = {
    informe: 'poblacion-propia', desde: { anio: 2026, mes: 1 }, hasta: { anio: 2026, mes: 8 },
    nivel: 'municipio', vacuna: null, red: null, municipios: [], aprobados: false, ddriss: null,
  }

  it('siempre escribe informe, desde y hasta, y omite los valores por defecto', () => {
    expect(parametrosDeInforme(BASE).toString()).toBe('informe=poblacion-propia&desde=2026-01&hasta=2026-08')
  })

  it('escribe los demás filtros cuando no son los de por defecto', () => {
    const parametros = parametrosDeInforme({
      ...BASE, nivel: 'establecimiento', vacuna: 'HEXA', red: 2, municipios: [1, 4], aprobados: true, ddriss: 5,
    })
    expect(Object.fromEntries(parametros)).toEqual({
      informe: 'poblacion-propia', desde: '2026-01', hasta: '2026-08', nivel: 'establecimiento', vacuna: 'HEXA',
      red: '2', municipios: '1,4', aprobados: 'si', ddriss: '5',
    })
  })

  it('lo que escribe se vuelve a leer igual', () => {
    const valores = { ...BASE, informe: 'total', desde: { anio: 2025, mes: 12 }, vacuna: 'BCG', municipios: [4] }
    const leidos = filtrosDeInforme(parametrosDeInforme(valores), OPCIONES)
    expect(leidos).toMatchObject({ informe: 'total', desde: { anio: 2025, mes: 12 }, vacuna: 'BCG', municipios: [4] })
  })

  it('aTextoDeMes completa el mes con cero', () => {
    expect(aTextoDeMes({ anio: 2026, mes: 3 })).toBe('2026-03')
  })
})

describe('encabezadosDeTabla', () => {
  const HEXA = { codigo: 'HEXA', nombre: 'Hexavalente' }
  const BCG = { codigo: 'BCG', nombre: 'BCG' }
  const MENOR_1 = { grupoEdad: 'MENOR_1', titulo: '< 1 año' }
  const DE_1_A_5 = { grupoEdad: '1_A_5', titulo: 'De 1 a < 6 años' }
  const columna = (vacuna, seccion, codigo) => ({ vacuna, seccion, dosis: { id: 1, codigo } })

  it('agrupa la vacuna y la sección sobre sus columnas seguidas', () => {
    const columnas = [
      columna(HEXA, MENOR_1, 'D1'), columna(HEXA, MENOR_1, 'D2'), columna(HEXA, DE_1_A_5, 'D1'),
      columna(BCG, null, 'UNICA'),
    ]
    expect(encabezadosDeTabla(columnas)).toEqual({
      vacunas: [
        { clave: 'v0', codigo: 'HEXA', nombre: 'Hexavalente', abarca: 3 },
        { clave: 'v3', codigo: 'BCG', nombre: 'BCG', abarca: 1 },
      ],
      secciones: [
        { clave: 's0', titulo: '< 1 año', grupoEdad: 'MENOR_1', abarca: 2 },
        { clave: 's2', titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', abarca: 1 },
        { clave: 's3', titulo: '', grupoEdad: null, abarca: 1 },
      ],
      dosis: [
        { clave: 'd0', codigo: 'D1' }, { clave: 'd1', codigo: 'D2' }, { clave: 'd2', codigo: 'D1' },
        { clave: 'd3', codigo: 'UNICA' },
      ],
    })
  })

  it('no une secciones de vacunas distintas aunque se llamen igual', () => {
    const columnas = [columna(HEXA, MENOR_1, 'D1'), columna(BCG, MENOR_1, 'UNICA')]
    expect(encabezadosDeTabla(columnas).secciones.map((s) => s.abarca)).toEqual([1, 1])
  })

  it('sin columnas, sin encabezados', () => {
    expect(encabezadosDeTabla([])).toEqual({ vacunas: [], secciones: [], dosis: [] })
  })
})

describe('textos del rango y de los meses sin cerrar', () => {
  it('textoRango dice de qué mes a qué mes, o un solo mes', () => {
    expect(textoRango({ anio: 2026, mes: 1 }, { anio: 2026, mes: 8 })).toBe('De enero de 2026 a agosto de 2026')
    expect(textoRango({ anio: 2026, mes: 8 }, { anio: 2026, mes: 8 })).toBe('Agosto de 2026')
  })

  it('textoMesesSinCerrar junta los meses de un año y separa los de años distintos', () => {
    expect(textoMesesSinCerrar([{ anio: 2026, mes: 8 }, { anio: 2026, mes: 9 }])).toBe('agosto y septiembre de 2026')
    expect(textoMesesSinCerrar([{ anio: 2025, mes: 12 }, { anio: 2026, mes: 1 }]))
      .toBe('diciembre de 2025 y enero de 2026')
    expect(textoMesesSinCerrar([])).toBe('')
  })

  it('avisoDeMeses: preliminar con la casilla, y sin ella, que no suman', () => {
    const uno = [{ anio: 2026, mes: 9 }]
    const dos = [{ anio: 2026, mes: 8 }, { anio: 2026, mes: 9 }]
    expect(avisoDeMeses(uno, true)).toBe('Datos preliminares: septiembre de 2026 todavía no está cerrado.')
    expect(avisoDeMeses(dos, true)).toBe('Datos preliminares: agosto y septiembre de 2026 todavía no están cerrados.')
    expect(avisoDeMeses(uno, false)).toBe(
      'Septiembre de 2026 todavía no está cerrado y no suma en el informe. '
        + 'Marca «Incluir aprobados sin cerrar» para verlos como preliminares.',
    )
    expect(avisoDeMeses(dos, false)).toMatch(/^Agosto y septiembre de 2026 todavía no están cerrados y no suman/)
    expect(avisoDeMeses([], false)).toBeNull()
  })
})
