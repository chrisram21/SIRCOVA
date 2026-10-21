import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';

// Todo lo que crean estas pruebas lleva este prefijo y se borra en afterAll. Nunca se inicia sesión con las cuentas
// creadas: la bitácora tiene llave foránea a usuario y entonces ya no se podrían borrar.
const PREFIJO = 'vitest-hu04-';

let token;
let administrador;
let establecimientoActivo;
let establecimientoInactivoId;

const firmar = (datos) =>
  jwt.sign(
    { rol: 'ADMINISTRADOR', permisos: [], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null, ...datos },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(administrador.id), expiresIn: '5m' },
  );

let consecutivo = 0;
const unico = () => `${Date.now().toString(36)}${(consecutivo += 1)}`;
const correoUnico = () => `${PREFIJO}${unico()}@prueba.local`;

const registrar = (cuerpo, credencial = token) =>
  request(app).post('/api/v1/empleados').set('Authorization', `Bearer ${credencial}`).send(cuerpo);

const minimo = (extra = {}) => ({ nombres: 'Prueba', apellidos: 'HU-04', correo: correoUnico(), ...extra });

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  administrador = { id: res.body.usuario.id, ddrissId: res.body.usuario.empleado.ddrissId };

  [[establecimientoActivo]] = await pool.query(
    'SELECT id, municipio_id, tipo_establecimiento_id FROM establecimiento WHERE ddriss_id = ? AND activo = TRUE LIMIT 1',
    [administrador.ddrissId],
  );
  if (!establecimientoActivo) throw new Error('La base de prueba no tiene establecimientos activos en la DDRISS del usuario');

  const [resultado] = await pool.query(
    `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, municipio_id, activo)
     VALUES (?, 'Establecimiento inactivo de prueba', ?, ?, ?, FALSE)`,
    [`${PREFIJO}inact`, establecimientoActivo.tipo_establecimiento_id, administrador.ddrissId, establecimientoActivo.municipio_id],
  );
  establecimientoInactivoId = resultado.insertId;
});

afterAll(async () => {
  await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM empleado WHERE correo LIKE ? OR codigo_empleado LIKE ?', [`${PREFIJO}%`, `${PREFIJO}%`]);
  await pool.query('DELETE FROM establecimiento WHERE codigo = ?', [`${PREFIJO}inact`]);
});

describe('POST /empleados', () => {
  it('con datos mínimos responde 201, guarda la DDRISS del administrador y registra la bitácora', async () => {
    const res = await registrar(minimo({ cargo: '  ', telefono: '' }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombres: 'Prueba',
      apellidos: 'HU-04',
      cargo: null,
      telefono: null,
      establecimientoId: null,
      municipioId: null,
      ddrissId: administrador.ddrissId,
      activo: true,
    });

    const [[fila]] = await pool.query('SELECT ddriss_id, cargo FROM empleado WHERE id = ?', [res.body.id]);
    expect(fila).toEqual({ ddriss_id: administrador.ddrissId, cargo: null });

    const [bitacora] = await pool.query(
      `SELECT usuario_id, valores_nuevos FROM bitacora
        WHERE modulo = 'USUARIOS' AND accion = 'CREAR' AND entidad = 'empleado' AND entidad_id = ?`,
      [String(res.body.id)],
    );
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0].usuario_id).toBe(administrador.id);
    const valores = typeof bitacora[0].valores_nuevos === 'string' ? JSON.parse(bitacora[0].valores_nuevos) : bitacora[0].valores_nuevos;
    expect(valores).toMatchObject({ id: res.body.id, ddrissId: administrador.ddrissId });
  });

  it('ignora una DDRISS enviada en el cuerpo', async () => {
    const res = await registrar(minimo({ ddrissId: administrador.ddrissId + 100 }));

    expect(res.status).toBe(201);
    expect(res.body.ddrissId).toBe(administrador.ddrissId);
  });

  it('con establecimiento, el municipio sale del establecimiento', async () => {
    const res = await registrar(minimo({ establecimientoId: establecimientoActivo.id }));

    expect(res.status).toBe(201);
    expect(res.body.establecimientoId).toBe(establecimientoActivo.id);
    expect(res.body.municipioId).toBe(establecimientoActivo.municipio_id);
  });

  it('sin establecimiento acepta un municipio del departamento sede', async () => {
    const res = await registrar(minimo({ municipioId: establecimientoActivo.municipio_id }));

    expect(res.status).toBe(201);
    expect(res.body.municipioId).toBe(establecimientoActivo.municipio_id);
  });

  it('sin nombres, o con establecimiento y municipio juntos, responde 400 ENTRADA_INVALIDA', async () => {
    for (const cuerpo of [
      minimo({ nombres: '   ' }),
      minimo({ establecimientoId: establecimientoActivo.id, municipioId: establecimientoActivo.municipio_id }),
      minimo({ correo: 'sin-arroba' }),
      minimo({ establecimientoId: 'uno' }),
    ]) {
      const res = await registrar(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('un establecimiento inexistente, inactivo o de otra DDRISS responde 422 ESTABLECIMIENTO_INVALIDO', async () => {
    const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 100, permisos: ['EMPLEADO_CREAR'] });
    for (const [cuerpo, credencial] of [
      [minimo({ establecimientoId: 999999999 }), token],
      [minimo({ establecimientoId: establecimientoInactivoId }), token],
      [minimo({ establecimientoId: establecimientoActivo.id }), otraDdriss],
    ]) {
      const res = await registrar(cuerpo, credencial);
      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('ESTABLECIMIENTO_INVALIDO');
    }
  });

  it('un municipio de otro departamento responde 422 MUNICIPIO_INVALIDO', async () => {
    const [[municipio]] = await pool.query(
      `SELECT m.id FROM municipio m
        WHERE m.departamento_id <> (SELECT departamento_id FROM ddriss WHERE id = ?) LIMIT 1`,
      [administrador.ddrissId],
    );
    if (!municipio) return;

    const res = await registrar(minimo({ municipioId: municipio.id }));

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('MUNICIPIO_INVALIDO');
  });

  it('un correo o un código repetidos responden 409', async () => {
    const correo = correoUnico();
    const codigoEmpleado = `${PREFIJO}${unico()}`.slice(0, 20);
    expect((await registrar(minimo({ correo, codigoEmpleado }))).status).toBe(201);

    const porCorreo = await registrar(minimo({ correo }));
    expect(porCorreo.status).toBe(409);
    expect(porCorreo.body.error.codigo).toBe('CORREO_DUPLICADO');

    const porCodigo = await registrar(minimo({ codigoEmpleado }));
    expect(porCodigo.status).toBe(409);
    expect(porCodigo.body.error.codigo).toBe('CODIGO_EMPLEADO_DUPLICADO');
  });

  it('sin EMPLEADO_CREAR responde 403 SIN_PERMISO', async () => {
    const res = await registrar(minimo(), firmar({ permisos: ['USUARIO_CREAR'] }));

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});
