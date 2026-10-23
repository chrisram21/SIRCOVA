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

// alcance: 'departamento' (por defecto) o 'procedencia', que suma el 9999 y los municipios de establecimientos externos.
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

export function listarEstablecimientos({ activo } = {}) {
  const consulta = activo === undefined ? '' : `?activo=${activo}`
  return solicitar(`/establecimientos${consulta}`)
}
