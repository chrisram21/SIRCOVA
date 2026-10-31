import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2016 (enero abierto y febrero cerrado en la DDRISS 1; marzo sin cierre_periodo de
// ninguna DDRISS), reportes de enero de establecimientos de la semilla en cada estado y tres establecimientos de
// prueba ZVT27-*: uno inactivo, uno sin reporta_5c y uno inactivo con reporte. Todo se borra al inicio y al final.
const ANIO = 2016;
const ESQUEMA_FICTICIO = '000000000000000000000027';
const periodoIds = {};
const establecimientos = {};
let estadigrafa;
let revisor2;
let personal;

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM resultado_validacion WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query("DELETE FROM establecimiento WHERE codigo LIKE 'ZVT27-%'");
}

async function crearPeriodo(mes, estado) {
  const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
  const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
    ANIO,
    mes,
    `${ANIO}-${dosDigitos(mes)}-01`,
    `${ANIO}-${dosDigitos(mes)}-${fin}`,
  ]);
  periodoIds[mes] = periodo.insertId;
  if (estado) {
    await pool.query(
      `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
       VALUES (?, 1, ?, ?, ?, ?)`,
      [
        periodo.insertId,
        `${ANIO}-${dosDigitos(mes + 1)}-10`,
        estado,
        estado === 'CERRADO' ? 2 : null,
        estado === 'CERRADO' ? `${ANIO}-12-20 16:00:00` : null,
      ],
    );
  }
}

// Un establecimiento de prueba en el municipio y el distrito de CS-1201.
async function crearEstablecimiento(codigo, { activo, reporta5c }) {
  const [creado] = await pool.query(
    `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, distrito_salud_id, municipio_id,
                                  reporta_5c, activo)
     SELECT ?, ?, tipo_establecimiento_id, ddriss_id, distrito_salud_id, municipio_id, ?, ?
       FROM establecimiento WHERE codigo = 'CS-1201'`,
    [codigo, `vitest-hu27 ${codigo}`, reporta5c, activo],
  );
  establecimientos[codigo] = creado.insertId;
}

