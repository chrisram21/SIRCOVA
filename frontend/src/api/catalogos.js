import { solicitar } from './cliente.js'

export function listarDdriss() {
  return solicitar('/ddriss')
}

// Solo se envían los filtros que tienen valor.
function conConsulta(ruta, filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  const texto = consulta.toString()
  return texto ? `${ruta}?${texto}` : ruta
}

// alcance: 'departamento' (por defecto); 'procedencia', que suma el 9999 y los municipios de establecimientos
// externos; o 'todos', los de cualquier departamento.
export function listarMunicipios({ alcance, incluirInactivos } = {}) {
  return solicitar(conConsulta('/municipios', { alcance, incluirInactivos }))
}

export function listarDistritos({ municipioId, activo } = {}) {
  return solicitar(conConsulta('/distritos', { municipioId, activo }))
}

export function crearDistrito({ municipioId, nombre }) {
  return solicitar('/distritos', { metodo: 'POST', cuerpo: { municipioId, nombre } })
}

export function renombrarDistrito(id, nombre) {
  return solicitar(`/distritos/${id}`, { metodo: 'PATCH', cuerpo: { nombre } })
}

export function desactivarDistrito(id) {
  return solicitar(`/distritos/${id}/desactivar`, { metodo: 'POST' })
}

export function reactivarDistrito(id) {
  return solicitar(`/distritos/${id}/reactivar`, { metodo: 'POST' })
}

export function listarEstablecimientos({ activo, municipioId, tipoEstablecimientoId } = {}) {
  return solicitar(conConsulta('/establecimientos', { activo, municipioId, tipoEstablecimientoId }))
}

export function obtenerEstablecimiento(id) {
  return solicitar(`/establecimientos/${id}`)
}

export function crearEstablecimiento(datos) {
  return solicitar('/establecimientos', { metodo: 'POST', cuerpo: datos })
}

// Solo los campos que cambiaron.
export function editarEstablecimiento(id, cambios) {
  return solicitar(`/establecimientos/${id}`, { metodo: 'PATCH', cuerpo: cambios })
}

export function desactivarEstablecimiento(id) {
  return solicitar(`/establecimientos/${id}/desactivar`, { metodo: 'POST' })
}

export function reactivarEstablecimiento(id) {
  return solicitar(`/establecimientos/${id}/reactivar`, { metodo: 'POST' })
}

export function listarTiposEstablecimiento() {
  return solicitar('/tipos-establecimiento')
}

// El catálogo de vacunas es nacional: no se filtra por DDRISS. Cada vacuna trae todas sus dosis, también las
// inactivas.
export function listarVacunas({ activa } = {}) {
  return solicitar(conConsulta('/vacunas', { activa }))
}

export function obtenerVacuna(id) {
  return solicitar(`/vacunas/${id}`)
}

export function crearVacuna(datos) {
  return solicitar('/vacunas', { metodo: 'POST', cuerpo: datos })
}

// Solo los campos que cambiaron.
export function editarVacuna(id, cambios) {
  return solicitar(`/vacunas/${id}`, { metodo: 'PATCH', cuerpo: cambios })
}

export function desactivarVacuna(id) {
  return solicitar(`/vacunas/${id}/desactivar`, { metodo: 'POST' })
}

export function reactivarVacuna(id) {
  return solicitar(`/vacunas/${id}/reactivar`, { metodo: 'POST' })
}

// Las funciones de dosis devuelven la vacuna completa, con la marca de "completa el esquema" ya recalculada.
export function agregarDosis(vacunaId, datos) {
  return solicitar(`/vacunas/${vacunaId}/dosis`, { metodo: 'POST', cuerpo: datos })
}

export function editarDosis(vacunaId, dosisId, cambios) {
  return solicitar(`/vacunas/${vacunaId}/dosis/${dosisId}`, { metodo: 'PATCH', cuerpo: cambios })
}

export function desactivarDosis(vacunaId, dosisId) {
  return solicitar(`/vacunas/${vacunaId}/dosis/${dosisId}/desactivar`, { metodo: 'POST' })
}

export function reactivarDosis(vacunaId, dosisId) {
  return solicitar(`/vacunas/${vacunaId}/dosis/${dosisId}/reactivar`, { metodo: 'POST' })
}

// El calendario es común; estado, fechaLimiteEnvio y cerradoEn son los de la DDRISS del usuario (null si el mes no
// está abierto en ella).
export function listarPeriodos({ anio, estado } = {}) {
  return solicitar(conConsulta('/periodos', { anio, estado }))
}

// Agrega al calendario los meses que falten del año, sin abrir ninguno.
export function crearAnioPeriodos(anio) {
  return solicitar('/periodos', { metodo: 'POST', cuerpo: { anio } })
}

export function abrirPeriodo(id, fechaLimiteEnvio) {
  return solicitar(`/periodos/${id}/abrir`, { metodo: 'POST', cuerpo: { fechaLimiteEnvio } })
}

export function cambiarFechaLimite(id, fechaLimiteEnvio) {
  return solicitar(`/periodos/${id}`, { metodo: 'PATCH', cuerpo: { fechaLimiteEnvio } })
}

// Los 7 grupos y los municipios del departamento sede de la DDRISS, cada uno con su población del año por grupo.
export function consultarPoblacion(anio) {
  return solicitar(conConsulta('/poblaciones-objetivo', { anio }))
}

// Crea o corrige los grupos que vienen; los demás no cambian. Sin fuente, las filas existentes conservan la suya.
export function guardarPoblacion(municipioId, anio, { fuente, grupos }) {
  const cuerpo = fuente === undefined ? { grupos } : { fuente, grupos }
  return solicitar(`/poblaciones-objetivo/${municipioId}/${anio}`, { metodo: 'PUT', cuerpo })
}
