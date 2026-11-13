import * as informesService from './informes.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function opcionesDeInformes(req, res) {
  res.json(await informesService.opcionesDeInformes(req.usuario, req.query));
}

export async function informePorFila(req, res) {
  res.json(await informesService.informePorFila(req.usuario, req.query));
}

export async function informeEnExcel(req, res) {
  const { bytes, nombre } = await informesService.exportarInformeExcel(req.usuario, req.query, contextoAuditoria(req));
  res.attachment(nombre);
  res.type('xlsx');
  res.send(bytes);
}