async function crearReporte(codigo, estado, { enviado = null, revisorId = null } = {}) {
  const [creado] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en, revisor_id, asignado_en)
     VALUES (?, ?, ?, 1, ?, ?, ?)`,
    [establecimientos[codigo], periodoIds[1], estado, enviado, revisorId, revisorId ? enviado : null],
  );
  return creado.insertId;
}

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function tokenDe(nombreUsuario) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
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
      rol: cuenta.rol,
      permisos: permisos.map((p) => p.codigo),
      ddrissId: cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id,
      municipioId: cuenta.municipio_id,
    },
    { expiresIn: '10m' },
  );
  return { token, id: cuenta.id };
}

const bandeja = (consulta, credencial = estadigrafa.token) =>
  request(app).get('/api/v1/revision/bandeja').query(consulta).set('Authorization', `Bearer ${credencial}`);
const codigos = (res) => res.body.elementos.map((e) => e.establecimiento.codigo);
const GRUPOS = ['POR_ATENDER', 'ASIGNADOS_A_MI', 'EN_REVISION', 'ENVIADO', 'CORRECCION_SOLICITADA', 'SIN_ENVIAR', 'APROBADO', 'CERRADO', 'TODOS'];

describe('GET /revision/bandeja', () => {
  let reporteEnviado;
  let deLaDdriss;

  beforeAll(async () => {
    await limpiar();
    estadigrafa = await tokenDe('estadigrafa');
    revisor2 = await tokenDe('revisor2');
    personal = await tokenDe('cs1201');
    await crearPeriodo(1, 'ABIERTO');
    await crearPeriodo(2, 'CERRADO');
    await crearPeriodo(3, null);

    const [semilla] = await pool.query(
      "SELECT id, codigo FROM establecimiento WHERE codigo IN ('CS-1201', 'CS-1202', 'CS-1203', 'CS-1204', 'CS-1205', 'CS-1206', 'CS-1207', 'CS-1208')",
    );
    for (const e of semilla) establecimientos[e.codigo] = e.id;
    await crearEstablecimiento('ZVT27-INACT', { activo: false, reporta5c: true });
    await crearEstablecimiento('ZVT27-NO5C', { activo: true, reporta5c: false });
    await crearEstablecimiento('ZVT27-INACT2', { activo: false, reporta5c: true });

    reporteEnviado = await crearReporte('CS-1201', 'ENVIADO', { enviado: `${ANIO}-02-03 10:00:00` });
    await crearReporte('CS-1202', 'EN_REVISION', { enviado: `${ANIO}-02-01 10:00:00`, revisorId: estadigrafa.id });
    await crearReporte('CS-1203', 'EN_REVISION', { enviado: `${ANIO}-02-02 10:00:00`, revisorId: revisor2.id });
    await crearReporte('CS-1204', 'CORRECCION_SOLICITADA', { enviado: `${ANIO}-02-04 10:00:00` });
    await crearReporte('CS-1205', 'BORRADOR');
    await crearReporte('CS-1206', 'APROBADO', { enviado: `${ANIO}-02-05 10:00:00` });
    await crearReporte('CS-1207', 'CERRADO', { enviado: `${ANIO}-02-06 10:00:00` });
    await crearReporte('CS-1208', 'RECTIFICACION', { enviado: `${ANIO}-02-07 10:00:00` });
    // Ya no está activo, pero su reporte del mes sí se revisa.
    await crearReporte('ZVT27-INACT2', 'ENVIADO', { enviado: `${ANIO}-02-08 10:00:00` });

    // Dos advertencias que cuentan, una corregida y un error que no.
    await pool.query(
      `INSERT INTO resultado_validacion (reporte_id, regla_codigo, regla_version, severidad, mensaje, estado) VALUES
         (?, 'ZVT27_A', 1, 'ADVERTENCIA', 'a', 'ABIERTO'),
         (?, 'ZVT27_B', 1, 'ADVERTENCIA', 'b', 'JUSTIFICADO'),
         (?, 'ZVT27_C', 1, 'ADVERTENCIA', 'c', 'CORREGIDO'),
         (?, 'ZVT27_D', 1, 'ERROR', 'd', 'CORREGIDO')`,
      [reporteEnviado, reporteEnviado, reporteEnviado, reporteEnviado],
    );
    const [vacunas] = await pool.query('SELECT id FROM vacuna ORDER BY id LIMIT 3');
    await pool.query(
      `INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version, total_declarado) VALUES
         (?, ?, ?, 1, 30), (?, ?, ?, 1, 12), (?, ?, ?, 1, NULL)`,
      vacunas.flatMap((v) => [reporteEnviado, v.id, ESQUEMA_FICTICIO]),
    );

    const [filas] = await pool.query(
      'SELECT codigo FROM establecimiento WHERE ddriss_id = 1 AND activo = TRUE AND reporta_5c = TRUE',
    );
    deLaDdriss = filas.map((f) => f.codigo);
  }, 120000);

  afterAll(limpiar, 60000);

  it('por defecto trae Por atender, ordenados por fecha de envío, con revisor, advertencias y dosis', async () => {
    const res = await bandeja({ periodoId: periodoIds[1] });

    expect(res.status).toBe(200);
    expect(codigos(res)).toEqual(['CS-1202', 'CS-1203', 'CS-1201', 'ZVT27-INACT2']);
    expect(res.body).toMatchObject({ total: 4, pagina: 1, porPagina: 20 });
    const [primero, segundo, tercero] = res.body.elementos;
    expect(primero).toMatchObject({ estado: 'EN_REVISION', revisor: { id: estadigrafa.id }, enviadoEn: `${ANIO}-02-01T10:00:00.000Z` });
    expect(typeof primero.revisor.nombre).toBe('string');
    expect(segundo.revisor.id).toBe(revisor2.id);
    expect(tercero).toMatchObject({ reporteId: reporteEnviado, estado: 'ENVIADO', revisor: null, advertencias: 2, dosisTotales: 42 });
    expect(Number.isInteger(tercero.versionFila)).toBe(true);
    expect(res.body.elementos[3]).toMatchObject({ advertencias: 0, dosisTotales: null });
  });

  it('cada grupo trae lo suyo y su conteo coincide con lo que muestra', async () => {
    const conteos = (await bandeja({ periodoId: periodoIds[1] })).body.conteos;
    for (const grupo of GRUPOS) {
      const res = await bandeja({ periodoId: periodoIds[1], grupo, porPagina: 100 });
      expect(res.status).toBe(200);
      expect(res.body.total).toBe(conteos[grupo]);
      expect(res.body.elementos).toHaveLength(conteos[grupo]);
      expect(res.body.conteos).toEqual(conteos);
    }
    expect(conteos).toMatchObject({
      POR_ATENDER: 4,
      ASIGNADOS_A_MI: 1,
      EN_REVISION: 2,
      ENVIADO: 2,
      CORRECCION_SOLICITADA: 1,
      APROBADO: 1,
      CERRADO: 2,
    });
    expect(conteos.TODOS).toBe(deLaDdriss.length + 1);
    expect(conteos.SIN_ENVIAR).toBe(deLaDdriss.length - 8 + 1);
  });

  it('Asignados a mí es de quien consulta', async () => {
    expect(codigos(await bandeja({ periodoId: periodoIds[1], grupo: 'ASIGNADOS_A_MI' }))).toEqual(['CS-1202']);
    expect(codigos(await bandeja({ periodoId: periodoIds[1], grupo: 'ASIGNADOS_A_MI' }, revisor2.token))).toEqual(['CS-1203']);
  });

  it('Cerrado incluye RECTIFICACION', async () => {
    expect(codigos(await bandeja({ periodoId: periodoIds[1], grupo: 'CERRADO' }))).toEqual(['CS-1207', 'CS-1208']);
  });

  it('Sin enviar trae los que no tienen reporte y los BORRADOR, no un inactivo ni uno sin reporta_5c', async () => {
    const res = await bandeja({ periodoId: periodoIds[1], grupo: 'SIN_ENVIAR', porPagina: 100 });
    const lista = codigos(res);

    expect(lista).toContain('CS-1205');
    expect(lista).toContain('CS-1209');
    expect(lista).not.toContain('ZVT27-INACT');
    expect(lista).not.toContain('ZVT27-NO5C');
    expect(lista).not.toContain('CS-1201');
    const sinReporte = res.body.elementos.find((e) => e.establecimiento.codigo === 'CS-1209');
    expect(sinReporte).toMatchObject({ reporteId: null, versionFila: null, estado: null, enviadoEn: null, revisor: null, dosisTotales: null });
  });

  it('en Todos, los que no tienen fecha de envío van al final', async () => {
    const res = await bandeja({ periodoId: periodoIds[1], grupo: 'TODOS', porPagina: 100 });
    const fechas = res.body.elementos.map((e) => e.enviadoEn);
    const primeraSinFecha = fechas.indexOf(null);
    expect(primeraSinFecha).toBe(8);
    expect(fechas.slice(primeraSinFecha).every((f) => f === null)).toBe(true);
    expect(fechas.slice(0, 8)).toEqual([...fechas.slice(0, 8)].sort());
  });

  it('filtra por municipio, con los conteos de ese municipio', async () => {
    const [[{ municipio_id: municipioId }]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
    const res = await bandeja({ periodoId: periodoIds[1], municipioId, grupo: 'TODOS', porPagina: 100 });

    expect(res.status).toBe(200);
    expect(res.body.elementos.every((e) => e.municipio.id === municipioId)).toBe(true);
    expect(codigos(res)).toContain('CS-1201');
    expect(codigos(res)).not.toContain('CS-1202');
    expect(res.body.conteos.TODOS).toBe(res.body.elementos.length);
  });

  it('pagina, y una página fuera de rango responde vacía con el total real', async () => {
    const primera = await bandeja({ periodoId: periodoIds[1], porPagina: 2 });
    const segunda = await bandeja({ periodoId: periodoIds[1], porPagina: 2, pagina: 2 });
    const fuera = await bandeja({ periodoId: periodoIds[1], porPagina: 2, pagina: 9 });

    expect(codigos(primera)).toEqual(['CS-1202', 'CS-1203']);
    expect(codigos(segunda)).toEqual(['CS-1201', 'ZVT27-INACT2']);
    expect(fuera.status).toBe(200);
    expect(fuera.body).toMatchObject({ elementos: [], total: 4, pagina: 9 });
  });

  it('un mes cerrado también se consulta', async () => {
    const res = await bandeja({ periodoId: periodoIds[2], grupo: 'TODOS' });
    expect(res.status).toBe(200);
    expect(res.body.conteos.SIN_ENVIAR).toBe(deLaDdriss.length);
  });

  it('parámetros inválidos responden 400, un mes sin cierre de la DDRISS 404 y el Personal 403', async () => {
    const malos = [
      {},
      { periodoId: 'abc' },
      { periodoId: periodoIds[1], grupo: 'BORRADOR' },
      { periodoId: periodoIds[1], porPagina: 101 },
      { periodoId: periodoIds[1], municipioId: 0 },
      { periodoId: periodoIds[1], estado: 'ENVIADO' },
    ];
    for (const consulta of malos) {
      const res = await bandeja(consulta);
      expect([res.status, res.body.error?.codigo]).toEqual([400, 'ENTRADA_INVALIDA']);
    }
    const repetido = await request(app)
      .get(`/api/v1/revision/bandeja?periodoId=${periodoIds[1]}&periodoId=${periodoIds[2]}`)
      .set('Authorization', `Bearer ${estadigrafa.token}`);
    expect(repetido.status).toBe(400);

    const sinCierre = await bandeja({ periodoId: periodoIds[3] });
    expect([sinCierre.status, sinCierre.body.error?.codigo]).toEqual([404, 'NO_ENCONTRADO']);
    const delPersonal = await bandeja({ periodoId: periodoIds[1] }, personal.token);
    expect([delPersonal.status, delPersonal.body.error?.codigo]).toEqual([403, 'SIN_PERMISO']);
  });
});

describe('GET /revision/revisores', () => {
  beforeAll(async () => {
    estadigrafa ??= await tokenDe('estadigrafa');
    personal ??= await tokenDe('cs1201');
  }, 60000);

  const revisores = (credencial = estadigrafa.token, consulta = {}) =>
    request(app).get('/api/v1/revision/revisores').query(consulta).set('Authorization', `Bearer ${credencial}`);

  it('trae solo los revisores activos de la DDRISS, con su nombre', async () => {
    const res = await revisores();
    const [esperados] = await pool.query(
      `SELECT u.id FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN empleado em ON em.id = u.empleado_id
        WHERE r.codigo = 'REVISOR' AND u.activo = TRUE AND em.activo = TRUE AND em.ddriss_id = 1`,
    );

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.id).sort((a, b) => a - b)).toEqual(esperados.map((e) => e.id).sort((a, b) => a - b));
    expect(res.body.map((r) => r.id)).toContain(estadigrafa.id);
    expect(res.body.every((r) => typeof r.nombre === 'string' && r.nombre.trim() !== '')).toBe(true);
  });

  it('un parámetro responde 400 y el Personal 403', async () => {
    expect((await revisores(estadigrafa.token, { ddrissId: 1 })).status).toBe(400);
    expect((await revisores(personal.token)).status).toBe(403);
  });
});
