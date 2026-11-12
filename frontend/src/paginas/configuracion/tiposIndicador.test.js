import { describe, it, expect } from 'vitest'
import {
  TIPOS_INDICADOR,
  TIPOS_CREABLES,
  ASCENDENTE,
  DESCENDENTE,
  MENSAJES_TIPOS_INDICADOR as M,
  camposDelTipo,
  revisarCamposDelTipo,
  revisarOrdenDosis,
  aUmbrales,
  aCortes,
  codigoIndicador,
} from './tiposIndicador.js'

const COBERTURA = {
  dosis: 'D3', clasificacionPoblacion: 'MENOR_1', grupoEdad: 'MENOR_1', prorrateo: 'MENSUAL_LINEAL', meta: 95,
  cortes: [80, 90], umbralesProvisionales: true, esIndicadorMapa: true,
}
const AVANCE = { dosis: 'D3', clasificacionPoblacion: 'MENOR_1', cortes: [80, 90] }
const BRECHA = { dosis: 'D3', clasificacionPoblacion: 'MENOR_1', prorrateo: 'NINGUNO', meta: 95 }
const DESERCION = { dosisInicial: 'D1', dosisFinal: 'D3', grupoEdad: null, meta: 10, cortes: [10, 15] }

// Las dos franjas de DES_HEXA1_3 en la semilla del 02.
const DOS_FRANJAS = [
  { color: 'verde', desde: null, hasta: 10 },
  { color: 'rojo', desde: 10, hasta: null },
]
// Las franjas de COB_HEXA3 en la semilla del 02.
const COB_HEXA3 = [
  { color: 'verde', desde: 95, hasta: null },
  { color: 'amarillo', desde: 80, hasta: 95 },
  { color: 'rojo', desde: 0, hasta: 80 },
]

