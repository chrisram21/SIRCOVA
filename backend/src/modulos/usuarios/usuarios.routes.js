import { Router } from 'express';
import * as usuariosController from './usuarios.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';
import { requierePermiso } from '../../middlewares/permisos.js';

const router = Router();

router.post('/empleados', autenticar, requierePermiso('EMPLEADO_CREAR'), usuariosController.registrarEmpleado);
router.patch('/empleados/:id', autenticar, requierePermiso('EMPLEADO_EDITAR'), usuariosController.editarEmpleado);
router.get('/usuarios', autenticar, requierePermiso('USUARIO_CONSULTAR'), usuariosController.listarUsuarios);
router.post('/usuarios', autenticar, requierePermiso('USUARIO_CREAR'), usuariosController.crearCuenta);
router.get('/usuarios/:id', autenticar, requierePermiso('USUARIO_CONSULTAR'), usuariosController.obtenerUsuario);
router.patch('/usuarios/:id', autenticar, requierePermiso('USUARIO_EDITAR'), usuariosController.cambiarRol);
router.post('/usuarios/:id/desactivar', autenticar, requierePermiso('USUARIO_DESACTIVAR'), usuariosController.desactivarCuenta);
router.post('/usuarios/:id/restaurar', autenticar, requierePermiso('USUARIO_DESACTIVAR'), usuariosController.restaurarCuenta);
router.get('/roles', autenticar, requierePermiso('ROL_CONSULTAR'), usuariosController.listarRoles);

export default router;
