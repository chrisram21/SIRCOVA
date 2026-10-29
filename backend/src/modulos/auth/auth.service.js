import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import pool, { enTransaccion } from '../../config/mysql.js';
import entorno from '../../config/entorno.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { evaluarContrasena } from './politicaContrasena.service.js';
import * as sesiones from './sesiones.service.js';

// Hash de una contraseña al azar: se compara cuando el usuario no existe para que la respuesta tarde lo mismo.
const HASH_FICTICIO = '$2b$12$YoGDls95Ec5nVQ1mAJIxA.RNOKGr3YCDvCzFdvzP18Zj2yYCV4g86';

const MAXIMO_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
const MOTIVOS_CIERRE = ['MANUAL', 'INACTIVIDAD'];
const COSTO_BCRYPT = 12;
const CAMPOS_CAMBIO_CONTRASENA = ['contrasenaActual', 'contrasenaNueva'];

const errores = {
  entradaInvalida: () => new ErrorApi(400, 'ENTRADA_INVALIDA', 'Debe indicar el nombre de usuario y la contraseña.'),
  credenciales: () => new ErrorApi(401, 'CREDENCIALES_INVALIDAS', 'Usuario o contraseña incorrectos.'),
  desactivada: () => new ErrorApi(403, 'CUENTA_DESACTIVADA', 'Su cuenta está desactivada; contacte al administrador.'),
  sinAlcance: () =>
    new ErrorApi(403, 'CUENTA_SIN_ALCANCE', 'Su cuenta no tiene una DDRISS o un establecimiento asignado; contacte al administrador.'),
  bloqueada: () =>
    new ErrorApi(
      423,
      'CUENTA_BLOQUEADA',
      `Su usuario ha sido bloqueado. Contáctese con su administrador de DDRISS o intente de nuevo en ${MINUTOS_BLOQUEO} minutos.`,
    ),
  motivoInvalido: () => new ErrorApi(400, 'ENTRADA_INVALIDA', 'El motivo del cierre de sesión no es válido.'),
  noAutenticado: () => new ErrorApi(401, 'NO_AUTENTICADO', 'Debe iniciar sesión.'),
  cambioInvalido: () => new ErrorApi(400, 'ENTRADA_INVALIDA', 'Debe indicar la contraseña actual y la nueva.'),
  actualIncorrecta: () => new ErrorApi(422, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta.'),
  repetida: () => new ErrorApi(422, 'CONTRASENA_REPETIDA', 'La contraseña nueva debe ser distinta de la actual.'),
  debil: (motivo) => new ErrorApi(422, 'CONTRASENA_DEBIL', motivo),
};

const esTextoConContenido = (valor) => typeof valor === 'string' && valor.trim() !== '';

async function buscarUsuario(conexion, nombreUsuario) {
  // FOR UPDATE OF u: bloquea solo la fila del usuario, para contar bien los intentos simultáneos.
  // El bloqueo se compara con NOW() de MySQL para no depender de la hora del servidor de Node.
  const [filas] = await conexion.query(
    `SELECT u.id, u.nombre_usuario, u.hash_contrasena, u.rol_id, r.codigo AS rol, r.nombre AS rol_nombre,
            u.activo, e.activo AS empleado_activo, u.intentos_fallidos, u.debe_cambiar_contrasena,
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

function armarSesion(usuario, permisos, sesionId) {
  const empleado = {
    nombres: usuario.nombres,
    apellidos: usuario.apellidos,
    ddrissId: usuario.ddriss_id,
    establecimientoId: usuario.establecimiento_id,
    municipioId: usuario.municipio_id,
  };
  const token = jwt.sign(
    {
      sid: sesionId,
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
    usuario: {
      id: usuario.id,
      nombreUsuario: usuario.nombre_usuario,
      rol: usuario.rol,
      rolNombre: usuario.rol_nombre,
      permisos,
      debeCambiarContrasena: Boolean(usuario.debe_cambiar_contrasena),
      empleado,
    },
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
  // Gana el último inicio de sesión: la sesión abierta en otro equipo se cierra aquí.
  const anterior = await sesiones.cerrarSesionDeUsuario(conexion, usuario.id, 'REEMPLAZADA');
  const nueva = await sesiones.crearSesion(conexion, usuario.id, contexto);
  await bitacora({
    accion: ACCIONES.LOGIN_OK,
    usuarioId: usuario.id,
    entidadId: usuario.id,
    valoresNuevos: anterior?.vigente ? { sesionReemplazada: true } : null,
  });
  return {
    sesion: armarSesion(usuario, await obtenerPermisos(conexion, usuario.rol_id), nueva.id),
    refresh: { token: nueva.refreshToken, segundosRestantes: nueva.segundosRestantes },
  };
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
  return { respuesta: resultado.sesion, refresh: resultado.refresh };
}

async function buscarCuenta(conexion, usuarioId) {
  const [[cuenta]] = await conexion.query(
    `SELECT u.id, u.nombre_usuario, u.rol_id, r.codigo AS rol, r.nombre AS rol_nombre, u.activo,
            e.activo AS empleado_activo, u.debe_cambiar_contrasena,
            e.nombres, e.apellidos, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE u.id = ?`,
    [usuarioId],
  );
  return cuenta;
}

// Renueva el JWT con los permisos y datos actuales de la cuenta. Sin bitácora: no es una acción sobre los datos
// (excepción a la regla 7). Devuelve refresh: null cuando llegó el refresh anterior dentro del margen, porque el
// navegador ya tiene el nuevo y el servidor no lo conoce en claro.
export async function refrescarSesion(refreshToken) {
  if (!refreshToken) throw errores.noAutenticado();

  return enTransaccion(async (conexion) => {
    const sesion = await sesiones.buscarPorRefresh(conexion, refreshToken);
    if (!sesion) throw errores.noAutenticado();
    const errorSesion = sesiones.errorDeSesion(sesion);
    if (errorSesion) throw errorSesion;

    const cuenta = await buscarCuenta(conexion, sesion.usuarioId);
    if (!cuenta.activo || !cuenta.empleado_activo) throw sesiones.erroresSesion.cuentaDesactivada();
    // Regla 10, como en el login: sin DDRISS el token significaría "todo el país".
    const sinDdriss = cuenta.rol !== 'AUTORIDAD' && cuenta.ddriss_id == null;
    const sinEstablecimiento = cuenta.rol === 'ESTABLECIMIENTO' && cuenta.establecimiento_id == null;
    if (sinDdriss || sinEstablecimiento) throw sesiones.erroresSesion.desactualizada();

    let refresh = null;
    if (sesion.esActual) {
      refresh = { token: await sesiones.rotarRefresh(conexion, sesion.id), segundosRestantes: sesion.segundosRestantes };
    } else {
      await sesiones.registrarUso(conexion, sesion.id);
    }
    return { respuesta: armarSesion(cuenta, await obtenerPermisos(conexion, cuenta.rol_id), sesion.id), refresh };
  });
}

// La sesión llega del Bearer ({ sesionId, usuarioId }) o de la cookie ({ refreshToken }). Si ya estaba cerrada
// o no existe no se escribe nada: el botón «Cerrar sesión» de una sesión reemplazada no debe fallar.
export async function cerrarSesion(identificacion, datos, contexto) {
  const motivo = datos.motivo === undefined ? 'MANUAL' : datos.motivo;
  if (!MOTIVOS_CIERRE.includes(motivo)) throw errores.motivoInvalido();

  await enTransaccion(async (conexion) => {
    let sesion;
    if (identificacion.sesionId) {
      const [[fila]] = await conexion.query(
        'SELECT id, usuario_id FROM sesion WHERE id = ? AND usuario_id = ? FOR UPDATE',
        [identificacion.sesionId, identificacion.usuarioId],
      );
      sesion = fila && { id: fila.id, usuarioId: fila.usuario_id };
    } else {
      sesion = await sesiones.buscarPorRefresh(conexion, identificacion.refreshToken);
    }
    if (!sesion || !(await sesiones.cerrarSesion(conexion, sesion.id, motivo))) return;

    await registrarBitacora(conexion, {
      ...contexto,
      usuarioId: sesion.usuarioId,
      modulo: MODULOS.USUARIOS,
      accion: ACCIONES.LOGOUT,
      entidad: 'usuario',
      entidadId: sesion.usuarioId,
      valoresNuevos: { motivo },
    });
  });
}

const esCambioValido = (datos) =>
  datos !== null &&
  typeof datos === 'object' &&
  Object.keys(datos).every((campo) => CAMPOS_CAMBIO_CONTRASENA.includes(campo)) &&
  CAMPOS_CAMBIO_CONTRASENA.every((campo) => typeof datos[campo] === 'string' && datos[campo] !== '');

// Una contraseña actual incorrecta no suma intentos ni va a la bitácora: la persona ya tiene una sesión válida.
export async function cambiarContrasena(usuario, datos, contexto) {
  if (!esCambioValido(datos)) throw errores.cambioInvalido();
  const { contrasenaActual, contrasenaNueva } = datos;

  await enTransaccion(async (conexion) => {
    const [[cuenta]] = await conexion.query(
      `SELECT u.nombre_usuario, u.hash_contrasena, u.debe_cambiar_contrasena, e.nombres, e.apellidos
         FROM usuario u
         JOIN empleado e ON e.id = u.empleado_id
        WHERE u.id = ?
          FOR UPDATE OF u`,
      [usuario.id],
    );

    if (!(await bcrypt.compare(contrasenaActual, cuenta.hash_contrasena))) throw errores.actualIncorrecta();
    if (await bcrypt.compare(contrasenaNueva, cuenta.hash_contrasena)) throw errores.repetida();

    const { motivos } = evaluarContrasena(contrasenaNueva, {
      nombreUsuario: cuenta.nombre_usuario,
      nombres: cuenta.nombres,
      apellidos: cuenta.apellidos,
    });
    if (motivos.length > 0) throw errores.debil(motivos[0]);

    await conexion.query(
      'UPDATE usuario SET hash_contrasena = ?, debe_cambiar_contrasena = FALSE WHERE id = ?',
      [await bcrypt.hash(contrasenaNueva, COSTO_BCRYPT), usuario.id],
    );
    await registrarBitacora(conexion, {
      ...contexto,
      usuarioId: usuario.id,
      modulo: MODULOS.USUARIOS,
      accion: ACCIONES.CAMBIO_CONTRASENA,
      entidad: 'usuario',
      entidadId: usuario.id,
      valoresAnteriores: { debeCambiarContrasena: Boolean(cuenta.debe_cambiar_contrasena) },
      valoresNuevos: { debeCambiarContrasena: false },
    });
  });
}
