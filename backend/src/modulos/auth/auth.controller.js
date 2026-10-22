import * as authService from './auth.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function login(req, res) {
  const sesion = await authService.iniciarSesion(req.body ?? {}, contextoAuditoria(req));
  res.json(sesion);
}

export async function logout(req, res) {
  await authService.cerrarSesion(req.usuario, req.body ?? {}, contextoAuditoria(req));
  res.status(204).end();
}

export async function cambiarContrasena(req, res) {
  await authService.cambiarContrasena(req.usuario, req.body ?? {}, contextoAuditoria(req));
  res.status(204).end();
}
