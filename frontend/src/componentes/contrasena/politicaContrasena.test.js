import { cargarEvaluador, MOTIVOS } from './politicaContrasena.js'

// Mismos casos que backend/tests/politicaContrasena.test.js.
const datos = { nombreUsuario: 'jperez', nombres: 'Juan Carlos', apellidos: 'Pérez López' }
let evaluarContrasena

beforeAll(async () => {
  evaluarContrasena = await cargarEvaluador()
})

test('rechaza 11 caracteres y acepta 12 fuertes sin mayúsculas, números ni símbolos', () => {
  expect(evaluarContrasena('tucan grap7', datos).motivos).toContain(MOTIVOS.corta)
  expect(evaluarContrasena('tucan grapa7', datos)).toEqual({ puntaje: 4, motivos: [] })
  expect(evaluarContrasena('caballo bateria grapa correcta', datos)).toEqual({ puntaje: 4, motivos: [] })
})

test('rechaza más de 72 bytes aunque tenga menos de 72 caracteres', () => {
  expect(evaluarContrasena('ñ'.repeat(36), datos).motivos).not.toContain(MOTIVOS.larga)
  expect(evaluarContrasena('ñ'.repeat(37), datos).motivos).toContain(MOTIVOS.larga)
})

test('rechaza el usuario, los nombres o los apellidos sin importar mayúsculas ni tildes', () => {
  expect(evaluarContrasena('PEREZ caballo bateria grapa', datos).motivos).toEqual([MOTIVOS.nombre])
  expect(evaluarContrasena('lópez caballo bateria grapa', datos).motivos).toEqual([MOTIVOS.nombre])
  expect(evaluarContrasena('grapa JPerez bateria caballo', datos).motivos).toEqual([MOTIVOS.nombre])
  expect(evaluarContrasena('carlos caballo bateria grapa', datos).motivos).toEqual([MOTIVOS.nombre])
})

test('no cuenta las palabras de menos de 3 letras del nombre', () => {
  const conPalabrasCortas = { nombreUsuario: 'lu', nombres: 'Lu', apellidos: 'De' }
  expect(evaluarContrasena('caballo de bateria grapa lu', conPalabrasCortas).motivos).toEqual([])
})

test('rechaza una contraseña fácil de adivinar con un motivo en español', () => {
  const { puntaje, motivos } = evaluarContrasena('contrasena12345', datos)
  expect(puntaje).toBeLessThan(3)
  expect(motivos).toEqual([MOTIVOS.adivinable])
})

test('usa la advertencia traducida de zxcvbn cuando la trae', () => {
  const { motivos } = evaluarContrasena('aaaaaaaaaaaaaaaa', datos)
  expect(motivos).toHaveLength(1)
  expect(motivos[0]).toMatch(/repetidos/i)
})

test('carga zxcvbn una sola vez', async () => {
  expect(await cargarEvaluador()).toBe(evaluarContrasena)
})
