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

export function listarUsuarios() {
  return solicitar('/usuarios')
}

export function obtenerUsuario(id) {
  return solicitar(`/usuarios/${id}`)
}

export function cambiarRol(id, rolId) {
  return solicitar(`/usuarios/${id}`, { metodo: 'PATCH', cuerpo: { rolId } })
}

export function desactivarCuenta(id) {
  return solicitar(`/usuarios/${id}/desactivar`, { metodo: 'POST' })
}

export function restaurarCuenta(id) {
  return solicitar(`/usuarios/${id}/restaurar`, { metodo: 'POST' })
}

export function desbloquearCuenta(id) {
  return solicitar(`/usuarios/${id}/desbloquear`, { metodo: 'POST' })
}

// Devuelve { usuario, contrasenaTemporal }; la contraseña solo llega en esta respuesta.
export function restablecerContrasena(id) {
  return solicitar(`/usuarios/${id}/restablecer-contrasena`, { metodo: 'POST' })
}

export function editarEmpleado(id, cambios) {
  return solicitar(`/empleados/${id}`, { metodo: 'PATCH', cuerpo: cambios })
}
