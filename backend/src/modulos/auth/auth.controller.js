import * as authService from './auth.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';
import { leerCookieRefresh, ponerCookieRefresh, borrarCookieRefresh } from './cookieRefresh.js';

export async function login(req, res) {
  const { respuesta, refresh } = await authService.iniciarSesion(req.body ?? {}, contextoAuditoria(req));
  ponerCookieRefresh(res, refresh.token, refresh.segundosRestantes);
  res.json(respuesta);
}

// Un 401 borra la cookie: ya no sirve para renovar.
export async function refrescar(req, res) {
  let resultado;
  try {
    resultado = await authService.refrescarSesion(leerCookieRefresh(req));
  } catch (err) {
    if (err.status === 401) borrarCookieRefresh(res);
    throw err;
  }
  if (resultado.refresh) ponerCookieRefresh(res, resultado.refresh.token, resultado.refresh.segundosRestantes);
  res.json(resultado.respuesta);
}

export async function logout(req, res) {
  await authService.cerrarSesion(req.cierre, req.body ?? {}, contextoAuditoria(req));
  borrarCookieRefresh(res);
  res.status(204).end();
}

export async function cambiarContrasena(req, res) {
  await authService.cambiarContrasena(req.usuario, req.body ?? {}, contextoAuditoria(req));
  res.status(204).end();
}

export async function perfil(req, res) {
  res.json(await authService.obtenerPerfil(req.usuario));
}
