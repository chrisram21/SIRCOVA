import * as reportesService from './reportes.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function crearReporte(req, res) {
  res.status(201).json(await reportesService.crearReporte(req.body, req.usuario, contextoAuditoria(req)));
}

export async function obtenerReporte(req, res) {
  res.json(await reportesService.obtenerReporte(req.params.id, req.usuario));
}
