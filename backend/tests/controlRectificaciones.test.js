import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { RELOJ, mesGuatemala } from '../src/modulos/revision/rectificaciones.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 1999 y reportes CERRADO de CS-1201 (establecimiento 1) y CS-1206 (6), y fijan RELOJ en
// 1999 para no contar las solicitudes reales ni las de otros archivos. Las solicitudes por la API usan la vacuna
// ZVT_SPEC57 (esquema nacional desde enero de 1999) y reportes creados por la API en los meses 7 a 12. Todo se borra
// al inicio y al final, alertas incluidas; las filas de la bitácora quedan.
const ANIO = 1999;
const VACUNA = 'ZVT_SPEC57';
let vacunaId;
const PROPIO = 1;
const OTRO = 6;
const periodoIds = {};
let personal;
let otroPersonal;

const dosDigitos = (n) => String(n).padStart(2, '0');
const segundos = (iso) => Date.parse(iso) / 1000;
const fijarReloj = (iso) => vi.spyOn(RELOJ, 'ahora').mockReturnValue(new Date(iso));

const DEL_ANIO = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;

async function limpiar() {
  await pool.query(
    `DELETE rd FROM rectificacion_detalle rd JOIN solicitud_rectificacion s ON s.id = rd.solicitud_id
      WHERE s.reporte_id IN (SELECT id FROM (${DEL_ANIO}) t)`,
  );
  await pool.query(`DELETE FROM solicitud_rectificacion WHERE reporte_id IN (SELECT id FROM (${DEL_ANIO}) t)`);
  await pool.query(
    `DELETE FROM alerta WHERE reporte_id IN (SELECT id FROM (${DEL_ANIO}) t)
        OR periodo_id IN (SELECT id FROM periodo WHERE anio = ?)`,
    [ANIO],
  );
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${DEL_ANIO}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${DEL_ANIO}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': VACUNA });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
}

const esquema = () => ({
  _id: new ObjectId(),
  vacuna: { id: new Int32(vacunaId), codigo: VACUNA, nombre: `vitest-spec57 ${VACUNA}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO}-01-01T00:00:00.000Z`), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  reglas: [],
  presentacion: { filas: 'dosis', columnas: ['sexo'] },
  auditoria: {
    creado_por: new Int32(1),
    creado_en: new Date(),
    publicado_por: new Int32(1),
    publicado_en: new Date(),
    motivo_cambio: 'vitest-spec57',
  },
  incluir_por_defecto: true,
  dimensiones: {
    dosis: [{ codigo: 'D1', etiqueta: '1.ª dosis' }],
    procedencia: { modo: 'PROPIO_Y_OTROS', permite_no_especificado: true },
    desagregacion: [{ dimension: 'sexo', valores: ['M', 'F'] }],
  },
  secciones: [{ codigo: 'TODAS', titulo: 'Todas', orden: new Int32(1), grupo_edad: null, dosis: ['D1'] }],
  campos_adicionales: [],
});

async function preparar() {
  for (let mes = 1; mes <= 12; mes += 1) {
    const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
    const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
      ANIO,
      mes,
      `${ANIO}-${dosDigitos(mes)}-01`,
      `${ANIO}-${dosDigitos(mes)}-${fin}`,
    ]);
    periodoIds[mes] = periodo.insertId;
    await pool.query(
      "INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, ?, 'ABIERTO')",
      [periodo.insertId, '2099-12-31'],
    );
  }
  const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, ?, 1, TRUE)', [
    VACUNA,
    `vitest-spec57 ${VACUNA}`,
  ]);
  vacunaId = vacuna.insertId;
  await pool.query("INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, 'D1', '1.ª dosis', 1, TRUE)", [
    vacunaId,
  ]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertOne(esquema());
}

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function deUsuario(nombre) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE u.nombre_usuario = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE`,
    [nombre],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa ${nombre} en la base de prueba`);
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
  return { token, id: cuenta.id, municipioId: cuenta.municipio_id };
}

