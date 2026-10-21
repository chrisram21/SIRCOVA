import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool from '../../config/mysql.js';
import entorno from '../../config/entorno.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';

// Hash de una contraseña al azar: se compara cuando el usuario no existe para que la respuesta tarde lo mismo.
const HASH_FICTICIO = '$2b$12$YoGDls95Ec5nVQ1mAJIxA.RNOKGr3YCDvCzFdvzP18Zj2yYCV4g86';

const MAXIMO_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;
const MOTIVOS_CIERRE = ['MANUAL', 'INACTIVIDAD'];

const errores = {
  entradaInvalida: () => new ErrorApi(400, 'ENTRADA_INVALIDA', 'Debe indicar el nombre de usuario y la contraseña.'),
  credenciales: () => new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.'),
  desactivada: () => new ErrorApi(403, 'CUENTA_DESACTIVADA', 'Su cuenta está desactivada; contacte al administrador.'),
  sinAlcance: () =>
    new ErrorApi(403, 'CUENTA_SIN_ALCANCE', 'Su cuenta no tiene una DDRISS o un establecimiento asignado; contacte al administrador.'),
  bloqueada: () =>
    new ErrorApi(423, 'CUENTA_BLOQUEADA', `Su cuenta está bloqueada por ${MINUTOS_BLOQUEO} minutos por intentos fallidos.`),
  motivoInvalido: () => new ErrorApi(400, 'ENTRADA_INVALIDA', 'El motivo del cierre de sesión no es válido.'),
};

const esTextoConContenido = (valor) => typeof valor === 'string' && valor.trim() !== '';

async function buscarUsuario(conexion, nombreUsuario) {
  // FOR UPDATE OF u: bloquea solo la fila del usuario, para contar bien los intentos simultáneos.
  // El bloqueo se compara con NOW() de MySQL para no depender de la hora del servidor de Node.
  const [filas] = await conexion.query(
    `SELECT u.id, u.nombre_usuario, u.hash_contrasena, u.rol_id, r.codigo AS rol,
            u.activo, e.activo AS empleado_activo, u.intentos_fallidos,
            COALESCE(u.bloqueado_hasta > NOW(), FALSE) AS bloqueado,
            COALESCE(u.bloqueado_hasta <= NOW(), FALSE) AS bloqueo_vencido,
            e.nombres, e.apellidos, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE u.nombre_usuario = ?
        FOR UPDATE OF u`,
    [nombreUsuario],
  );
  return filas[0] ?? null;
}

async function obtenerPermisos(conexion, rolId) {
  const [filas] = await conexion.query(
    `SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id
      WHERE rp.rol_id = ? ORDER BY p.codigo`,
    [rolId],
  );
  return filas.map((f) => f.codigo);
}

function armarSesion(usuario, permisos) {
  const empleado = {
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    ddrissId: usuario.ddriss_id,
    establecimientoId: usuario.establecimiento_id,
    municipioId: usuario.municipio_id,
  };
  const token = jwt.sign(
    {
      rol: usuario.rol,
      permisos,
      ddrissId: empleado.ddrissId,
      establecimientoId: empleado.establecimientoId,
      municipioId: empleado.municipioId,
    },
    entorno.jwt.secreto,
    { algorithm: 'HS256', expiresIn: entorno.jwt.expiracion, subject: String(usuario.id) },
  );
  return {
    token,
    usuario: { id: usuario.id, nombreUsuario: usuario.nombre_usuario, rol: usuario.rol, permisos, empleado },
  };
}

