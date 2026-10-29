import { Router } from 'express';
import * as authController from './auth.controller.js';
import { autenticarSinExigirCambio, identificarSesionParaCierre } from '../../middlewares/autenticar.js';

const router = Router();

router.post('/login', authController.login);
router.post('/refrescar', authController.refrescar);
router.post('/logout', identificarSesionParaCierre, authController.logout);
router.post('/contrasena', autenticarSinExigirCambio, authController.cambiarContrasena);
router.get('/yo', autenticarSinExigirCambio, authController.perfil);

export default router;
