import * as bandejaService from './bandeja.service.js';
import * as reasignacionService from './reasignacion.service.js';
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

export async function reasignarRevisor(req, res) {
  res.json(await reasignacionService.reasignarRevisor(req.params.id, req.body, req));
}
