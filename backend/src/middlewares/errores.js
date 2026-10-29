export class ErrorApi extends Error {
  constructor(status, codigo, mensaje) {
    super(mensaje);
    this.status = status;
    this.codigo = codigo;
  }
}

export function rutaNoEncontrada(req, res) {
  res.status(404).json({
    error: { codigo: 'NO_ENCONTRADO', mensaje: 'La ruta solicitada no existe.' },
  });
}

// Express lo reconoce como manejador de errores solo si declara los 4 parámetros.
export function manejarErrores(err, req, res, next) {
  if (err instanceof ErrorApi) {
    return res.status(err.status).json({
      error: { codigo: err.codigo, mensaje: err.message },
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'El cuerpo de la solicitud no es un JSON válido.' },
    });
  }

  if (err.type === 'encoding.unsupported') {
    return res.status(415).json({
      error: { codigo: 'CODIFICACION_NO_ADMITIDA', mensaje: 'El servidor no acepta cuerpos comprimidos.' },
    });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      error: { codigo: 'CUERPO_DEMASIADO_GRANDE', mensaje: 'El cuerpo de la solicitud es demasiado grande.' },
    });
  }

  console.error(err);
  res.status(500).json({
    error: { codigo: 'ERROR_INTERNO', mensaje: 'Ocurrió un error interno. Intente de nuevo.' },
  });
}
