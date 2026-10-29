import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';
import entorno from './config/entorno.js';
import sistemaRoutes from './modulos/sistema/sistema.routes.js';
import authRoutes from './modulos/auth/auth.routes.js';
import usuariosRoutes from './modulos/usuarios/usuarios.routes.js';
import catalogosRoutes from './modulos/catalogos/catalogos.routes.js';
import configuracionRoutes from './modulos/configuracion/configuracion.routes.js';
import produccionRoutes from './modulos/produccion/produccion.routes.js';
import { rutaNoEncontrada, manejarErrores } from './middlewares/errores.js';

const app = express();
const documentoOpenapi = YAML.parse(fs.readFileSync(entorno.rutaOpenapi, 'utf8'));

// credentials: para que el navegador mande y guarde la cookie del refresh token.
app.use(cors({ origin: entorno.corsOrigen, credentials: true }));
app.use(express.json());

// Swagger UI carga el contrato por URL: incrustado, un `$` seguido de comilla invertida en una descripción rompe su script.
app.get('/api/docs/openapi.json', (req, res) => res.json(documentoOpenapi));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(null, { swaggerOptions: { url: '/api/docs/openapi.json' } }));
app.use('/api/v1', sistemaRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1', usuariosRoutes);
app.use('/api/v1', catalogosRoutes);
app.use('/api/v1', configuracionRoutes);
app.use('/api/v1', produccionRoutes);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

export default app;
