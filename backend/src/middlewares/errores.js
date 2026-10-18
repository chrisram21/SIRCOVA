export function rutaNoEncontrada(req, res) {
  res.status(404).json({
    error: { codigo: 'NO_ENCONTRADO', mensaje: 'La ruta solicitada no existe.' },
  });
}

// Express lo reconoce como manejador de errores solo si declara los 4 parámetros.
export function manejarErrores(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'El cuerpo de la solicitud no es un JSON válido.' },
    });
  }

  console.error(err);
  res.status(500).json({
    error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error interno. Intente de nuevo.' },
  });
}
