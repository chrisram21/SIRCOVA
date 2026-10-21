import * as catalogosService from './catalogos.service.js';

export async function listarDdriss(req, res) {
  res.json(await catalogosService.listarDdriss(req.usuario));
}

export async function listarMunicipios(req, res) {
  res.json(await catalogosService.listarMunicipios(req.usuario));
}

export async function listarEstablecimientos(req, res) {
  res.json(await catalogosService.listarEstablecimientos(req.usuario, req.query));
}
