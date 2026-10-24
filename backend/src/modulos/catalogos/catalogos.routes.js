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
router.get('/vacunas', autenticar, requierePermiso('VACUNA_CONSULTAR'), catalogosController.listarVacunas);
router.post('/vacunas', autenticar, requierePermiso('VACUNA_CREAR'), catalogosController.crearVacuna);
router.get('/vacunas/:id', autenticar, requierePermiso('VACUNA_CONSULTAR'), catalogosController.obtenerVacuna);
router.patch('/vacunas/:id', autenticar, requierePermiso('VACUNA_EDITAR'), catalogosController.editarVacuna);
router.post(
  '/vacunas/:id/desactivar',
  autenticar,
  requierePermiso('VACUNA_EDITAR'),
  catalogosController.desactivarVacuna,
);
router.post(
  '/vacunas/:id/reactivar',
  autenticar,
  requierePermiso('VACUNA_EDITAR'),
  catalogosController.reactivarVacuna,
);
router.post('/vacunas/:id/dosis', autenticar, requierePermiso('VACUNA_EDITAR'), catalogosController.agregarDosis);
router.patch(
  '/vacunas/:id/dosis/:dosisId',
  autenticar,
  requierePermiso('VACUNA_EDITAR'),
  catalogosController.editarDosis,
);
router.post(
  '/vacunas/:id/dosis/:dosisId/desactivar',
  autenticar,
  requierePermiso('VACUNA_EDITAR'),
  catalogosController.desactivarDosis,
);
router.post(
  '/vacunas/:id/dosis/:dosisId/reactivar',
  autenticar,
  requierePermiso('VACUNA_EDITAR'),
  catalogosController.reactivarDosis,
);
router.get('/periodos', autenticar, requierePermiso('PERIODO_CONSULTAR'), catalogosController.listarPeriodos);
router.post('/periodos', autenticar, requierePermiso('PERIODO_CREAR'), catalogosController.crearAnioPeriodos);
router.patch('/periodos/:id', autenticar, requierePermiso('PERIODO_EDITAR'), catalogosController.cambiarFechaLimite);
router.post('/periodos/:id/abrir', autenticar, requierePermiso('PERIODO_EDITAR'), catalogosController.abrirPeriodo);
router.get(
  '/poblaciones-objetivo',
  autenticar,
  requierePermiso('POBLACION_CONSULTAR'),
  catalogosController.consultarPoblacion,
);
router.put(
  '/poblaciones-objetivo/:municipioId/:anio',
  autenticar,
  requierePermiso('POBLACION_REGISTRAR'),
  catalogosController.guardarPoblacion,
);

export default router;
