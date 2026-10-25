import { MENSAJES_COHERENCIA as M, problemasDeCoherencia } from './coherenciaEsquema.js'

// Los mismos casos que "reglas de coherencia" de backend/tests/esquemas.test.js (sin la vacuna inactiva, que el
// editor no deja abrir). Las dimensiones vienen como las devuelve GET /dimensiones.
const valor = (codigo, orden, activo = true) => ({ codigo, etiqueta: codigo, orden, activo })
const largo = (n) => `${'d'.repeat(29)}${n}`
const referencias = () => ({
  vacuna: { id: 1, codigo: 'ZVT', nombre: 'Vacuna', activa: true },
  dosis: [
    { codigo: 'D1', nombre: 'Primera dosis', orden: 1, activa: true },
    { codigo: 'D2', nombre: 'Segunda dosis', orden: 2, activa: true },
    { codigo: 'D3', nombre: 'Tercera dosis', orden: 3, activa: false },
    { codigo: 'R1', nombre: 'Primer refuerzo', orden: 4, activa: true },
  ],
  dimensiones: [
    { codigo: 'grupo_edad', activa: true, valores: [valor('MENOR_1', 1), valor('1_A_5', 2), valor('INACT', 3, false)] },
    { codigo: 'sexo', activa: true, valores: [valor('F', 1), valor('M', 2)] },
    { codigo: 'apagada', activa: false, valores: [valor('A', 1)] },
    // Cinco dimensiones de 30 caracteres con un valor de 30: su combinación pasa de 255.
    ...[1, 2, 3, 4, 5].map((n) => ({ codigo: largo(n), activa: true, valores: [valor('V'.repeat(30), 1)] })),
  ],
})
const valido = () => ({
  dosis: [
    { codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
    { codigo: 'D1', desagregacion: null },
  ],
  desagregacion: [
    { dimension: 'sexo', valores: ['M', 'F'] },
    { dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'] },
  ],
  secciones: [
    { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1'] },
    { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['R1', 'D1'] },
  ],
})
// Sin desagregación por edad: una sola sección sin grupo.
const sinEdad = (c) => {
  c.desagregacion = [{ dimension: 'sexo', valores: ['F'] }]
  c.dosis = [{ codigo: 'D1', desagregacion: null }]
  c.secciones = [{ titulo: 'General', grupoEdad: null, dosis: ['D1'] }]
}
const dosisDe = (c, codigo) => c.dosis.find((d) => d.codigo === codigo)
const masDimensionesLargas = (c) => {
  c.desagregacion.push(...[1, 2, 3, 4, 5].map((n) => ({ dimension: largo(n), valores: ['V'.repeat(30)] })))
}

it('un esquema válido no tiene problemas', () => {
  expect(problemasDeCoherencia(valido(), referencias())).toEqual([])
})

it('sin grupo de edad, una sola sección sin grupo no tiene problemas', () => {
  const contenido = valido()
  sinEdad(contenido)
  expect(problemasDeCoherencia(contenido, referencias())).toEqual([])
})

it.each([
  ['no hay dosis', (c) => { c.dosis = [] }, M.sinDosis],
  ['una dosis está inactiva', (c) => { c.dosis.push({ codigo: 'D3', desagregacion: null }) }, M.dosisInactiva('D3', 'ZVT')],
  ['una dosis no existe', (c) => { c.dosis.push({ codigo: 'D9', desagregacion: null }) }, M.dosisInactiva('D9', 'ZVT')],
  [
    'una dimensión está inactiva',
    (c) => { c.desagregacion.push({ dimension: 'apagada', valores: ['A'] }) },
    M.dimensionInactiva('apagada'),
  ],
  [
    'una dimensión no existe',
    (c) => { c.desagregacion.push({ dimension: 'no_existe', valores: ['A'] }) },
    M.dimensionInactiva('no_existe'),
  ],
  ['un valor está inactivo', (c) => { c.desagregacion[1].valores.push('INACT') }, M.valorInactivo('INACT', 'grupo_edad')],
  ['un valor no existe', (c) => { c.desagregacion[0].valores.push('X') }, M.valorInactivo('X', 'sexo')],
  [
    'la desagregación de una dosis usa un valor inactivo',
    (c) => { dosisDe(c, 'R1').desagregacion[0].valores.push('INACT') },
    M.valorInactivo('INACT', 'grupo_edad'),
  ],
  [
    'la desagregación de una dosis no trae grupo de edad',
    (c) => { dosisDe(c, 'R1').desagregacion = [{ dimension: 'sexo', valores: ['F'] }] },
    M.dosisSinEdad('R1'),
  ],
  ['una dosis sin desagregar en una vacuna por edad', (c) => { dosisDe(c, 'R1').desagregacion = [] }, M.dosisSinEdad('R1')],
  [
    'la desagregación de una dosis trae grupo de edad y la vacuna no',
    (c) => {
      sinEdad(c)
      c.dosis[0].desagregacion = [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }]
    },
    M.dosisConEdad('D1'),
  ],
  ['no hay secciones', (c) => { c.secciones = [] }, M.sinSecciones],
  [
    'una sección usa una dosis que no está en el esquema',
    (c) => { c.secciones[0].dosis.push('D2') },
    M.dosisAjena('< 1 año', 'D2'),
  ],
  ['una dosis no está en ninguna sección', (c) => { c.dosis.push({ codigo: 'D2', desagregacion: null }) }, M.dosisSinSeccion('D2')],
  ['una sección no tiene grupo de edad', (c) => { c.secciones[0].grupoEdad = null }, M.seccionSinGrupo('< 1 año')],
  ['dos secciones usan el mismo grupo', (c) => { c.secciones[1].grupoEdad = 'MENOR_1' }, M.grupoRepetido('MENOR_1')],
  [
    'una dosis no admite el grupo de su sección',
    (c) => { c.secciones[0].dosis.push('R1') },
    M.grupoNoPermitido('R1', 'MENOR_1', '< 1 año'),
  ],
  [
    'sin grupo de edad hay dos secciones',
    (c) => {
      sinEdad(c)
      c.secciones.push({ titulo: 'Otra', grupoEdad: null, dosis: ['D1'] })
    },
    M.unaSeccion,
  ],
  [
    'sin grupo de edad la sección tiene grupo',
    (c) => {
      sinEdad(c)
      c.secciones[0].grupoEdad = 'MENOR_1'
    },
    M.seccionConGrupo('General'),
  ],
  ['la combinación de una dosis pasa de 255 caracteres', masDimensionesLargas, M.combinacionLarga('D1')],
  // Solo en el editor: en el backend son errores de forma (400) con el mismo texto.
  ['una dimensión se queda sin valores', (c) => { c.desagregacion[0].valores = [] }, M.sinValores('sexo')],
  ['una sección se queda sin dosis', (c) => { c.secciones[0].dosis = [] }, M.seccionSinDosis('< 1 año')],
])('avisa si %s', (_, cambiar, mensaje) => {
  const contenido = valido()
  cambiar(contenido)
  expect(problemasDeCoherencia(contenido, referencias())).toContain(mensaje)
})

it('lista todos los problemas a la vez, sin repetir', () => {
  const contenido = valido()
  contenido.dosis.push({ codigo: 'D2', desagregacion: null }, { codigo: 'D3', desagregacion: null })
  contenido.secciones[1].grupoEdad = 'MENOR_1'

  expect(problemasDeCoherencia(contenido, referencias())).toEqual([
    M.dosisInactiva('D3', 'ZVT'),
    M.dosisSinSeccion('D2'),
    M.dosisSinSeccion('D3'),
    M.grupoRepetido('MENOR_1'),
    M.grupoNoPermitido('R1', 'MENOR_1', 'De 1 a < 6 años'),
  ])
})