// La misma lista está en backend/tests/tiposIndicador.test.js: si cambia una, se cambia la otra.
const CASOS = {
  revisarCamposDelTipo: {
    validos: [
      ['COBERTURA', COBERTURA, COBERTURA],
      ['COBERTURA',
        { ...COBERTURA, grupoEdad: undefined, umbralesProvisionales: undefined, esIndicadorMapa: undefined },
        { ...COBERTURA, grupoEdad: null, umbralesProvisionales: false, esIndicadorMapa: false }],
      ['COBERTURA', { ...COBERTURA, meta: 1, cortes: [0, 100] }, { ...COBERTURA, meta: 1, cortes: [0, 100] }],
      ['COBERTURA', { ...COBERTURA, meta: 95.5, cortes: [79.9, 89.5] },
        { ...COBERTURA, meta: 95.5, cortes: [79.9, 89.5] }],
      ['AVANCE_META_MES', AVANCE,
        { ...AVANCE, grupoEdad: null, umbralesProvisionales: false, esIndicadorMapa: false }],
      ['BRECHA', BRECHA, { ...BRECHA, grupoEdad: null }],
      ['BRECHA', { ...BRECHA, esIndicadorMapa: false }, { ...BRECHA, grupoEdad: null }],
      ['DESERCION', DESERCION, { ...DESERCION, umbralesProvisionales: false }],
      ['PROYECCION', { meta: 90 }, { meta: 90 }],
    ],
    invalidos: [
      ['DESERCION', { ...DESERCION, prorrateo: 'NINGUNO' }, M.campoDelTipo('DESERCION', 'prorrateo')],
      ['DESERCION', { ...DESERCION, dosis: 'D3' }, M.campoDelTipo('DESERCION', 'dosis')],
      ['DESERCION', { ...DESERCION, clasificacionPoblacion: 'MENOR_1' },
        M.campoDelTipo('DESERCION', 'clasificacionPoblacion')],
      ['BRECHA', { ...BRECHA, cortes: [80, 90] }, M.campoDelTipo('BRECHA', 'cortes')],
      ['BRECHA', { ...BRECHA, esIndicadorMapa: true }, M.campoDelTipo('BRECHA', 'esIndicadorMapa')],
      ['AVANCE_META_MES', { ...AVANCE, meta: 100 }, M.campoDelTipo('AVANCE_META_MES', 'meta')],
      ['AVANCE_META_MES', { ...AVANCE, prorrateo: 'MENSUAL_LINEAL' }, M.campoDelTipo('AVANCE_META_MES', 'prorrateo')],
      ['PROYECCION', { meta: 90, dosis: 'D3' }, M.campoDelTipo('PROYECCION', 'dosis')],
      ['PROYECCION', { meta: 90, grupoEdad: 'MENOR_1' }, M.campoDelTipo('PROYECCION', 'grupoEdad')],
      ['COBERTURA', { ...COBERTURA, dosis: undefined }, M.faltante('dosis')],
      ['COBERTURA', { ...COBERTURA, clasificacionPoblacion: null }, M.faltante('clasificacionPoblacion')],
      ['COBERTURA', { ...COBERTURA, prorrateo: undefined }, M.faltante('prorrateo')],
      ['COBERTURA', { ...COBERTURA, meta: undefined }, M.faltante('meta')],
      ['COBERTURA', { ...COBERTURA, cortes: undefined }, M.faltante('cortes')],
      ['DESERCION', { ...DESERCION, dosisFinal: undefined }, M.faltante('dosisFinal')],
      ['PROYECCION', {}, M.faltante('meta')],
      ['COBERTURA', { ...COBERTURA, dosis: 'd3' }, M.codigo('dosis')],
      ['COBERTURA', { ...COBERTURA, dosis: 3 }, M.codigo('dosis')],
      ['COBERTURA', { ...COBERTURA, grupoEdad: 'menor 1' }, M.codigo('grupoEdad')],
      ['COBERTURA', { ...COBERTURA, prorrateo: 'ANUAL' }, M.prorrateo],
      ['COBERTURA', { ...COBERTURA, meta: 0 }, M.meta],
      ['COBERTURA', { ...COBERTURA, meta: 100.5 }, M.meta],
      ['COBERTURA', { ...COBERTURA, meta: 95.25 }, M.meta],
      ['COBERTURA', { ...COBERTURA, meta: '95' }, M.meta],
      ['COBERTURA', { ...COBERTURA, cortes: [90, 90] }, M.cortes],
      ['COBERTURA', { ...COBERTURA, cortes: [90, 80] }, M.cortes],
      ['COBERTURA', { ...COBERTURA, cortes: [-1, 80] }, M.cortes],
      ['COBERTURA', { ...COBERTURA, cortes: [80, 100.5] }, M.cortes],
      ['COBERTURA', { ...COBERTURA, cortes: [80.25, 90] }, M.cortes],
      ['COBERTURA', { ...COBERTURA, cortes: [80] }, M.cortes],
      ['COBERTURA', { ...COBERTURA, cortes: [80, 90, 95] }, M.cortes],
      ['COBERTURA', { ...COBERTURA, umbralesProvisionales: 'no' }, M.booleano('umbralesProvisionales')],
      ['COBERTURA', { ...COBERTURA, esIndicadorMapa: 1 }, M.booleano('esIndicadorMapa')],
      ['DESERCION', { ...DESERCION, dosisFinal: 'D1' }, M.ordenDosis],
      ['OTRO', {}, M.tipo],
    ],
  },
  revisarOrdenDosis: {
    validos: [[1, 3], [1, 2]],
    invalidos: [[3, 1], [2, 2]],
  },
  cortes: [
    [[80, 90], ASCENDENTE, [
      { color: 'verde', desde: 90, hasta: null },
      { color: 'amarillo', desde: 80, hasta: 90 },
      { color: 'rojo', desde: 0, hasta: 80 },
    ]],
    [[10, 15], DESCENDENTE, [
      { color: 'verde', desde: null, hasta: 10 },
      { color: 'amarillo', desde: 10, hasta: 15 },
      { color: 'rojo', desde: 15, hasta: null },
    ]],
    [[0.5, 99.5], ASCENDENTE, [
      { color: 'verde', desde: 99.5, hasta: null },
      { color: 'amarillo', desde: 0.5, hasta: 99.5 },
      { color: 'rojo', desde: 0, hasta: 0.5 },
    ]],
  ],
  aCortesSinForma: [
    [DOS_FRANJAS, DESCENDENTE],
    [COB_HEXA3, DESCENDENTE],
    [[], ASCENDENTE],
    [null, ASCENDENTE],
    [[COB_HEXA3[1], COB_HEXA3[0], COB_HEXA3[2]], ASCENDENTE],
    [[{ ...COB_HEXA3[0] }, { ...COB_HEXA3[1] }, { ...COB_HEXA3[2], desde: 10 }], ASCENDENTE],
  ],
  codigoIndicador: {
    validos: [
      ['COBERTURA', 'HEXA', 'D3', [], 'COB_HEXA3'],
      ['AVANCE_META_MES', 'SPR', 'D1', [], 'AVANCE_SPR1'],
      ['BRECHA', 'BCG', 'UNICA', ['COB_BCG'], 'BRECHA_BCGU'],
      ['COBERTURA', 'DPT', 'R1', [], 'COB_DPTR1'],
      ['DESERCION', 'HEXA', { inicial: 'D1', final: 'D3' }, [], 'DES_HEXA1_3'],
      ['COBERTURA', 'HEXA', 'D3', ['COB_HEXA3'], 'COB_HEXA3_2'],
      ['COBERTURA', 'HEXA', 'D3', ['COB_HEXA3', 'COB_HEXA3_2', 'COB_HEXA3_4'], 'COB_HEXA3_3'],
      ['COBERTURA', 'A'.repeat(35), 'D1', [], `COB_${'A'.repeat(35)}1`],
    ],
    invalidos: [
      ['COBERTURA', 'A'.repeat(36), 'D1', [], M.codigoLargo],
      ['COBERTURA', 'A'.repeat(35), 'D1', [`COB_${'A'.repeat(35)}1`], M.codigoLargo],
      ['PROYECCION', 'HEXA', 'D3', [], M.tipo],
    ],
  },
  // SPEC 60: con el prorrateo; solo la COBERTURA con NINGUNO cambia de prefijo.
  codigoConProrrateo: {
    validos: [
      ['COBERTURA', 'HEXA', 'D3', ['COB_HEXA3'], 'NINGUNO', 'COB_ANUAL_HEXA3'],
      ['COBERTURA', 'BCG', 'UNICA', ['COB_BCG'], 'NINGUNO', 'COB_ANUAL_BCGU'],
      ['COBERTURA', 'SPR', 'D1', ['COB_ANUAL_SPR1'], 'NINGUNO', 'COB_ANUAL_SPR1_2'],
      ['COBERTURA', 'HEXA', 'D3', [], 'MENSUAL_LINEAL', 'COB_HEXA3'],
      ['BRECHA', 'HEXA', 'D3', [], 'NINGUNO', 'BRECHA_HEXA3'],
      ['COBERTURA', 'A'.repeat(29), 'D1', [], 'NINGUNO', `COB_ANUAL_${'A'.repeat(29)}1`],
    ],
    invalidos: [
      ['COBERTURA', 'A'.repeat(30), 'D1', [], 'NINGUNO', M.codigoLargo],
    ],
  },
}

