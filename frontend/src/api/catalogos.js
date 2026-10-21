import { solicitar } from './cliente.js'

export function listarDdriss() {
  return solicitar('/ddriss')
}

export function listarMunicipios() {
  return solicitar('/municipios')
}

export function listarEstablecimientos({ activo } = {}) {
  const consulta = activo === undefined ? '' : `?activo=${activo}`
  return solicitar(`/establecimientos${consulta}`)
}
