import { solicitar } from './cliente.js'

// El catálogo de dimensiones (MongoDB) es nacional: no se filtra por DDRISS. Cada dimensión trae todos sus
// valores, también los inactivos, ordenados por orden.
const rutaDimension = (codigo) => `/dimensiones/${encodeURIComponent(codigo)}`
const rutaValor = (codigo, valor) => `${rutaDimension(codigo)}/valores/${encodeURIComponent(valor)}`

export function listarDimensiones({ activa } = {}) {
  return solicitar(activa === undefined ? '/dimensiones' : `/dimensiones?activa=${activa}`)
}

export function obtenerDimension(codigo) {
  return solicitar(rutaDimension(codigo))
}

export function crearDimension(datos) {
  return solicitar('/dimensiones', { metodo: 'POST', cuerpo: datos })
}

// Solo nombre y descripción; los valores se cambian con sus propias funciones.
export function editarDimension(codigo, cambios) {
  return solicitar(rutaDimension(codigo), { metodo: 'PATCH', cuerpo: cambios })
}

export function desactivarDimension(codigo) {
  return solicitar(`${rutaDimension(codigo)}/desactivar`, { metodo: 'POST' })
}

export function reactivarDimension(codigo) {
  return solicitar(`${rutaDimension(codigo)}/reactivar`, { metodo: 'POST' })
}

export function agregarValorDimension(codigo, datos) {
  return solicitar(`${rutaDimension(codigo)}/valores`, { metodo: 'POST', cuerpo: datos })
}

export function editarValorDimension(codigo, valor, datos) {
  return solicitar(rutaValor(codigo, valor), { metodo: 'PATCH', cuerpo: datos })
}

// codigos trae todos los valores de la dimensión, activos e inactivos, en el orden nuevo.
export function ordenarValoresDimension(codigo, codigos) {
  return solicitar(`${rutaDimension(codigo)}/valores/orden`, { metodo: 'PUT', cuerpo: { codigos } })
}

export function desactivarValorDimension(codigo, valor) {
  return solicitar(`${rutaValor(codigo, valor)}/desactivar`, { metodo: 'POST' })
}

export function reactivarValorDimension(codigo, valor) {
  return solicitar(`${rutaValor(codigo, valor)}/reactivar`, { metodo: 'POST' })
}

// Esquemas de captura: los nacionales y los de la DDRISS del usuario. Los borradores son siempre de su DDRISS.
export function listarEsquemas() {
  return solicitar('/esquemas-captura')
}

export function obtenerEsquema(id) {
  return solicitar(`/esquemas-captura/${encodeURIComponent(id)}`)
}

// copiaDe es el id del vigente que aplica, o null para empezar vacío.
export function crearEsquema(datos) {
  return solicitar('/esquemas-captura', { metodo: 'POST', cuerpo: datos })
}

// Reemplaza procedencia, dosis, desagregación y secciones de un borrador.
export function editarEsquema(id, datos) {
  return solicitar(`/esquemas-captura/${encodeURIComponent(id)}`, { metodo: 'PUT', cuerpo: datos })
}

export function descartarEsquema(id) {
  return solicitar(`/esquemas-captura/${encodeURIComponent(id)}`, { metodo: 'DELETE' })
}

// vigenciaDesde es el día 1 de un mes del calendario (AAAA-MM-01); el vigente anterior de la DDRISS pasa a histórico.
export function publicarEsquema(id, { vigenciaDesde, motivoCambio }) {
  return solicitar(`/esquemas-captura/${encodeURIComponent(id)}/publicar`, {
    metodo: 'POST',
    cuerpo: { vigenciaDesde, motivoCambio },
  })
}

// Las versiones nacionales y de la DDRISS del usuario, de la más nueva a la más vieja, con sus reportes.
export function historialEsquemas(vacunaId) {
  return solicitar(`/esquemas-captura/historial?vacunaId=${encodeURIComponent(vacunaId)}`)
}

// Reglas de validación: una fila por código, con la versión que aplica a la DDRISS del usuario (la de su DDRISS
// antes que la nacional). Cada escritura publica una versión nueva de la DDRISS al momento; no hay borradores.
const rutaRegla = (codigo) => `/reglas-validacion/${encodeURIComponent(codigo)}`

export function listarReglas() {
  return solicitar('/reglas-validacion')
}

export function historialRegla(codigo) {
  return solicitar(`${rutaRegla(codigo)}/historial`)
}

// El código lo genera el backend ({TIPO}_{NN}); solo se crean los tipos con parámetros.
export function crearRegla(datos) {
  return solicitar('/reglas-validacion', { metodo: 'POST', cuerpo: datos })
}

// datos.versionBase es la versión que se cargó en el editor; si cambió, responde 409.
export function publicarVersionRegla(codigo, datos) {
  return solicitar(`${rutaRegla(codigo)}/versiones`, { metodo: 'POST', cuerpo: datos })
}

// { version, motivoCambio }: la del VIGENTE de la DDRISS. Responde la fila actualizada.
export function desactivarRegla(codigo, datos) {
  return solicitar(`${rutaRegla(codigo)}/desactivar`, { metodo: 'POST', cuerpo: datos })
}

// { version, motivoCambio }: la de su última versión de la DDRISS. Responde la versión publicada.
export function activarRegla(codigo, datos) {
  return solicitar(`${rutaRegla(codigo)}/activar`, { metodo: 'POST', cuerpo: datos })
}
