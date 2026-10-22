import { Router } from 'express';
import * as authController from './auth.controller.js';
import { autenticarSinExigirCambio } from '../../middlewares/autenticar.js';

const router = Router();

router.post('/login', authController.login);
router.post('/logout', autenticarSinExigirCambio, authController.logout);
router.post('/contrasena', autenticarSinExigirCambio, authController.cambiarContrasena);

export default router;