// Decide el resultado del intento y deja las escrituras en la transacción; nunca lanza errores de negocio.
async function evaluarIntento(conexion, { nombreUsuario, contrasena }, contexto) {
  const bitacora = (datos) =>
    registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.USUARIOS,
      entidad: 'usuario',
      ...datos,
    });
  const fallo = (usuario, motivo) =>
    bitacora({ accion: ACCIONES.LOGIN_FALLIDO, nombreUsuarioIntento: nombreUsuario, entidadId: usuario?.id, valoresNuevos: { motivo } });

  const usuario = await buscarUsuario(conexion, nombreUsuario);

  if (!usuario) {
    await bcrypt.compare(contrasena, HASH_FICTICIO);
    await fallo(null, 'CREDENCIALES');
    return { error: errores.credenciales() };
  }

  if (usuario.bloqueado) {
    await fallo(usuario, 'BLOQUEADA');
    return { error: errores.bloqueada() };
  }

  let intentos = usuario.intentos_fallidos;
  if (usuario.bloqueo_vencido) {
    await conexion.query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [usuario.id]);
    intentos = 0;
  }

  if (!(await bcrypt.compare(contrasena, usuario.hash_contrasena))) {
    intentos += 1;
    await fallo(usuario, 'CREDENCIALES');
    if (intentos < MAXIMO_INTENTOS) {
      await conexion.query('UPDATE usuario SET intentos_fallidos = ? WHERE id = ?', [intentos, usuario.id]);
      return { error: errores.credenciales() };
    }
    await conexion.query(
      'UPDATE usuario SET intentos_fallidos = ?, bloqueado_hasta = NOW() + INTERVAL ? MINUTE WHERE id = ?',
      [intentos, MINUTOS_BLOQUEO, usuario.id],
    );
    const [[{ hasta }]] = await conexion.query(
      `SELECT DATE_FORMAT(bloqueado_hasta, '%Y-%m-%d %H:%i:%s') AS hasta FROM usuario WHERE id = ?`,
      [usuario.id],
    );
    await bitacora({
      accion: ACCIONES.CUENTA_BLOQUEADA, nombreUsuarioIntento: nombreUsuario, entidadId: usuario.id, valoresNuevos: { bloqueadoHasta: hasta },
    });
    return { error: errores.bloqueada() };
  }

  if (!usuario.activo || !usuario.empleado_activo) {
    await fallo(usuario, 'DESACTIVADA');
    return { error: errores.desactivada() };
  }

  // Regla 10: sin DDRISS el token significaría "todo el país", y eso solo lo puede tener AUTORIDAD.
  const sinDdriss = usuario.rol !== 'AUTORIDAD' && usuario.ddriss_id == null;
  const sinEstablecimiento = usuario.rol === 'ESTABLECIMIENTO' && usuario.establecimiento_id == null;
  if (sinDdriss || sinEstablecimiento) {
    await fallo(usuario, 'SIN_ALCANCE');
    return { error: errores.sinAlcance() };
  }

  await conexion.query(
    'UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, ultimo_acceso = NOW() WHERE id = ?',
    [usuario.id],
  );
  await bitacora({ accion: ACCIONES.LOGIN_OK, usuarioId: usuario.id, entidadId: usuario.id });
  return { sesion: armarSesion(usuario, await obtenerPermisos(conexion, usuario.rol_id)) };
}

export async function iniciarSesion(datos, contexto) {
  if (!esTextoConContenido(datos.nombreUsuario) || !esTextoConContenido(datos.contrasena)) {
    throw errores.entradaInvalida();
  }

  const conexion = await pool.getConnection();
  let resultado;
  try {
    await conexion.beginTransaction();
    resultado = await evaluarIntento(conexion, datos, contexto);
    // Se confirma también cuando el intento falla: el contador y la bitácora deben quedar guardados.
    await conexion.commit();
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }

  if (resultado.error) throw resultado.error;
  return resultado.sesion;
}

// El token no se revoca: sigue sirviendo hasta su exp, pero el frontend ya lo borró.
export async function cerrarSesion(usuario, datos, contexto) {
  const motivo = datos.motivo === undefined ? 'MANUAL' : datos.motivo;
  if (!MOTIVOS_CIERRE.includes(motivo)) throw errores.motivoInvalido();

  await registrarBitacora(pool, {
    ...contexto,
    usuarioId: usuario.id,
    modulo: MODULOS.USUARIOS,
    accion: ACCIONES.LOGOUT,
    entidad: 'usuario',
    entidadId: usuario.id,
    valoresNuevos: { motivo },
  });
}
