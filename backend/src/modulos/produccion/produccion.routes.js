import { Router } from 'express';
import * as produccionController from './produccion.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.post('/reportes', autenticar, requierePermiso('REPORTE_CREAR'), produccionController.crearReporte);
router.get('/reportes/:id', autenticar, requierePermiso('REPORTE_CONSULTAR'), produccionController.obtenerReporte);

export default router;
