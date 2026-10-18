import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import entorno from './config/entorno.js';
import sistemaRoutes from './modulos/sistema/sistema.routes.js';
import authRoutes from './modulos/auth/auth.routes.js';
import { rutaNoEncontrada, manejarErrores } from './middlewares/errores.js';

const app = express();
const documentoOpenapi = YAML.parse(fs.readFileSync(entorno.rutaOpenapi, 'utf8'));

app.use(cors({ origin: entorno.corsOrigen }));
app.use(express.json());

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(documentoOpenapi));
app.use('/api/v1', sistemaRoutes);
app.use('/api/v1/auth', authRoutes);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;
