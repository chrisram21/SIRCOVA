import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import { autenticar } from '../src/middlewares/autenticar.js';
import { manejarErrores } from '../src/middlewares/errores.js';

// App mínima solo para la prueba: el middleware todavía no protege ninguna ruta real.
const appPrueba = express();
appPrueba.get('/protegida', autenticar, (req, res) => res.json(req.usuario));
appPrueba.use(manejarErrores);

const datosSesion = {
  rol: 'ADMINISTRADOR',
  permisos: ['POBLACION_REGISTRAR'],
  ddrissId: 1,
  establecimientoId: null,
  municipioId: null,
};

const firmar = (opciones = {}, secreto = entorno.jwt.secreto) =>
  jwt.sign(datosSesion, secreto, { algorithm: 'HS256', subject: '7', expiresIn: '5m', ...opciones });

const pedir = (encabezado) => {
  const peticion = request(appPrueba).get('/protegida');
  return encabezado === undefined ? peticion : peticion.set('Authorization', encabezado);
};

describe('middleware autenticar', () => {
  it.each([
    ['sin encabezado', undefined],
    ['encabezado vacío', ''],
    ['Bearer sin token', 'Bearer '],
    ['otro esquema', `Basic ${firmar()}`],
    ['token mal formado', 'Bearer esto-no-es-un-jwt'],
    ['token firmado con otro secreto', `Bearer ${firmar({}, 'otro-secreto-cualquiera')}`],
    ['token con otro algoritmo (HS512)', `Bearer ${firmar({ algorithm: 'HS512' })}`],
    ['token sin sub', `Bearer ${jwt.sign(datosSesion, entorno.jwt.secreto, { algorithm: 'HS256' })}`],
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

  it('acepta el token que devuelve POST /auth/login', async () => {
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });

    const res = await pedir(`Bearer ${login.body.token}`);

    expect(login.status).toBe(200);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      id: login.body.usuario.id,
      rol: login.body.usuario.rol,
      permisos: login.body.usuario.permisos,
      ddrissId: login.body.usuario.empleado.ddrissId,
      establecimientoId: login.body.usuario.empleado.establecimientoId,
      municipioId: login.body.usuario.empleado.municipioId,
    });
  });
});
