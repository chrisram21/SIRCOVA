import { describe, it, expect } from 'vitest'
import { MARCADORES_REGLA, describirMarcador, insertarMarcador } from './marcadoresRegla.js'
import { TIPOS_REGLA } from './tiposRegla.js'

describe('MARCADORES_REGLA', () => {
  it('los 9 tipos de regla tienen nombre y descripción para cada marcador', () => {
    expect(Object.keys(TIPOS_REGLA)).toHaveLength(9)
    for (const [tipo, { marcadores }] of Object.entries(TIPOS_REGLA)) {
      for (const clave of marcadores) {
        expect(MARCADORES_REGLA[clave]?.etiqueta, `${tipo}: ${clave}`).toBeTruthy()
        expect(MARCADORES_REGLA[clave]?.descripcion, `${tipo}: ${clave}`).toBeTruthy()
      }
    }
  })

  it('describirMarcador arma el Tooltip, y sin entrada muestra el código', () => {
    expect(describirMarcador('variacion_max_pct')).toEqual({
      etiqueta: 'Variación máxima (%)',
      ayuda: 'La variación máxima de la regla, en porcentaje. Inserta {variacion_max_pct}.',
    })
    expect(describirMarcador('nuevo_dato')).toEqual({ etiqueta: 'nuevo_dato', ayuda: 'Inserta {nuevo_dato}.' })
  })
})

describe('insertarMarcador', () => {
  // [texto, inicio, fin, marcador, texto esperado, cursor esperado]
  const CASOS = [
    ['La producción de ', 17, 17, 'vacuna', 'La producción de {vacuna}', 25],
    ['La producción de', 16, 16, 'vacuna', 'La producción de {vacuna}', 25],
    ['Total ()', 7, 7, 'total', 'Total ({total})', 14],
    ['', 0, 0, 'vacuna', '{vacuna}', 8],
    ['Varía XX %', 6, 8, 'variacion', 'Varía {variacion} %', 17],
    ['varía mucho.', 0, 0, 'vacuna', '{vacuna}varía mucho.', 8],
  ]

  it.each(CASOS)('%j en [%i, %i) con %s', (texto, inicio, fin, marcador, esperado, cursor) => {
    expect(insertarMarcador(texto, inicio, fin, marcador)).toEqual({ texto: esperado, cursor })
  })
})
