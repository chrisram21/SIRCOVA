import * as informesService from './informes.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function opcionesDeInformes(req, res) {
  res.json(await informesService.opcionesDeInformes(req.usuario, req.query));
}

export async function informePorFila(req, res) {
  res.json(await informesService.informePorFila(req.usuario, req.query));
}

// formato: la extensión del archivo (xlsx o pdf); express pone su Content-Type.
const enArchivo = (formato) => async (req, res) => {
  const contexto = contextoAuditoria(req);
  const { bytes, nombre } = await informesService.exportarInforme(req.usuario, req.query, contexto, formato);
  res.attachment(nombre);
  res.type(formato);
  res.send(bytes);
};

export const informeEnExcel = enArchivo('xlsx');
export const informeEnPdf = enArchivo('pdf');
