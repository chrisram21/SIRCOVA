import * as dimensionesService from './dimensiones.service.js';
import * as esquemasService from './esquemas.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function listarDimensiones(req, res) {
  res.json(await dimensionesService.listarDimensiones(req.query));
}

export async function obtenerDimension(req, res) {
  res.json(await dimensionesService.obtenerDimension(req.params.codigo));
}

export async function crearDimension(req, res) {
  res.status(201).json(await dimensionesService.crearDimension(req.body, contextoAuditoria(req)));
}

export async function editarDimension(req, res) {
  res.json(await dimensionesService.editarDimension(req.params.codigo, req.body, contextoAuditoria(req)));
}

export async function desactivarDimension(req, res) {
  res.json(await dimensionesService.desactivarDimension(req.params.codigo, contextoAuditoria(req)));
}

export async function reactivarDimension(req, res) {
  res.json(await dimensionesService.reactivarDimension(req.params.codigo, contextoAuditoria(req)));
}

export async function agregarValor(req, res) {
  res.status(201).json(await dimensionesService.agregarValor(req.params.codigo, req.body, contextoAuditoria(req)));
}

export async function editarValor(req, res) {
  const { codigo, valor } = req.params;
  res.json(await dimensionesService.editarValor(codigo, valor, req.body, contextoAuditoria(req)));
}

export async function ordenarValores(req, res) {
  res.json(await dimensionesService.ordenarValores(req.params.codigo, req.body, contextoAuditoria(req)));
}

export async function desactivarValor(req, res) {
  res.json(await dimensionesService.desactivarValor(req.params.codigo, req.params.valor, contextoAuditoria(req)));
}

export async function reactivarValor(req, res) {
  res.json(await dimensionesService.reactivarValor(req.params.codigo, req.params.valor, contextoAuditoria(req)));
}

export async function listarEsquemas(req, res) {
  res.json(await esquemasService.listarEsquemas(req.query, req.usuario));
}

export async function historialEsquemas(req, res) {
  res.json(await esquemasService.historialEsquemas(req.query, req.usuario));
}

export async function obtenerEsquema(req, res) {
  res.json(await esquemasService.obtenerEsquema(req.params.id, req.usuario));
}

export async function crearEsquema(req, res) {
  res.status(201).json(await esquemasService.crearEsquema(req.body, contextoAuditoria(req), req.usuario));
}

export async function editarEsquema(req, res) {
  res.json(await esquemasService.editarEsquema(req.params.id, req.body, contextoAuditoria(req), req.usuario));
}

export async function publicarEsquema(req, res) {
  res.json(await esquemasService.publicarEsquema(req.params.id, req.body, contextoAuditoria(req), req.usuario));
}

export async function descartarEsquema(req, res) {
  await esquemasService.descartarEsquema(req.params.id, contextoAuditoria(req), req.usuario);
  res.status(204).end();
}
