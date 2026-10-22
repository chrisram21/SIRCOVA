import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';

let token;
let administrador;

// autenticar compara el rol, el establecimiento y el municipio del token con los de la cuenta, así que los
// casos de otro rol usan cuentas propias, creadas por SQL con este prefijo y borradas en afterAll.
// Nunca se inicia sesión con ellas: la bitácora tendría una llave foránea a la cuenta.
const PREFIJO = 'vitest-hu05-cat-';

const firmarPara = (id, datos) =>
  jwt.sign(
    { rol: 'ADMINISTRADOR', permisos: [], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null, ...datos },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(id), expiresIn: '5m' },
  );

// Firma un token con el mismo usuario de prueba pero otros permisos o DDRISS, para los casos sin permiso o de otro ámbito.
const firmar = (datos) => firmarPara(administrador.id, datos);

async function crearCuentaPrueba(nombre, rol, { ddrissId, establecimientoId = null }) {
  const [empleado] = await pool.query(
    `INSERT INTO empleado (nombres, apellidos, correo, establecimiento_id, ddriss_id) VALUES ('Prueba', 'HU-05', ?, ?, ?)`,
    [`${PREFIJO}${nombre}@prueba.local`, establecimientoId, ddrissId],
  );
  const [usuario] = await pool.query(
    `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id, debe_cambiar_contrasena)
     SELECT ?, ?, 'sin-contrasena', id, FALSE FROM rol WHERE codigo = ?`,
    [empleado.insertId, `${PREFIJO}${nombre}`, rol],
  );
  return usuario.insertId;
}

const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  administrador = { id: res.body.usuario.id, ddrissId: res.body.usuario.empleado.ddrissId };
});

afterAll(async () => {
  await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO}%`]);
});

describe('GET /roles', () => {
  it('devuelve los cinco roles con id, código y nombre', async () => {
    const res = await consultar('/roles');

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.codigo).sort()).toEqual(
      ['ADMINISTRADOR', 'AUTORIDAD', 'EPIDEMIOLOGIA', 'ESTABLECIMIENTO', 'REVISOR'],
    );
    expect(Object.keys(res.body[0]).sort()).toEqual(['codigo', 'id', 'nombre']);
  });
});

describe('GET /ddriss', () => {
  it('devuelve solo la DDRISS del usuario', async () => {
    const res = await consultar('/ddriss');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(administrador.ddrissId);
    expect(Object.keys(res.body[0]).sort()).toEqual(['codigo', 'departamentoId', 'id', 'nombre']);
  });
});

describe('GET /municipios', () => {
  it('devuelve solo los municipios activos del departamento sede, por nombre', async () => {
    const [[{ departamento_id: departamentoId }]] = await pool.query(
      'SELECT departamento_id FROM ddriss WHERE id = ?',
      [administrador.ddrissId],
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM municipio WHERE departamento_id = ? AND activo = TRUE',
      [departamentoId],
    );

    const res = await consultar('/municipios');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
    expect(res.body.every((m) => m.departamentoId === departamentoId && m.activo === true)).toBe(true);
    const nombres = res.body.map((m) => m.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    expect(res.body[0]).not.toHaveProperty('esJurisdiccion');
  });

  it('la autoridad nacional recibe todos los municipios activos', async () => {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM municipio WHERE activo = TRUE');

    const autoridad = await crearCuentaPrueba('autoridad', 'AUTORIDAD', { ddrissId: null });

    const res = await consultar(
      '/municipios',
      firmarPara(autoridad, { rol: 'AUTORIDAD', ddrissId: null, permisos: ['MUNICIPIO_CONSULTAR'] }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
  });
});

describe('GET /establecimientos', () => {
  it('devuelve solo los establecimientos de su DDRISS', async () => {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM establecimiento WHERE ddriss_id = ?', [
      administrador.ddrissId,
    ]);

    const res = await consultar('/establecimientos');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
    const ids = res.body.map((e) => e.id);
    if (ids.length > 0) {
      const [fuera] = await pool.query('SELECT id FROM establecimiento WHERE id IN (?) AND ddriss_id <> ?', [
        ids,
        administrador.ddrissId,
      ]);
      expect(fuera).toEqual([]);
    }
  });

  it('con activo=true no devuelve inactivos y con municipioId filtra por municipio', async () => {
    const activos = await consultar('/establecimientos?activo=true');
    expect(activos.status).toBe(200);
    expect(activos.body.every((e) => e.activo === true)).toBe(true);

    const municipioId = activos.body[0]?.municipioId;
    if (municipioId) {
      const delMunicipio = await consultar(`/establecimientos?municipioId=${municipioId}`);
      expect(delMunicipio.status).toBe(200);
      expect(delMunicipio.body.every((e) => e.municipioId === municipioId)).toBe(true);
    }
  });

  it('un filtro mal formado responde 400 ENTRADA_INVALIDA', async () => {
    for (const consulta of ['activo=si', 'municipioId=abc']) {
      const res = await consultar(`/establecimientos?${consulta}`);
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('el personal de establecimiento solo recibe el suyo', async () => {
    const [[establecimiento]] = await pool.query('SELECT id FROM establecimiento WHERE ddriss_id = ? LIMIT 1', [
      administrador.ddrissId,
    ]);
    if (!establecimiento) return;
    const personal = await crearCuentaPrueba('establecimiento', 'ESTABLECIMIENTO', {
      ddrissId: administrador.ddrissId,
      establecimientoId: establecimiento.id,
    });

    const res = await consultar(
      '/establecimientos',
      firmarPara(personal, { rol: 'ESTABLECIMIENTO', establecimientoId: establecimiento.id, permisos: ['ESTABLECIMIENTO_CONSULTAR'] }),
    );

    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.id)).toEqual([establecimiento.id]);
  });
});

describe('permisos de los catálogos', () => {
  it.each(['/roles', '/ddriss', '/municipios', '/establecimientos'])('%s sin su permiso responde 403 SIN_PERMISO', async (ruta) => {
    const res = await consultar(ruta, firmar({ permisos: ['POBLACION_REGISTRAR'] }));

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});
