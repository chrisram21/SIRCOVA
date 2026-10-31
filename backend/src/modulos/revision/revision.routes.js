import { Router } from 'express';
import * as revisionController from './revision.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';

const router = Router();

// El permiso depende de estadoDestino: lo revisa el servicio (PERMISO_POR_DESTINO).
router.post('/reportes/:id/transiciones', autenticar, revisionController.cambiarEstado);

export default router;
