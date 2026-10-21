import * as usuariosService from './usuarios.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function registrarEmpleado(req, res) {
  const empleado = await usuariosService.registrarEmpleado(req.body, req.usuario, contextoAuditoria(req));
  res.status(201).json(empleado);
}

export async function listarRoles(req, res) {
  res.json(await usuariosService.listarRoles());
}
