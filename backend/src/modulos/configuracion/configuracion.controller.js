import * as dimensionesService from './dimensiones.service.js';
import * as esquemasService from './esquemas.service.js';
import * as indicadoresService from './indicadores.service.js';
import * as reglasService from './reglas.service.js';
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

export async function listarReglas(req, res) {
  res.json(await reglasService.listarReglas(req.query, req.usuario));
}

export async function crearRegla(req, res) {
  res.status(201).json(await reglasService.crearRegla(req.body, contextoAuditoria(req), req.usuario));
}

export async function publicarVersionRegla(req, res) {
  const { codigo } = req.params;
  res.status(201).json(await reglasService.publicarVersionRegla(codigo, req.body, contextoAuditoria(req), req.usuario));
}

export async function desactivarRegla(req, res) {
  res.json(await reglasService.desactivarRegla(req.params.codigo, req.body, contextoAuditoria(req), req.usuario));
}

export async function activarRegla(req, res) {
  const { codigo } = req.params;
  res.status(201).json(await reglasService.activarRegla(codigo, req.body, contextoAuditoria(req), req.usuario));
}

export async function historialRegla(req, res) {
  res.json(await reglasService.historialRegla(req.params.codigo, req.query, req.usuario));
}

export async function listarConfigIndicadores(req, res) {
  res.json(await indicadoresService.listarConfigIndicadores(req.query, req.usuario));
}

export async function opcionesIndicadores(req, res) {
  res.json(await indicadoresService.opcionesIndicadores(req.query));
}

export async function historialIndicador(req, res) {
  res.json(await indicadoresService.historialIndicador(req.params.codigo, req.query, req.usuario));
}

// El 409 INDICADOR_DUPLICADO lleva codigoExistente junto al error, como RECTIFICACION_PENDIENTE (SPEC 40).
function responderIndicador(res, status, { indicador, duplicado }) {
  if (duplicado) {
    return res.status(409).json({
      error: { codigo: 'INDICADOR_DUPLICADO', mensaje: indicadoresService.mensajeDuplicado(duplicado) },
      codigoExistente: duplicado,
    });
  }
  res.status(status).json(indicador);
}

export async function crearIndicador(req, res) {
  responderIndicador(res, 201, await indicadoresService.crearIndicador(req.body, contextoAuditoria(req), req.usuario));
}

export async function publicarVersionIndicador(req, res) {
  const { codigo } = req.params;
  const resultado = await indicadoresService.publicarVersionIndicador(
    codigo,
    req.body,
    contextoAuditoria(req),
    req.usuario,
  );
  responderIndicador(res, 201, resultado);
}

export async function desactivarIndicador(req, res) {
  const { codigo } = req.params;
  res.json(await indicadoresService.desactivarIndicador(codigo, req.body, contextoAuditoria(req), req.usuario));
}

export async function activarIndicador(req, res) {
  const { codigo } = req.params;
  responderIndicador(
    res,
    201,
    await indicadoresService.activarIndicador(codigo, req.body, contextoAuditoria(req), req.usuario),
  );
}
