import { Router } from 'express';
import * as alertasController from './alertas.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get('/alertas', autenticar, requierePermiso('ALERTA_CONSULTAR'), alertasController.listarAlertas);
router.post('/alertas/:id/atender', autenticar, requierePermiso('ALERTA_ATENDER'), alertasController.atenderAlerta);

export default router;
