import { describe, it, expect } from 'vitest'
import {
  TIPOS_REGLA,
  TIPOS_CREABLES,
  MENSAJES_TIPOS as M,
  revisarParametros,
  revisarMarcadores,
  marcadoresDesconocidos,
} from './tiposRegla.js'
import { validarMensajeRegla } from '@/validaciones/campos.js'

// La misma lista está en backend/tests/tiposRegla.test.js: si cambia una, se cambia la otra.
const CASOS = {
  revisarParametros: {
    validos: [
      ['RANGO', { minimo: 0, maximo: 500 }, { minimo: 0, maximo: 500 }],
      ['RANGO', { maximo: 100_000, minimo: 99_999 }, { minimo: 99_999, maximo: 100_000 }],
      ['SECUENCIA_DOSIS', { exceso_permitido_pct: 0 }, { exceso_permitido_pct: 0 }],
      ['SECUENCIA_DOSIS', { exceso_permitido_pct: 1000 }, { exceso_permitido_pct: 1000 }],
      ['VARIACION_HISTORICA', { meses_referencia: 3, variacion_max_pct: 50, minimo_dosis: 10 },
        { meses_referencia: 3, variacion_max_pct: 50, minimo_dosis: 10 }],
      ['TOTAL_CUADRA', { tolerancia: 0 }, { tolerancia: 0 }],
      ['CAMPOS_COMPLETOS', { cero_explicito: true }, { cero_explicito: true }],
      ['CAMPOS_COMPLETOS', { cero_explicito: false }, { cero_explicito: false }],
      ['NO_NEGATIVO', {}, {}],
      ['SIN_DUPLICADOS', {}, {}],
    ],
    invalidos: [
      ['RANGO', { minimo: 0, maximo: 500, tolerancia: 1 }, M.parametroNoPermitido('RANGO', 'tolerancia')],
      ['NO_NEGATIVO', { minimo: 0 }, M.parametroNoPermitido('NO_NEGATIVO', 'minimo')],
      ['RANGO', { minimo: 0 }, M.parametroFaltante('maximo')],
      ['RANGO', { minimo: 0, maximo: null }, M.parametroFaltante('maximo')],
      ['VARIACION_HISTORICA', { meses_referencia: 3, variacion_max_pct: 50 }, M.parametroFaltante('minimo_dosis')],
      ['RANGO', { minimo: -1, maximo: 10 }, M.parametroEntero('minimo', 0, 100_000)],
      ['RANGO', { minimo: 0, maximo: 100_001 }, M.parametroEntero('maximo', 1, 100_000)],
      ['RANGO', { minimo: 10, maximo: 10 }, M.parametroEntero('maximo', 11, 100_000)],
      ['RANGO', { minimo: 10, maximo: 5 }, M.parametroEntero('maximo', 11, 100_000)],
      ['RANGO', { minimo: 1.5, maximo: 10 }, M.parametroEntero('minimo', 0, 100_000)],
      ['RANGO', { minimo: '0', maximo: 10 }, M.parametroEntero('minimo', 0, 100_000)],
      ['SECUENCIA_DOSIS', { exceso_permitido_pct: 1001 }, M.parametroEntero('exceso_permitido_pct', 0, 1000)],
      ['VARIACION_HISTORICA', { meses_referencia: 0, variacion_max_pct: 50, minimo_dosis: 10 },
        M.parametroEntero('meses_referencia', 1, 12)],
      ['VARIACION_HISTORICA', { meses_referencia: 13, variacion_max_pct: 50, minimo_dosis: 10 },
        M.parametroEntero('meses_referencia', 1, 12)],
      ['VARIACION_HISTORICA', { meses_referencia: 3, variacion_max_pct: 0, minimo_dosis: 10 },
        M.parametroEntero('variacion_max_pct', 1, 1000)],
      ['TOTAL_CUADRA', { tolerancia: -1 }, M.parametroEntero('tolerancia', 0, 1000)],
      ['CAMPOS_COMPLETOS', { cero_explicito: 'true' }, M.parametroBooleano('cero_explicito')],
      ['CAMPOS_COMPLETOS', { cero_explicito: 1 }, M.parametroBooleano('cero_explicito')],
      ['RANGO', null, M.parametros],
      ['RANGO', [0, 10], M.parametros],
      ['RANGO', 'minimo=0', M.parametros],
      ['OTRO', {}, M.tipo],
    ],
  },
  revisarMarcadores: {
    validos: [
      ['RANGO', '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).'],
      ['TOTAL_CUADRA', 'El total de {vacuna} no cuadra: {total} contra {suma}; revise {vacuna}.'],
      ['NO_NEGATIVO', 'Hay cantidades negativas en el reporte.'],
      ['SIN_DUPLICADOS', 'Ya hay un reporte de {establecimiento} para {periodo}.'],
    ],
    invalidos: [
      ['TOTAL_CUADRA', 'La dosis {dosis} de {vacuna} no cuadra.', M.marcador('dosis', 'TOTAL_CUADRA')],
      ['RANGO', '{vacuna}: {valor} fuera de {rango} y {otro}.', M.marcador('rango', 'RANGO')],
      ['RANGO', 'Revise {Vacuna}, el valor está fuera de rango.', M.marcador('Vacuna', 'RANGO')],
      ['RANGO', 'Revise { vacuna }, el valor está fuera de rango.', M.marcador(' vacuna ', 'RANGO')],
      ['RANGO', 'Revise {} en la vacuna.', M.marcador('', 'RANGO')],
      ['OTRO', 'Revise {vacuna}.', M.tipo],
    ],
  },
}

