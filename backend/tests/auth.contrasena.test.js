import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { MOTIVOS } from '../src/modulos/auth/politicaContrasena.service.js';

// El cambio correcto y el login con la nueva escriben su usuario_id en la bitácora, y la llave foránea impide
// borrar esa cuenta: por eso usa una cuenta permanente que se reinicia en cada corrida. Los casos que fallan no
// escriben con el id de la cuenta y usan una temporal, que se borra en afterAll.
const PERMANENTE = 'vitest-hu03-permanente';
const TEMPORAL = 'vitest-hu03-temporal';
const ACTUAL = 'caballo bateria grapa correcta';
const NUEVA = 'tucan violeta grapa nube';

let ddrissId;
const ids = {};

async function prepararCuenta(nombreUsuario) {
  const correo = `${nombreUsuario}@prueba.local`;
  const hash = await bcrypt.hash(ACTUAL, 4);
  let [[empleado]] = await pool.query('SELECT id FROM empleado WHERE correo = ?', [correo]);
  if (!empleado) {
    const [creado] = await pool.query(
      `INSERT INTO empleado (nombres, apellidos, correo, ddriss_id) VALUES ('Prueba', 'HU-03', ?, ?)`,
      [correo, ddrissId],
    );
    empleado = { id: creado.insertId };
  }
  let [[usuario]] = await pool.query('SELECT id FROM usuario WHERE nombre_usuario = ?', [nombreUsuario]);
  if (!usuario) {
    const [creado] = await pool.query(
      `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id)
       SELECT ?, ?, ?, id FROM rol WHERE codigo = 'REVISOR'`,
      [empleado.id, nombreUsuario, hash],
    );
    usuario = { id: creado.insertId };
  }
  await pool.query(`UPDATE empleado SET nombres = 'Prueba', apellidos = 'HU-03', activo = TRUE WHERE id = ?`, [
    empleado.id,
  ]);
  await pool.query(
    `UPDATE usuario SET hash_contrasena = ?, debe_cambiar_contrasena = TRUE, activo = TRUE,
            intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
    [hash, usuario.id],
  );
  return usuario.id;
}

const tokenPara = (id) =>
  jwt.sign(
    { rol: 'REVISOR', permisos: [], ddrissId, establecimientoId: null, municipioId: null },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(id), expiresIn: '5m' },
  );

const cambiar = (id, cuerpo) =>
  request(app).post('/api/v1/auth/contrasena').set('Authorization', `Bearer ${tokenPara(id)}`).send(cuerpo);

const iniciarSesion = (nombreUsuario, contrasena) =>
  request(app).post('/api/v1/auth/login').send({ nombreUsuario, contrasena });

async function filasCambio(id) {
  const [filas] = await pool.query(
    `SELECT usuario_id, entidad, entidad_id, valores_anteriores, valores_nuevos FROM bitacora
      WHERE accion = 'CAMBIO_CONTRASENA' AND entidad = 'usuario' AND entidad_id = ? ORDER BY id DESC`,
    [String(id)],
  );
  return filas;
}

async function leerCuenta(id) {
  const [[fila]] = await pool.query(
    'SELECT hash_contrasena, debe_cambiar_contrasena, intentos_fallidos FROM usuario WHERE id = ?',
    [id],
  );
  return fila;
}

beforeAll(async () => {
  const login = await iniciarSesion(process.env.PRUEBA_USUARIO, process.env.PRUEBA_CONTRASENA);
  if (login.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${login.status})`);
  ddrissId = login.body.usuario.empleado.ddrissId;

  ids.permanente = await prepararCuenta(PERMANENTE);
  ids.temporal = await prepararCuenta(TEMPORAL);
});

afterAll(async () => {
  await pool.query('DELETE FROM usuario WHERE nombre_usuario = ?', [TEMPORAL]);
  await pool.query('DELETE FROM empleado WHERE correo = ?', [`${TEMPORAL}@prueba.local`]);
});

describe('POST /auth/contrasena', () => {
  it('sin token: responde 401', async () => {
    const res = await request(app).post('/api/v1/auth/contrasena').send({ contrasenaActual: ACTUAL, contrasenaNueva: NUEVA });

    expect(res.status).toBe(401);
  });

  it.each([
    ['cuerpo vacío', {}],
    ['falta la nueva', { contrasenaActual: ACTUAL }],
    ['la nueva no es texto', { contrasenaActual: ACTUAL, contrasenaNueva: 12345678901234 }],
    ['otro campo', { contrasenaActual: ACTUAL, contrasenaNueva: NUEVA, confirmacion: NUEVA }],
  ])('%s: responde 400 ENTRADA_INVALIDA', async (_, cuerpo) => {
    const res = await cambiar(ids.temporal, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('actual incorrecta: responde 422 sin sumar intentos ni escribir en la bitácora', async () => {
    const antes = await leerCuenta(ids.temporal);

    const res = await cambiar(ids.temporal, { contrasenaActual: 'no es la actual', contrasenaNueva: NUEVA });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { codigo: 'CONTRASENA_ACTUAL_INCORRECTA', mensaje: 'La contraseña actual no es correcta.' },
    });
    expect(await leerCuenta(ids.temporal)).toEqual(antes);
    expect(await filasCambio(ids.temporal)).toHaveLength(0);
  });

  it('nueva igual a la actual: responde 422 CONTRASENA_REPETIDA', async () => {
    const res = await cambiar(ids.temporal, { contrasenaActual: ACTUAL, contrasenaNueva: ACTUAL });

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('CONTRASENA_REPETIDA');
  });

  it.each([
    ['corta', 'tucan grap7', MOTIVOS.corta],
    ['con el nombre', 'PRUEBA caballo bateria', MOTIVOS.nombre],
    ['fácil de adivinar', 'contrasena12345', MOTIVOS.adivinable],
  ])('nueva %s: responde 422 CONTRASENA_DEBIL con el motivo', async (_, contrasenaNueva, motivo) => {
    const res = await cambiar(ids.temporal, { contrasenaActual: ACTUAL, contrasenaNueva });

    expect(res.status).toBe(422);
    expect(res.body).toEqual({ error: { codigo: 'CONTRASENA_DEBIL', mensaje: motivo } });
    expect(Boolean((await leerCuenta(ids.temporal)).debe_cambiar_contrasena)).toBe(true);
    expect(await filasCambio(ids.temporal)).toHaveLength(0);
  });

  it('cambio correcto: responde 204, deja la cuenta sin cambio pendiente, registra la bitácora y solo entra la nueva', async () => {
    const filasAntes = (await filasCambio(ids.permanente)).length;

    const res = await cambiar(ids.permanente, { contrasenaActual: ACTUAL, contrasenaNueva: NUEVA });

    expect(res.status).toBe(204);
    expect(Boolean((await leerCuenta(ids.permanente)).debe_cambiar_contrasena)).toBe(false);

    const filas = await filasCambio(ids.permanente);
    expect(filas).toHaveLength(filasAntes + 1);
    expect(filas[0]).toEqual({
      usuario_id: ids.permanente,
      entidad: 'usuario',
      entidad_id: String(ids.permanente),
      valores_anteriores: { debeCambiarContrasena: true },
      valores_nuevos: { debeCambiarContrasena: false },
    });

    expect((await iniciarSesion(PERMANENTE, ACTUAL)).status).toBe(401);
    expect((await iniciarSesion(PERMANENTE, NUEVA)).status).toBe(200);
  });
});
