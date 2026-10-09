
const {
  verificarConexiones
} = require('./sistema.servicio');

async function consultarSalud(req, res) {
  try {
    const estado = await verificarConexiones();

    if (estado.mysql !== 'ok' || estado.mongo !== 'ok') {
      console.error('Estado de conexiones:', estado);

      return res.status(503).json({
        error: {
          codigo: 'SERVICIOS_NO_DISPONIBLES',
          mensaje: 'Una o más bases de datos no responden'
        }
      });
    }

    return res.status(200).json(estado);

  } catch (error) {
    console.error('Error al consultar salud:', error.message);

    return res.status(503).json({
      error: {
        codigo: 'SERVICIOS_NO_DISPONIBLES',
        mensaje: 'No fue posible comprobar los servicios'
      }
    });
  }
}

module.exports = { consultarSalud };
