import * as reportesService from './reportes.service.js';
import * as capturaService from './captura.service.js';
import * as vacunasDelReporteService from './vacunasDelReporte.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

export async function listarReportes(req, res) {
  res.json(await reportesService.listarReportes(req.usuario, req.query));
}

export async function crearReporte(req, res) {
  res.status(201).json(await reportesService.crearReporte(req.body, req.usuario, contextoAuditoria(req)));
}

export async function obtenerReporte(req, res) {
  res.json(await reportesService.obtenerReporte(req.params.id, req.usuario));
}

export async function obtenerFormulario(req, res) {
  res.json(await capturaService.obtenerFormulario(req.params.id, req.usuario));
}

export async function guardarVacuna(req, res) {
  res.json(
    await capturaService.guardarVacuna(req.params.id, req.params.vacunaId, req.body, req.usuario, contextoAuditoria(req)),
  );
}

export async function listarVacunasDisponibles(req, res) {
  res.json(await vacunasDelReporteService.listarDisponibles(req.params.id, req.usuario));
}

export async function agregarVacuna(req, res) {
  res.status(201).json(await vacunasDelReporteService.agregarVacuna(req.params.id, req.body, req.usuario, contextoAuditoria(req)));
}

export async function quitarVacuna(req, res) {
  res.json(
    await vacunasDelReporteService.quitarVacuna(
      req.params.id,
      req.params.vacunaId,
      req.query,
      req.usuario,
      contextoAuditoria(req),
    ),
  );
}
