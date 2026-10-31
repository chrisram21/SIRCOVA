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
