import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import { autenticar } from '../src/middlewares/autenticar.js';
import { requierePermiso } from '../src/middlewares/permisos.js';
import { manejarErrores } from '../src/middlewares/errores.js';

// App mínima solo para la prueba: todavía no hay endpoints de negocio con permiso.
const appPrueba = express();
appPrueba.get('/consulta', autenticar, requierePermiso('PRUEBA_CONSULTAR'), (req, res) => res.json({ ok: true }));
appPrueba.post('/consulta', autenticar, requierePermiso('PRUEBA_CONSULTAR'), (req, res) => res.json({ ok: true }));
appPrueba.get('/poblacion', autenticar, requierePermiso('POBLACION_REGISTRAR'), (req, res) => res.json({ ok: true }));
appPrueba.get('/creacion', autenticar, requierePermiso('PRUEBA_CREAR'), (req, res) => res.json({ ok: true }));
appPrueba.use(manejarErrores);

const firmar = (rol, permisos) =>
  jwt.sign(
    { rol, permisos, ddrissId: 1, establecimientoId: null, municipioId: null },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: '7', expiresIn: '5m' },
  );

const errorSinPermiso = {
  error: { codigo: 'SIN_PERMISO', mensaje: 'No tiene permiso para realizar esta acción.' },
};

describe('middleware requierePermiso', () => {
  it('con el permiso: responde 200', async () => {
    const res = await request(appPrueba)
      .get('/consulta')
      .set('Authorization', `Bearer ${firmar('REVISOR', ['PRUEBA_CONSULTAR'])}`);

    expect(res.status).toBe(200);
  });

  it('sin permisos: responde 403 SIN_PERMISO', async () => {
    const res = await request(appPrueba).get('/consulta').set('Authorization', `Bearer ${firmar('REVISOR', [])}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorSinPermiso);
  });

  it('con otro permiso del mismo módulo: responde 403 SIN_PERMISO', async () => {
    const res = await request(appPrueba)
      .get('/consulta')
      .set('Authorization', `Bearer ${firmar('REVISOR', ['PRUEBA_CREAR'])}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorSinPermiso);
  });

  it('AUTORIDAD con el permiso: GET responde 200', async () => {
    const res = await request(appPrueba)
      .get('/consulta')
      .set('Authorization', `Bearer ${firmar('AUTORIDAD', ['PRUEBA_CONSULTAR'])}`);

    expect(res.status).toBe(200);
  });

  it('AUTORIDAD con el permiso: POST responde 403 SIN_PERMISO', async () => {
    const res = await request(appPrueba)
      .post('/consulta')
      .set('Authorization', `Bearer ${firmar('AUTORIDAD', ['PRUEBA_CONSULTAR'])}`);

    expect(res.status).toBe(403);
    expect(res.body).toEqual(errorSinPermiso);
  });

  it('sin token: responde 401 NO_AUTENTICADO', async () => {
    const res = await request(appPrueba).get('/consulta');

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('NO_AUTENTICADO');
  });

  it.each(['minusculas', 'SINGUION', 'prueba_crear', '_PRUEBA', ''])(
    'el código "%s" lanza un error al crearse',
    (codigo) => {
      expect(() => requierePermiso(codigo)).toThrow(/ENTIDAD_ACCION/);
    },
  );
});

// El usuario de prueba es ADMINISTRADOR, que tiene POBLACION_REGISTRAR en rol_permiso.
describe('requierePermiso con el token de POST /auth/login', () => {
  const iniciarSesion = () =>
    request(app)
      .post('/api/v1/auth/login')
      .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });

  it('el permiso asignado en rol_permiso responde 200 y uno no asignado responde 403', async () => {
    const login = await iniciarSesion();
    expect(login.status).toBe(200);
    const autorizacion = `Bearer ${login.body.token}`;

    const permitido = await request(appPrueba).get('/poblacion').set('Authorization', autorizacion);
    const denegado = await request(appPrueba).get('/creacion').set('Authorization', autorizacion);

    expect(permitido.status).toBe(200);
    expect(denegado.status).toBe(403);
    expect(denegado.body).toEqual(errorSinPermiso);
  });
});
