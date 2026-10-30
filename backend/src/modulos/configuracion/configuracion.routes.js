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
router.get(
  '/esquemas-captura',
  autenticar,
  requierePermiso('ESQUEMA_CONSULTAR'),
  configuracionController.listarEsquemas,
);
router.post('/esquemas-captura', autenticar, requierePermiso('ESQUEMA_CREAR'), configuracionController.crearEsquema);
// Antes de /:id, para que "historial" no se tome como un id.
router.get(
  '/esquemas-captura/historial',
  autenticar,
  requierePermiso('ESQUEMA_CONSULTAR'),
  configuracionController.historialEsquemas,
);
router.get(
  '/esquemas-captura/:id',
  autenticar,
  requierePermiso('ESQUEMA_CONSULTAR'),
  configuracionController.obtenerEsquema,
);
router.put(
  '/esquemas-captura/:id',
  autenticar,
  requierePermiso('ESQUEMA_EDITAR'),
  configuracionController.editarEsquema,
);
router.delete(
  '/esquemas-captura/:id',
  autenticar,
  requierePermiso('ESQUEMA_EDITAR'),
  configuracionController.descartarEsquema,
);
router.post(
  '/esquemas-captura/:id/publicar',
  autenticar,
  requierePermiso('ESQUEMA_PUBLICAR'),
  configuracionController.publicarEsquema,
);
router.get(
  '/reglas-validacion',
  autenticar,
  requierePermiso('REGLA_CONSULTAR'),
  configuracionController.listarReglas,
);
router.post('/reglas-validacion', autenticar, requierePermiso('REGLA_CREAR'), configuracionController.crearRegla);
router.post(
  '/reglas-validacion/:codigo/versiones',
  autenticar,
  requierePermiso('REGLA_EDITAR'),
  configuracionController.publicarVersionRegla,
);
router.get(
  '/reglas-validacion/:codigo/historial',
  autenticar,
  requierePermiso('REGLA_CONSULTAR'),
  configuracionController.historialRegla,
);

export default router;
