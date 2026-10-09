
const {
  obtenerMunicipios
} = require('./catalogos.servicio');

async function listarMunicipios(req, res) {
  const { jurisdiccion } = req.query;

  if (
    jurisdiccion !== undefined &&
    jurisdiccion !== 'true' &&
    jurisdiccion !== 'false'
  ) {
    return res.status(400).json({
      error: {
        codigo: 'PARAMETRO_INVALIDO',
        mensaje: 'jurisdiccion debe ser true o false'
      }
    });
  }

  try {
    const municipios = await obtenerMunicipios(
      jurisdiccion === 'true'
    );

    return res.status(200).json(municipios);

  } catch (error) {
    console.error(
      'Error al consultar municipios:',
      error.message
    );

    return res.status(500).json({
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'No fue posible consultar los municipios'
      }
    });
  }
}

module.exports = { listarMunicipios };
