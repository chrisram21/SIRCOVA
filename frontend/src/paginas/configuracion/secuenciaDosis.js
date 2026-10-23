// Vista previa de las reglas de las dosis del SPEC 15: código, orden, dosis que completa el esquema y errores de
// secuencia. Repite el cálculo de backend/src/modulos/catalogos/vacunas.service.js; el que decide es el backend, y la
// pantalla siempre muestra la vacuna que devuelve.

export const TIPOS_DOSIS = [
  { valor: 'UNICA', etiqueta: 'Única' },
  { valor: 'DOSIS', etiqueta: 'Dosis' },
  { valor: 'REFUERZO', etiqueta: 'Refuerzo' },
]

export const MENSAJES_SECUENCIA = {
  unica: 'Una vacuna con dosis única no lleva otras dosis, solo refuerzos.',
  refuerzoAntes: 'Los refuerzos van después de las dosis.',
}

const PREFIJOS = { DOSIS: 'D', REFUERZO: 'R' }
const ORDINALES_DOSIS = ['Primera', 'Segunda', 'Tercera', 'Cuarta', 'Quinta', 'Sexta', 'Séptima', 'Octava', 'Novena', 'Décima']
const ORDINALES_REFUERZO = ['Primer', 'Segundo', 'Tercer', 'Cuarto', 'Quinto', 'Sexto', 'Séptimo', 'Octavo', 'Noveno', 'Décimo']

export function tipoDeCodigo(codigo) {
  if (codigo === 'UNICA') return 'UNICA'
  if (/^D\d+$/.test(codigo ?? '')) return 'DOSIS'
  if (/^R\d+$/.test(codigo ?? '')) return 'REFUERZO'
  return null
}

// Siguiente código del tipo, contando las dosis activas e inactivas: un código no se reutiliza.
export function siguienteCodigo(tipo, codigos) {
  if (tipo === 'UNICA') return 'UNICA'
  const numeros = codigos.filter((c) => tipoDeCodigo(c) === tipo).map((c) => Number(c.slice(1)))
  return `${PREFIJOS[tipo]}${Math.max(0, ...numeros) + 1}`
}

// Código y orden de cada fila de una vacuna nueva; una fila sin tipo no tiene código.
export function codigosDeLista(tipos) {
  const codigos = []
  return tipos.map((tipo, i) => {
    const codigo = PREFIJOS[tipo] || tipo === 'UNICA' ? siguienteCodigo(tipo, codigos) : null
    if (codigo) codigos.push(codigo)
    return { codigo, orden: i + 1 }
  })
}

// La activa UNICA o DOSIS de mayor orden o, si no hay, el refuerzo activo de mayor orden. Recibe las dosis por orden,
// con su codigo y, si falta, se toman como activas. Devuelve su posición, o -1.
export function queCompleta(dosis) {
  const activas = dosis.map((d, i) => ({ ...d, i })).filter((d) => d.codigo && d.activa !== false)
  const sinRefuerzos = activas.filter((d) => tipoDeCodigo(d.codigo) !== 'REFUERZO')
  return (sinRefuerzos.length > 0 ? sinRefuerzos : activas).at(-1)?.i ?? -1
}

const rompeLaUnica = (tipos) => {
  const unicas = tipos.filter((t) => t === 'UNICA').length
  return unicas > 1 || (unicas === 1 && tipos.includes('DOSIS'))
}

// Error de secuencia de la lista de una vacuna nueva, o null.
export function errorDeSecuencia(tipos) {
  const elegidos = tipos.filter(Boolean)
  if (rompeLaUnica(elegidos)) return MENSAJES_SECUENCIA.unica
  const primerRefuerzo = elegidos.indexOf('REFUERZO')
  if (primerRefuerzo >= 0 && elegidos.slice(primerRefuerzo).some((t) => t !== 'REFUERZO')) {
    return MENSAJES_SECUENCIA.refuerzoAntes
  }
  return null
}

// Tipos que admite una dosis agregada a una vacuna que ya tiene estas dosis (activas e inactivas).
export function tiposAdmitidos(dosis) {
  const tipos = dosis.map((d) => tipoDeCodigo(d.codigo))
  return TIPOS_DOSIS.map((t) => t.valor).filter((tipo) => !rompeLaUnica([...tipos, tipo]))
}

export function nombreSugerido(codigo) {
  const tipo = tipoDeCodigo(codigo)
  if (tipo === 'UNICA') return 'Dosis única'
  if (!tipo) return ''
  const numero = Number(codigo.slice(1))
  if (tipo === 'DOSIS') return numero <= ORDINALES_DOSIS.length ? `${ORDINALES_DOSIS[numero - 1]} dosis` : `Dosis ${numero}`
  return numero <= ORDINALES_REFUERZO.length ? `${ORDINALES_REFUERZO[numero - 1]} refuerzo` : `Refuerzo ${numero}`
}
