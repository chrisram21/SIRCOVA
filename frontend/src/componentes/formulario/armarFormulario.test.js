import { armarFormulario, claveCombinacion } from './armarFormulario.js'

// Esquemas armados a mano a partir de la semilla del 04, en la forma de contenidoDe. Las dimensiones vienen como
// las devuelve GET /dimensiones y la vacuna como GET /vacunas/{id}.
const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const dimensiones = [
  {
    codigo: 'grupo_edad',
    nombre: 'Grupo de edad',
    activa: true,
    valores: [valor('MENOR_1', '< 1 año', 1), valor('1_A_5', 'De 1 a < 6 años', 4)],
  },
  { codigo: 'sexo', nombre: 'Sexo', activa: true, valores: [valor('M', 'Masculino', 1), valor('F', 'Femenino', 2)] },
  {
    codigo: 'embarazo',
    nombre: 'Condición de embarazo',
    activa: true,
    valores: [valor('EMBARAZADA', 'Embarazada', 1), valor('NO_EMBARAZADA', 'No embarazada', 2)],
  },
]
const vacuna = (...codigos) => ({
  id: 1,
  codigo: 'ZVT',
  nombre: 'Vacuna',
  dosis: codigos.map((codigo, i) => ({ codigo, nombre: `Dosis ${codigo}`, orden: i + 1, activa: true })),
})
const procedencia = { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true }
const general = (codigo) => ({ codigo, desagregacion: null })

