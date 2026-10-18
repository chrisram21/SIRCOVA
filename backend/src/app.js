const fs = require('node:fs');
const express = require('express');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yaml');
const entorno = require('./config/entorno');
const sistemaRoutes = require('./modulos/sistema/sistema.routes');
const { rutaNoEncontrada, manejarErrores } = require('./middlewares/errores');

const app = express();
const documentoOpenapi = YAML.parse(fs.readFileSync(entorno.rutaOpenapi, 'utf8'));

app.use(express.json());

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(documentoOpenapi));
app.use('/api/v1', sistemaRoutes);

app.use(rutaNoEncontrada);
app.use(manejarErrores);

module.exports = app;
