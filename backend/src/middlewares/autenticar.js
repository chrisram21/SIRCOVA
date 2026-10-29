import jwt from 'jsonwebtoken';
import entorno from '../config/entorno.js';
import pool from '../config/mysql.js';
import { ErrorApi } from './errores.js';
import { leerCookieRefresh } from '../modulos/auth/cookieRefresh.js';
import {
  COLUMNAS_ESTADO, PARAMETROS_ESTADO, erroresSesion, errorDeSesion, estadoDeFila, registrarUso,
} from '../modulos/auth/sesiones.service.js';

const noAutenticado = () => new ErrorApi(401, 'NO_AUTENTICADO', 'Debe iniciar sesión.');
const sesionVencida = () => new ErrorApi(401, 'SESION_VENCIDA', 'Su sesión venció; inicie sesión de nuevo.');
const cambioContrasenaRequerido = () =>
  new ErrorApi(403, 'CAMBIO_CONTRASENA_REQUERIDO', 'Debe cambiar su contraseña temporal antes de continuar.');

const esIdValido = (valor) => Number.isInteger(valor) && valor > 0;

// Devuelve { datos } con el contenido del token, o { error } con el 401 que corresponde.
function leerToken(req) {
  const coincidencia = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') ?? '');
  if (!coincidencia) return { error: noAutenticado() };
  try {
    // Se fija el algoritmo para que no se acepte un token firmado de otra forma.
    return { datos: jwt.verify(coincidencia[1], entorno.jwt.secreto, { algorithms: ['HS256'] }) };
  } catch (err) {
    return { error: err instanceof jwt.TokenExpiredError ? sesionVencida() : noAutenticado() };
  }
}

export function verificarToken(req, res, next) {
  const { datos, error } = leerToken(req);
  if (error) return next(error);

  const id = Number(datos.sub);
  if (!esIdValido(id) || !esIdValido(datos.sid)) return next(noAutenticado());

  // El sid va aparte de req.usuario, que los servicios reciben como los datos de la cuenta.
  req.sesionId = datos.sid;
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

// Una sola consulta revisa la sesión del token y la cuenta. Primero la sesión: cerrada (el código sale de su
// motivo), con la jornada terminada o inactiva. Después la cuenta, como respaldo de los cierres: desactivada, o
// con otro rol, establecimiento o municipio que el token. La DDRISS no se compara porque ningún endpoint la cambia.
// Ninguno de estos 401 va a la bitácora.
export async function revisarCuenta(req, res, next) {
  try {
    const [filas] = await pool.query(
      `SELECT u.activo, e.activo AS empleado_activo, r.codigo AS rol, e.establecimiento_id, e.municipio_id,
              u.debe_cambiar_contrasena, s.id AS sesion_id, ${COLUMNAS_ESTADO}
         FROM usuario u
         JOIN empleado e ON e.id = u.empleado_id
         JOIN rol r ON r.id = u.rol_id
         LEFT JOIN sesion s ON s.id = ? AND s.usuario_id = u.id
        WHERE u.id = ?`,
      [...PARAMETROS_ESTADO, req.sesionId, req.usuario.id],
    );
    const cuenta = filas[0];
    if (!cuenta?.sesion_id) return next(noAutenticado());
    const sesion = estadoDeFila(cuenta);
    const errorSesion = errorDeSesion(sesion);
    if (errorSesion) return next(errorSesion);
    if (!cuenta.activo || !cuenta.empleado_activo) return next(erroresSesion.cuentaDesactivada());

    const { rol, establecimientoId, municipioId } = req.usuario;
    if (
      rol !== cuenta.rol ||
      (establecimientoId ?? null) !== cuenta.establecimiento_id ||
      (municipioId ?? null) !== cuenta.municipio_id
    ) {
      return next(erroresSesion.desactualizada());
    }
    if (sesion.usoPorRegistrar) await registrarUso(pool, req.sesionId);
    req.usuario.debeCambiarContrasena = Boolean(cuenta.debe_cambiar_contrasena);
    next();
  } catch (err) {
    next(err);
  }
}

// Es un 403 y no un 401 para que el frontend no cierre la sesión; no va a la bitácora, como los 401 de arriba.
export function exigirContrasenaCambiada(req, res, next) {
  if (req.usuario.debeCambiarContrasena) return next(cambioContrasenaRequerido());
  next();
}

export const autenticar = [verificarToken, revisarCuenta, exigirContrasenaCambiada];

// Solo para las rutas que una cuenta con la contraseña temporal debe poder usar: cambiarla.
export const autenticarSinExigirCambio = [verificarToken, revisarCuenta];

// Solo para el logout: no exige que la sesión siga abierta, y con el JWT vencido basta la cookie.
// Deja en req.cierre la sesión del Bearer ({ sesionId, usuarioId }) o el refresh de la cookie ({ refreshToken }).
export function identificarSesionParaCierre(req, res, next) {
  const { datos, error } = leerToken(req);
  const usuarioId = Number(datos?.sub);
  if (datos && esIdValido(usuarioId) && esIdValido(datos.sid)) {
    req.cierre = { sesionId: datos.sid, usuarioId };
    return next();
  }
  const refreshToken = leerCookieRefresh(req);
  if (refreshToken) {
    req.cierre = { refreshToken };
    return next();
  }
  next(error ?? noAutenticado());
}
