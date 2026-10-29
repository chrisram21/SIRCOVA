import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { autenticar, verificarToken } from '../src/middlewares/autenticar.js';
import { manejarErrores } from '../src/middlewares/errores.js';
import { tokenDePrueba, borrarSesionesDe } from './sesionDePrueba.js';

// Apps mínimas solo para la prueba: así se revisa req.usuario sin depender de una ruta real.
// La de verificarToken no consulta la base, por eso acepta el usuario 7 firmado a mano.
const appToken = express();
appToken.get('/protegida', verificarToken, (req, res) => res.json(req.usuario));
appToken.use(manejarErrores);

const appCompleta = express();
appCompleta.get('/protegida', autenticar, (req, res) => res.json(req.usuario));
appCompleta.use(manejarErrores);

const datosSesion = {
  rol: 'ADMINISTRADOR',
  permisos: ['POBLACION_REGISTRAR'],
  ddrissId: 1,
  establecimientoId: null,
  municipioId: null,
};

// El sid va fuera de datosSesion porque no forma parte de req.usuario.
const firmar = (opciones = {}, secreto = entorno.jwt.secreto, carga = { ...datosSesion, sid: 1 }) =>
  jwt.sign(carga, secreto, { algorithm: 'HS256', subject: '7', expiresIn: '5m', ...opciones });

const pedir = (encabezado) => {
  const peticion = request(appToken).get('/protegida');
  return encabezado === undefined ? peticion : peticion.set('Authorization', encabezado);
};

const iniciarSesion = () =>
  request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });

