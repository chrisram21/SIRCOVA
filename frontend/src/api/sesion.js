const CLAVE = 'sircova.sesion'

// Solo se lee el payload para saber si el token venció; la firma la verifica la API.
function leerPayload(token) {
  const partes = token.split('.')
  if (partes.length !== 3) throw new Error('Token mal formado')
  const base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
  const bytes = Uint8Array.from(atob(base64), (caracter) => caracter.charCodeAt(0))
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function guardarSesion(sesion) {
  sessionStorage.setItem(CLAVE, JSON.stringify(sesion))
}

export function borrarSesion() {
  sessionStorage.removeItem(CLAVE)
}

export function leerSesion() {
  const texto = sessionStorage.getItem(CLAVE)
  if (!texto) return null

  try {
    const sesion = JSON.parse(texto)
    if (typeof sesion?.token !== 'string' || typeof sesion.usuario !== 'object' || !sesion.usuario) {
      throw new Error('Sesión mal formada')
    }
    const { exp } = leerPayload(sesion.token)
    if (typeof exp !== 'number' || exp * 1000 <= Date.now()) throw new Error('Sesión vencida')
    return sesion
  } catch {
    borrarSesion()
    return null
  }
}
