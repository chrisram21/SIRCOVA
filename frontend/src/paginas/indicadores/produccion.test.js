import { describe, it, expect } from 'vitest'
import {
  barrasDeProduccion,
  establecimientosVisibles,
  filtrosDeProduccion,
  mesDeProduccion,
  nombreDeFilaProduccion,
  textoPreliminar,
} from './produccion.js'

const OPCIONES = {
  vacunas: [{ codigo: 'HEXA' }, { codigo: 'BCG' }],
  establecimientos: [
    { id: 31, municipioId: 1 },
    { id: 40, municipioId: 32 },
    { id: 5, municipioId: 4 },
  ],
}
const url = (texto) => new URLSearchParams(texto)

describe('filtrosDeProduccion', () => {
  it('por defecto agrupa por municipio, acumulado, con todas las vacunas y sin establecimientos', () => {
    expect(filtrosDeProduccion(url(''), OPCIONES)).toEqual({
      agrupar: 'municipio', acumulado: true, vacuna: null, establecimientos: [],
    })
  })

  it('lee agrupar, solo el mes, la vacuna y los establecimientos de la URL', () => {
    expect(filtrosDeProduccion(url('agrupar=establecimiento&periodo=mes&vacuna=BCG&establecimientos=40,31'), OPCIONES))
      .toEqual({ agrupar: 'establecimiento', acumulado: false, vacuna: 'BCG', establecimientos: [40, 31] })
  })

  it('vacuna=todas o una vacuna que no está son todas las vacunas', () => {
    expect(filtrosDeProduccion(url('vacuna=todas'), OPCIONES).vacuna).toBeNull()
    expect(filtrosDeProduccion(url('vacuna=OPV'), OPCIONES).vacuna).toBeNull()
  })

  it('descarta valores inválidos, repetidos y establecimientos que no están en las opciones', () => {
    expect(filtrosDeProduccion(url('agrupar=distrito&periodo=x&establecimientos=31,31,99,abc,,5'), OPCIONES))
      .toEqual({ agrupar: 'municipio', acumulado: true, vacuna: null, establecimientos: [31, 5] })
  })

  it('sin opciones todavía, no elige vacuna ni establecimientos', () => {
    expect(filtrosDeProduccion(url('vacuna=HEXA&establecimientos=31'), null)).toEqual({
      agrupar: 'municipio', acumulado: true, vacuna: null, establecimientos: [],
    })
  })
})

describe('mesDeProduccion', () => {
  const MESES = [{ anio: 2026, mes: 9 }, { anio: 2026, mes: 8 }, { anio: 2025, mes: 12 }]

  it('el pedido si la DDRISS lo tiene', () => {
    expect(mesDeProduccion(MESES, { anio: 2026, mes: 8 })).toBe(MESES[1])
  })

  it('si no lo tiene, el más reciente; sin meses, null', () => {
    expect(mesDeProduccion(MESES, { anio: 2026, mes: 10 })).toBe(MESES[0])
    expect(mesDeProduccion([], { anio: 2026, mes: 10 })).toBeNull()
  })
})

describe('establecimientosVisibles', () => {
  it('recorta a los municipios visibles; sin recorte, todos', () => {
    expect(establecimientosVisibles(OPCIONES.establecimientos, [1, 4]).map((e) => e.id)).toEqual([31, 5])
    expect(establecimientosVisibles(OPCIONES.establecimientos, null)).toBe(OPCIONES.establecimientos)
  })
})

describe('barrasDeProduccion', () => {
  const fila = (nombre, total, { establecimiento = false, fuera = false, id = total } = {}) => ({
    municipio: { id, nombre: establecimiento ? 'San Marcos' : nombre },
    establecimiento: establecimiento ? { id, nombre } : null,
    fueraDelConsolidado: fuera,
    dosisPoblacionPropia: total - 1,
    dosisOtrosMunicipios: 1,
    dosisTotal: total,
  })

  it('ordena de mayor a menor (a igual total, por nombre) y separa propia y otros', () => {
    const barras = barrasDeProduccion([fila('Ayutla', 5), fila('Tajumulco', 9), fila('Comitancillo', 5, { id: 7 })])
    expect(barras.map((b) => [b.nombre, b.total])).toEqual([['Tajumulco', 9], ['Ayutla', 5], ['Comitancillo', 5]])
    expect(barras[0]).toEqual({
      clave: 'm9', nombre: 'Tajumulco', propia: 8, otros: 1, total: 9, fueraDelConsolidado: false,
    })
  })

  it('por establecimiento, usa su nombre y conserva si no suma en el consolidado', () => {
    const [hospital] = barrasDeProduccion([fila('Hospital de San Marcos', 4, { establecimiento: true, fuera: true })])
    expect([hospital.clave, hospital.nombre, hospital.fueraDelConsolidado]).toEqual([
      'e4', 'Hospital de San Marcos', true,
    ])
  })

  it('nombreDeFilaProduccion da el establecimiento o, si no hay, el municipio', () => {
    expect(nombreDeFilaProduccion(fila('Ayutla', 1))).toBe('Ayutla')
    expect(nombreDeFilaProduccion(fila('Puesto X', 1, { establecimiento: true }))).toBe('Puesto X')
  })
})

describe('textoPreliminar', () => {
  it('nombra los meses sin cerrar con su año', () => {
    expect(textoPreliminar([{ anio: 2026, mes: 9, estado: 'EN_CIERRE' }])).toBe(
      'Datos preliminares: septiembre de 2026 todavía no está cerrado.',
    )
    expect(textoPreliminar([
      { anio: 2026, mes: 8, estado: 'EN_CIERRE' },
      { anio: 2026, mes: 9, estado: 'ABIERTO' },
      { anio: 2026, mes: 10, estado: 'ABIERTO' },
    ])).toBe('Datos preliminares: agosto, septiembre y octubre de 2026 todavía no están cerrados.')
  })

  it('sin meses sin cerrar no hay texto', () => {
    expect(textoPreliminar([])).toBeNull()
  })
})