describe('verificarToken', () => {
  it.each([
    ['sin encabezado', undefined],
    ['encabezado vacío', ''],
    ['Bearer sin token', 'Bearer '],
    ['otro esquema', `Basic ${firmar()}`],
    ['token mal formado', 'Bearer esto-no-es-un-jwt'],
    ['token firmado con otro secreto', `Bearer ${firmar({}, 'otro-secreto-cualquiera')}`],
    ['token con otro algoritmo (HS512)', `Bearer ${firmar({ algorithm: 'HS512' })}`],
    ['token sin sub', `Bearer ${jwt.sign(datosSesion, entorno.jwt.secreto, { algorithm: 'HS256' })}`],
    ['token sin sid', `Bearer ${firmar({}, entorno.jwt.secreto, datosSesion)}`],
    ['token con un sid que no es un entero', `Bearer ${firmar({}, entorno.jwt.secreto, { ...datosSesion, sid: 'uno' })}`],
  ])('%s: responde 401 NO_AUTENTICADO', async (_, encabezado) => {
    const res = await pedir(encabezado);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debe iniciar sesión.' } });
  });

  it('token vencido: responde 401 SESION_VENCIDA', async () => {
    const res = await pedir(`Bearer ${firmar({ expiresIn: -10 })}`);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { codigo: 'SESION_VENCIDA', mensaje: 'Su sesión venció; inicie sesión de nuevo.' },
    });
  });

  it('token válido: deja los datos de la sesión en req.usuario', async () => {
    const res = await pedir(`Bearer ${firmar()}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ id: 7, ...datosSesion });
  });
});

describe('autenticar', () => {
  it('acepta el token que devuelve POST /auth/login', async () => {
    const login = await iniciarSesion();

    const res = await request(appCompleta).get('/protegida').set('Authorization', `Bearer ${login.body.token}`);

    expect(login.status).toBe(200);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: login.body.usuario.id,
      rol: login.body.usuario.rol,
      permisos: login.body.usuario.permisos,
      ddrissId: login.body.usuario.empleado.ddrissId,
      establecimientoId: login.body.usuario.empleado.establecimientoId,
      municipioId: login.body.usuario.empleado.municipioId,
      debeCambiarContrasena: false,
    });
  });
});

// Las cuentas se crean por SQL con este prefijo y se borran en afterAll. Nunca se inicia sesión con ellas y los
// tokens llevan ROL_CONSULTAR: un login o un 403 dejarían en la bitácora una llave foránea a la cuenta.
describe('autenticar revisa la cuenta en la base', () => {
  const PREFIJO = 'vitest-hu05-aut-';
  const ids = {};
  let ddrissId;
  let sidAjeno;

  async function crearCuenta(nombre, { cuentaActiva = true, empleadoActiva = true, debeCambiar = false } = {}) {
    const [empleado] = await pool.query(
      `INSERT INTO empleado (nombres, apellidos, correo, ddriss_id, activo) VALUES ('Prueba', 'HU-05', ?, ?, ?)`,
      [`${PREFIJO}${nombre}@prueba.local`, ddrissId, empleadoActiva],
    );
    const [usuario] = await pool.query(
      `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id, activo, debe_cambiar_contrasena)
       SELECT ?, ?, 'sin-contrasena', id, ?, ? FROM rol WHERE codigo = 'REVISOR'`,
      [empleado.insertId, `${PREFIJO}${nombre}`, cuentaActiva, debeCambiar],
    );
    return usuario.insertId;
  }

  const tokenPara = (id, datos = {}) =>
    tokenDePrueba(id, {
      rol: 'REVISOR', permisos: ['ROL_CONSULTAR'], ddrissId, establecimientoId: null, municipioId: null, ...datos,
    });

  const consultarRoles = async (credencial) =>
    request(app).get('/api/v1/roles').set('Authorization', `Bearer ${await credencial}`);

  beforeAll(async () => {
    const login = await iniciarSesion();
    if (login.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${login.status})`);
    ddrissId = login.body.usuario.empleado.ddrissId;
    sidAjeno = jwt.decode(login.body.token).sid;

    ids.activa = await crearCuenta('activa');
    ids.desactivada = await crearCuenta('desactivada', { cuentaActiva: false });
    ids.empleadoInactivo = await crearCuenta('empinactivo', { empleadoActiva: false });
    ids.debeCambiar = await crearCuenta('debecambiar', { debeCambiar: true });
  });

  afterAll(async () => {
    await borrarSesionesDe(`${PREFIJO}%`);
    await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO}%`]);
    await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO}%`]);
  });

  it('con la cuenta activa y los datos del token correctos: responde 200', async () => {
    const res = await consultarRoles(tokenPara(ids.activa));

    expect(res.status).toBe(200);
  });

  it.each([
    ['la cuenta', 'desactivada'],
    ['el empleado', 'empleadoInactivo'],
  ])('con %s desactivado: responde 401 CUENTA_DESACTIVADA', async (_, cuenta) => {
    const res = await consultarRoles(tokenPara(ids[cuenta]));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { codigo: 'CUENTA_DESACTIVADA', mensaje: 'Su cuenta está desactivada; contacte al administrador.' },
    });
  });

  it.each([
    ['otro rol', { rol: 'ADMINISTRADOR' }],
    ['otro establecimiento', { establecimientoId: 999999 }],
    ['otro municipio', { municipioId: 9999 }],
  ])('con %s en el token: responde 401 SESION_DESACTUALIZADA', async (_, datos) => {
    const res = await consultarRoles(tokenPara(ids.activa, datos));

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { codigo: 'SESION_DESACTUALIZADA', mensaje: 'Sus datos de acceso cambiaron; inicie sesión de nuevo.' },
    });
  });

  it('con un sub que no existe: responde 401 NO_AUTENTICADO', async () => {
    // Una cuenta que no existe no puede tener sesión: este token se firma a mano.
    const res = await consultarRoles(
      jwt.sign({ rol: 'REVISOR', permisos: [], sid: 1 }, entorno.jwt.secreto, { algorithm: 'HS256', subject: '999999999' }),
    );

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debe iniciar sesión.' } });
  });

  it('con el sid de una sesión de otra cuenta: responde 401 NO_AUTENTICADO', async () => {
    const ajeno = jwt.sign(
      { rol: 'REVISOR', permisos: ['ROL_CONSULTAR'], ddrissId, establecimientoId: null, municipioId: null, sid: sidAjeno },
      entorno.jwt.secreto,
      { algorithm: 'HS256', subject: String(ids.activa), expiresIn: '5m' },
    );

    const res = await consultarRoles(ajeno);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debe iniciar sesión.' } });
  });

  it('con la contraseña temporal pendiente: responde 403 CAMBIO_CONTRASENA_REQUERIDO', async () => {
    const res = await consultarRoles(tokenPara(ids.debeCambiar));

    expect(res.status).toBe(403);
    expect(res.body).toEqual({
      error: { codigo: 'CAMBIO_CONTRASENA_REQUERIDO', mensaje: 'Debe cambiar su contraseña temporal antes de continuar.' },
    });
  });

  // Un 204 dejaría filas con el id de la cuenta; un 400 de validación demuestra igual que la ruta no exige el cambio.
  it.each([
    ['POST /auth/logout', '/api/v1/auth/logout', { motivo: 'OTRO' }],
    ['POST /auth/contrasena', '/api/v1/auth/contrasena', {}],
  ])('con la contraseña temporal pendiente, %s no responde ese 403', async (_, ruta, cuerpo) => {
    const token = await tokenPara(ids.debeCambiar);
    const res = await request(app).post(ruta).set('Authorization', `Bearer ${token}`).send(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('ninguno de esos 401 ni el 403 deja filas en la bitácora', async () => {
    const cuentas = Object.values(ids).map(String);
    const [[{ filas }]] = await pool.query(
      `SELECT COUNT(*) AS filas FROM bitacora WHERE usuario_id IN (?) OR (entidad = 'usuario' AND entidad_id IN (?))`,
      [Object.values(ids), cuentas],
    );

    expect(filas).toBe(0);
  });
});
