import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';

// Las pruebas usan el año 2021 (ANIO_PRUEBA): crean sus 12 meses en periodo (sin cierre_periodo) y borran esos
// meses y la población de 2021 al inicio y al final. 2020 es de periodos.test.js.
const ANIO_PRUEBA = 2021;
const GRUPOS = ['NACIDOS_VIVOS', 'MENOR_1', '1_A_MENOR_2', '4_ANIOS', '1_A_5', 'MEF_15_49', 'EMBARAZADAS'];

async function limpiar() {
  await pool.query('DELETE FROM poblacion_objetivo WHERE anio = ?', [ANIO_PRUEBA]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO_PRUEBA]);
}

async function crearMesesDePrueba() {
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const ultimoDia = new Date(Date.UTC(ANIO_PRUEBA, mes, 0)).getUTCDate();
    const mm = String(mes).padStart(2, '0');
    return [ANIO_PRUEBA, mes, `${ANIO_PRUEBA}-${mm}-01`, `${ANIO_PRUEBA}-${mm}-${ultimoDia}`];
  });
  await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES ?', [meses]);
}

afterAll(limpiar);

let token;
let ddrissUsuario;
let tokenEpidemiologia;
let tokenRevisor;

const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
const guardar = (municipioId, anio, cuerpo, credencial = token) =>
  request(app)
    .put(`/api/v1/poblaciones-objetivo/${municipioId}/${anio}`)
    .set('Authorization', `Bearer ${credencial}`)
    .send(cuerpo);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
async function filasBitacora(ids) {
  if (ids.length === 0) return [];
  const [filas] = await pool.query(
    `SELECT accion, entidad_id, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND entidad = 'poblacion_objetivo' AND entidad_id IN (?)
      ORDER BY id`,
    [ids.map(String)],
  );
  return filas.map((f) => ({
    accion: f.accion,
    entidadId: Number(f.entidad_id),
    anteriores: leerJson(f.valores_anteriores),
    nuevos: leerJson(f.valores_nuevos),
  }));
}

async function filasPoblacion(municipioId) {
  const [filas] = await pool.query(
    `SELECT po.id, cp.codigo, po.cantidad, po.fuente
       FROM poblacion_objetivo po
       JOIN clasificacion_poblacion cp ON cp.id = po.clasificacion_poblacion_id
      WHERE po.municipio_id = ? AND po.anio = ?
      ORDER BY cp.id`,
    [municipioId, ANIO_PRUEBA],
  );
  return filas;
}

const idDeMunicipio = async (codigoIne) => {
  const [[fila]] = await pool.query('SELECT id FROM municipio WHERE codigo_ine = ?', [codigoIne]);
  return fila.id;
};

// Los municipios del departamento sede de la DDRISS del usuario, calculados aparte del servicio.
async function municipiosEsperados() {
  const [filas] = await pool.query(
    `SELECT m.id, m.codigo_ine, m.nombre
       FROM municipio m
       JOIN ddriss d ON d.departamento_id = m.departamento_id
      WHERE d.id = ? AND m.activo = TRUE AND m.codigo_ine <> '9999'
      ORDER BY m.nombre`,
    [ddrissUsuario],
  );
  return filas;
}

beforeAll(async () => {
  await limpiar();
  await crearMesesDePrueba();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  ddrissUsuario = jwt.decode(token).ddrissId;
  tokenEpidemiologia = await tokenDeLaSemilla('EPIDEMIOLOGIA');
  tokenRevisor = await tokenDeLaSemilla('REVISOR');
});

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function tokenDeLaSemilla(rol) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE r.codigo = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
    [rol],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa con el rol ${rol} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  return jwt.sign(
    {
      rol,
      permisos: permisos.map((p) => p.codigo),
      ddrissId: cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id,
      municipioId: cuenta.municipio_id,
    },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(cuenta.id), expiresIn: '5m' },
  );
}

