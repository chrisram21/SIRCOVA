import * as alertasService from './alertas.service.js';

export async function listarAlertas(req, res) {
  res.json(await alertasService.listarAlertas(req.usuario, req.query));
}
