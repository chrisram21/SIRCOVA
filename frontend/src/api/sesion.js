// En memoria y no en sessionStorage, donde cualquier script de la página lo lee. Lo que dura toda la jornada es el
// refresh token, en una cookie HttpOnly que el frontend no ve: con ella se recupera la sesión al recargar.
let sesion = null

// La versión anterior guardaba la sesión aquí; se borra la que haya quedado.
try {
  sessionStorage.removeItem('sircova.sesion')
} catch {
  // Sin acceso a sessionStorage no hay nada que borrar.
}

// Solo se lee el payload para saber cuándo vence el token y de qué sesión es; la firma la verifica la API.
function leerPayload(token) {
  const partes = token.split('.')
  if (partes.length !== 3) throw new Error('Token mal formado')
  const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

// Vencimiento del token en milisegundos, o null si el token está mal formado.
export function leerVencimiento(token) {
  try {
    const { exp } = leerPayload(token)
    return typeof exp === 'number' ? exp * 1000 : null
  } catch {
    return null
  }
}

// Id de la sesión del servidor (sid) del token guardado; no cambia al renovar el token.
export function leerSid() {
  if (!sesion) return null
  try {
    return leerPayload(sesion.token).sid ?? null
  } catch {
    return null
  }
}

export function leerTokenGuardado() {
  return sesion?.token ?? null
}

export function guardarSesion(nueva) {
  sesion = nueva
}

export function borrarSesion() {
  sesion = null
}

// Un token vencido no se descarta: la API responde SESION_VENCIDA y el cliente lo renueva.
export function leerSesion() {
  return sesion
}