const api = (metodo, ruta, credencial = personal) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial.token}`);

// Un reporte CERRADO por SQL, sin celdas: para el conteo basta con que exista.
async function reporteSql(establecimientoId, mes, creadoPor) {
  const [reporte] = await pool.query(
    "INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, cerrado_en) VALUES (?, ?, 'CERRADO', ?, NOW())",
    [establecimientoId, periodoIds[mes], creadoPor],
  );
  return reporte.insertId;
}

async function solicitudSql(reporteId, solicitadoEnIso, estado = 'RECHAZADA', solicitadoPor = personal.id) {
  await pool.query(
    `INSERT INTO solicitud_rectificacion (reporte_id, solicitado_por, motivo, estado, solicitado_en)
     VALUES (?, ?, 'vitest-spec57', ?, FROM_UNIXTIME(?))`,
    [reporteId, solicitadoPor, estado, segundos(solicitadoEnIso)],
  );
}

beforeAll(async () => {
  [personal, otroPersonal] = await Promise.all([deUsuario('cs1201'), deUsuario('cs1206')]);
  await limpiar();
  await preparar();
});

afterAll(async () => {
  await limpiar();
  await pool.end();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mesGuatemala', () => {
  it('usa la hora de Guatemala (UTC−6)', () => {
    expect(mesGuatemala(new Date('1999-03-01T05:59:59.000Z'))).toEqual({ anio: 1999, mes: 2 });
    expect(mesGuatemala(new Date('1999-03-01T06:00:00.000Z'))).toEqual({ anio: 1999, mes: 3 });
    expect(mesGuatemala(new Date('2000-01-01T05:00:00.000Z'))).toEqual({ anio: 1999, mes: 12 });
  });
});

describe('GET /reportes/{id}/rectificaciones/conteo-del-mes', () => {
  let reportePropio;

  beforeAll(async () => {
    reportePropio = await reporteSql(PROPIO, 1, personal.id);
    const otroPropio = await reporteSql(PROPIO, 2, personal.id);
    const ajeno = await reporteSql(OTRO, 1, otroPersonal.id);
    // Marzo de 1999 en Guatemala: del 1999-03-01T06:00Z al 1999-04-01T06:00Z.
    await solicitudSql(reportePropio, '1999-03-01T06:00:00.000Z', 'RECHAZADA');
    await solicitudSql(reportePropio, '1999-03-15T12:00:00.000Z', 'APLICADA');
    await solicitudSql(otroPropio, '1999-04-01T05:59:59.000Z', 'PENDIENTE');
    // No cuentan: 28 de febrero a las 23:00 de Guatemala, 1 de abril y otro establecimiento.
    await solicitudSql(reportePropio, '1999-03-01T05:00:00.000Z');
    await solicitudSql(otroPropio, '1999-04-01T06:00:00.000Z');
    await solicitudSql(ajeno, '1999-03-10T12:00:00.000Z', 'RECHAZADA', otroPersonal.id);
  });

  it('cuenta las del mes de Guatemala de todos los reportes del establecimiento, en cualquier estado', async () => {
    fijarReloj('1999-03-20T12:00:00.000Z');
    const res = await api('get', `/reportes/${reportePropio}/rectificaciones/conteo-del-mes`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual({ anio: 1999, mes: 3, cantidad: 3, umbral: 5 });
  });

  it('el último día del mes a las 23:00 de Guatemala sigue en ese mes', async () => {
    fijarReloj('1999-04-01T05:00:00.000Z');
    const res = await api('get', `/reportes/${reportePropio}/rectificaciones/conteo-del-mes`);
    expect(res.body).toEqual({ anio: 1999, mes: 3, cantidad: 3, umbral: 5 });
  });

  it('cuenta aparte el otro mes y el otro establecimiento', async () => {
    fijarReloj('1999-02-15T12:00:00.000Z');
    const febrero = await api('get', `/reportes/${reportePropio}/rectificaciones/conteo-del-mes`);
    expect(febrero.body).toEqual({ anio: 1999, mes: 2, cantidad: 1, umbral: 5 });

    fijarReloj('1999-03-20T12:00:00.000Z');
    const [[ajeno]] = await pool.query(
      `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id
        WHERE p.anio = ? AND r.establecimiento_id = ?`,
      [ANIO, OTRO],
    );
    const res = await api('get', `/reportes/${ajeno.id}/rectificaciones/conteo-del-mes`, otroPersonal);
    expect(res.body).toEqual({ anio: 1999, mes: 3, cantidad: 1, umbral: 5 });
  });

  it('responde 404 fuera del ámbito y 400 con un id inválido', async () => {
    const ajeno = await api('get', `/reportes/${reportePropio}/rectificaciones/conteo-del-mes`, otroPersonal);
    expect([ajeno.status, ajeno.body.error?.codigo]).toEqual([404, 'NO_ENCONTRADO']);
    const invalido = await api('get', '/reportes/abc/rectificaciones/conteo-del-mes');
    expect([invalido.status, invalido.body.error?.codigo]).toEqual([400, 'ENTRADA_INVALIDA']);
  });
});

describe('POST /reportes/{id}/rectificaciones: alerta al llegar a 5 en el mes', () => {
  const JUNIO = '1999-06-15T12:00:00.000Z';
  const JULIO = '1999-07-15T12:00:00.000Z';
  const reportes = {};
  let idQuinta;

  const celdaF = (credencial, campo, cantidad) => ({
    dosisCodigo: 'D1',
    municipioProcedenciaId: credencial.municipioId,
    dimensiones: { sexo: 'F' },
    [campo]: cantidad,
  });

  // Un reporte del mes indicado, creado y guardado por la API (D1 F = 10) y cerrado por SQL.
  async function reporteCerrado(mes, credencial) {
    const creado = await api('post', '/reportes', credencial).send({ periodoId: periodoIds[mes] });
    expect(creado.status, JSON.stringify(creado.body)).toBe(201);
    const guardado = await api('put', `/reportes/${creado.body.id}/vacunas/${vacunaId}`, credencial).send({
      versionFila: creado.body.versionFila,
      celdas: [celdaF(credencial, 'cantidad', 10)],
    });
    expect(guardado.status, JSON.stringify(guardado.body)).toBe(200);
    await pool.query("UPDATE reporte_produccion SET estado = 'CERRADO', cerrado_en = NOW() WHERE id = ?", [creado.body.id]);
    const [[fila]] = await pool.query('SELECT version_fila FROM reporte_produccion WHERE id = ?', [creado.body.id]);
    return { id: creado.body.id, versionFila: fila.version_fila };
  }

  const solicitar = (reporte, credencial = personal) =>
    api('post', `/reportes/${reporte.id}/rectificaciones`, credencial).send({
      motivo: 'vitest-spec57 faltó sumar una jornada.',
      versionFila: reporte.versionFila,
      cambios: [{ vacunaId, ...celdaF(credencial, 'cantidadNueva', 12) }],
    });

  const alertasDe = async (establecimientoId, mes) => {
    const [filas] = await pool.query(
      `SELECT id, tipo, severidad, titulo, mensaje, ddriss_id, periodo_id, municipio_id, establecimiento_id, reporte_id,
              rol_destino_id, estado, UNIX_TIMESTAMP(generada_en) AS generada
         FROM alerta WHERE establecimiento_id = ? AND periodo_id = ? ORDER BY id`,
      [establecimientoId, periodoIds[mes]],
    );
    return filas.map((f) => ({ ...f, generada: Number(f.generada) }));
  };

  // Rechazar por SQL la pendiente deja libre el reporte para la siguiente solicitud.
  const rechazar = (reporteId) =>
    pool.query("UPDATE solicitud_rectificacion SET estado = 'RECHAZADA' WHERE reporte_id = ? AND estado = 'PENDIENTE'", [
      reporteId,
    ]);

  beforeAll(async () => {
    for (const mes of [7, 8, 9, 10]) reportes[mes] = await reporteCerrado(mes, personal);
    reportes[12] = await reporteCerrado(12, otroPersonal);
    // Junio: 3 del establecimiento propio y 4 del otro; julio: 4 del propio.
    for (let i = 0; i < 3; i += 1) await solicitudSql(reportes[7].id, JUNIO);
    for (let i = 0; i < 4; i += 1) await solicitudSql(reportes[12].id, JUNIO, 'RECHAZADA', otroPersonal.id);
    for (let i = 0; i < 4; i += 1) await solicitudSql(reportes[8].id, JULIO);
  }, 60_000);

  it('la 4.ª no crea alerta; la 5.ª se guarda (201) y crea la alerta con su bitácora; la 6.ª no crea otra', async () => {
    fijarReloj(JUNIO);
    const cuarta = await solicitar(reportes[7]);
    expect(cuarta.status, JSON.stringify(cuarta.body)).toBe(201);
    expect(await alertasDe(PROPIO, 6)).toEqual([]);
    await rechazar(reportes[7].id);

    const quinta = await solicitar(reportes[7]);
    expect(quinta.status, JSON.stringify(quinta.body)).toBe(201);
    expect(quinta.body.solicitudesDelMes).toEqual({ anio: 1999, mes: 6, cantidad: 5, umbral: 5 });
    idQuinta = quinta.body.id;
    const [[establecimiento]] = await pool.query(
      'SELECT codigo, nombre, ddriss_id, municipio_id FROM establecimiento WHERE id = ?',
      [PROPIO],
    );
    const [[administrador]] = await pool.query("SELECT id FROM rol WHERE codigo = 'ADMINISTRADOR'");
    const alertas = await alertasDe(PROPIO, 6);
    expect(alertas).toHaveLength(1);
    const { id: alertaId, ...alerta } = alertas[0];
    expect(alerta).toEqual({
      tipo: 'PROCESO',
      severidad: 'ADVERTENCIA',
      titulo: 'Rectificaciones frecuentes',
      mensaje: `${establecimiento.codigo} ${establecimiento.nombre} lleva 5 solicitudes de rectificación en junio de 1999.`,
      ddriss_id: establecimiento.ddriss_id,
      periodo_id: periodoIds[6],
      municipio_id: establecimiento.municipio_id,
      establecimiento_id: PROPIO,
      reporte_id: reportes[7].id,
      rol_destino_id: administrador.id,
      estado: 'ACTIVA',
      generada: segundos(JUNIO),
    });
    const [[{ solicitado }]] = await pool.query(
      'SELECT UNIX_TIMESTAMP(solicitado_en) AS solicitado FROM solicitud_rectificacion WHERE id = ?',
      [quinta.body.id],
    );
    expect(Number(solicitado)).toBe(segundos(JUNIO));

    const [bitacora] = await pool.query(
      "SELECT usuario_id, modulo, accion, valores_nuevos FROM bitacora WHERE entidad = 'alerta' AND entidad_id = ?",
      [String(alertaId)],
    );
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0]).toMatchObject({ usuario_id: personal.id, modulo: 'RECTIFICACION', accion: 'CREAR' });
    expect(bitacora[0].valores_nuevos).toMatchObject({
      tipo: 'PROCESO',
      establecimientoId: PROPIO,
      reporteId: reportes[7].id,
    });
    await rechazar(reportes[7].id);

    const sexta = await solicitar(reportes[7]);
    expect(sexta.status, JSON.stringify(sexta.body)).toBe(201);
    expect(await alertasDe(PROPIO, 6)).toHaveLength(1);
  });

  it('la 5.ª de otro establecimiento crea su alerta y no toca la del propio', async () => {
    fijarReloj(JUNIO);
    const res = await solicitar(reportes[12], otroPersonal);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(await alertasDe(OTRO, 6)).toHaveLength(1);
    expect(await alertasDe(PROPIO, 6)).toHaveLength(1);
  });

  it('dos solicitudes simultáneas que serían la 5.ª y la 6.ª dejan una sola alerta en su mes', async () => {
    fijarReloj(JULIO);
    const respuestas = await Promise.all([solicitar(reportes[9]), solicitar(reportes[10])]);
    expect(respuestas.map((r) => r.status)).toEqual([201, 201]);
    const alertas = await alertasDe(PROPIO, 7);
    expect(alertas).toHaveLength(1);
    expect([reportes[9].id, reportes[10].id]).toContain(alertas[0].reporte_id);
    // Cada mes cuenta aparte: la de junio sigue siendo una.
    expect(await alertasDe(PROPIO, 6)).toHaveLength(1);
  });

  it('GET /rectificaciones/{id} trae el conteo del mes de la solicitud, con las posteriores', async () => {
    fijarReloj('1999-11-15T12:00:00.000Z');
    const res = await api('get', `/rectificaciones/${idQuinta}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.solicitudesDelMes).toEqual({ anio: 1999, mes: 6, cantidad: 6, umbral: 5 });
  });
});
