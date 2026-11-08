import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// SPEC 49: GET /indicadores/serie. Todo por SQL, sin el motor: en 2001, la DDRISS 1 tiene corridas vigentes de enero,
// febrero, marzo y abril, y una no vigente de febrero. El código ZVT_HU41_COB (que no está en MongoDB) tiene filas
// departamental y de San Marcos en enero, febrero y abril; marzo no lo tiene. Enero y febrero están CERRADO antes de
// sus corridas, así que solo abril es parcial. La DDRISS ficticia ZVT_OTRA41 tiene su propia corrida de enero, para
// el ámbito. Todo se borra al inicio y al final (los resultados antes que las corridas, las corridas antes que los
// meses y la DDRISS).
//
// SPEC 51: poblacionAnual se prueba con las versiones reales COB_HEXA3 v1 (grupo MENOR_1) y DES_HEXA1_3 v1 (sin grupo)
// en enero de 2001, con población MENOR_1 de 2001 para todos los municipios de la DDRISS 1; marzo de 2000 tiene
// COB_HEXA3 sin población. Para meses-calculados, ZVT_OTRA41 tiene además corridas de 2000: marzo y mayo vigentes,
// julio no vigente y septiembre FALLIDA. La limpieza borra también 2000 y la población de los dos años.
const ANIO = 2001;
const ANIO_ANTERIOR = 2000;
const MENOR_1 = 'MENOR_1';
const CODIGO = 'ZVT_HU41_COB';
const DDRISS_OTRA = 'ZVT_OTRA41';
const MUNICIPIO_SM = 1;
const VACUNA_ID = 2;
const FUTURA = '2099-12-31';

const cuentas = {};
const corridas = {};
let ddrissOtraId;

