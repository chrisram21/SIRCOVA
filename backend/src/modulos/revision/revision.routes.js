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

export default router;
