import crypto from 'node:crypto';
import entorno from '../../config/entorno.js';
import { ErrorApi } from '../../middlewares/errores.js';

// Cuánto se sigue aceptando el refresh anterior después de rotarlo: dos pestañas que renuevan a la vez.
export const MARGEN_ROTACION_SEGUNDOS = 30;

// Los 401 de una sesión que ya no sirve; los usan autenticar y POST /auth/refrescar. El frontend muestra el mensaje tal cual.
export const erroresSesion = {
  cuentaDesactivada: () =>
    new ErrorApi(401, 'CUENTA_DESACTIVADA', 'Su cuenta está desactivada; contacte al administrador.'),
  desactualizada: () =>
    new ErrorApi(401, 'SESION_DESACTUALIZADA', 'Sus datos de acceso cambiaron; inicie sesión de nuevo.'),
  reemplazada: () =>
    new ErrorApi(
      401,
      'SESION_REEMPLAZADA',
      'Se inició sesión con su cuenta en otro equipo. Inicie sesión de nuevo para continuar aquí.',
    ),
  cerrada: () => new ErrorApi(401, 'SESION_CERRADA', 'Su sesión se cerró; inicie sesión de nuevo.'),
  contrasenaRestablecida: () =>
    new ErrorApi(
      401,
      'CONTRASENA_RESTABLECIDA',
      'Su contraseña fue restablecida. Inicie sesión con la contraseña temporal que le dé su administrador.',
    ),
  inactiva: () => new ErrorApi(401, 'SESION_INACTIVA', 'Su sesión se cerró por inactividad. Inicie sesión de nuevo.'),
  jornadaTerminada: () =>
    new ErrorApi(401, 'JORNADA_TERMINADA', 'Su jornada de 8 horas terminó; inicie sesión de nuevo.'),
};

const ERROR_POR_MOTIVO = {
  MANUAL: erroresSesion.cerrada,
  INACTIVIDAD: erroresSesion.cerrada,
  REEMPLAZADA: erroresSesion.reemplazada,
  CONTRASENA_RESTABLECIDA: erroresSesion.contrasenaRestablecida,
  CUENTA_DESACTIVADA: erroresSesion.cuentaDesactivada,
  DATOS_CAMBIADOS: erroresSesion.desactualizada,
};

// El 401 de una sesión cerrada, con la jornada terminada o inactiva, en ese orden; null si sigue vigente.
export function errorDeSesion({ cerrada, motivoCierre, jornadaTerminada, inactiva }) {
  if (cerrada) return (ERROR_POR_MOTIVO[motivoCierre] ?? erroresSesion.cerrada)();
  if (jornadaTerminada) return erroresSesion.jornadaTerminada();
  if (inactiva) return erroresSesion.inactiva();
  return null;
}

// ultimo_uso se actualiza como mucho una vez por minuto, para no escribir en cada petición.
const SEGUNDOS_ENTRE_USOS = 60;

// Columnas de la sesión que necesita errorDeSesion, para el SELECT de quien llama (alias s). Sus dos ? van
// primero en los parámetros de la consulta: [...PARAMETROS_ESTADO, …los demás].
export const COLUMNAS_ESTADO = `s.motivo_cierre, s.cerrada_en IS NOT NULL AS cerrada,
            s.expira_en <= NOW() AS jornada_terminada,
            s.ultimo_uso <= NOW() - INTERVAL ? SECOND AS inactiva,
            s.ultimo_uso <= NOW() - INTERVAL ? SECOND AS uso_por_registrar`;
export const PARAMETROS_ESTADO = [entorno.sesion.inactividad, SEGUNDOS_ENTRE_USOS];

export function estadoDeFila(fila) {
  return {
    cerrada: Boolean(fila.cerrada),
    motivoCierre: fila.motivo_cierre,
    jornadaTerminada: Boolean(fila.jornada_terminada),
    inactiva: Boolean(fila.inactiva),
    usoPorRegistrar: Boolean(fila.uso_por_registrar),
  };
}

// Sin bitácora (excepción a la regla 7, como ultimo_acceso).
export async function registrarUso(conexion, sesionId) {
  await conexion.query('UPDATE sesion SET ultimo_uso = NOW() WHERE id = ?', [sesionId]);
}

// Todas reciben la conexión de quien llama para ir en su transacción. Las fechas se calculan con NOW()
// de MySQL, nunca con la hora de Node, para no depender de la zona horaria.