const hexavalente = () => ({
  procedencia,
  dosis: [general('D1'), general('D2'), general('D3')],
  desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
  secciones: [
    { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1', 'D2', 'D3'] },
    { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D1', 'D2', 'D3'] },
  ],
})
const vph = () => ({
  procedencia,
  dosis: [general('D1'), general('D2'), general('D3')],
  desagregacion: [{ dimension: 'sexo', valores: ['F', 'M'] }],
  secciones: [{ titulo: 'VPH', grupoEdad: null, dosis: ['D1', 'D2', 'D3'] }],
})
const armar = (contenido, codigos = ['D1', 'D2', 'D3']) =>
  armarFormulario({ contenido, vacuna: vacuna(...codigos), dimensiones })
const claves = (fila) => fila.celdas.map((c) => c?.claveCombinacion ?? null)

it('Hexavalente v2: una tabla con una columna por sección y una fila por dosis', () => {
  const { tablas, dimensionesUsadas } = armar(hexavalente())
  expect(tablas).toHaveLength(1)
  const [tabla] = tablas
  expect(tabla.clave).toBe('general')
  expect(tabla.seccion).toBeNull()
  expect(tabla.encabezados).toEqual([
    [{ etiqueta: '< 1 año', columnas: 1 }, { etiqueta: 'De 1 a < 6 años', columnas: 1 }],
  ])
  expect(tabla.filas.map((f) => f.etiqueta)).toEqual(['Dosis D1', 'Dosis D2', 'Dosis D3'])
  for (const fila of tabla.filas) expect(claves(fila)).toEqual(['grupo_edad=MENOR_1', 'grupo_edad=1_A_5'])
  expect(dimensionesUsadas).toEqual(['Dosis', 'Grupo de edad'])
})

it('VPH: una sola sección no tiene nivel de secciones y los valores van en el orden del catálogo', () => {
  const { tablas, dimensionesUsadas } = armar(vph())
  const [tabla] = tablas
  expect(tabla.seccion).toBe('VPH')
  expect(tabla.encabezados).toEqual([[{ etiqueta: 'Masculino', columnas: 1 }, { etiqueta: 'Femenino', columnas: 1 }]])
  expect(claves(tabla.filas[0])).toEqual(['sexo=M', 'sexo=F'])
  expect(dimensionesUsadas).toEqual(['Dosis', 'Sexo'])
})

it('BCG: sin desagregación hay una columna con clave vacía', () => {
  const contenido = {
    procedencia,
    dosis: [general('UNICA')],
    desagregacion: [],
    secciones: [{ titulo: '< 1 año', grupoEdad: null, dosis: ['UNICA'] }],
  }
  const { tablas, dimensionesUsadas } = armar(contenido, ['UNICA'])
  expect(tablas[0].encabezados).toEqual([])
  expect(tablas[0].columnas).toHaveLength(1)
  expect(claves(tablas[0].filas[0])).toEqual([''])
  expect(dimensionesUsadas).toEqual(['Dosis'])
})

it('una dosis con desagregación propia va en su propia tabla', () => {
  const contenido = hexavalente()
  contenido.dosis.push({ codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] })
  contenido.secciones[1].dosis.push('R1')
  const { tablas } = armar(contenido, ['D1', 'D2', 'D3', 'R1'])
  expect(tablas.map((t) => t.clave)).toEqual(['general', 'dosis-R1'])
  const propia = tablas[1]
  expect(propia.titulo).toBe('Dosis R1')
  expect(propia.seccion).toBe('De 1 a < 6 años')
  expect(propia.filas.map((f) => f.dosis)).toEqual(['R1'])
  expect(claves(propia.filas[0])).toEqual(['grupo_edad=1_A_5'])
  expect(tablas[0].filas.map((f) => f.dosis)).toEqual(['D1', 'D2', 'D3'])
})

describe('secciones de cada tabla', () => {
  it('Hexavalente v2: la general tiene «< 1 año» y «De 1 a < 6 años», en el orden de sus columnas', () => {
    const [tabla] = armar(hexavalente()).tablas
    expect(tabla.secciones).toEqual([
      { titulo: '< 1 año', grupoEdad: 'MENOR_1' },
      { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5' },
    ])
    expect(tabla.columnas.map((c) => tabla.secciones[c.seccion].grupoEdad)).toEqual(['MENOR_1', '1_A_5'])
  })

  it('BCG: una sola sección sin grupoEdad', () => {
    const contenido = {
      procedencia,
      dosis: [general('UNICA')],
      desagregacion: [],
      secciones: [{ titulo: '< 1 año', grupoEdad: null, dosis: ['UNICA'] }],
    }
    expect(armar(contenido, ['UNICA']).tablas[0].secciones).toEqual([{ titulo: '< 1 año', grupoEdad: null }])
  })

  it('Td: la tabla del refuerzo solo tiene las secciones que lo incluyen', () => {
    const contenido = {
      procedencia,
      dosis: [
        general('D1'),
        {
          codigo: 'R1',
          desagregacion: [
            { dimension: 'grupo_edad', valores: ['1_A_5'] },
            { dimension: 'embarazo', valores: ['EMBARAZADA', 'NO_EMBARAZADA'] },
          ],
        },
      ],
      desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
      secciones: [
        { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1'] },
        { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D1', 'R1'] },
      ],
    }
    const [comun, refuerzo] = armar(contenido, ['D1', 'R1']).tablas
    expect(comun.secciones.map((s) => s.grupoEdad)).toEqual(['MENOR_1', '1_A_5'])
    expect(refuerzo.clave).toBe('dosis-R1')
    expect(refuerzo.secciones).toEqual([{ titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5' }])
    expect(refuerzo.columnas.every((c) => c.seccion === 0)).toBe(true)
  })
})

it('una dosis que no está en una sección tiene celda null en sus columnas', () => {
  const contenido = hexavalente()
  contenido.secciones[1].dosis = ['D1', 'D2']
  const fila = armar(contenido).tablas[0].filas.find((f) => f.dosis === 'D3')
  expect(claves(fila)).toEqual(['grupo_edad=MENOR_1', null])
})

it('dos dimensiones además de la edad: producto en el orden del catálogo y claves ordenadas por código', () => {
  const contenido = hexavalente()
  contenido.desagregacion = [
    { dimension: 'embarazo', valores: ['NO_EMBARAZADA', 'EMBARAZADA'] },
    { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
    { dimension: 'sexo', valores: ['F', 'M'] },
  ]
  const { tablas, dimensionesUsadas } = armar(contenido)
  const [tabla] = tablas
  expect(tabla.encabezados).toEqual([
    [{ etiqueta: '< 1 año', columnas: 4 }, { etiqueta: 'De 1 a < 6 años', columnas: 4 }],
    [1, 2, 3, 4].map((i) => ({ etiqueta: i % 2 ? 'Masculino' : 'Femenino', columnas: 2 })),
    Array.from({ length: 4 }).flatMap(() => [
      { etiqueta: 'Embarazada', columnas: 1 },
      { etiqueta: 'No embarazada', columnas: 1 },
    ]),
  ])
  expect(claves(tabla.filas[0]).slice(0, 4)).toEqual([
    'embarazo=EMBARAZADA|grupo_edad=MENOR_1|sexo=M',
    'embarazo=NO_EMBARAZADA|grupo_edad=MENOR_1|sexo=M',
    'embarazo=EMBARAZADA|grupo_edad=MENOR_1|sexo=F',
    'embarazo=NO_EMBARAZADA|grupo_edad=MENOR_1|sexo=F',
  ])
  expect(tabla.columnas).toHaveLength(8)
  expect(dimensionesUsadas).toEqual(['Dosis', 'Grupo de edad', 'Sexo', 'Condición de embarazo'])
})

it('omite sin error un valor o una dimensión fuera del catálogo y una dosis que no es de la vacuna', () => {
  const contenido = vph()
  contenido.desagregacion = [
    { dimension: 'sexo', valores: ['F', 'X'] },
    { dimension: 'inexistente', valores: ['A'] },
  ]
  contenido.dosis.push(general('D9'))
  contenido.secciones[0].dosis.push('D9')
  const { tablas, dimensionesUsadas } = armar(contenido)
  expect(tablas[0].filas.map((f) => f.dosis)).toEqual(['D1', 'D2', 'D3'])
  expect(claves(tablas[0].filas[0])).toEqual(['sexo=F'])
  expect(dimensionesUsadas).toEqual(['Dosis', 'Sexo'])
})

it('omite una dosis sin sección y una sección sin dosis', () => {
  const contenido = hexavalente()
  contenido.secciones[0].dosis = ['D1', 'D2']
  contenido.secciones[1].dosis = []
  const [tabla] = armar(contenido).tablas
  expect(tabla.filas.map((f) => f.dosis)).toEqual(['D1', 'D2'])
  expect(tabla.seccion).toBe('< 1 año')
  expect(tabla.encabezados).toEqual([])
})

it('un esquema sin secciones no arma ninguna tabla', () => {
  const contenido = hexavalente()
  contenido.secciones = []
  expect(armar(contenido).tablas).toEqual([])
})

describe('versión publicada sin secciones (anterior a la v0.4, como Hexavalente v1)', () => {
  const sinSecciones = (c) => ({ ...c, secciones: [] })
  const armarPublicada = (contenido, codigos = ['D1', 'D2', 'D3']) =>
    armarFormulario({ contenido, vacuna: vacuna(...codigos), dimensiones, deducirSecciones: true })

  it('arma una sección por valor de grupo_edad, en el orden del catálogo, con las dosis que lo admiten', () => {
    const contenido = sinSecciones(hexavalente())
    contenido.desagregacion = [{ dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'] }]
    contenido.dosis.push({ codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] })
    const { tablas } = armarPublicada(contenido, ['D1', 'D2', 'D3', 'R1'])
    expect(tablas[0].encabezados).toEqual([
      [{ etiqueta: '< 1 año', columnas: 1 }, { etiqueta: 'De 1 a < 6 años', columnas: 1 }],
    ])
    expect(claves(tablas[0].filas[0])).toEqual(['grupo_edad=MENOR_1', 'grupo_edad=1_A_5'])
    expect(tablas[1].clave).toBe('dosis-R1')
    expect(tablas[1].seccion).toBe('De 1 a < 6 años')
  })

  it('con un solo grupo de edad, su etiqueta va encima de la tabla', () => {
    const contenido = sinSecciones(hexavalente())
    contenido.desagregacion = [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }]
    const [tabla] = armarPublicada(contenido).tablas
    expect(tabla.seccion).toBe('< 1 año')
    expect(tabla.filas.map((f) => f.dosis)).toEqual(['D1', 'D2', 'D3'])
    expect(claves(tabla.filas[0])).toEqual(['grupo_edad=MENOR_1'])
  })

  it('sin grupo de edad arma una sola sección con el nombre de la vacuna', () => {
    const [tabla] = armarPublicada(sinSecciones(vph())).tablas
    expect(tabla.seccion).toBe('Vacuna')
    expect(claves(tabla.filas[0])).toEqual(['sexo=M', 'sexo=F'])
  })

  it('sin deducirSecciones (un borrador) no las inventa', () => {
    expect(armar(sinSecciones(hexavalente())).tablas).toEqual([])
  })
})

it('la etiqueta de una desagregación del esquema reemplaza el nombre de la dimensión', () => {
  const contenido = vph()
  contenido.desagregacion[0].etiqueta = 'Sexo biológico'
  expect(armar(contenido).dimensionesUsadas).toEqual(['Dosis', 'Sexo biológico'])
})

it('las filas siguen el orden de las dosis de la vacuna y se pasan procedencia, campos y reglas', () => {
  const contenido = vph()
  contenido.dosis.reverse()
  const campos = [{ clave: 'total', etiqueta: 'Total', tipo: 'entero', requerido: true }]
  const reglas = [{ codigo: 'NO_NEGATIVO', version: 1, severidadOverride: null }]
  const formulario = armarFormulario({ contenido, vacuna: vacuna('D1', 'D2', 'D3'), dimensiones, camposAdicionales: campos, reglas })
  expect(formulario.tablas[0].filas.map((f) => f.dosis)).toEqual(['D1', 'D2', 'D3'])
  expect(formulario.procedencia).toEqual(procedencia)
  expect(formulario.camposAdicionales).toBe(campos)
  expect(formulario.reglas).toBe(reglas)
})

it('claveCombinacion ordena por código de dimensión', () => {
  expect(claveCombinacion({ sexo: 'F', grupo_edad: 'MENOR_1' })).toBe('grupo_edad=MENOR_1|sexo=F')
  expect(claveCombinacion({})).toBe('')
})
