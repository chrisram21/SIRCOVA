import { Router } from 'express';
import * as indicadoresController from './indicadores.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.post('/indicadores/corridas', autenticar, requierePermiso('INDICADOR_CALCULAR'), indicadoresController.crearCorrida);
router.get('/indicadores/corridas', autenticar, requierePermiso('INDICADOR_CONSULTAR'), indicadoresController.listarCorridas);
router.get(
  '/indicadores/corridas/:id',
  autenticar,
  requierePermiso('INDICADOR_CONSULTAR'),
  indicadoresController.obtenerCorrida,
);
router.get(
  '/indicadores/resultados',
  autenticar,
  requierePermiso('INDICADOR_CONSULTAR'),
  indicadoresController.resultadosVigentes,
);
router.get(
  '/indicadores/serie',
  autenticar,
  requierePermiso('INDICADOR_CONSULTAR'),
  indicadoresController.serieDelIndicador,
);
router.get(
  '/indicadores/meses-calculados',
  autenticar,
  requierePermiso('INDICADOR_CONSULTAR'),
  indicadoresController.mesesCalculados,
);

export default router;
