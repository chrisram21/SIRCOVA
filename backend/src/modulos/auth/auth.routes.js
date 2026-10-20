import { Router } from 'express';
import * as authController from './auth.controller.js';
import { autenticar } from '../../middlewares/autenticar.js';

const router = Router();

router.post('/login', authController.login);
router.post('/logout', autenticar, authController.logout);

export default router;