describe('GET /poblaciones-objetivo', () => {
  it('trae los 7 grupos, los municipios del departamento sede y la población de 2026 de la semilla', async () => {
    const res = await consultar('/poblaciones-objetivo?anio=2026');

    expect(res.status).toBe(200);
    expect(res.body.anio).toBe(2026);
    expect(res.body.grupos.map((g) => g.codigo)).toEqual(GRUPOS);
    expect(res.body.grupos.every((g) => typeof g.descripcion === 'string' && g.descripcion.length > 0)).toBe(true);

    const esperados = await municipiosEsperados();
    expect(res.body.municipios.map((m) => [m.id, m.codigoIne, m.nombre])).toEqual(
      esperados.map((m) => [m.id, m.codigo_ine, m.nombre]),
    );
    const codigos = res.body.municipios.map((m) => m.codigoIne);
    expect(codigos).not.toContain('9999');
    expect(codigos).not.toContain('0920');

    const [filas] = await pool.query(
      `SELECT po.municipio_id, cp.codigo, po.cantidad, po.fuente
         FROM poblacion_objetivo po
         JOIN clasificacion_poblacion cp ON cp.id = po.clasificacion_poblacion_id
        WHERE po.anio = 2026`,
    );
    const porId = new Map(res.body.municipios.map((m) => [m.id, m]));
    let comparadas = 0;
    for (const fila of filas) {
      const municipio = porId.get(fila.municipio_id);
      if (!municipio) continue;
      expect(municipio.poblacion[fila.codigo], `${municipio.nombre} ${fila.codigo}`).toMatchObject({
        cantidad: fila.cantidad,
        fuente: fila.fuente,
      });
      expect(municipio.poblacion[fila.codigo].actualizadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
      comparadas += 1;
    }
    expect(comparadas).toBeGreaterThan(0);
    const totalDevuelto = res.body.municipios.reduce((suma, m) => suma + Object.keys(m.poblacion).length, 0);
    expect(totalDevuelto).toBe(comparadas);
  });

  it('un año del calendario sin población trae los municipios con poblacion vacío', async () => {
    const res = await consultar(`/poblaciones-objetivo?anio=${ANIO_PRUEBA}`);

    expect(res.status).toBe(200);
    expect(res.body.municipios).toHaveLength((await municipiosEsperados()).length);
    expect(res.body.municipios.every((m) => Object.keys(m.poblacion).length === 0)).toBe(true);
  });

  it.each([
    ['/poblaciones-objetivo', 'anio debe ser un número entero.'],
    ['/poblaciones-objetivo?anio=abc', 'anio debe ser un número entero.'],
    ['/poblaciones-objetivo?anio=2026.5', 'anio debe ser un número entero.'],
    ['/poblaciones-objetivo?anio=2026&anio=2027', 'anio no se puede repetir.'],
    ['/poblaciones-objetivo?anio=2026&municipioId=1', 'Parámetro no permitido: municipioId.'],
  ])('%s responde 400', async (ruta, mensaje) => {
    const res = await consultar(ruta);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('un año sin meses en el calendario responde 422', async () => {
    const res = await consultar('/poblaciones-objetivo?anio=2019');

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      codigo: 'ANIO_SIN_PERIODOS',
      mensaje: 'El año 2019 no está en el calendario de periodos.',
    });
  });

  it('Epidemiología no tiene POBLACION_CONSULTAR y recibe 403', async () => {
    const res = await consultar('/poblaciones-objetivo?anio=2026', tokenEpidemiologia);

    expect(res.status).toBe(403);
  });
});

describe('PUT /poblaciones-objetivo/{municipioId}/{anio}', () => {
  const FUENTE = 'vitest-hu13 archivo MSPAS';
  const MENSAJE_CANTIDAD = 'La cantidad debe ser un número entero entre 0 y 9,999,999.';
  let municipio;
  let otroMunicipio;
  let municipioRevisor;
  const ids = {};

  beforeAll(async () => {
    [municipio, otroMunicipio, municipioRevisor] = await municipiosEsperados();
  });

  it('crea los grupos que vienen, con su fuente, y deja una fila CREAR por grupo', async () => {
    const res = await guardar(municipio.id, ANIO_PRUEBA, {
      fuente: `  ${FUENTE} `,
      grupos: { NACIDOS_VIVOS: 1494, MENOR_1: 1450, '4_ANIOS': 1378 },
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: municipio.id, codigoIne: municipio.codigo_ine, nombre: municipio.nombre });
    expect(Object.keys(res.body.poblacion).sort()).toEqual(['4_ANIOS', 'MENOR_1', 'NACIDOS_VIVOS']);
    expect(res.body.poblacion.MENOR_1).toMatchObject({ cantidad: 1450, fuente: FUENTE });
    expect(res.body.poblacion.MENOR_1.actualizadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    const filas = await filasPoblacion(municipio.id);
    expect(filas.map((f) => [f.codigo, f.cantidad, f.fuente])).toEqual([
      ['NACIDOS_VIVOS', 1494, FUENTE],
      ['MENOR_1', 1450, FUENTE],
      ['4_ANIOS', 1378, FUENTE],
    ]);
    for (const fila of filas) ids[fila.codigo] = fila.id;

    const bitacora = await filasBitacora(filas.map((f) => f.id));
    expect(bitacora.map((b) => b.accion)).toEqual(['CREAR', 'CREAR', 'CREAR']);
    expect(bitacora.find((b) => b.entidadId === ids.MENOR_1).nuevos).toEqual({
      id: ids.MENOR_1,
      municipioId: municipio.id,
      anio: ANIO_PRUEBA,
      grupo: 'MENOR_1',
      cantidad: 1450,
      fuente: FUENTE,
    });
  });

  it('corrige un grupo, crea uno nuevo, ignora el que no cambia y no toca los que no vienen', async () => {
    const res = await guardar(municipio.id, ANIO_PRUEBA, {
      fuente: FUENTE,
      grupos: { MENOR_1: 1500, '4_ANIOS': 1378, EMBARAZADAS: 300 },
    });

    expect(res.status).toBe(200);
    expect(res.body.poblacion.NACIDOS_VIVOS.cantidad).toBe(1494);
    expect(res.body.poblacion.MENOR_1.cantidad).toBe(1500);
    expect(res.body.poblacion.EMBARAZADAS).toMatchObject({ cantidad: 300, fuente: FUENTE });

    ids.EMBARAZADAS = (await filasPoblacion(municipio.id)).find((f) => f.codigo === 'EMBARAZADAS').id;
    const bitacora = await filasBitacora(Object.values(ids));
    expect(bitacora.filter((b) => b.accion === 'ACTUALIZAR')).toEqual([
      { accion: 'ACTUALIZAR', entidadId: ids.MENOR_1, anteriores: { cantidad: 1450 }, nuevos: { cantidad: 1500 } },
    ]);
    expect(bitacora.filter((b) => b.accion === 'CREAR').map((b) => b.entidadId)).toContain(ids.EMBARAZADAS);
    expect(bitacora).toHaveLength(5);
  });

  it('sin fuente, una fila existente conserva la suya y una nueva queda sin fuente', async () => {
    const res = await guardar(municipio.id, ANIO_PRUEBA, { grupos: { NACIDOS_VIVOS: 1000, '1_A_MENOR_2': 50 } });

    expect(res.status).toBe(200);
    expect(res.body.poblacion.NACIDOS_VIVOS).toMatchObject({ cantidad: 1000, fuente: FUENTE });
    expect(res.body.poblacion['1_A_MENOR_2']).toMatchObject({ cantidad: 50, fuente: null });

    ids['1_A_MENOR_2'] = (await filasPoblacion(municipio.id)).find((f) => f.codigo === '1_A_MENOR_2').id;
    const bitacora = await filasBitacora([ids.NACIDOS_VIVOS]);
    expect(bitacora.at(-1)).toMatchObject({
      accion: 'ACTUALIZAR',
      anteriores: { cantidad: 1494 },
      nuevos: { cantidad: 1000 },
    });
  });

  it('un guardado sin cambios responde 200 y no deja filas en la bitácora', async () => {
    const antes = await filasBitacora(Object.values(ids));

    const res = await guardar(municipio.id, ANIO_PRUEBA, {
      fuente: FUENTE,
      grupos: { MENOR_1: 1500, '4_ANIOS': 1378 },
    });

    expect(res.status).toBe(200);
    expect(await filasBitacora(Object.values(ids))).toHaveLength(antes.length);
  });

  it('después de los guardados hay una sola fila por municipio, año y grupo', async () => {
    const [filas] = await pool.query(
      `SELECT clasificacion_poblacion_id, COUNT(*) AS veces FROM poblacion_objetivo
        WHERE municipio_id = ? AND anio = ? GROUP BY clasificacion_poblacion_id`,
      [municipio.id, ANIO_PRUEBA],
    );
    expect(filas).toHaveLength(5);
    expect(filas.every((f) => Number(f.veces) === 1)).toBe(true);
  });

  it.each([
    [{ grupos: { MENOR_1: -1 } }, MENSAJE_CANTIDAD],
    [{ grupos: { MENOR_1: 10000000 } }, MENSAJE_CANTIDAD],
    [{ grupos: { MENOR_1: 1.5 } }, MENSAJE_CANTIDAD],
    [{ grupos: { MENOR_1: '12' } }, MENSAJE_CANTIDAD],
    [{ grupos: { MENOR_1: null } }, MENSAJE_CANTIDAD],
    [{ grupos: {} }, 'Debe registrar al menos un grupo.'],
    [{ fuente: 'x' }, 'Debe registrar al menos un grupo.'],
    [{ grupos: [1450] }, 'Debe registrar al menos un grupo.'],
    [{ grupos: { MENOR_5: 10 } }, 'El grupo MENOR_5 no existe.'],
    [{ grupos: { MENOR_1: 10 }, anio: 2021 }, 'Campo no permitido: anio.'],
    [{ grupos: { MENOR_1: 10 }, fuente: 'a'.repeat(151) }, 'La fuente admite hasta 150 caracteres.'],
  ])('el cuerpo %j responde 400', async (cuerpo, mensaje) => {
    const res = await guardar(municipio.id, ANIO_PRUEBA, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it.each([
    ['abc', ANIO_PRUEBA, 'municipioId debe ser un número entero.'],
    [1, 'abc', 'anio debe ser un número entero.'],
  ])('la ruta /%s/%s responde 400', async (municipioId, anio, mensaje) => {
    const res = await guardar(municipioId, anio, { grupos: { MENOR_1: 10 } });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('Coatepeque, el 9999 y un municipio inexistente responden 404', async () => {
    for (const municipioId of [await idDeMunicipio('0920'), await idDeMunicipio('9999'), 60000]) {
      const res = await guardar(municipioId, ANIO_PRUEBA, { grupos: { MENOR_1: 10 } });

      expect(res.status, `municipio ${municipioId}`).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
    }
  });

  it('un año sin meses en el calendario responde 422', async () => {
    const res = await guardar(municipio.id, 2019, { grupos: { MENOR_1: 10 } });

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('ANIO_SIN_PERIODOS');
  });

  it('dos guardados en paralelo del mismo grupo nuevo dejan una sola fila', async () => {
    const respuestas = await Promise.all([
      guardar(otroMunicipio.id, ANIO_PRUEBA, { grupos: { MENOR_1: 700 } }),
      guardar(otroMunicipio.id, ANIO_PRUEBA, { grupos: { MENOR_1: 800 } }),
    ]);

    expect(respuestas.map((r) => r.status)).toContain(200);
    for (const res of respuestas.filter((r) => r.status !== 200)) {
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('POBLACION_EN_CONFLICTO');
    }
    const filas = await filasPoblacion(otroMunicipio.id);
    expect(filas.filter((f) => f.codigo === 'MENOR_1')).toHaveLength(1);
  });

  it('el Revisor también registra la población', async () => {
    const res = await guardar(municipioRevisor.id, ANIO_PRUEBA, { grupos: { MENOR_1: 900 } }, tokenRevisor);

    expect(res.status).toBe(200);
    expect(res.body.poblacion.MENOR_1.cantidad).toBe(900);
  });

  it('Epidemiología no tiene POBLACION_REGISTRAR y recibe 403', async () => {
    const res = await guardar(municipio.id, ANIO_PRUEBA, { grupos: { MENOR_1: 10 } }, tokenEpidemiologia);

    expect(res.status).toBe(403);
  });
});
