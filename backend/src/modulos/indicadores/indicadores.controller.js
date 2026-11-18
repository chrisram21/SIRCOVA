import * as corridasService from './corridas.service.js';
import * as exportacionService from './exportacion.service.js';
import * as produccionService from './produccion.service.js';
import { contextoAuditoria } from '../auditoria/auditoria.service.js';

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

export async function opcionesDeProduccion(req, res) {
  res.json(await produccionService.opcionesDeProduccion(req.usuario, req.query));
}

export async function produccionPorFila(req, res) {
  res.json(await produccionService.produccionPorFila(req.usuario, req.query));
}

// SPEC 72: el nombre del archivo viaja en Content-Disposition (cors lo expone desde el SPEC 64).
const enExcel = (exportar) => async (req, res) => {
  const { bytes, nombre } = await exportar(req.usuario, req.query, contextoAuditoria(req));
  res.attachment(nombre);
  res.type('xlsx');
  res.send(bytes);
};

export const resultadosEnExcel = enExcel(exportacionService.exportarResultados);
export const produccionEnExcel = enExcel(exportacionService.exportarProduccion);
