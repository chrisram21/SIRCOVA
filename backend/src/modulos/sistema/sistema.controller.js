const sistemaService = require('./sistema.service');

async function salud(req, res) {
  const estados = await sistemaService.obtenerSalud();

  if (estados.mysql === 'ok' && estados.mongo === 'ok') {
    return res.json({ estado: 'ok', ...estados });
  }

  res.status(503).json({
    error: {
      codigo: 'BD_NO_DISPONIBLE',
      mensaje: 'Una o más bases de datos no responden.',
      detalles: [estados],
    },
  });
}

module.exports = { salud };
