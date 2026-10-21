import jwt from 'jsonwebtoken';
import entorno from '../config/entorno.js';
import pool from '../config/mysql.js';
import { ErrorApi } from './errores.js';

const noAutenticado = () => new ErrorApi(401, 'NO_AUTENTICADO', 'Debe iniciar sesión.');
const sesionVencida = () => new ErrorApi(401, 'SESION_VENCIDA', 'Su sesión venció; inicie sesión de nuevo.');
const cuentaDesactivada = () =>
  new ErrorApi(401, 'CUENTA_DESACTIVADA', 'Su cuenta está desactivada; contacte al administrador.');
const sesionDesactualizada = () =>
  new ErrorApi(401, 'SESION_DESACTUALIZADA', 'Sus datos de acceso cambiaron; inicie sesión de nuevo.');

export function verificarToken(req, res, next) {
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

// El token no se revoca: esta consulta es lo que corta una sesión abierta al desactivar la cuenta o
// cambiarle el rol, el establecimiento o el municipio, que definen sus permisos y su ámbito.
// La DDRISS no se compara porque ningún endpoint la cambia. Ninguno de estos 401 va a la bitácora.
export async function revisarCuenta(req, res, next) {
  try {
    const [filas] = await pool.query(
      `SELECT u.activo, e.activo AS empleado_activo, r.codigo AS rol, e.establecimiento_id, e.municipio_id
         FROM usuario u
         JOIN empleado e ON e.id = u.empleado_id
         JOIN rol r ON r.id = u.rol_id
        WHERE u.id = ?`,
      [req.usuario.id],
    );
    const cuenta = filas[0];
    if (!cuenta) return next(noAutenticado());
    if (!cuenta.activo || !cuenta.empleado_activo) return next(cuentaDesactivada());

    const { rol, establecimientoId, municipioId } = req.usuario;
    if (
      rol !== cuenta.rol ||
      (establecimientoId ?? null) !== cuenta.establecimiento_id ||
      (municipioId ?? null) !== cuenta.municipio_id
    ) {
      return next(sesionDesactualizada());
    }
    next();
  } catch (err) {
    next(err);
  }
}

export const autenticar = [verificarToken, revisarCuenta];
