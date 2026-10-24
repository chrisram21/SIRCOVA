import { Router } from 'express';
import * as configuracionController from './configuracion.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get(
  '/dimensiones',
  autenticar,
  requierePermiso('DIMENSION_CONSULTAR'),
  configuracionController.listarDimensiones,
);
router.get(
  '/dimensiones/:codigo',
  autenticar,
  requierePermiso('DIMENSION_CONSULTAR'),
  configuracionController.obtenerDimension,
);
router.post('/dimensiones', autenticar, requierePermiso('DIMENSION_CREAR'), configuracionController.crearDimension);
router.patch(
  '/dimensiones/:codigo',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.editarDimension,
);
router.post(
  '/dimensiones/:codigo/desactivar',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.desactivarDimension,
);
router.post(
  '/dimensiones/:codigo/reactivar',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.reactivarDimension,
);
router.post(
  '/dimensiones/:codigo/valores',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.agregarValor,
);
router.put(
  '/dimensiones/:codigo/valores/orden',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.ordenarValores,
);
router.patch(
  '/dimensiones/:codigo/valores/:valor',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.editarValor,
);
router.post(
  '/dimensiones/:codigo/valores/:valor/desactivar',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.desactivarValor,
);
router.post(
  '/dimensiones/:codigo/valores/:valor/reactivar',
  autenticar,
  requierePermiso('DIMENSION_EDITAR'),
  configuracionController.reactivarValor,
);

export default router;
