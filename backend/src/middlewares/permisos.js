import pool from '../config/mysql.js';
import { ErrorApi } from './errores.js';
import { registrarBitacora, contextoAuditoria, MODULOS, ACCIONES } from '../modulos/auditoria/auditoria.service.js';

const FORMATO_CODIGO = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/;
const METODOS_CONSULTA = new Set(['GET', 'HEAD']);

const sinPermiso = () => new ErrorApi(403, 'SIN_PERMISO', 'No tiene permiso para realizar esta acción.');

// Va con el pool, fuera de cualquier transacción. Si falla, se responde 403 igual: la bitácora no debe convertirlo en 500.
async function registrarAccesoDenegado(req, codigo, motivo) {
  try {
    await registrarBitacora(pool, {
      ...contextoAuditoria(req),
      modulo: MODULOS.SISTEMA,
      accion: ACCIONES.ACCESO_DENEGADO,
      entidad: 'permiso',
      entidadId: codigo,
      valoresNuevos: { metodo: req.method, ruta: req.baseUrl + req.path, motivo },
    });
  } catch (err) {
    console.error('[permisos] No se pudo registrar el acceso denegado:', err);
  }
}

// Se monta después de autenticar. Los permisos salen del token, así que un cambio en
// rol_permiso aplica desde el siguiente inicio de sesión.
export function requierePermiso(codigo) {
  if (typeof codigo !== 'string' || !FORMATO_CODIGO.test(codigo)) {
    throw new Error(`Código de permiso inválido: ${codigo}. Debe tener la forma ENTIDAD_ACCION.`);
  }

  return async (req, res, next) => {
    if (!req.usuario) return next(new ErrorApi(401, 'NO_AUTENTICADO', 'Debe iniciar sesión.'));

    // AUTORIDAD es de solo consulta aunque se le asigne un permiso de escritura por error.
    if (req.usuario.rol === 'AUTORIDAD' && !METODOS_CONSULTA.has(req.method)) {
      await registrarAccesoDenegado(req, codigo, 'SOLO_CONSULTA');
      return next(sinPermiso());
    }

    const permisos = Array.isArray(req.usuario.permisos) ? req.usuario.permisos : [];
    if (!permisos.includes(codigo)) {
      await registrarAccesoDenegado(req, codigo, 'SIN_PERMISO');
      return next(sinPermiso());
    }

    next();
  };
}
