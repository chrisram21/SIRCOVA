import { Router } from 'express';
import * as informesController from './informes.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get(
  '/informes/opciones',
  autenticar,
  requierePermiso('INFORME_CONSULTAR'),
  informesController.opcionesDeInformes,
);
router.get(
  '/informes/produccion',
  autenticar,
  requierePermiso('INFORME_CONSULTAR'),
  informesController.informePorFila,
);
router.get(
  '/informes/produccion/excel',
  autenticar,
  requierePermiso('INFORME_CONSULTAR'),
  informesController.informeEnExcel,
);

export default router;
