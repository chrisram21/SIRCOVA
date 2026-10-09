
const express = require('express');

const {
  consultarSalud
} = require('./sistema.controller');

const router = express.Router();

router.get('/health', consultarSalud);

module.exports = router;
