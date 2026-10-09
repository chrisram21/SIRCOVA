
const express = require('express');

const rutasSistema = require(
  './modulos/sistema/sistema.routes'
);

const rutasCatalogos = require(
  './modulos/catalogos/catalogos.routes'
);

const rutasConfiguracion = require(
  './modulos/configuracion/configuracion.routes'
);

const app = express();

app.use(express.json());

// Rutas de la API versión 1
app.use('/api/v1', rutasSistema);
app.use('/api/v1', rutasCatalogos);
app.use('/api/v1', rutasConfiguracion);

// Manejo de rutas no existentes
app.use((req, res) => {
  res.status(404).json({
    error: {
      codigo: 'RUTA_NO_ENCONTRADA',
      mensaje: 'La ruta solicitada no existe'
    }
  });
});

module.exports = app;
