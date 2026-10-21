import { solicitar } from './cliente.js'

export function registrarEmpleado(empleado) {
  return solicitar('/empleados', { metodo: 'POST', cuerpo: empleado })
}

export function crearCuenta(cuenta) {
  return solicitar('/usuarios', { metodo: 'POST', cuerpo: cuenta })
}

export function listarRoles() {
  return solicitar('/roles')
}
