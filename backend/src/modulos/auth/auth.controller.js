import * as authService from './auth.service.js';

const contextoDe = (req) => ({ ip: req.ip, agente: req.get('user-agent') });

export async function login(req, res) {
  const sesion = await authService.iniciarSesion(req.body ?? {}, contextoDe(req));
  res.json(sesion);
}

export async function logout(req, res) {
  await authService.cerrarSesion(req.usuario, req.body ?? {}, contextoDe(req));
  res.status(204).end();
}
