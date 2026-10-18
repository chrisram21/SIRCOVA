import jwt from 'jsonwebtoken';
import entorno from '../config/entorno.js';
import { ErrorApi } from './errores.js';

const noAutenticado = () => new ErrorApi(401, 'NO_AUTENTICADO', 'Debe iniciar sesión.');
const sesionVencida = () => new ErrorApi(401, 'SESION_VENCIDA', 'Su sesión venció; inicie sesión de nuevo.');

export function autenticar(req, res, next) {
  const coincidencia = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  if (!coincidencia) return next(noAutenticado());

  let datos;
  try {
    // Se fija el algoritmo para que no se acepte un token firmado de otra forma.
    datos = jwt.verify(coincidencia[1], entorno.jwt.secreto, { algorithms: ['HS256'] });
  } catch (err) {
    return next(err instanceof jwt.TokenExpiredError ? sesionVencida() : noAutenticado());
  }

  const id = Number(datos.sub);
  if (!Number.isInteger(id) || id <= 0) return next(noAutenticado());

  req.usuario = {
    id,
    rol: datos.rol,
    permisos: datos.permisos,
    ddrissId: datos.ddrissId,
    establecimientoId: datos.establecimientoId,
    municipioId: datos.municipioId,
  };
  next();
}
