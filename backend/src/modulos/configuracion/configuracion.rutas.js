const express = require('express');

const {
  listarDimensiones
} = require('./configuracion.controlador');

const router = express.Router();

router.get('/dimensiones', listarDimensiones);

module.exports = router;