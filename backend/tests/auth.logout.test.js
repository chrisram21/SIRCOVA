import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import entorno from '../src/config/entorno.js';

const USUARIO = process.env.PRUEBA_USUARIO;
const CONTRASENA = process.env.PRUEBA_CONTRASENA;
const AGENTE = 'vitest-sircova';

let token;
let usuarioId;

const logout = (cuerpo, autorizacion = `Bearer ${token}`) => {
  const peticion = request(app).post('/api/v1/auth/logout').set('User-Agent', AGENTE);
  if (autorizacion) peticion.set('Authorization', autorizacion);
  return cuerpo === undefined ? peticion : peticion.send(cuerpo);
};

async function ultimoIdBitacora() {
  const [[fila]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS id FROM bitacora');
  return fila.id;
}

async function bitacoraDesde(id) {
  const [filas] = await pool.query('SELECT * FROM bitacora WHERE id > ? ORDER BY id', [id]);
  return filas;
}

beforeAll(async () => {
  if (!USUARIO || !CONTRASENA) throw new Error('Defina PRUEBA_USUARIO y PRUEBA_CONTRASENA en backend/.env');
  const respuesta = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: USUARIO, contrasena: CONTRASENA });
  if (respuesta.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${respuesta.status})`);
  token = respuesta.body.token;
  usuarioId = respuesta.body.usuario.id;
});

describe('POST /api/v1/auth/logout', () => {
  it('sin cuerpo responde 204 y registra LOGOUT con motivo MANUAL', async () => {
    const desde = await ultimoIdBitacora();

    const respuesta = await logout();

    expect(respuesta.status).toBe(204);
    expect(respuesta.text).toBe('');
    const filas = await bitacoraDesde(desde);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      usuario_id: usuarioId,
      nombre_usuario_intento: null,
      modulo: 'USUARIOS',
      accion: 'LOGOUT',
      entidad: 'usuario',
      entidad_id: String(usuarioId),
      valores_nuevos: { motivo: 'MANUAL' },
      agente_usuario: AGENTE,
    });
    expect(filas[0].ip_origen).toBeTruthy();
  });

  it('con motivo INACTIVIDAD registra ese motivo', async () => {
    const desde = await ultimoIdBitacora();

    const respuesta = await logout({ motivo: 'INACTIVIDAD' });

    expect(respuesta.status).toBe(204);
    const filas = await bitacoraDesde(desde);
    expect(filas).toHaveLength(1);
    expect(filas[0].accion).toBe('LOGOUT');
    expect(filas[0].valores_nuevos).toEqual({ motivo: 'INACTIVIDAD' });
  });

  it('con un motivo desconocido responde 400 y no escribe en la bitácora', async () => {
    const desde = await ultimoIdBitacora();

    const respuesta = await logout({ motivo: 'OTRO' });

    expect(respuesta.status).toBe(400);
    expect(respuesta.body).toEqual({
      error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'El motivo del cierre de sesión no es válido.' },
    });
    expect(await bitacoraDesde(desde)).toHaveLength(0);
  });

  it('sin token responde 401 NO_AUTENTICADO y no escribe en la bitácora', async () => {
    const desde = await ultimoIdBitacora();

    const respuesta = await logout(undefined, null);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('NO_AUTENTICADO');
    expect(await bitacoraDesde(desde)).toHaveLength(0);
  });

  it('con un token vencido responde 401 SESION_VENCIDA y no escribe en la bitácora', async () => {
    const vencido = jwt.sign({ rol: 'ADMINISTRADOR', permisos: [] }, entorno.jwt.secreto, {
      algorithm: 'HS256',
      subject: String(usuarioId),
      expiresIn: -10,
    });
    const desde = await ultimoIdBitacora();

    const respuesta = await logout(undefined, `Bearer ${vencido}`);

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('SESION_VENCIDA');
    expect(await bitacoraDesde(desde)).toHaveLength(0);
  });
});
