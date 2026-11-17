import { Router } from 'express';
import * as auditoriaController from './auditoria.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

const consultar = [autenticar, requierePermiso('BITACORA_CONSULTAR')];

router.get('/auditoria/bitacora', ...consultar, auditoriaController.listarBitacora);
router.get('/auditoria/bitacora/opciones', ...consultar, auditoriaController.opcionesBitacora);
router.get('/auditoria/bitacora/excel', ...consultar, auditoriaController.bitacoraEnExcel);

export default router;
