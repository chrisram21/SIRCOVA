const {
  obtenerDimensiones
} = require('./configuracion.service');

async function listarDimensiones(req, res) {
  try {
    const dimensiones = await obtenerDimensiones();

    return res.status(200).json(dimensiones);

  } catch (error) {
    console.error(
      'Error al consultar dimensiones:',
      error.message
    );

    return res.status(500).json({
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'No fue posible consultar las dimensiones'
      }
    });
  }
}

module.exports = { listarDimensiones };