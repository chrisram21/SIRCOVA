import { solicitar } from './cliente.js'

export function iniciarSesion(nombreUsuario, contrasena) {
  return solicitar('/auth/login', { metodo: 'POST', cuerpo: { nombreUsuario, contrasena } })
}

export function cerrarSesion(motivo) {
  return solicitar('/auth/logout', { metodo: 'POST', cuerpo: { motivo } })
}

export function cambiarContrasena({ contrasenaActual, contrasenaNueva }) {
  return solicitar('/auth/contrasena', { metodo: 'POST', cuerpo: { contrasenaActual, contrasenaNueva } })
}

// La cuenta de la sesión con los datos de su empleado y su lugar de trabajo (Mi perfil).
export function obtenerPerfil() {
  return solicitar('/auth/yo')
}
