import {
  codigosDeLista,
  errorDeSecuencia,
  MENSAJES_SECUENCIA,
  nombreSugerido,
  queCompleta,
  siguienteCodigo,
  tipoDeCodigo,
  tiposAdmitidos,
} from './secuenciaDosis.js'

// Los mismos casos que backend/tests/vacunas.test.js.
const codigoDeLaQueCompleta = (dosis) => dosis[queCompleta(dosis)]?.codigo

describe('una vacuna nueva', () => {
  it('DOSIS, DOSIS, REFUERZO da D1, D2 y R1 con orden 1 a 3, y D2 completa el esquema', () => {
    const lista = codigosDeLista(['DOSIS', 'DOSIS', 'REFUERZO'])

    expect(lista).toEqual([
      { codigo: 'D1', orden: 1 },
      { codigo: 'D2', orden: 2 },
      { codigo: 'R1', orden: 3 },
    ])
    expect(codigoDeLaQueCompleta(lista)).toBe('D2')
    expect(errorDeSecuencia(['DOSIS', 'DOSIS', 'REFUERZO'])).toBeNull()
  })

  it('solo con refuerzos completa el último refuerzo; UNICA con refuerzo, la UNICA', () => {
    expect(codigoDeLaQueCompleta(codigosDeLista(['REFUERZO', 'REFUERZO']))).toBe('R2')
    expect(codigoDeLaQueCompleta(codigosDeLista(['UNICA', 'REFUERZO']))).toBe('UNICA')
    expect(errorDeSecuencia(['UNICA', 'REFUERZO'])).toBeNull()
  })

  it.each([
    ['UNICA con DOSIS', ['UNICA', 'DOSIS'], MENSAJES_SECUENCIA.unica],
    ['dos UNICA', ['UNICA', 'UNICA'], MENSAJES_SECUENCIA.unica],
    ['un refuerzo antes de una dosis', ['DOSIS', 'REFUERZO', 'DOSIS'], MENSAJES_SECUENCIA.refuerzoAntes],
  ])('%s es un error de secuencia', (_caso, tipos, mensaje) => {
    expect(errorDeSecuencia(tipos)).toBe(mensaje)
  })

  it('una fila sin tipo no tiene código ni cuenta para la secuencia', () => {
    expect(codigosDeLista(['DOSIS', '', 'DOSIS'])).toEqual([
      { codigo: 'D1', orden: 1 },
      { codigo: null, orden: 2 },
      { codigo: 'D2', orden: 3 },
    ])
    expect(errorDeSecuencia(['REFUERZO', ''])).toBeNull()
    expect(queCompleta([{ codigo: null }])).toBe(-1)
  })
})

describe('una dosis agregada', () => {
  const vacuna = (...codigos) => codigos.map((codigo) => ({ codigo, activa: true }))

  it('a D1, D2 y R1, una DOSIS es D3, va al final y completa el esquema', () => {
    const dosis = vacuna('D1', 'D2', 'R1')
    const codigo = siguienteCodigo('DOSIS', dosis.map((d) => d.codigo))

    expect(codigo).toBe('D3')
    expect(codigoDeLaQueCompleta([...dosis, { codigo, activa: true }])).toBe('D3')
  })

  it('un código no se reutiliza: con D3 inactiva, la siguiente DOSIS es D4', () => {
    const dosis = [...vacuna('D1', 'D2', 'R1'), { codigo: 'D3', activa: false }]

    expect(siguienteCodigo('DOSIS', dosis.map((d) => d.codigo))).toBe('D4')
    // Con D3 inactiva, la marca vuelve a D2.
    expect(codigoDeLaQueCompleta(dosis)).toBe('D2')
  })

  it('a una vacuna con UNICA solo se agregan refuerzos; a una con DOSIS, DOSIS y refuerzos', () => {
    expect(tiposAdmitidos(vacuna('UNICA'))).toEqual(['REFUERZO'])
    expect(tiposAdmitidos(vacuna('D1', 'R1'))).toEqual(['DOSIS', 'REFUERZO'])
    expect(tiposAdmitidos(vacuna('R1'))).toEqual(['UNICA', 'DOSIS', 'REFUERZO'])
  })
})

it('deduce el tipo del código como el backend', () => {
  expect(['UNICA', 'D1', 'D12', 'R2', 'X1', 'D'].map(tipoDeCodigo)).toEqual(['UNICA', 'DOSIS', 'DOSIS', 'REFUERZO', null, null])
})

it('sugiere el nombre de la semilla según el código', () => {
  expect(['UNICA', 'D1', 'D2', 'D3', 'R1', 'R2', 'D11'].map(nombreSugerido)).toEqual([
    'Dosis única',
    'Primera dosis',
    'Segunda dosis',
    'Tercera dosis',
    'Primer refuerzo',
    'Segundo refuerzo',
    'Dosis 11',
  ])
})
