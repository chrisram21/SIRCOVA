import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';

// Firma un token de prueba con el sid de una sesión real del usuario, sin pasar por el login ni la bitácora.
// Reutiliza la sesión abierta y vigente del usuario, porque solo puede tener una; si la abierta venció o está
// inactiva, la cierra y crea otra. Un POST /auth/login de la misma cuenta la cierra (SESION_REEMPLAZADA).
// Para un token inválido a propósito (vencido, otra firma, otro algoritmo) se sigue usando jwt.sign.
export async function tokenDePrueba(usuarioId, carga = {}, opciones = {}) {
  const sid = await sesionAbierta(usuarioId);
  return jwt.sign({ ...carga, sid }, entorno.jwt.secreto, {
    algorithm: 'HS256',
    subject: String(usuarioId),
    expiresIn: '5m',
    ...opciones,
  });
}

async function sesionAbierta(usuarioId) {
  const [[vigente]] = await pool.query(
    `SELECT id FROM sesion
      WHERE usuario_id = ? AND cerrada_en IS NULL AND expira_en > NOW() AND ultimo_uso > NOW() - INTERVAL ? SECOND`,
    [usuarioId, entorno.sesion.inactividad],
  );
  if (vigente) return vigente.id;

  await pool.query(
    `UPDATE sesion SET cerrada_en = NOW(), motivo_cierre = 'INACTIVIDAD' WHERE usuario_id = ? AND cerrada_en IS NULL`,
    [usuarioId],
  );
  const hash = crypto.createHash('sha256').update(crypto.randomBytes(32)).digest('hex');
  const [creada] = await pool.query(
    `INSERT INTO sesion (usuario_id, hash_refresh, expira_en, agente_usuario)
     VALUES (?, ?, NOW() + INTERVAL ? SECOND, 'vitest')`,
    [usuarioId, hash, entorno.sesion.duracionMaxima],
  );
  return creada.insertId;
}

// La llave foránea de sesion no borra en cascada: las pruebas que borran cuentas quitan antes sus sesiones.
export async function borrarSesionesDe(patronNombreUsuario) {
  await pool.query(
    `DELETE s FROM sesion s JOIN usuario u ON u.id = s.usuario_id WHERE u.nombre_usuario LIKE ?`,
    [patronNombreUsuario],
  );
}