const hashDe = (token) => crypto.createHash('sha256').update(token).digest('hex');

function nuevoRefresh() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, hash: hashDe(token) };
}

const recortar = (texto, largo) => (texto == null ? null : String(texto).slice(0, largo));

// Devuelve el refresh en claro solo aquí: en la base queda su SHA-256.
export async function crearSesion(conexion, usuarioId, contexto) {
  const refresh = nuevoRefresh();
  const [resultado] = await conexion.query(
    `INSERT INTO sesion (usuario_id, hash_refresh, expira_en, ip_origen, agente_usuario)
     VALUES (?, ?, NOW() + INTERVAL ? SECOND, ?, ?)`,
    [
      usuarioId,
      refresh.hash,
      entorno.sesion.duracionMaxima,
      recortar(contexto.ipOrigen, 45),
      recortar(contexto.agenteUsuario, 255),
    ],
  );
  return { id: resultado.insertId, refreshToken: refresh.token, segundosRestantes: entorno.sesion.duracionMaxima };
}

// La primera consulta de la transacción de quien llama: si hay dos renovaciones a la vez, la segunda espera el
// bloqueo y después ve el refresh ya rotado, que acepta por el margen.
export async function buscarPorRefresh(conexion, refreshToken) {
  if (typeof refreshToken !== 'string' || refreshToken === '') return null;
  const hash = hashDe(refreshToken);
  const [filas] = await conexion.query(
    `SELECT id, usuario_id, motivo_cierre, cerrada_en IS NOT NULL AS cerrada,
            expira_en <= NOW() AS jornada_terminada,
            ultimo_uso <= NOW() - INTERVAL ? SECOND AS inactiva,
            hash_refresh = ? AS es_actual,
            TIMESTAMPDIFF(SECOND, NOW(), expira_en) AS segundos_restantes
       FROM sesion
      WHERE hash_refresh = ?
         OR (hash_refresh_anterior = ? AND rotado_en > NOW() - INTERVAL ? SECOND)
        FOR UPDATE`,
    [entorno.sesion.inactividad, hash, hash, hash, MARGEN_ROTACION_SEGUNDOS],
  );
  const fila = filas[0];
  if (!fila) return null;
  return {
    id: fila.id,
    usuarioId: fila.usuario_id,
    cerrada: Boolean(fila.cerrada),
    motivoCierre: fila.motivo_cierre,
    jornadaTerminada: Boolean(fila.jornada_terminada),
    inactiva: Boolean(fila.inactiva),
    esActual: Boolean(fila.es_actual),
    segundosRestantes: Number(fila.segundos_restantes),
  };
}

// El refresh que se reemplaza pasa a ser el anterior, aceptado durante el margen.
export async function rotarRefresh(conexion, sesionId) {
  const refresh = nuevoRefresh();
  await conexion.query(
    `UPDATE sesion
        SET hash_refresh_anterior = hash_refresh, hash_refresh = ?, rotado_en = NOW(), ultimo_uso = NOW()
      WHERE id = ?`,
    [refresh.hash, sesionId],
  );
  return refresh.token;
}

// Devuelve si la cerró: una sesión ya cerrada no cambia ni su fecha ni su motivo.
export async function cerrarSesion(conexion, sesionId, motivo) {
  const [resultado] = await conexion.query(
    'UPDATE sesion SET cerrada_en = NOW(), motivo_cierre = ? WHERE id = ? AND cerrada_en IS NULL',
    [motivo, sesionId],
  );
  return resultado.affectedRows > 0;
}

// Devuelve null si el usuario no tenía una sesión abierta, o { vigente } si la cerró: vigente indica que
// todavía estaba en su jornada y sin inactividad (el login lo registra como sesión reemplazada).
export async function cerrarSesionDeUsuario(conexion, usuarioId, motivo) {
  const [filas] = await conexion.query(
    `SELECT id, expira_en > NOW() AND ultimo_uso > NOW() - INTERVAL ? SECOND AS vigente
       FROM sesion
      WHERE usuario_id = ? AND cerrada_en IS NULL
        FOR UPDATE`,
    [entorno.sesion.inactividad, usuarioId],
  );
  const abierta = filas[0];
  if (!abierta) return null;
  await cerrarSesion(conexion, abierta.id, motivo);
  return { vigente: Boolean(abierta.vigente) };
}
