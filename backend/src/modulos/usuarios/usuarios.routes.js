import { Router } from 'express';
import * as usuariosController from './usuarios.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.get('/roles', autenticar, requierePermiso('ROL_CONSULTAR'), usuariosController.listarRoles);

export default router;
