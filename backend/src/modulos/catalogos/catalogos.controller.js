import * as catalogosService from './catalogos.service.js';
import * as distritosService from './distritos.service.js';
import * as establecimientosService from './establecimientos.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function listarDdriss(req, res) {
  res.json(await catalogosService.listarDdriss(req.usuario));
}

export async function listarMunicipios(req, res) {
  res.json(await catalogosService.listarMunicipios(req.usuario, req.query));
}

export async function listarDistritos(req, res) {
  res.json(await distritosService.listarDistritos(req.usuario, req.query));
}

export async function crearDistrito(req, res) {
  const distrito = await distritosService.crearDistrito(req.body, req.usuario, contextoAuditoria(req));
  res.status(201).json(distrito);
}

export async function renombrarDistrito(req, res) {
  res.json(await distritosService.renombrarDistrito(req.params.id, req.body, req.usuario, contextoAuditoria(req)));
}

export async function desactivarDistrito(req, res) {
  res.json(await distritosService.desactivarDistrito(req.params.id, req.usuario, contextoAuditoria(req)));
}

export async function reactivarDistrito(req, res) {
  res.json(await distritosService.reactivarDistrito(req.params.id, req.usuario, contextoAuditoria(req)));
}

export async function listarEstablecimientos(req, res) {
  res.json(await establecimientosService.listarEstablecimientos(req.usuario, req.query));
}

export async function crearEstablecimiento(req, res) {
  const establecimiento = await establecimientosService.crearEstablecimiento(req.body, req.usuario, contextoAuditoria(req));
  res.status(201).json(establecimiento);
}

export async function obtenerEstablecimiento(req, res) {
  res.json(await establecimientosService.obtenerEstablecimiento(req.params.id, req.usuario));
}

export async function editarEstablecimiento(req, res) {
  res.json(
    await establecimientosService.editarEstablecimiento(req.params.id, req.body, req.usuario, contextoAuditoria(req)),
  );
}

export async function desactivarEstablecimiento(req, res) {
  res.json(await establecimientosService.desactivarEstablecimiento(req.params.id, req.usuario, contextoAuditoria(req)));
}

export async function reactivarEstablecimiento(req, res) {
  res.json(await establecimientosService.reactivarEstablecimiento(req.params.id, req.usuario, contextoAuditoria(req)));
}

export async function listarTiposEstablecimiento(req, res) {
  res.json(await establecimientosService.listarTiposEstablecimiento(req.query));
}
