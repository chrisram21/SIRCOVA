import { Router } from 'express';
import * as revisionController from './revision.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get('/revision/bandeja', autenticar, requierePermiso('REPORTE_REVISAR'), revisionController.obtenerBandeja);
router.get('/revision/revisores', autenticar, requierePermiso('REPORTE_REVISAR'), revisionController.listarRevisores);
// El permiso depende de estadoDestino: lo revisa el servicio (PERMISO_POR_DESTINO).
router.post('/reportes/:id/transiciones', autenticar, revisionController.cambiarEstado);
// REPORTE_ASIGNAR lo revisa el servicio, después del cuerpo, como en las transiciones.
router.patch('/reportes/:id/revisor', autenticar, revisionController.reasignarRevisor);
router.post('/periodos/:id/cerrar', autenticar, requierePermiso('PERIODO_CERRAR'), revisionController.cerrarPeriodo);
router.post(
  '/reportes/:id/rectificaciones',
  autenticar,
  requierePermiso('RECTIFICACION_SOLICITAR'),
  revisionController.solicitarRectificacion,
);
router.get(
  '/rectificaciones',
  autenticar,
  requierePermiso('RECTIFICACION_CONSULTAR'),
  revisionController.listarRectificaciones,
);
router.get(
  '/rectificaciones/:id',
  autenticar,
  requierePermiso('RECTIFICACION_CONSULTAR'),
  revisionController.obtenerRectificacion,
);
router.post(
  '/rectificaciones/:id/aprobar',
  autenticar,
  requierePermiso('RECTIFICACION_RESOLVER'),
  revisionController.aprobarRectificacion,
);
router.post(
  '/rectificaciones/:id/rechazar',
  autenticar,
  requierePermiso('RECTIFICACION_RESOLVER'),
  revisionController.rechazarRectificacion,
);

export default router;
