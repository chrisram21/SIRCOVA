
const express = require('express');

const {
  listarMunicipios,
  listarVacunas,
  listarEstablecimientos,
  listarPeriodos
} = require('./catalogos.controlador');

const router = express.Router();

// Consultas de municipios
router.get('/municipios', listarMunicipios);

// Consultas de vacunas y sus dosis
router.get('/vacunas', listarVacunas);

// Consultas de establecimientos
router.get('/establecimientos', listarEstablecimientos);

// Consultas de períodos mensuales
router.get('/periodos', listarPeriodos);

module.exports = router;
