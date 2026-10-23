import * as usuariosService from './usuarios.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function registrarEmpleado(req, res) {
  const empleado = await usuariosService.registrarEmpleado(req.body, req.usuario, contextoAuditoria(req));
  res.status(201).json(empleado);
}

export async function editarEmpleado(req, res) {
  res.json(await usuariosService.editarEmpleado(req.params.id, req.body, req.usuario, contextoAuditoria(req)));
}

export async function crearCuenta(req, res) {
  const usuario = await usuariosService.crearCuenta(req.body, req.usuario, contextoAuditoria(req));
  res.status(201).json(usuario);
}

export async function listarRoles(req, res) {
  res.json(await usuariosService.listarRoles());
}

export async function listarUsuarios(req, res) {
  res.json(await usuariosService.listarUsuarios(req.usuario, req.query));
}

export async function obtenerUsuario(req, res) {
  res.json(await usuariosService.obtenerUsuario(req.params.id, req.usuario));
}

export async function cambiarRol(req, res) {
  res.json(await usuariosService.cambiarRol(req.params.id, req.body, req.usuario, contextoAuditoria(req)));
}

export async function desactivarCuenta(req, res) {
  res.json(await usuariosService.desactivarCuenta(req.params.id, req.usuario, contextoAuditoria(req)));
}

export async function restaurarCuenta(req, res) {
  res.json(await usuariosService.restaurarCuenta(req.params.id, req.usuario, contextoAuditoria(req)));
}

export async function restablecerContrasena(req, res) {
  res.json(await usuariosService.restablecerContrasena(req.params.id, req.usuario, contextoAuditoria(req)));
}

export async function desbloquearCuenta(req, res) {
  res.json(await usuariosService.desbloquearCuenta(req.params.id, req.usuario, contextoAuditoria(req)));
}
