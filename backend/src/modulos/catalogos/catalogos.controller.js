import * as catalogosService from './catalogos.service.js';
import * as distritosService from './distritos.service.js';
import * as establecimientosService from './establecimientos.service.js';
import * as vacunasService from './vacunas.service.js';
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

export async function listarVacunas(req, res) {
  res.json(await vacunasService.listarVacunas(req.query));
}

export async function obtenerVacuna(req, res) {
  res.json(await vacunasService.obtenerVacuna(req.params.id));
}

export async function crearVacuna(req, res) {
  res.status(201).json(await vacunasService.crearVacuna(req.body, contextoAuditoria(req)));
}

export async function editarVacuna(req, res) {
  res.json(await vacunasService.editarVacuna(req.params.id, req.body, contextoAuditoria(req)));
}

export async function desactivarVacuna(req, res) {
  res.json(await vacunasService.desactivarVacuna(req.params.id, contextoAuditoria(req)));
}

export async function reactivarVacuna(req, res) {
  res.json(await vacunasService.reactivarVacuna(req.params.id, contextoAuditoria(req)));
}

export async function agregarDosis(req, res) {
  res.status(201).json(await vacunasService.agregarDosis(req.params.id, req.body, contextoAuditoria(req)));
}

export async function editarDosis(req, res) {
  res.json(
    await vacunasService.editarDosis(req.params.id, req.params.dosisId, req.body, contextoAuditoria(req)),
  );
}

export async function desactivarDosis(req, res) {
  res.json(await vacunasService.desactivarDosis(req.params.id, req.params.dosisId, contextoAuditoria(req)));
}

export async function reactivarDosis(req, res) {
  res.json(await vacunasService.reactivarDosis(req.params.id, req.params.dosisId, contextoAuditoria(req)));
}
