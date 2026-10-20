import { solicitar } from './cliente.js'

export function iniciarSesion(nombreUsuario, contrasena) {
  return solicitar('/auth/login', { metodo: 'POST', cuerpo: { nombreUsuario, contrasena } })
}
