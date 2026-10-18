const { Router } = require('express');
const sistemaController = require('./sistema.controller');

const router = Router();

router.get('/salud', sistemaController.salud);

module.exports = router;
