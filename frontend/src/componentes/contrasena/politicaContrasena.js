// Misma regla que backend/src/modulos/auth/politicaContrasena.service.js: un cambio a una se hace en las dos.
export const LARGO_MINIMO = 12
export const BYTES_MAXIMOS = 72
export const PUNTAJE_MINIMO = 3
const LARGO_MINIMO_PALABRA = 3

export const MOTIVOS = {
  corta: `Debe tener al menos ${LARGO_MINIMO} caracteres.`,
  larga: 'Es demasiado larga.',
  nombre: 'No debe contener su nombre ni su usuario.',
  adivinable: 'Es fácil de adivinar; use una frase más larga.',
}

function normalizar(texto) {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

function palabrasPersonales({ nombreUsuario, nombres, apellidos }) {
  return [nombreUsuario, nombres, apellidos]
    .filter((texto) => typeof texto === 'string')
    .flatMap((texto) => normalizar(texto).split(/[^\p{L}\p{N}]+/u))
    .filter((palabra) => palabra.length >= LARGO_MINIMO_PALABRA)
}

function evaluar(zxcvbn, contrasena, datosPersonales = {}) {
  const palabras = palabrasPersonales(datosPersonales)
  const motivos = []

  if ([...contrasena].length < LARGO_MINIMO) motivos.push(MOTIVOS.corta)
  const demasiadoLarga = new TextEncoder().encode(contrasena).length > BYTES_MAXIMOS
  if (demasiadoLarga) motivos.push(MOTIVOS.larga)

  const normalizada = normalizar(contrasena)
  if (palabras.some((palabra) => normalizada.includes(palabra))) motivos.push(MOTIVOS.nombre)

  const { score, feedback } = zxcvbn.check(demasiadoLarga ? contrasena.slice(0, BYTES_MAXIMOS) : contrasena, palabras)
  if (score < PUNTAJE_MINIMO) motivos.push(feedback.warning ?? MOTIVOS.adivinable)

  return { puntaje: score, motivos }
}

let evaluador = null

// zxcvbn y sus diccionarios pesan: se cargan la primera vez que se pide, no con la app.
// Devuelve una función (contrasena, { nombreUsuario, nombres, apellidos }) => { puntaje, motivos }.
export function cargarEvaluador() {
  evaluador ??= Promise.all([
    import('@zxcvbn-ts/core'),
    import('@zxcvbn-ts/language-common'),
    import('@zxcvbn-ts/language-es-es'),
  ])
    .then(([{ ZxcvbnFactory }, idiomaComun, idiomaEspanol]) => {
      const zxcvbn = new ZxcvbnFactory({
        dictionary: { ...idiomaComun.dictionary, ...idiomaEspanol.dictionary },
        graphs: idiomaComun.adjacencyGraphs,
        translations: idiomaEspanol.translations,
      })
      return (contrasena, datosPersonales) => evaluar(zxcvbn, contrasena, datosPersonales)
    })
    .catch((error) => {
      evaluador = null
      throw error
    })
  return evaluador
}
