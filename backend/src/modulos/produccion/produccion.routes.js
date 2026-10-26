import { Router } from 'express';
import * as produccionController from './produccion.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get('/reportes', autenticar, requierePermiso('REPORTE_CONSULTAR'), produccionController.listarReportes);
router.post('/reportes', autenticar, requierePermiso('REPORTE_CREAR'), produccionController.crearReporte);
router.get('/reportes/:id', autenticar, requierePermiso('REPORTE_CONSULTAR'), produccionController.obtenerReporte);
router.get(
  '/reportes/:id/formulario',
  autenticar,
  requierePermiso('REPORTE_CONSULTAR'),
  produccionController.obtenerFormulario,
);
router.put(
  '/reportes/:id/vacunas/:vacunaId',
  autenticar,
  requierePermiso('REPORTE_EDITAR'),
  produccionController.guardarVacuna,
);

export default router;
