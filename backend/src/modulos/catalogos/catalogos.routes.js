import { Router } from 'express';
import * as catalogosController from './catalogos.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get('/ddriss', autenticar, requierePermiso('DDRISS_CONSULTAR'), catalogosController.listarDdriss);
router.get('/municipios', autenticar, requierePermiso('MUNICIPIO_CONSULTAR'), catalogosController.listarMunicipios);
router.get(
  '/establecimientos',
  autenticar,
  requierePermiso('ESTABLECIMIENTO_CONSULTAR'),
  catalogosController.listarEstablecimientos,
);

export default router;
