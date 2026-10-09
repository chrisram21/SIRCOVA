
const express = require('express');

const {
  listarMunicipios,
  listarVacunas,
  listarEstablecimientos,
  listarPeriodos
} = require('./catalogos.controller');

const router = express.Router();

router.get('/municipios', listarMunicipios);

router.get('/vacunas', listarVacunas);

router.get('/establecimientos', listarEstablecimientos);

router.get('/periodos', listarPeriodos);

module.exports = router;
