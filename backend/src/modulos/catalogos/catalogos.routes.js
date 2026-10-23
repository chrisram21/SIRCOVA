import { Router } from 'express';
import * as catalogosController from './catalogos.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get('/ddriss', autenticar, requierePermiso('DDRISS_CONSULTAR'), catalogosController.listarDdriss);
router.get('/municipios', autenticar, requierePermiso('MUNICIPIO_CONSULTAR'), catalogosController.listarMunicipios);
router.get('/distritos', autenticar, requierePermiso('DISTRITO_CONSULTAR'), catalogosController.listarDistritos);
router.post('/distritos', autenticar, requierePermiso('DISTRITO_CREAR'), catalogosController.crearDistrito);
router.patch('/distritos/:id', autenticar, requierePermiso('DISTRITO_EDITAR'), catalogosController.renombrarDistrito);
router.post(
  '/distritos/:id/desactivar',
  autenticar,
  requierePermiso('DISTRITO_EDITAR'),
  catalogosController.desactivarDistrito,
);
router.post(
  '/distritos/:id/reactivar',
  autenticar,
  requierePermiso('DISTRITO_EDITAR'),
  catalogosController.reactivarDistrito,
);
router.get(
  '/establecimientos',
  autenticar,
  requierePermiso('ESTABLECIMIENTO_CONSULTAR'),
  catalogosController.listarEstablecimientos,
);
router.post(
  '/establecimientos',
  autenticar,
  requierePermiso('ESTABLECIMIENTO_CREAR'),
  catalogosController.crearEstablecimiento,
);
router.get(
  '/establecimientos/:id',
  autenticar,
  requierePermiso('ESTABLECIMIENTO_CONSULTAR'),
  catalogosController.obtenerEstablecimiento,
);
router.patch(
  '/establecimientos/:id',
  autenticar,
  requierePermiso('ESTABLECIMIENTO_EDITAR'),
  catalogosController.editarEstablecimiento,
);
router.post(
  '/establecimientos/:id/desactivar',
  autenticar,
  requierePermiso('ESTABLECIMIENTO_EDITAR'),
  catalogosController.desactivarEstablecimiento,
);
router.post(
  '/establecimientos/:id/reactivar',
  autenticar,
  requierePermiso('ESTABLECIMIENTO_EDITAR'),
  catalogosController.reactivarEstablecimiento,
);
router.get(
  '/tipos-establecimiento',
  autenticar,
  requierePermiso('TIPO_ESTABLECIMIENTO_CONSULTAR'),
  catalogosController.listarTiposEstablecimiento,
);

export default router;
