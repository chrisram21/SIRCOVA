
const {
  obtenerMunicipios,
  obtenerVacunas,
  obtenerEstablecimientos,
  obtenerPeriodos
} = require('./catalogos.service');


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

async function listarVacunas(req, res) {
  try {
    const vacunas = await obtenerVacunas();

    return res.status(200).json(vacunas);

  } catch (error) {
    console.error(
      'Error al consultar vacunas:',
      error.message
    );

    return res.status(500).json({
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'No fue posible consultar las vacunas'
      }
    });
  }
}

async function listarEstablecimientos(req, res) {
  const { municipioId, activo } = req.query;

  const filtros = {};

  if (municipioId !== undefined) {
    const id = Number(municipioId);

    if (
      !/^\d+$/.test(municipioId) ||
      !Number.isInteger(id) ||
      id < 1 ||
      id > 65535
    ) {
      return res.status(400).json({
        error: {
          codigo: 'PARAMETRO_INVALIDO',
          mensaje: 'municipioId debe ser un entero positivo válido'
        }
      });
    }

    filtros.municipioId = id;
  }

  if (activo !== undefined) {
    if (activo !== 'true' && activo !== 'false') {
      return res.status(400).json({
        error: {
          codigo: 'PARAMETRO_INVALIDO',
          mensaje: 'activo debe ser true o false'
        }
      });
    }

    filtros.activo = activo === 'true';
  }

  try {
    const establecimientos =
      await obtenerEstablecimientos(filtros);

    return res.status(200).json(establecimientos);

  } catch (error) {
    console.error(
      'Error al consultar establecimientos:',
      error.message
    );

    return res.status(500).json({
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'No fue posible consultar los establecimientos'
      }
    });
  }
}

async function listarPeriodos(req, res) {
  const { anio } = req.query;

  let anioFiltro;

  if (anio !== undefined) {
    const valor = Number(anio);

    if (
      !/^\d+$/.test(anio) ||
      !Number.isInteger(valor) ||
      valor < 1 ||
      valor > 65535
    ) {
      return res.status(400).json({
        error: {
          codigo: 'PARAMETRO_INVALIDO',
          mensaje: 'anio debe ser un entero positivo válido'
        }
      });
    }

    anioFiltro = valor;
  }

  try {
    const periodos = await obtenerPeriodos(anioFiltro);

    return res.status(200).json(periodos);

  } catch (error) {
    console.error(
      'Error al consultar períodos:',
      error.message
    );

    return res.status(500).json({
      error: {
        codigo: 'ERROR_INTERNO',
        mensaje: 'No fue posible consultar los períodos'
      }
    });
  }
}



module.exports = {
  listarMunicipios,
  listarVacunas,
  listarEstablecimientos,
  listarPeriodos
};


