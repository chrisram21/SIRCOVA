import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas que escriben usan el año 2020 (ANIO_PRUEBA), que el equipo no usa en la base de prueba, y borran sus
// filas de cierre_periodo y periodo al inicio y al final. La bitácora no tiene llave foránea a esas tablas.
const ANIO_PRUEBA = 2020;

async function limpiar() {
  await pool.query(
    'DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?',
    [ANIO_PRUEBA],
  );
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO_PRUEBA]);
}

const anioGuatemala = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date()).slice(0, 4));

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
const filasBitacora = async (accion, entidad, ids) => {
  if (ids.length === 0) return [];
  const [filas] = await pool.query(
    `SELECT entidad_id, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND accion = ? AND entidad = ? AND entidad_id IN (?)
      ORDER BY id`,
    [accion, entidad, ids.map(String)],
  );
  return filas.map((f) => ({
    entidadId: Number(f.entidad_id),
    anteriores: leerJson(f.valores_anteriores),
    nuevos: leerJson(f.valores_nuevos),
  }));
};

afterAll(limpiar);

let token;
let ddrissUsuario;
let tokenEpidemiologia;

const enviar = (metodo, ruta, cuerpo, credencial = token) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);
const consultar = (ruta, credencial) => enviar('get', ruta, undefined, credencial);

// Último día del mes, calculado aparte del servicio y de la base.
const finDeMes = (anio, mes) => {
  const dia = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  return `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
};

beforeAll(async () => {
  await limpiar();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  ddrissUsuario = jwt.decode(token).ddrissId;

  // Una cuenta de Epidemiología de la semilla, con sus datos y permisos reales: autenticar compara el rol, el
  // establecimiento y el municipio con la base.
  const [[cuenta]] = await pool.query(
    `SELECT u.id, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE r.codigo = 'EPIDEMIOLOGIA' AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
  );
  if (!cuenta) throw new Error('No hay una cuenta de Epidemiología activa en la base de prueba');
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  tokenEpidemiologia = await tokenDePrueba(cuenta.id, {
    rol: 'EPIDEMIOLOGIA',
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  });
});

