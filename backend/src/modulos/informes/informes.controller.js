import * as informesService from './informes.service.js';

export async function opcionesDeInformes(req, res) {
  res.json(await informesService.opcionesDeInformes(req.usuario, req.query));
}

export async function informePorFila(req, res) {
  res.json(await informesService.informePorFila(req.usuario, req.query));
}
