
const express = require('express');

const {
  consultarSalud
} = require('./sistema.controlador');

const router = express.Router();

router.get('/health', consultarSalud);

module.exports = router;
