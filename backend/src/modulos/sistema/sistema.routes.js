import { Router } from 'express';
import * as sistemaController from './sistema.controller.js';

const router = Router();

router.get('/salud', sistemaController.salud);

export default router;
