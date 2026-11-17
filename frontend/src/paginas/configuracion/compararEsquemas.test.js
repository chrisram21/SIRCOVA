import { compararEsquemas, versionAnterior } from './compararEsquemas.js'

const DIMENSIONES = [
  {
    codigo: 'grupo_edad',
    nombre: 'Grupo de edad',
    valores: [
      { codigo: 'MENOR_1', etiqueta: '< 1 año' },
      { codigo: '1_A_5', etiqueta: '1 a 5 años' },
    ],
  },
  {
    codigo: 'sexo',
    nombre: 'Sexo',
    valores: [
      { codigo: 'M', etiqueta: 'Masculino' },
      { codigo: 'F', etiqueta: 'Femenino' },
    ],
  },
  { codigo: 'pueblo', nombre: 'Pueblo', valores: [{ codigo: 'MAYA', etiqueta: 'Maya' }] },
]

const base = (cambios = {}) => ({
  procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: true },
  desagregacion: [
    { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta: null },
    { dimension: 'sexo', valores: ['M', 'F'], etiqueta: null },
  ],
  dosis: [
    { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
    { codigo: 'R1', etiqueta: 'Primer refuerzo', desagregacion: [] },
  ],
  secciones: [{ codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1'] }],
  incluirPorDefecto: true,
  ...cambios,
})

const comparar = (cambios, dimensiones = DIMENSIONES) => compararEsquemas(base(), base(cambios), dimensiones)

test('sin diferencias de captura la lista está vacía', () => {
  expect(comparar({})).toEqual([])
})

test('la procedencia cambiada muestra el modo y la opción de no especificada con sus etiquetas', () => {
  expect(comparar({ procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: false } })).toEqual([
    {
      grupo: 'procedencia',
      tipo: 'cambiado',
      etiqueta: 'Modo de procedencia',
      antes: 'Propio y otros, como el 5C',
      despues: 'Por municipio de procedencia',
    },
    {
      grupo: 'procedencia',
      tipo: 'cambiado',
      etiqueta: 'Permitir procedencia no especificada',
      antes: 'Sí',
      despues: 'No',
    },
  ])
})

test('una dimensión agregada, quitada o con valores o etiqueta cambiados', () => {
  const diferencias = comparar({
    desagregacion: [
      { dimension: 'grupo_edad', valores: ['MENOR_1'], etiqueta: 'Edad' },
      { dimension: 'pueblo', valores: ['MAYA'], etiqueta: null },
    ],
  })

  expect(diferencias).toEqual([
    { grupo: 'desagregacion', tipo: 'cambiado', etiqueta: 'Valores de Grupo de edad', antes: '< 1 año, 1 a 5 años', despues: '< 1 año' },
    { grupo: 'desagregacion', tipo: 'cambiado', etiqueta: 'Etiqueta de Grupo de edad', antes: '—', despues: 'Edad' },
    { grupo: 'desagregacion', tipo: 'agregado', etiqueta: 'Dimensión Pueblo', antes: undefined, despues: 'Maya' },
    { grupo: 'desagregacion', tipo: 'quitado', etiqueta: 'Dimensión Sexo', antes: 'Masculino, Femenino', despues: undefined },
  ])
})

test('las mismas dimensiones en otro orden se marcan como cambio de orden', () => {
  const [sexo, edad] = [base().desagregacion[1], base().desagregacion[0]]
  expect(comparar({ desagregacion: [sexo, edad] })).toEqual([
    {
      grupo: 'desagregacion',
      tipo: 'cambiado',
      etiqueta: 'Orden de las dimensiones',
      antes: 'Grupo de edad, Sexo',
      despues: 'Sexo, Grupo de edad',
    },
  ])
})

test('sin el catálogo de dimensiones se muestran los códigos', () => {
  const [diferencia] = comparar({ desagregacion: [base().desagregacion[0]] }, [])
  expect(diferencia).toMatchObject({ tipo: 'quitado', etiqueta: 'Dimensión sexo', antes: 'M, F' })
})

test('una dosis agregada o quitada, y su etiqueta o su desagregación cambiadas', () => {
  const diferencias = comparar({
    dosis: [
      { codigo: 'D1', etiqueta: '1.ª dosis', desagregacion: [] },
      { codigo: 'D2', etiqueta: 'Segunda dosis', desagregacion: null },
    ],
  })

  expect(diferencias).toEqual([
    { grupo: 'dosis', tipo: 'cambiado', etiqueta: 'Etiqueta de D1', antes: 'Primera dosis', despues: '1.ª dosis' },
    { grupo: 'dosis', tipo: 'cambiado', etiqueta: 'Desagregación de D1', antes: 'General', despues: 'Sin desagregar' },
    { grupo: 'dosis', tipo: 'agregado', etiqueta: 'Dosis D2', antes: undefined, despues: 'Segunda dosis' },
    { grupo: 'dosis', tipo: 'quitado', etiqueta: 'Dosis R1', antes: 'Primer refuerzo', despues: undefined },
  ])
})

test('la desagregación propia de una dosis se describe con sus dimensiones y valores', () => {
  const [diferencia] = comparar({
    dosis: [
      { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
      { codigo: 'R1', etiqueta: 'Primer refuerzo', desagregacion: [{ dimension: 'sexo', valores: ['F'], etiqueta: null }] },
    ],
  })
  expect(diferencia).toEqual({
    grupo: 'dosis',
    tipo: 'cambiado',
    etiqueta: 'Desagregación de R1',
    antes: 'Sin desagregar',
    despues: 'Sexo: Femenino',
  })
})

test('una sección agregada, quitada o con título, orden o dosis cambiados', () => {
  const diferencias = comparar({
    secciones: [
      { codigo: 'MENOR_1', titulo: 'Menores de 1 año', orden: 2, grupoEdad: 'MENOR_1', dosis: ['D1', 'R1'] },
      { codigo: '1_A_5', titulo: '1 a 5 años', orden: 1, grupoEdad: '1_A_5', dosis: ['R1'] },
    ],
  })

  expect(diferencias).toEqual([
    { grupo: 'secciones', tipo: 'cambiado', etiqueta: 'Título de «< 1 año»', antes: '< 1 año', despues: 'Menores de 1 año' },
    { grupo: 'secciones', tipo: 'cambiado', etiqueta: 'Orden de «Menores de 1 año»', antes: '1', despues: '2' },
    { grupo: 'secciones', tipo: 'cambiado', etiqueta: 'Dosis de «Menores de 1 año»', antes: 'D1', despues: 'D1, R1' },
    { grupo: 'secciones', tipo: 'agregado', etiqueta: 'Sección «1 a 5 años»', antes: undefined, despues: 'R1' },
  ])
  expect(comparar({ secciones: [] })).toEqual([
    { grupo: 'secciones', tipo: 'quitado', etiqueta: 'Sección «< 1 año»', antes: 'D1', despues: undefined },
  ])
})

test('una versión sin secciones (Hexavalente v1) cuenta como lista vacía', () => {
  const viejo = base()
  delete viejo.secciones
  expect(compararEsquemas(viejo, base(), DIMENSIONES)).toEqual([
    { grupo: 'secciones', tipo: 'agregado', etiqueta: 'Sección «< 1 año»', antes: undefined, despues: 'D1' },
  ])
})

test('incluirPorDefecto: sin el campo cuenta como Sí', () => {
  const viejo = base()
  delete viejo.incluirPorDefecto
  expect(compararEsquemas(viejo, base(), DIMENSIONES)).toEqual([])
  expect(compararEsquemas(viejo, base({ incluirPorDefecto: false }), DIMENSIONES)).toEqual([
    { grupo: 'inclusion', tipo: 'cambiado', etiqueta: 'Incluir en los reportes nuevos', antes: 'Sí', despues: 'No' },
  ])
})

test('las diferencias salen por grupo: procedencia, desagregación, dosis, secciones e inclusión', () => {
  const diferencias = comparar({
    incluirPorDefecto: false,
    secciones: [],
    dosis: [base().dosis[0]],
    desagregacion: [base().desagregacion[0]],
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
  })
  expect(diferencias.map((d) => d.grupo)).toEqual(['procedencia', 'desagregacion', 'dosis', 'secciones', 'inclusion'])
})

describe('versionAnterior', () => {
  const VERSIONES = [
    { id: 'v4', version: 4, territorio: { nivel: 'DDRISS' } },
    { id: 'v3', version: 3, territorio: { nivel: 'NACIONAL' } },
    { id: 'v1', version: 1, territorio: { nivel: 'DDRISS' } },
  ]

  test('da la de número inmediatamente menor, de cualquier territorio', () => {
    expect(versionAnterior(VERSIONES, 'v4').id).toBe('v3')
    expect(versionAnterior(VERSIONES, 'v3').id).toBe('v1')
  })

  test('con la primera versión o un id que no está, da null', () => {
    expect(versionAnterior(VERSIONES, 'v1')).toBeNull()
    expect(versionAnterior(VERSIONES, 'otro')).toBeNull()
  })
})
