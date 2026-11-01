import * as bandejaService from './bandeja.service.js';
import * as cierreService from './cierre.service.js';
import * as reasignacionService from './reasignacion.service.js';
import * as rectificacionesService from './rectificaciones.service.js';
import * as transicionesService from './transiciones.service.js';

export async function cambiarEstado(req, res) {
  const { reporte, rechazo } = await transicionesService.cambiarEstado(req.params.id, req.body, req);
  if (rechazo) {
    return res.status(422).json({
      error: { codigo: 'REPORTE_CON_ERRORES', mensaje: rechazo.mensaje },
      validacion: rechazo.validacion,
    });
  }
  res.json(reporte);
}

export async function obtenerBandeja(req, res) {
  res.json(await bandejaService.obtenerBandeja(req.usuario, req.query));
}

export async function listarRevisores(req, res) {
  res.json(await bandejaService.listarRevisores(req.usuario, req.query));
}

export async function cerrarPeriodo(req, res) {
  const { periodo, pendientes } = await cierreService.cerrarPeriodo(req.params.id, req.body, req);
  if (pendientes) {
    return res.status(409).json({
      error: { codigo: 'PERIODO_CON_PENDIENTES', mensaje: cierreService.mensajePendientes(pendientes) },
      faltanPorAprobar: pendientes,
    });
  }
  res.json(periodo);
}

export async function reasignarRevisor(req, res) {
  res.json(await reasignacionService.reasignarRevisor(req.params.id, req.body, req));
}

export async function solicitarRectificacion(req, res) {
  const { solicitud, pendiente } = await rectificacionesService.solicitarRectificacion(req.params.id, req.body, req);
  if (pendiente) {
    return res.status(409).json({
      error: { codigo: 'RECTIFICACION_PENDIENTE', mensaje: rectificacionesService.mensajePendiente },
      solicitudId: pendiente,
    });
  }
  res.status(201).json(solicitud);
}

export async function listarRectificaciones(req, res) {
  res.json(await rectificacionesService.listarRectificaciones(req.usuario, req.query));
}

export async function obtenerRectificacion(req, res) {
  res.json(await rectificacionesService.obtenerRectificacion(req.params.id, req.usuario));
}
