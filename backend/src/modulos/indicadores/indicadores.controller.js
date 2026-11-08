import * as corridasService from './corridas.service.js';

export async function crearCorrida(req, res) {
  res.status(201).json(await corridasService.crearCorrida(req.body, req));
}

export async function listarCorridas(req, res) {
  res.json(await corridasService.listarCorridas(req.usuario, req.query));
}

export async function obtenerCorrida(req, res) {
  res.json(await corridasService.obtenerCorrida(req.params.id, req.usuario));
}

export async function resultadosVigentes(req, res) {
  res.json(await corridasService.resultadosVigentes(req.usuario, req.query));
}

export async function serieDelIndicador(req, res) {
  res.json(await corridasService.serieDelIndicador(req.usuario, req.query));
}

export async function mesesCalculados(req, res) {
  res.json(await corridasService.mesesCalculados(req.usuario, req.query));
}
