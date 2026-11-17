import * as alertasService from './alertas.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function listarAlertas(req, res) {
  res.json(await alertasService.listarAlertas(req.usuario, req.query));
}

export async function atenderAlerta(req, res) {
  res.json(await alertasService.atenderAlerta(req.usuario, req.params.id, req.body, contextoAuditoria(req)));
}
