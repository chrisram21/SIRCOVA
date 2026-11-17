import * as bitacoraService from './bitacora.service.js';
import { contextoAuditoria } from './auditoria.service.js';

export async function listarBitacora(req, res) {
  res.json(await bitacoraService.listarBitacora(req.usuario, req.query));
}

export async function opcionesBitacora(req, res) {
  res.json(await bitacoraService.opcionesBitacora(req.usuario, req.query));
}

export async function bitacoraEnExcel(req, res) {
  const { bytes, nombre } = await bitacoraService.exportarBitacora(req.usuario, req.query, contextoAuditoria(req));
  res.attachment(nombre);
  res.type('xlsx');
  res.send(bytes);
}