describe('revisarParametros', () => {
  it.each(CASOS.revisarParametros.validos)('%s acepta %j', (tipo, parametros, esperado) => {
    const resultado = revisarParametros(tipo, parametros)
    expect(resultado).toEqual({ valor: esperado })
    expect(Object.keys(resultado.valor)).toEqual(Object.keys(esperado))
  })

  it.each(CASOS.revisarParametros.invalidos)('%s rechaza %j', (tipo, parametros, mensaje) => {
    expect(revisarParametros(tipo, parametros)).toEqual({ error: mensaje })
  })
})

describe('revisarMarcadores', () => {
  it.each(CASOS.revisarMarcadores.validos)('%s acepta %j', (tipo, mensaje) => {
    expect(revisarMarcadores(tipo, mensaje)).toEqual({ valor: mensaje })
  })

  it.each(CASOS.revisarMarcadores.invalidos)('%s rechaza %j', (tipo, mensaje, error) => {
    expect(revisarMarcadores(tipo, mensaje)).toEqual({ error })
  })

  it('marcadoresDesconocidos los da todos, sin repetir', () => {
    expect(marcadoresDesconocidos('RANGO', '{rango} {vacuna} {otro} {rango}')).toEqual(['rango', 'otro'])
  })
})

describe('catálogo', () => {
  it('se crean solo los cuatro tipos con parámetros', () => {
    expect(TIPOS_CREABLES).toEqual(['RANGO', 'SECUENCIA_DOSIS', 'VARIACION_HISTORICA', 'TOTAL_CUADRA'])
    expect(Object.keys(TIPOS_REGLA)).toHaveLength(9)
  })

  it('el mensaje de ejemplo de cada tipo que se crea cumple su tipo y su formato', () => {
    for (const tipo of TIPOS_CREABLES) {
      const { mensajeEjemplo } = TIPOS_REGLA[tipo]
      expect(revisarMarcadores(tipo, mensajeEjemplo)).toEqual({ valor: mensajeEjemplo })
      expect(validarMensajeRegla(mensajeEjemplo)).toEqual({ valor: mensajeEjemplo })
    }
  })
})