describe('catálogo de tipos', () => {
  it('se crean todos menos PROYECCION', () => {
    expect(TIPOS_CREABLES).toEqual(['COBERTURA', 'AVANCE_META_MES', 'BRECHA', 'DESERCION'])
    expect(Object.keys(TIPOS_INDICADOR)).toHaveLength(5)
  })

  it('cada tipo deja editar sus campos', () => {
    expect(camposDelTipo('DESERCION')).toEqual(['dosisInicial', 'dosisFinal', 'grupoEdad', 'meta', 'cortes',
      'umbralesProvisionales'])
    expect(camposDelTipo('PROYECCION')).toEqual(['meta'])
    expect(camposDelTipo('OTRO')).toEqual([])
  })
})

describe('revisarCamposDelTipo', () => {
  it.each(CASOS.revisarCamposDelTipo.validos)('%s acepta %j', (tipo, cuerpo, esperado) => {
    expect(revisarCamposDelTipo(tipo, cuerpo)).toEqual({ valor: esperado })
  })

  it.each(CASOS.revisarCamposDelTipo.invalidos)('%s rechaza %j', (tipo, cuerpo, mensaje) => {
    expect(revisarCamposDelTipo(tipo, cuerpo)).toEqual({ error: mensaje })
  })
})

describe('revisarOrdenDosis', () => {
  it.each(CASOS.revisarOrdenDosis.validos)('acepta %i antes que %i', (inicial, final) => {
    expect(revisarOrdenDosis(inicial, final)).toEqual({ valor: true })
  })

  it.each(CASOS.revisarOrdenDosis.invalidos)('rechaza %i antes que %i', (inicial, final) => {
    expect(revisarOrdenDosis(inicial, final)).toEqual({ error: M.ordenDosis })
  })
})

describe('aUmbrales y aCortes', () => {
  it.each(CASOS.cortes)('%j en %s', (cortes, sentido, franjas) => {
    expect(aUmbrales(cortes, sentido)).toEqual(franjas)
    expect(aCortes(franjas, sentido)).toEqual(cortes)
  })

  it('lee los cortes de COB_HEXA3', () => {
    expect(aCortes(COB_HEXA3, ASCENDENTE)).toEqual([80, 95])
  })

  it.each(CASOS.aCortesSinForma)('%j en %s no tiene la forma de tres franjas', (umbrales, sentido) => {
    expect(aCortes(umbrales, sentido)).toBeNull()
  })
})

describe('codigoIndicador', () => {
  it.each(CASOS.codigoIndicador.validos)('%s de %s %j → %s', (tipo, vacuna, dosis, existentes, esperado) => {
    expect(codigoIndicador(tipo, vacuna, dosis, existentes)).toEqual({ valor: esperado })
  })

  it.each(CASOS.codigoIndicador.invalidos)('%s de %s %j se rechaza', (tipo, vacuna, dosis, existentes, mensaje) => {
    expect(codigoIndicador(tipo, vacuna, dosis, existentes)).toEqual({ error: mensaje })
  })

  it.each(CASOS.codigoConProrrateo.validos)(
    '%s de %s %j con %j y %s → %s',
    (tipo, vacuna, dosis, existentes, prorrateo, esperado) => {
      expect(codigoIndicador(tipo, vacuna, dosis, existentes, prorrateo)).toEqual({ valor: esperado })
    },
  )

  it.each(CASOS.codigoConProrrateo.invalidos)(
    '%s de %s %j con %j y %s se rechaza',
    (tipo, vacuna, dosis, existentes, prorrateo, mensaje) => {
      expect(codigoIndicador(tipo, vacuna, dosis, existentes, prorrateo)).toEqual({ error: mensaje })
    },
  )
})
