const express = require('express');

const {
  listarDimensiones
} = require('./configuracion.controller');

const router = express.Router();

router.get('/dimensiones', listarDimensiones);

module.exports = router;