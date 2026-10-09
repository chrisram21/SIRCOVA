
const express = require('express');

const {
  listarMunicipios
} = require('./catalogos.controlador');

const router = express.Router();

router.get('/municipios', listarMunicipios);

module.exports = router;
