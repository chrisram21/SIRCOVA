import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';

const USUARIO = process.env.PRUEBA_USUARIO;
const CONTRASENA = process.env.PRUEBA_CONTRASENA;

let sesion;

const yo = (autorizacion) => {
  const peticion = request(app).get('/api/v1/auth/yo');
  if (autorizacion) peticion.set('Authorization', autorizacion);
  return peticion;
};

beforeAll(async () => {
  if (!USUARIO || !CONTRASENA) throw new Error('Defina PRUEBA_USUARIO y PRUEBA_CONTRASENA en backend/.env');
  const respuesta = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: USUARIO, contrasena: CONTRASENA });
  if (respuesta.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${respuesta.status})`);
  sesion = respuesta.body;
});

describe('GET /api/v1/auth/yo', () => {
  it('devuelve la cuenta de la sesión con los datos de su empleado y su lugar de trabajo', async () => {
    const respuesta = await yo(`Bearer ${sesion.token}`);

    expect(respuesta.status).toBe(200);
    const { usuario } = sesion;
    expect(respuesta.body).toMatchObject({
      id: usuario.id,
      nombreUsuario: usuario.nombreUsuario,
      rol: usuario.rol,
      rolNombre: usuario.rolNombre,
      permisos: usuario.permisos,
      debeCambiarContrasena: false,
    });
    expect(respuesta.body.empleado).toMatchObject(usuario.empleado);
    expect(typeof respuesta.body.empleado.cuiRegistrado).toBe('boolean');
    expect(Date.parse(respuesta.body.creadoEn)).not.toBeNaN();
    // El último acceso es el inicio de sesión de beforeAll: si la zona horaria se corriera, saldría horas atrás.
    expect(Math.abs(Date.now() - Date.parse(respuesta.body.ultimoAcceso))).toBeLessThan(10 * 60 * 1000);
    if (respuesta.body.empleado.ddrissId !== null) {
      expect(respuesta.body.empleado.ddrissNombre).toEqual(expect.any(String));
    }
    if (respuesta.body.empleado.establecimientoId !== null) {
      expect(respuesta.body.empleado.establecimientoNombre).toEqual(expect.any(String));
    }
  });

  it('nunca devuelve el CUI, su huella, la contraseña ni los datos del bloqueo', async () => {
    const respuesta = await yo(`Bearer ${sesion.token}`);

    const texto = JSON.stringify(respuesta.body);
    for (const clave of ['cui', 'cuiHmac', 'cui_hmac', 'hashContrasena', 'hash_contrasena', 'contrasena', 'intentosFallidos', 'bloqueadoHasta']) {
      expect(texto).not.toContain(`"${clave}"`);
    }
  });

  it('sin token responde 401', async () => {
    const respuesta = await yo();

    expect(respuesta.status).toBe(401);
    expect(respuesta.body.error.codigo).toBe('NO_AUTENTICADO');
  });
});