describe('GET /periodos', () => {
  it('trae los 12 meses de 2026 en orden con el estado de la semilla en la DDRISS del usuario', async () => {
    const res = await consultar('/periodos?anio=2026');

    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    for (const periodo of res.body.slice(0, 8)) {
      expect(periodo.estado, `mes ${periodo.mes}`).toBe('CERRADO');
      expect(periodo.cerradoEn, `mes ${periodo.mes}`).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
    expect(res.body.slice(8, 10).map((p) => [p.mes, p.estado, p.fechaLimiteEnvio, p.cerradoEn])).toEqual([
      [9, 'ABIERTO', '2026-10-10', null],
      [10, 'ABIERTO', '2026-11-10', null],
    ]);
    for (const periodo of res.body.slice(10)) {
      expect(periodo, `mes ${periodo.mes}`).toMatchObject({ estado: null, fechaLimiteEnvio: null, cerradoEn: null });
    }
  });

  it('las fechas salen como AAAA-MM-DD sin correrse un día', async () => {
    const res = await consultar('/periodos?anio=2026');

    expect(res.status).toBe(200);
    for (const periodo of res.body) {
      expect(periodo.fechaInicio).toBe(`2026-${String(periodo.mes).padStart(2, '0')}-01`);
      expect(periodo.fechaFin).toBe(finDeMes(2026, periodo.mes));
    }
    expect(res.body[1].fechaFin).toBe('2026-02-28');
    expect(res.body[0].fechaLimiteEnvio).toBe('2026-02-10');
  });

  it('sin parámetros trae todo el calendario ordenado por año y mes', async () => {
    const res = await consultar('/periodos');

    expect(res.status).toBe(200);
    const claves = res.body.map((p) => p.anio * 100 + p.mes);
    expect(claves).toEqual([...claves].sort((a, b) => a - b));
    expect(res.body.filter((p) => p.anio === 2026)).toHaveLength(12);
  });

  it('estado=ABIERTO trae solo septiembre y octubre de 2026', async () => {
    const res = await consultar('/periodos?anio=2026&estado=ABIERTO');

    expect(res.status).toBe(200);
    expect(res.body.map((p) => p.mes)).toEqual([9, 10]);
  });

  it.each([
    ['/periodos?anio=abc', 'anio debe ser un número entero.'],
    ['/periodos?anio=2026.5', 'anio debe ser un número entero.'],
    ['/periodos?estado=OTRO', 'estado debe ser ABIERTO, EN_CIERRE o CERRADO.'],
    ['/periodos?mes=10', 'Parámetro no permitido: mes.'],
    ['/periodos?anio=2026&anio=2027', 'anio no se puede repetir.'],
  ])('%s responde 400 ENTRADA_INVALIDA', async (ruta, mensaje) => {
    const res = await consultar(ruta);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('una cuenta de Epidemiología recibe 403 SIN_PERMISO', async () => {
    const res = await consultar('/periodos', tokenEpidemiologia);

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('POST /periodos', () => {
  const crearAnio = (cuerpo, credencial) => enviar('post', '/periodos', cuerpo, credencial);
  const cierresDe = async (anio) => {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?',
      [anio],
    );
    return total;
  };

  it('crea los 12 meses de 2020 con sus fechas, sin abrir ninguno, y deja 12 filas CREAR', async () => {
    const res = await crearAnio({ anio: ANIO_PRUEBA });

    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(12);
    for (const periodo of res.body) {
      expect(periodo).toMatchObject({
        anio: ANIO_PRUEBA,
        fechaInicio: `2020-${String(periodo.mes).padStart(2, '0')}-01`,
        fechaFin: finDeMes(ANIO_PRUEBA, periodo.mes),
        estado: null,
        fechaLimiteEnvio: null,
        cerradoEn: null,
      });
    }
    expect(res.body.map((p) => p.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(res.body[1].fechaFin).toBe('2020-02-29');
    expect(await cierresDe(ANIO_PRUEBA)).toBe(0);

    const filas = await filasBitacora('CREAR', 'periodo', res.body.map((p) => p.id));
    expect(filas).toHaveLength(12);
    expect(filas[1]).toMatchObject({
      anteriores: null,
      nuevos: { id: res.body[1].id, anio: 2020, mes: 2, fechaInicio: '2020-02-01', fechaFin: '2020-02-29' },
    });
  });

  it('en un año incompleto crea solo los meses que faltan', async () => {
    await pool.query('DELETE FROM periodo WHERE anio = ? AND mes IN (2, 7, 12)', [ANIO_PRUEBA]);

    const res = await crearAnio({ anio: ANIO_PRUEBA });

    expect(res.status).toBe(201);
    expect(res.body.map((p) => p.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const nuevos = res.body.filter((p) => [2, 7, 12].includes(p.mes)).map((p) => p.id);
    const filas = await filasBitacora('CREAR', 'periodo', res.body.map((p) => p.id));
    expect(filas.map((f) => f.entidadId).filter((id) => nuevos.includes(id))).toHaveLength(3);
    expect(filas.filter((f) => !nuevos.includes(f.entidadId))).toHaveLength(9);
  });

  it('un año con sus 12 meses responde 409 PERIODO_ANIO_EXISTENTE', async () => {
    const res = await crearAnio({ anio: 2026 });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'PERIODO_ANIO_EXISTENTE',
      mensaje: 'El año 2026 ya tiene sus 12 meses en el calendario.',
    });
  });

  it('2019 y el año actual + 2 responden 422 ANIO_FUERA_DE_RANGO', async () => {
    const ultimo = anioGuatemala() + 1;
    for (const anio of [2019, ultimo + 1]) {
      const res = await crearAnio({ anio });

      expect(res.status, String(anio)).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'ANIO_FUERA_DE_RANGO',
        mensaje: `El año debe estar entre 2020 y ${ultimo}.`,
      });
    }
  });

  it.each([
    [{ anio: '2020' }, 'anio debe ser un número entero.'],
    [{ anio: 2020.5 }, 'anio debe ser un número entero.'],
    [{}, 'anio debe ser un número entero.'],
    [{ anio: 2020, mes: 1 }, 'Campo no permitido: mes.'],
  ])('%j responde 400 ENTRADA_INVALIDA', async (cuerpo, mensaje) => {
    const res = await crearAnio(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('una cuenta de Epidemiología recibe 403 SIN_PERMISO', async () => {
    const res = await crearAnio({ anio: ANIO_PRUEBA }, tokenEpidemiologia);

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('POST /periodos/{id}/abrir', () => {
  const meses = {};
  const abrir = (id, cuerpo, credencial) => enviar('post', `/periodos/${id}/abrir`, cuerpo, credencial);
  const cierresDe = async (periodoId) => {
    const [filas] = await pool.query(
      `SELECT id, ddriss_id, estado, DATE_FORMAT(fecha_limite_envio, '%Y-%m-%d') AS fecha FROM cierre_periodo
        WHERE periodo_id = ?`,
      [periodoId],
    );
    return filas;
  };

  beforeAll(async () => {
    // El año puede existir ya por las pruebas de POST /periodos; entonces responde 409 y basta con leerlo.
    await enviar('post', '/periodos', { anio: ANIO_PRUEBA });
    const res = await consultar(`/periodos?anio=${ANIO_PRUEBA}`);
    for (const periodo of res.body) meses[periodo.mes] = periodo;
    if (Object.keys(meses).length !== 12) throw new Error('No se pudo preparar el año de prueba');
  });

  it('abrir marzo de 2020 crea solo la fila ABIERTO de la DDRISS del usuario y deja una fila CREAR', async () => {
    const res = await abrir(meses[3].id, { fechaLimiteEnvio: '2020-04-10' });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      ...meses[3],
      estado: 'ABIERTO',
      fechaLimiteEnvio: '2020-04-10',
      cerradoEn: null,
    });
    const cierres = await cierresDe(meses[3].id);
    expect(cierres).toHaveLength(1);
    expect(cierres[0]).toMatchObject({ ddriss_id: ddrissUsuario, estado: 'ABIERTO', fecha: '2020-04-10' });

    const filas = await filasBitacora('CREAR', 'cierre_periodo', [cierres[0].id]);
    expect(filas).toHaveLength(1);
    expect(filas[0].nuevos).toEqual({
      id: cierres[0].id,
      periodoId: meses[3].id,
      ddrissId: ddrissUsuario,
      fechaLimiteEnvio: '2020-04-10',
      estado: 'ABIERTO',
    });
  });

  it('un mes ya abierto, o cerrado, responde 409 PERIODO_YA_ABIERTO', async () => {
    const otraVez = await abrir(meses[3].id, { fechaLimiteEnvio: '2020-04-15' });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error).toEqual({ codigo: 'PERIODO_YA_ABIERTO', mensaje: 'El mes ya fue abierto en su DDRISS.' });

    expect((await abrir(meses[4].id, { fechaLimiteEnvio: '2020-05-10' })).status).toBe(201);
    await pool.query(
      `UPDATE cierre_periodo SET estado = 'CERRADO', cerrado_por = (SELECT MIN(id) FROM usuario), cerrado_en = NOW()
        WHERE periodo_id = ?`,
      [meses[4].id],
    );
    const cerrado = await abrir(meses[4].id, { fechaLimiteEnvio: '2020-05-20' });
    expect(cerrado.status).toBe(409);
    expect(cerrado.body.error.codigo).toBe('PERIODO_YA_ABIERTO');
    expect(await cierresDe(meses[4].id)).toHaveLength(1);
  });

  it('dos aperturas en paralelo del mismo mes: una 201 y otra 409', async () => {
    const respuestas = await Promise.all([
      abrir(meses[5].id, { fechaLimiteEnvio: '2020-06-10' }),
      abrir(meses[5].id, { fechaLimiteEnvio: '2020-06-11' }),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await cierresDe(meses[5].id)).toHaveLength(1);
  });

  it('una fecha igual o anterior al fin del mes responde 422 FECHA_LIMITE_INVALIDA', async () => {
    for (const fechaLimiteEnvio of ['2020-06-30', '2020-06-15']) {
      const res = await abrir(meses[6].id, { fechaLimiteEnvio });

      expect(res.status, fechaLimiteEnvio).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'FECHA_LIMITE_INVALIDA',
        mensaje: 'La fecha límite debe ser posterior al 2020-06-30.',
      });
    }
    expect(await cierresDe(meses[6].id)).toHaveLength(0);
  });

  it.each([
    [{ fechaLimiteEnvio: '2020-02-30' }, 'fechaLimiteEnvio debe ser una fecha AAAA-MM-DD.'],
    [{ fechaLimiteEnvio: '10/07/2020' }, 'fechaLimiteEnvio debe ser una fecha AAAA-MM-DD.'],
    [{}, 'fechaLimiteEnvio debe ser una fecha AAAA-MM-DD.'],
    [{ fechaLimiteEnvio: '2020-08-10', estado: 'CERRADO' }, 'Campo no permitido: estado.'],
  ])('%j responde 400 ENTRADA_INVALIDA', async (cuerpo, mensaje) => {
    const res = await abrir(meses[7].id, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('un id inexistente responde 404 NO_ENCONTRADO', async () => {
    for (const id of ['999999', 'abc']) {
      const res = await abrir(id, { fechaLimiteEnvio: '2020-08-10' });

      expect(res.status, id).toBe(404);
      expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El periodo no existe.' });
    }
  });

  it('una cuenta de Epidemiología recibe 403 SIN_PERMISO', async () => {
    const res = await abrir(meses[8].id, { fechaLimiteEnvio: '2020-09-10' }, tokenEpidemiologia);

    expect(res.status).toBe(403);
    expect(await cierresDe(meses[8].id)).toHaveLength(0);
  });
});

describe('PATCH /periodos/{id}', () => {
  const meses = {};
  const cambiar = (id, cuerpo, credencial) => enviar('patch', `/periodos/${id}`, cuerpo, credencial);
  const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());
  const cierreDe = async (periodoId) => {
    const [[fila]] = await pool.query(
      `SELECT id, estado, DATE_FORMAT(fecha_limite_envio, '%Y-%m-%d') AS fecha FROM cierre_periodo
        WHERE periodo_id = ? AND ddriss_id = ?`,
      [periodoId, ddrissUsuario],
    );
    return fila;
  };
  const ponerEstado = (periodoId, estado) =>
    pool.query(
      `UPDATE cierre_periodo
          SET estado = ?, cerrado_por = IF(? = 'CERRADO', (SELECT MIN(id) FROM usuario), NULL),
              cerrado_en = IF(? = 'CERRADO', NOW(), NULL)
        WHERE periodo_id = ?`,
      [estado, estado, estado, periodoId],
    );

  // Meses propios de este bloque: septiembre abierto, octubre y noviembre en cierre, enero cerrado y diciembre sin
  // abrir. Se preparan por la API y el estado se pone por SQL.
  beforeAll(async () => {
    await enviar('post', '/periodos', { anio: ANIO_PRUEBA });
    const res = await consultar(`/periodos?anio=${ANIO_PRUEBA}`);
    for (const periodo of res.body) meses[periodo.mes] = periodo;
    for (const mes of [1, 9, 10, 11]) {
      await pool.query('DELETE FROM cierre_periodo WHERE periodo_id = ?', [meses[mes].id]);
      const abierto = await enviar('post', `/periodos/${meses[mes].id}/abrir`, {
        fechaLimiteEnvio: `${mes === 1 ? '2020-02' : `2020-${mes + 1}`}-10`,
      });
      if (abierto.status !== 201) throw new Error(`No se pudo abrir el mes ${mes} (${abierto.status})`);
    }
    await ponerEstado(meses[10].id, 'EN_CIERRE');
    await ponerEstado(meses[11].id, 'EN_CIERRE');
    await ponerEstado(meses[1].id, 'CERRADO');
  });

  it('en ABIERTO cambia la fecha, sigue ABIERTO y deja una fila ACTUALIZAR con solo fechaLimiteEnvio', async () => {
    const res = await cambiar(meses[9].id, { fechaLimiteEnvio: '2020-10-20' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: meses[9].id, estado: 'ABIERTO', fechaLimiteEnvio: '2020-10-20' });
    const cierre = await cierreDe(meses[9].id);
    expect(cierre).toMatchObject({ estado: 'ABIERTO', fecha: '2020-10-20' });
    const filas = await filasBitacora('ACTUALIZAR', 'cierre_periodo', [cierre.id]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      anteriores: { fechaLimiteEnvio: '2020-10-10' },
      nuevos: { fechaLimiteEnvio: '2020-10-20' },
    });
    expect(Object.keys(filas[0].nuevos)).toEqual(['fechaLimiteEnvio']);
  });

  it('la misma fecha responde 200 y no deja fila en la bitácora', async () => {
    const cierre = await cierreDe(meses[9].id);
    const antes = await filasBitacora('ACTUALIZAR', 'cierre_periodo', [cierre.id]);

    const res = await cambiar(meses[9].id, { fechaLimiteEnvio: cierre.fecha });

    expect(res.status).toBe(200);
    expect(res.body.fechaLimiteEnvio).toBe(cierre.fecha);
    expect(await filasBitacora('ACTUALIZAR', 'cierre_periodo', [cierre.id])).toHaveLength(antes.length);
  });

  it('en EN_CIERRE con la fecha de hoy pasa a ABIERTO y la fila ACTUALIZAR trae la fecha y el estado', async () => {
    const res = await cambiar(meses[10].id, { fechaLimiteEnvio: hoy() });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'ABIERTO', fechaLimiteEnvio: hoy() });
    const cierre = await cierreDe(meses[10].id);
    expect(cierre.estado).toBe('ABIERTO');
    const [fila] = await filasBitacora('ACTUALIZAR', 'cierre_periodo', [cierre.id]);
    expect(fila).toMatchObject({
      anteriores: { fechaLimiteEnvio: '2020-11-10', estado: 'EN_CIERRE' },
      nuevos: { fechaLimiteEnvio: hoy(), estado: 'ABIERTO' },
    });
  });

  it('en EN_CIERRE con una fecha pasada pero posterior al fin del mes sigue EN_CIERRE', async () => {
    const res = await cambiar(meses[11].id, { fechaLimiteEnvio: '2020-12-15' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'EN_CIERRE', fechaLimiteEnvio: '2020-12-15' });
    expect(await cierreDe(meses[11].id)).toMatchObject({ estado: 'EN_CIERRE', fecha: '2020-12-15' });
  });

  it('un mes sin abrir responde 409 PERIODO_NO_ABIERTO y uno CERRADO 409 PERIODO_CERRADO', async () => {
    await pool.query('DELETE FROM cierre_periodo WHERE periodo_id = ?', [meses[12].id]);
    const sinAbrir = await cambiar(meses[12].id, { fechaLimiteEnvio: '2021-01-10' });
    expect(sinAbrir.status).toBe(409);
    expect(sinAbrir.body.error).toEqual({ codigo: 'PERIODO_NO_ABIERTO', mensaje: 'El mes no está abierto en su DDRISS.' });

    const cerrado = await cambiar(meses[1].id, { fechaLimiteEnvio: '2020-02-20' });
    expect(cerrado.status).toBe(409);
    expect(cerrado.body.error).toEqual({
      codigo: 'PERIODO_CERRADO',
      mensaje: 'El mes está cerrado; solo admite rectificaciones.',
    });
    expect((await cierreDe(meses[1].id)).fecha).toBe('2020-02-10');
  });

  it('una fecha igual al fin del mes responde 422 FECHA_LIMITE_INVALIDA', async () => {
    const res = await cambiar(meses[9].id, { fechaLimiteEnvio: '2020-09-30' });

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      codigo: 'FECHA_LIMITE_INVALIDA',
      mensaje: 'La fecha límite debe ser posterior al 2020-09-30.',
    });
  });

  it.each([
    [{ fechaLimiteEnvio: '2020-10-25', estado: 'ABIERTO' }, 'Campo no permitido: estado.'],
    [{}, 'fechaLimiteEnvio debe ser una fecha AAAA-MM-DD.'],
    [{ fechaLimiteEnvio: '2020-13-01' }, 'fechaLimiteEnvio debe ser una fecha AAAA-MM-DD.'],
  ])('%j responde 400 ENTRADA_INVALIDA', async (cuerpo, mensaje) => {
    const res = await cambiar(meses[9].id, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('un id inexistente responde 404 y Epidemiología recibe 403', async () => {
    const inexistente = await cambiar('999999', { fechaLimiteEnvio: '2020-10-25' });
    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El periodo no existe.' });

    const sinPermiso = await cambiar(meses[9].id, { fechaLimiteEnvio: '2020-10-25' }, tokenEpidemiologia);
    expect(sinPermiso.status).toBe(403);
    expect((await cierreDe(meses[9].id)).fecha).toBe('2020-10-20');
  });
});
