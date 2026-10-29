// Solo viaja a /api/v1/auth (login, refrescar y logout) y el JavaScript de la página no la puede leer.
const NOMBRE = 'sircova_refresh';
const OPCIONES = { httpOnly: true, secure: true, sameSite: 'strict', path: '/api/v1/auth' };

// Sin cookie-parser (no está en las dependencias permitidas): basta con buscar una sola cookie.
export function leerCookieRefresh(req) {
  for (const parte of (req.get('cookie') ?? '').split(';')) {
    const separador = parte.indexOf('=');
    if (separador === -1 || parte.slice(0, separador).trim() !== NOMBRE) continue;
    const valor = parte.slice(separador + 1).trim();
    return valor === '' ? null : valor;
  }
  return null;
}

export function ponerCookieRefresh(res, refreshToken, segundosRestantes) {
  res.cookie(NOMBRE, refreshToken, { ...OPCIONES, maxAge: segundosRestantes * 1000 });
}

export function borrarCookieRefresh(res) {
  res.cookie(NOMBRE, '', { ...OPCIONES, maxAge: 0 });
}
