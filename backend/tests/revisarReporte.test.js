import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL enero de 2014 (abierto en la DDRISS 1), un reporte EN_REVISION de CS-1201 con las vacunas
// ZVT_HU28A y ZVT_HU28B, sus resultados de validación y dos devoluciones con observaciones, y un reporte de CS-1202
// sin nada; las devoluciones usan un reporte de CS-1201 por mes, de febrero en adelante. Todo se borra al inicio y
// al final. La lectura y la devolución van en este mismo archivo porque Vitest corre los archivos en paralelo y cada
// uno borra su año.
const ANIO = 2014;
const VACUNAS = ['ZVT_HU28A', 'ZVT_HU28B'];
const ESQUEMA_FICTICIO = '000000000000000000000028';
const REGLA_FICTICIA = 'ZVT_HU28_X';
let estadigrafa;
let revisor2;
let personal;
let personalOtro;
let reporteId;
let reporteVacio;
const vacunas = {};
const resultados = {};
let regla;

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM observacion_revision WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM resultado_validacion WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [VACUNAS]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS]);
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

async function crearResultado(clave, { vacuna = null, detalleId = null, codigo, version, severidad, estado, fecha }) {
  const [creado] = await pool.query(
    `INSERT INTO resultado_validacion
       (reporte_id, reporte_vacuna_id, detalle_id, regla_codigo, regla_version, severidad, mensaje, estado, ejecutado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [reporteId, vacuna?.reporteVacunaId ?? null, detalleId, codigo, version, severidad, `vitest-hu28 ${clave}`, estado, fecha],
  );
  resultados[clave] = creado.insertId;
}

const leer = (ruta, credencial) => request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial.token}`);

// Cada devolución usa un reporte nuevo EN_REVISION de CS-1201, asignado a la estadígrafa, en otro mes de 2014 (el
// envío y la asignación ya los prueba transiciones.test.js).
let ultimoMes = 1;
async function reporteEnRevision(estado = 'EN_REVISION') {
  ultimoMes += 1;
  const mes = String(ultimoMes).padStart(2, '0');
  const fin = new Date(Date.UTC(ANIO, ultimoMes, 0)).getUTCDate();
  const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
    ANIO,
    ultimoMes,
    `${ANIO}-${mes}-01`,
    `${ANIO}-${mes}-${fin}`,
  ]);
  await pool.query(
    `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, '${ANIO}-12-31', 'ABIERTO')`,
    [periodo.insertId],
  );
  const [creado] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en, revisor_id, asignado_en)
     SELECT id, ?, ?, 1, NOW(), ?, NOW() FROM establecimiento WHERE codigo = 'CS-1201'`,
    [periodo.insertId, estado, estadigrafa.id],
  );
  for (const codigo of VACUNAS) {
    await pool.query(
      'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES (?, ?, ?, 1)',
      [creado.insertId, vacunas[codigo].id, ESQUEMA_FICTICIO],
    );
  }
  return { id: creado.insertId, periodoId: periodo.insertId, versionFila: 1 };
}

const devolver = (reporte, cuerpo, credencial = estadigrafa) =>
  request(app)
    .post(`/api/v1/reportes/${reporte.id}/transiciones`)
    .set('Authorization', `Bearer ${credencial.token}`)
    .send({ estadoDestino: 'CORRECCION_SOLICITADA', versionFila: reporte.versionFila, ...cuerpo });
const error = (res) => [res.status, res.body.error?.codigo];

async function leerEstado(reporteIdBuscado) {
  const [[reporte]] = await pool.query(
    'SELECT estado, version_fila, revisor_id FROM reporte_produccion WHERE id = ?',
    [reporteIdBuscado],
  );
  const [observaciones] = await pool.query(
    `SELECT reporte_vacuna_id, usuario_id, texto, detalle_id, atendida, UNIX_TIMESTAMP(creado_en) AS creado_en
       FROM observacion_revision WHERE reporte_id = ? ORDER BY id`,
    [reporteIdBuscado],
  );
  const [historial] = await pool.query(
    'SELECT estado_anterior, estado_nuevo, usuario_id, comentario FROM historial_estado_reporte WHERE reporte_id = ?',
    [reporteIdBuscado],
  );
  const [bitacora] = await pool.query(
    "SELECT accion, valores_anteriores, valores_nuevos FROM bitacora WHERE entidad = 'reporte_produccion' AND entidad_id = ?",
    [String(reporteIdBuscado)],
  );
  return { reporte, observaciones, historial, bitacora };
}

beforeAll(async () => {
  await limpiar();
  estadigrafa = await tokenDe('estadigrafa');
  revisor2 = await tokenDe('revisor2');
  personal = await tokenDe('cs1201');
  personalOtro = await tokenDe('cs1209');

  const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = 1');
  const reglas = await (await obtenerDb())
    .collection('reglas_validacion')
    .find({ estado: 'VIGENTE', 'territorio.nivel': 'NACIONAL' })
    .toArray();
  const deLaDdriss = await (await obtenerDb())
    .collection('reglas_validacion')
    .find({ 'territorio.ddriss_codigo': ddriss.codigo })
    .project({ codigo: 1, version: 1 })
    .toArray();
  // Una versión nacional que la DDRISS no tenga con el mismo código y versión, para que su nombre sea el esperado.
  regla = reglas.find((r) => !deLaDdriss.some((d) => d.codigo === r.codigo && d.version === r.version));
  if (!regla) throw new Error('No hay una regla nacional VIGENTE en la base de prueba');

  const [periodo] = await pool.query(
    `INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, 1, '${ANIO}-01-01', '${ANIO}-01-31')`,
    [ANIO],
  );
  await pool.query(
    `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, '${ANIO}-02-10', 'ABIERTO')`,
    [periodo.insertId],
  );
  const [[cs1201]] = await pool.query("SELECT id, municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
  const [creado] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en, revisor_id, asignado_en)
     VALUES (?, ?, 'EN_REVISION', 1, '${ANIO}-02-03 10:00:00', ?, '${ANIO}-02-04 10:00:00')`,
    [cs1201.id, periodo.insertId, estadigrafa.id],
  );
  reporteId = creado.insertId;
  const [vacio] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por)
     SELECT id, ?, 'BORRADOR', 1 FROM establecimiento WHERE codigo = 'CS-1202'`,
    [periodo.insertId],
  );
  reporteVacio = vacio.insertId;

  for (const [i, codigo] of VACUNAS.entries()) {
    const [vacuna] = await pool.query(
      'INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, ?, ?, TRUE)',
      [codigo, `vitest-hu28 ${codigo}`, i + 1],
    );
    const [dosis] = await pool.query(
      "INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, 'D1', 'Primera dosis', 1, TRUE)",
      [vacuna.insertId],
    );
    const [rv] = await pool.query(
      'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES (?, ?, ?, 1)',
      [reporteId, vacuna.insertId, ESQUEMA_FICTICIO],
    );
    vacunas[codigo] = { id: vacuna.insertId, dosisId: dosis.insertId, reporteVacunaId: rv.insertId };
  }
  const a = vacunas.ZVT_HU28A;
  const b = vacunas.ZVT_HU28B;
  const [detalle] = await pool.query(
    'INSERT INTO detalle_produccion (reporte_vacuna_id, dosis_id, municipio_procedencia_id, cantidad, actualizado_por) VALUES (?, ?, ?, 5, 1)',
    [a.reporteVacunaId, a.dosisId, cs1201.municipio_id],
  );

  const real = { codigo: regla.codigo, version: regla.version };
  await crearResultado('advB', { ...real, vacuna: b, severidad: 'ADVERTENCIA', estado: 'ABIERTO', fecha: `${ANIO}-02-01 08:00:00` });
  await crearResultado('errReporte', {
    codigo: REGLA_FICTICIA,
    version: 1,
    severidad: 'ERROR',
    estado: 'ABIERTO',
    fecha: `${ANIO}-02-02 09:30:00`,
  });
  await crearResultado('advA', {
    ...real,
    vacuna: a,
    detalleId: detalle.insertId,
    severidad: 'ADVERTENCIA',
    estado: 'JUSTIFICADO',
    fecha: `${ANIO}-02-01 08:00:00`,
  });
  await crearResultado('corregido', { ...real, vacuna: a, severidad: 'ERROR', estado: 'CORREGIDO', fecha: `${ANIO}-02-05 08:00:00` });
  await crearResultado('errA', { ...real, vacuna: a, severidad: 'ERROR', estado: 'ABIERTO', fecha: `${ANIO}-02-01 08:00:00` });

  const observar = (fecha, filas) =>
    pool.query(
      'INSERT INTO observacion_revision (reporte_id, reporte_vacuna_id, usuario_id, texto, creado_en) VALUES ?',
      [filas.map(([vacuna, texto]) => [reporteId, vacuna?.reporteVacunaId ?? null, estadigrafa.id, texto, fecha])],
    );
  await observar(`${ANIO}-02-05 10:00:00`, [
    [b, 'primera B'],
    [null, 'primera general'],
    [a, 'primera A'],
  ]);
  await observar(`${ANIO}-02-10 10:00:00`, [[a, 'segunda A']]);
});

afterAll(async () => {
  await limpiar();
});

describe('Lectura del detalle por el Revisor de la DDRISS', () => {
  it('lee el reporte, el formulario (no editable), la validación y las observaciones', async () => {
    const detalle = await leer(`/reportes/${reporteId}`, revisor2);
    expect(detalle.status).toBe(200);
    expect(detalle.body.vacunas.map((v) => v.vacuna?.codigo ?? v.codigo)).toEqual(VACUNAS);
    expect(detalle.body.revisor).toEqual({ id: estadigrafa.id, nombre: expect.any(String) });
    expect((await leer(`/reportes/${reporteVacio}`, revisor2)).body.revisor).toBeNull();

    const formulario = await leer(`/reportes/${reporteId}/formulario`, revisor2);
    expect(formulario.status).toBe(200);
    expect(formulario.body.editable).toBe(false);

    expect((await leer(`/reportes/${reporteId}/validacion`, revisor2)).status).toBe(200);
    expect((await leer(`/reportes/${reporteId}/observaciones`, revisor2)).status).toBe(200);
  });

  it('el Personal de otro establecimiento recibe 404', async () => {
    for (const ruta of ['', '/formulario', '/validacion', '/observaciones']) {
      const res = await leer(`/reportes/${reporteId}${ruta}`, personalOtro);
      expect(res.status, ruta).toBe(404);
    }
  });

  it('un id o un parámetro inválido responde 400', async () => {
    expect((await leer('/reportes/abc/validacion', revisor2)).status).toBe(400);
    expect((await leer('/reportes/abc/observaciones', revisor2)).status).toBe(400);
    const conParametro = await leer(`/reportes/${reporteId}/validacion?vacunaId=1`, revisor2);
    expect(conParametro.status).toBe(400);
    expect(conParametro.body.error.codigo).toBe('ENTRADA_INVALIDA');
    expect((await leer(`/reportes/${reporteId}/observaciones?x=1`, revisor2)).status).toBe(400);
  });
});

describe('GET /reportes/{id}/validacion', () => {
  it('trae solo ABIERTO y JUSTIFICADO, en el orden del motor, sin celdas ni campos', async () => {
    const res = await leer(`/reportes/${reporteId}/validacion`, estadigrafa);
    expect(res.status).toBe(200);
    expect(res.body.resultados.map((r) => r.id)).toEqual([
      resultados.errA,
      resultados.errReporte,
      resultados.advA,
      resultados.advB,
    ]);
    expect(res.body).toMatchObject({ errores: 2, advertencias: 2, corregidos: 0 });
    for (const r of res.body.resultados) {
      expect(r.celdas).toEqual([]);
      expect(r.campos).toEqual([]);
    }

    const [errA, errReporte, advA] = res.body.resultados;
    expect(errA.regla).toEqual({ codigo: regla.codigo, version: regla.version, nombre: regla.nombre, tipo: regla.tipo });
    expect(errA.vacuna).toEqual({ id: vacunas.ZVT_HU28A.id, codigo: 'ZVT_HU28A', nombre: 'vitest-hu28 ZVT_HU28A' });
    expect(errA.dosis).toBeNull();
    // Sin el documento de la regla, el código hace de nombre y de tipo.
    expect(errReporte.regla).toEqual({ codigo: REGLA_FICTICIA, version: 1, nombre: REGLA_FICTICIA, tipo: REGLA_FICTICIA });
    expect(errReporte.vacuna).toBeNull();
    // El esquema ficticio no está en MongoDB: la etiqueta de la dosis es su nombre.
    expect(advA).toMatchObject({ estado: 'JUSTIFICADO', dosis: { codigo: 'D1', etiqueta: 'Primera dosis' } });

    const [[{ ultima }]] = await pool.query(
      `SELECT UNIX_TIMESTAMP(MAX(ejecutado_en)) AS ultima FROM resultado_validacion
        WHERE reporte_id = ? AND estado IN ('ABIERTO', 'JUSTIFICADO')`,
      [reporteId],
    );
    expect(res.body.validadoEn).toBe(new Date(Number(ultima) * 1000).toISOString());
  });

  it('no escribe nada', async () => {
    const contar = async () => {
      const [[{ resultadosTotales }]] = await pool.query(
        'SELECT COUNT(*) AS resultadosTotales FROM resultado_validacion WHERE reporte_id = ?',
        [reporteId],
      );
      const [[{ filasBitacora }]] = await pool.query(
        "SELECT COUNT(*) AS filasBitacora FROM bitacora WHERE entidad = 'reporte_produccion' AND entidad_id = ?",
        [String(reporteId)],
      );
      const [[{ version }]] = await pool.query('SELECT version_fila AS version FROM reporte_produccion WHERE id = ?', [
        reporteId,
      ]);
      return [Number(resultadosTotales), Number(filasBitacora), version];
    };
    const antes = await contar();
    expect((await leer(`/reportes/${reporteId}/validacion`, estadigrafa)).status).toBe(200);
    expect(await contar()).toEqual(antes);
  });

  it('un reporte sin resultados responde validadoEn null y una lista vacía', async () => {
    const res = await leer(`/reportes/${reporteVacio}/validacion`, estadigrafa);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ validadoEn: null, errores: 0, advertencias: 0, corregidos: 0, resultados: [] });
  });
});

describe('GET /reportes/{id}/observaciones', () => {
  it('de la devolución más reciente a la más antigua, con la general primero y luego por vacuna', async () => {
    const res = await leer(`/reportes/${reporteId}/observaciones`, estadigrafa);
    expect(res.status).toBe(200);
    expect(res.body.map((o) => o.texto)).toEqual(['segunda A', 'primera general', 'primera A', 'primera B']);

    const general = res.body[1];
    expect(general.vacuna).toBeNull();
    expect(general.autor.id).toBe(estadigrafa.id);
    expect(general).toMatchObject({ atendida: false, atendidaEn: null });
    expect(res.body[2].vacuna).toEqual({ id: vacunas.ZVT_HU28A.id, codigo: 'ZVT_HU28A', nombre: 'vitest-hu28 ZVT_HU28A' });

    const [[{ creado }]] = await pool.query(
      'SELECT UNIX_TIMESTAMP(MAX(creado_en)) AS creado FROM observacion_revision WHERE reporte_id = ?',
      [reporteId],
    );
    expect(res.body[0].creadoEn).toBe(new Date(Number(creado) * 1000).toISOString());
  });

  it('el Personal del establecimiento ve las de su reporte', async () => {
    const res = await leer(`/reportes/${reporteId}/observaciones`, personal);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(4);
  });

  it('un reporte sin observaciones responde una lista vacía', async () => {
    const res = await leer(`/reportes/${reporteVacio}/observaciones`, estadigrafa);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

describe('POST /reportes/{id}/transiciones → CORRECCION_SOLICITADA', () => {
  it('el revisor asignado devuelve con una general y una por vacuna', async () => {
    const reporte = await reporteEnRevision();
    const b = vacunas.ZVT_HU28B;
    const res = await devolver(reporte, {
      observaciones: [
        { vacunaId: b.id, texto: '  Revise la dosis de B.  ' },
        { vacunaId: null, texto: 'Revise la procedencia.' },
      ],
    });
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('CORRECCION_SOLICITADA');

    const { reporte: fila, observaciones, historial, bitacora } = await leerEstado(reporte.id);
    expect(fila).toEqual({ estado: 'CORRECCION_SOLICITADA', version_fila: 2, revisor_id: estadigrafa.id });
    expect(observaciones.map((o) => [o.reporte_vacuna_id, o.texto])).toEqual([
      [null, 'Revise la procedencia.'],
      [expect.any(Number), 'Revise la dosis de B.'],
    ]);
    expect(observaciones.every((o) => o.usuario_id === estadigrafa.id && o.detalle_id === null && !o.atendida)).toBe(true);
    // Un solo INSERT: las dos comparten creado_en.
    expect(observaciones[0].creado_en).toBe(observaciones[1].creado_en);
    expect(historial).toEqual([
      {
        estado_anterior: 'EN_REVISION',
        estado_nuevo: 'CORRECCION_SOLICITADA',
        usuario_id: estadigrafa.id,
        comentario: 'Revise la procedencia.',
      },
    ]);
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0]).toMatchObject({
      accion: 'CAMBIO_ESTADO',
      valores_anteriores: { estado: 'EN_REVISION' },
      valores_nuevos: {
        estado: 'CORRECCION_SOLICITADA',
        observaciones: [
          { vacunaId: null, texto: 'Revise la procedencia.' },
          { vacunaId: b.id, texto: 'Revise la dosis de B.' },
        ],
      },
    });
  });

  it('sin observación general, el comentario resume las de vacuna y lo ve el Personal en «Mis reportes»', async () => {
    const una = await reporteEnRevision();
    expect((await devolver(una, { observaciones: [{ vacunaId: vacunas.ZVT_HU28A.id, texto: 'A' }] })).status).toBe(200);
    expect((await leerEstado(una.id)).historial[0].comentario).toBe('1 observación por vacuna: vitest-hu28 ZVT_HU28A');

    const dos = await reporteEnRevision();
    const res = await devolver(dos, {
      observaciones: [
        { vacunaId: vacunas.ZVT_HU28B.id, texto: 'B' },
        { vacunaId: vacunas.ZVT_HU28A.id, texto: 'A' },
      ],
    });
    expect(res.status).toBe(200);
    const comentario = '2 observaciones por vacuna: vitest-hu28 ZVT_HU28A, vitest-hu28 ZVT_HU28B';
    expect((await leerEstado(dos.id)).historial[0].comentario).toBe(comentario);

    const lista = await request(app)
      .get('/api/v1/reportes')
      .query({ periodoId: dos.periodoId })
      .set('Authorization', `Bearer ${personal.token}`);
    expect(lista.status).toBe(200);
    expect(lista.body.elementos[0].correccion.comentario).toBe(comentario);
  });

  it('rechaza el cuerpo inválido, sin observaciones o con una vacuna ajena', async () => {
    const reporte = await reporteEnRevision();
    const a = vacunas.ZVT_HU28A.id;
    const [[ajena]] = await pool.query('SELECT id FROM vacuna WHERE codigo NOT IN (?) LIMIT 1', [VACUNAS]);

    expect(error(await devolver(reporte, { observaciones: [] }))).toEqual([422, 'OBSERVACION_REQUERIDA']);
    expect(error(await devolver(reporte, {}))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await devolver(reporte, { observaciones: 'texto' }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await devolver(reporte, { observaciones: [{ vacunaId: null, texto: '   ' }] }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await devolver(reporte, { observaciones: [{ vacunaId: null, texto: 'x'.repeat(1001) }] }))).toEqual([
      400,
      'ENTRADA_INVALIDA',
    ]);
    expect(error(await devolver(reporte, { observaciones: [{ texto: 'sin vacuna' }] }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(
      error(await devolver(reporte, { observaciones: [{ vacunaId: null, texto: 'x', detalleId: 1 }] })),
    ).toEqual([400, 'ENTRADA_INVALIDA']);
    const repetida = await devolver(reporte, {
      observaciones: [
        { vacunaId: null, texto: 'una' },
        { vacunaId: null, texto: 'otra' },
      ],
    });
    expect(error(repetida)).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(repetida.body.error.mensaje).toBe('Solo puede haber una observación general.');
    expect(
      error(
        await devolver(reporte, {
          observaciones: [
            { vacunaId: a, texto: 'una' },
            { vacunaId: a, texto: 'otra' },
          ],
        }),
      ),
    ).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(
      error(await devolver(reporte, { comentario: 'algo', observaciones: [{ vacunaId: null, texto: 'x' }] })),
    ).toEqual([400, 'ENTRADA_INVALIDA']);
    const otroDestino = await request(app)
      .post(`/api/v1/reportes/${reporte.id}/transiciones`)
      .set('Authorization', `Bearer ${estadigrafa.token}`)
      .send({ estadoDestino: 'ENVIADO', versionFila: 1, observaciones: [{ vacunaId: null, texto: 'x' }] });
    expect(error(otroDestino)).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await devolver(reporte, { observaciones: [{ vacunaId: ajena.id, texto: 'x' }] }))).toEqual([
      422,
      'VACUNA_NO_EN_REPORTE',
    ]);
    expect(error(await devolver({ ...reporte, versionFila: 9 }, { observaciones: [{ vacunaId: null, texto: 'x' }] }))).toEqual([
      409,
      'REPORTE_DESACTUALIZADO',
    ]);

    const { reporte: fila, observaciones, historial, bitacora } = await leerEstado(reporte.id);
    expect(fila.estado).toBe('EN_REVISION');
    expect(fila.version_fila).toBe(1);
    expect(observaciones).toEqual([]);
    expect(historial).toEqual([]);
    expect(bitacora).toEqual([]);
  });

  it('otro revisor recibe 403 NO_ES_REVISOR_ASIGNADO sin ACCESO_DENEGADO, y el Personal 403 SIN_PERMISO', async () => {
    const reporte = await reporteEnRevision();
    const cuerpo = { observaciones: [{ vacunaId: null, texto: 'x' }] };
    const denegados = async () => {
      const [[{ total }]] = await pool.query(
        "SELECT COUNT(*) AS total FROM bitacora WHERE accion = 'ACCESO_DENEGADO' AND usuario_id = ?",
        [revisor2.id],
      );
      return Number(total);
    };
    const antes = await denegados();
    expect(error(await devolver(reporte, cuerpo, revisor2))).toEqual([403, 'NO_ES_REVISOR_ASIGNADO']);
    expect(await denegados()).toBe(antes);

    expect(error(await devolver(reporte, cuerpo, personal))).toEqual([403, 'SIN_PERMISO']);
    const { reporte: fila, observaciones } = await leerEstado(reporte.id);
    expect(fila.estado).toBe('EN_REVISION');
    expect(observaciones).toEqual([]);
  });

  it('un reporte que no está EN_REVISION responde 422 TRANSICION_NO_PERMITIDA', async () => {
    const reporte = await reporteEnRevision('ENVIADO');
    expect(error(await devolver(reporte, { observaciones: [{ vacunaId: null, texto: 'x' }] }))).toEqual([
      422,
      'TRANSICION_NO_PERMITIDA',
    ]);
  });
});
