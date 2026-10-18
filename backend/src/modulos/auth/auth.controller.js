import * as authService from './auth.service.js';

export async function login(req, res) {
  const sesion = await authService.iniciarSesion(req.body ?? {}, {
    ip: req.ip,
    agente: req.get('user-agent'),
  });
  res.json(sesion);
}