async function tokenDe(nombreUsuario) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN empleado e ON e.id = u.empleado_id
      WHERE u.nombre_usuario = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE`,
    [nombreUsuario],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa ${nombreUsuario} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  const token = await tokenDePrueba(
    cuenta.id,
    {
      rol: cuenta.rol, permisos: permisos.map((p) => p.codigo), ddrissId: cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id, municipioId: cuenta.municipio_id,
    },
    { expiresIn: '10m' },
  );
  return { token };
}

const serie = (consulta, cuenta = cuentas.epidemiologia) =>
  request(app).get(`/api/v1/indicadores/serie?${consulta}`).set('Authorization', `Bearer ${cuenta.token}`);
const mesesCalculados = (consulta = '', cuenta = cuentas.epidemiologia) =>
  request(app).get(`/api/v1/indicadores/meses-calculados${consulta}`).set('Authorization', `Bearer ${cuenta.token}`);
const poblaciones = {};

async function limpiar() {
  const anios = [ANIO, ANIO_ANTERIOR];
  const deLaPrueba =
    'SELECT c.id FROM corrida_calculo c LEFT JOIN ddriss d ON d.id = c.ddriss_id WHERE c.anio IN (?) OR d.codigo = ?';
  await pool.query(`DELETE FROM resultado_indicador WHERE corrida_id IN (SELECT id FROM (${deLaPrueba}) t)`, [anios, DDRISS_OTRA]);
  await pool.query(`DELETE FROM corrida_calculo WHERE id IN (SELECT id FROM (${deLaPrueba}) t)`, [anios, DDRISS_OTRA]);
  await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS_OTRA]);
  await pool.query('DELETE FROM poblacion_objetivo WHERE anio IN (?)', [anios]);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio IN (?)', [anios]);
  await pool.query('DELETE FROM periodo WHERE anio IN (?)', [anios]);
}

async function corrida(ddrissId, mes, vigente, { anio = ANIO, estado = 'COMPLETADA' } = {}) {
  const [fila] = await pool.query(
    `INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, motivo, estado, finalizada_en, vigente)
     VALUES (?, ?, ?, 'MANUAL', ?, NOW(), ?)`,
    [ddrissId, anio, mes, estado, vigente],
  );
  return fila.insertId;
}

// Una fila de un indicador real (versión 1), para poblacionAnual.
async function resultadoReal(corridaId, codigo, anio, mes, municipioId) {
  await pool.query(
    `INSERT INTO resultado_indicador
       (corrida_id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, anio, mes,
        numerador, denominador, valor, meta)
     VALUES (?, ?, 1, ?, ?, NULL, ?, ?, 10, 100, 10, 95)`,
    [corridaId, codigo, municipioId, VACUNA_ID, anio, mes],
  );
}

// Una fila del indicador; municipioId null = departamental.
async function resultado(corridaId, mes, municipioId, valor) {
  await pool.query(
    `INSERT INTO resultado_indicador
       (corrida_id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, anio, mes,
        numerador, denominador, valor, meta)
     VALUES (?, ?, 1, ?, ?, NULL, ?, ?, ?, 1000, ?, 95)`,
    [corridaId, CODIGO, municipioId, VACUNA_ID, ANIO, mes, valor * 10, valor],
  );
}

async function preparar() {
  for (const mes of [1, 2]) {
    const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
      ANIO, mes, `${ANIO}-0${mes}-01`, `${ANIO}-0${mes}-28`,
    ]);
    await pool.query(
      `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
       VALUES (?, 1, ?, 'CERRADO', 1, DATE_SUB(NOW(), INTERVAL 1 DAY))`,
      [periodo.insertId, FUTURA],
    );
  }

  corridas.enero = await corrida(1, 1, true);
  corridas.febreroAnterior = await corrida(1, 2, false);
  corridas.febrero = await corrida(1, 2, true);
  corridas.marzo = await corrida(1, 3, true);
  corridas.abril = await corrida(1, 4, true);

  await resultado(corridas.enero, 1, null, 6.4);
  await resultado(corridas.enero, 1, MUNICIPIO_SM, 7.1);
  await resultado(corridas.febreroAnterior, 2, null, 99);
  await resultado(corridas.febreroAnterior, 2, MUNICIPIO_SM, 99);
  await resultado(corridas.febrero, 2, null, 13.3);
  await resultado(corridas.febrero, 2, MUNICIPIO_SM, 14.2);
  await resultado(corridas.abril, 4, null, 27.8);
  await resultado(corridas.abril, 4, MUNICIPIO_SM, 30.5);

  const [otra] = await pool.query("INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-hu41 Otra', 3, TRUE)", [
    DDRISS_OTRA,
  ]);
  ddrissOtraId = otra.insertId;
  const corridaOtra = await corrida(ddrissOtraId, 1, true);
  await resultado(corridaOtra, 1, null, 50);
  const deOtroAnio = [[3, true, 'COMPLETADA'], [5, true, 'COMPLETADA'], [7, false, 'COMPLETADA'], [9, false, 'FALLIDA']];
  for (const [mes, vigente, estado] of deOtroAnio) {
    await corrida(ddrissOtraId, mes, vigente, { anio: ANIO_ANTERIOR, estado });
  }

  // Población MENOR_1 de 2001 para los municipios que suma el motor (activos, del departamento, sin el 9999).
  const [municipios] = await pool.query(
    `SELECT m.id FROM municipio m JOIN ddriss d ON d.id = 1
      WHERE m.activo = TRUE AND m.departamento_id = d.departamento_id AND m.codigo_ine <> '9999'`,
  );
  const [[grupo]] = await pool.query('SELECT id FROM clasificacion_poblacion WHERE codigo = ?', [MENOR_1]);
  for (const { id } of municipios) {
    poblaciones[id] = 100 + id;
    await pool.query(
      `INSERT INTO poblacion_objetivo (municipio_id, anio, clasificacion_poblacion_id, cantidad, fuente, registrado_por)
       VALUES (?, ?, ?, ?, 'vitest-hu43', 1)`,
      [id, ANIO, grupo.id, poblaciones[id]],
    );
  }
  for (const codigo of ['COB_HEXA3', 'DES_HEXA1_3']) {
    await resultadoReal(corridas.enero, codigo, ANIO, 1, null);
    await resultadoReal(corridas.enero, codigo, ANIO, 1, MUNICIPIO_SM);
  }
  corridas.marzoAnterior = await corrida(1, 3, true, { anio: ANIO_ANTERIOR });
  await resultadoReal(corridas.marzoAnterior, 'COB_HEXA3', ANIO_ANTERIOR, 3, null);
}

beforeAll(async () => {
  // La serie lee las versiones en MongoDB: se conecta aquí para que la primera prueba no pague la conexión a Atlas.
  await obtenerDb();
  for (const nombre of ['epidemiologia', 'autoridad.nacional', 'cs1201']) {
    cuentas[nombre] = await tokenDe(nombre);
  }
  await limpiar();
  await preparar();
}, 60000);

afterAll(limpiar, 60000);

describe('GET /indicadores/serie', () => {
  it('sin municipioId da la fila departamental de cada mes con corrida vigente, en orden', async () => {
    const res = await serie(`anio=${ANIO}&indicador=${CODIGO}`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.puntos.map((p) => [p.mes, p.corridaId, p.resultado.valor])).toEqual([
      [1, corridas.enero, 6.4],
      [2, corridas.febrero, 13.3],
      [4, corridas.abril, 27.8],
    ]);
    expect(res.body.puntos.every((p) => p.resultado.municipio === null && p.resultado.indicadorCodigo === CODIGO)).toBe(true);
  });

  it('marca parcial la corrida con meses sin cerrar', async () => {
    const res = await serie(`anio=${ANIO}&indicador=${CODIGO}`);

    expect(res.body.puntos.map((p) => [p.mes, p.parcial])).toEqual([[1, false], [2, false], [4, true]]);
  });

  it('con municipioId da la fila de ese municipio', async () => {
    const res = await serie(`anio=${ANIO}&indicador=${CODIGO}&municipioId=${MUNICIPIO_SM}`);

    expect(res.status).toBe(200);
    expect(res.body.puntos.map((p) => [p.mes, p.resultado.municipio?.id, p.resultado.valor])).toEqual([
      [1, MUNICIPIO_SM, 7.1],
      [2, MUNICIPIO_SM, 14.2],
      [4, MUNICIPIO_SM, 30.5],
    ]);
  });

  it('devuelve puntos vacíos para un indicador o un año sin filas', async () => {
    expect((await serie(`anio=${ANIO}&indicador=ZVT_HU41_NINGUNO`)).body).toEqual({ puntos: [] });
    expect((await serie(`anio=${ANIO_ANTERIOR}&indicador=${CODIGO}`)).body).toEqual({ puntos: [] });
  });

  it('responde 400 sin año, sin indicador, con un código inválido o un parámetro desconocido', async () => {
    const casos = [
      `indicador=${CODIGO}`,
      `anio=${ANIO}`,
      `anio=${ANIO}&indicador=cob`,
      `anio=${ANIO}&indicador=${CODIGO}&mes=2`,
      `anio=1999&indicador=${CODIGO}`,
      `anio=${ANIO}&indicador=${CODIGO}&municipioId=x`,
    ];
    for (const consulta of casos) {
      const res = await serie(consulta);
      expect(res.status, consulta).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('respeta el ámbito: ddrissId solo para la Autoridad nacional, que la elige', async () => {
    expect((await serie(`anio=${ANIO}&indicador=${CODIGO}&ddrissId=1`)).status).toBe(400);

    const nacional = cuentas['autoridad.nacional'];
    expect((await serie(`anio=${ANIO}&indicador=${CODIGO}`, nacional)).status).toBe(400);
    const otra = await serie(`anio=${ANIO}&indicador=${CODIGO}&ddrissId=${ddrissOtraId}`, nacional);
    expect(otra.status).toBe(200);
    expect(otra.body.puntos.map((p) => [p.mes, p.resultado.valor])).toEqual([[1, 50]]);
    const propia = await serie(`anio=${ANIO}&indicador=${CODIGO}&ddrissId=1`, nacional);
    expect(propia.body.puntos.map((p) => p.mes)).toEqual([1, 2, 4]);
  });

  it('el Personal del establecimiento (sin INDICADOR_CONSULTAR) recibe 403', async () => {
    const res = await serie(`anio=${ANIO}&indicador=${CODIGO}`, cuentas.cs1201);

    expect(res.status).toBe(403);
  });

  describe('poblacionAnual (SPEC 51)', () => {
    it('sin municipioId es la población del grupo de todos los municipios de la DDRISS', async () => {
      const res = await serie(`anio=${ANIO}&indicador=COB_HEXA3`);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const total = Object.values(poblaciones).reduce((suma, cantidad) => suma + cantidad, 0);
      expect(res.body.puntos.map((p) => [p.mes, p.poblacionAnual])).toEqual([[1, total]]);
    });

    it('con municipioId es la del municipio', async () => {
      const res = await serie(`anio=${ANIO}&indicador=COB_HEXA3&municipioId=${MUNICIPIO_SM}`);

      expect(res.body.puntos.map((p) => [p.mes, p.poblacionAnual])).toEqual([[1, poblaciones[MUNICIPIO_SM]]]);
    });

    it('es null sin grupo de población, sin la población del año o sin la versión en MongoDB', async () => {
      const desercion = await serie(`anio=${ANIO}&indicador=DES_HEXA1_3`);
      expect(desercion.body.puntos.map((p) => [p.mes, p.poblacionAnual])).toEqual([[1, null]]);

      const sinPoblacion = await serie(`anio=${ANIO_ANTERIOR}&indicador=COB_HEXA3`);
      expect(sinPoblacion.body.puntos.map((p) => [p.mes, p.poblacionAnual])).toEqual([[3, null]]);

      const sinVersion = await serie(`anio=${ANIO}&indicador=${CODIGO}`);
      expect(sinVersion.body.puntos.every((p) => p.poblacionAnual === null)).toBe(true);
    });
  });
});

describe('GET /indicadores/meses-calculados (SPEC 51)', () => {
  it('da los años con corridas vigentes COMPLETADA de la DDRISS, del más reciente, con sus meses en orden', async () => {
    const res = await mesesCalculados(`?ddrissId=${ddrissOtraId}`, cuentas['autoridad.nacional']);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ anios: [{ anio: ANIO, meses: [1] }, { anio: ANIO_ANTERIOR, meses: [3, 5] }] });
  });

  it('sin ddrissId da la DDRISS del usuario', async () => {
    const res = await mesesCalculados();

    expect(res.status).toBe(200);
    expect(res.body.anios.find((a) => a.anio === ANIO)).toEqual({ anio: ANIO, meses: [1, 2, 3, 4] });
    expect(res.body.anios.find((a) => a.anio === ANIO_ANTERIOR)).toEqual({ anio: ANIO_ANTERIOR, meses: [3] });
    const anios = res.body.anios.map((a) => a.anio);
    expect(anios).toEqual([...anios].sort((a, b) => b - a));
  });

  it('responde 400 con un parámetro desconocido o repetido, y con ddrissId fuera del alcance nacional', async () => {
    for (const consulta of ['?anio=2001', '?ddrissId=1']) {
      const res = await mesesCalculados(consulta);
      expect(res.status, consulta).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
    const nacional = cuentas['autoridad.nacional'];
    expect((await mesesCalculados('', nacional)).status).toBe(400);
    expect((await mesesCalculados(`?ddrissId=1&ddrissId=${ddrissOtraId}`, nacional)).status).toBe(400);
  });

  it('el Personal del establecimiento (sin INDICADOR_CONSULTAR) recibe 403', async () => {
    expect((await mesesCalculados('', cuentas.cs1201)).status).toBe(403);
  });
});
