import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL enero de 2015 (abierto en la DDRISS 1) y reportes de establecimientos de la semilla: dos EN_REVISION
// de la estadígrafa, uno de revisor2 y uno ENVIADO. Todo se borra al inicio y al final; las filas de la bitácora
// quedan. No usa 2016 ni 2017: bandeja.test.js y transiciones.test.js los borran y Vitest corre los archivos en paralelo.
const ANIO = 2015;
let periodoId;
let estadigrafa;
let revisor2;
let personal;

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
}

async function crearReporte(codigo, estado, revisorId) {
  const [creado] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en, revisor_id, asignado_en)
     SELECT id, ?, ?, 1, '2015-02-02 10:00:00', ?, ? FROM establecimiento WHERE codigo = ?`,
    [periodoId, estado, revisorId, revisorId ? '2015-02-03 10:00:00' : null, codigo],
  );
  return { id: creado.insertId, versionFila: 1 };
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

const reasignar = (reporteId, cuerpo, credencial = estadigrafa.token) =>
  request(app).patch(`/api/v1/reportes/${reporteId}/revisor`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);
const error = (res) => [res.status, res.body.error?.codigo];
const enBase = async (reporteId) => {
  const [[fila]] = await pool.query(
    'SELECT estado, version_fila, revisor_id, UNIX_TIMESTAMP(asignado_en) AS asignado FROM reporte_produccion WHERE id = ?',
    [reporteId],
  );
  return fila;
};
const contar = async (tabla, reporteId) => {
  const [[{ total }]] =
    tabla === 'historial'
      ? await pool.query('SELECT COUNT(*) AS total FROM historial_estado_reporte WHERE reporte_id = ?', [reporteId])
      : await pool.query(
          "SELECT COUNT(*) AS total FROM bitacora WHERE accion = 'ACTUALIZAR' AND entidad = 'reporte_produccion' AND entidad_id = ?",
          [String(reporteId)],
        );
  return Number(total);
};

describe('PATCH /reportes/{id}/revisor', () => {
  let suyo;
  let paraErrores;
  let deRevisor2;
  let enviado;

  beforeAll(async () => {
    await limpiar();
    estadigrafa = await tokenDe('estadigrafa');
    revisor2 = await tokenDe('revisor2');
    personal = await tokenDe('cs1201');
    const [periodo] = await pool.query(
      "INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, 1, '2015-01-01', '2015-01-31')",
      [ANIO],
    );
    periodoId = periodo.insertId;
    await pool.query(
      "INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, '2015-02-10', 'ABIERTO')",
      [periodoId],
    );
    suyo = await crearReporte('CS-1201', 'EN_REVISION', estadigrafa.id);
    paraErrores = await crearReporte('CS-1202', 'EN_REVISION', estadigrafa.id);
    deRevisor2 = await crearReporte('CS-1203', 'EN_REVISION', revisor2.id);
    enviado = await crearReporte('CS-1204', 'ENVIADO', null);
  }, 120000);

  afterAll(limpiar, 60000);

  it('el revisor asignado lo pasa a otro: cambia revisor_id y asignado_en, deja ACTUALIZAR y no escribe historial', async () => {
    const res = await reasignar(suyo.id, { revisorId: revisor2.id, versionFila: suyo.versionFila });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ versionFila: 2, revisor: { id: revisor2.id } });
    expect(typeof res.body.revisor.nombre).toBe('string');
    const fila = await enBase(suyo.id);
    expect(fila).toMatchObject({ estado: 'EN_REVISION', version_fila: 2, revisor_id: revisor2.id });
    expect(Math.abs(Number(fila.asignado) * 1000 - Date.now())).toBeLessThan(5 * 60 * 1000);
    expect(await contar('historial', suyo.id)).toBe(0);
    const [[filaBitacora]] = await pool.query(
      `SELECT usuario_id, modulo, valores_anteriores, valores_nuevos FROM bitacora
        WHERE accion = 'ACTUALIZAR' AND entidad = 'reporte_produccion' AND entidad_id = ? ORDER BY id DESC LIMIT 1`,
      [String(suyo.id)],
    );
    expect(filaBitacora).toMatchObject({
      usuario_id: estadigrafa.id,
      modulo: 'REVISION',
      valores_anteriores: { revisorId: estadigrafa.id },
      valores_nuevos: { revisorId: revisor2.id },
    });
  });

  it('quien no es el revisor asignado recibe 403 NO_ES_REVISOR_ASIGNADO', async () => {
    const res = await reasignar(deRevisor2.id, { revisorId: estadigrafa.id, versionFila: 1 });
    expect(error(res)).toEqual([403, 'NO_ES_REVISOR_ASIGNADO']);
    expect(await enBase(deRevisor2.id)).toMatchObject({ revisor_id: revisor2.id, version_fila: 1 });
  });

  it('un reporte que no está EN_REVISION responde 409 REPORTE_NO_EN_REVISION', async () => {
    expect(error(await reasignar(enviado.id, { revisorId: revisor2.id, versionFila: 1 }))).toEqual([409, 'REPORTE_NO_EN_REVISION']);
  });

  it('el mismo revisor o uno que no es revisor activo de la DDRISS responde 422 REVISOR_INVALIDO', async () => {
    for (const revisorId of [estadigrafa.id, personal.id, 999999999]) {
      expect(error(await reasignar(paraErrores.id, { revisorId, versionFila: 1 }))).toEqual([422, 'REVISOR_INVALIDO']);
    }
    expect(await contar('bitacora', paraErrores.id)).toBe(0);
  });

  it('una versionFila vieja responde 409 REPORTE_DESACTUALIZADO', async () => {
    await pool.query('UPDATE reporte_produccion SET version_fila = 2 WHERE id = ?', [paraErrores.id]);
    expect(error(await reasignar(paraErrores.id, { revisorId: revisor2.id, versionFila: 1 }))).toEqual([409, 'REPORTE_DESACTUALIZADO']);
  });

  it('un cuerpo inválido responde 400, sin REPORTE_ASIGNAR 403 y un reporte inexistente 404', async () => {
    for (const cuerpo of [{ revisorId: revisor2.id }, { versionFila: 1 }, { revisorId: 'x', versionFila: 1 }, { revisorId: revisor2.id, versionFila: 1, motivo: 'x' }]) {
      expect(error(await reasignar(paraErrores.id, cuerpo))).toEqual([400, 'ENTRADA_INVALIDA']);
    }
    expect(error(await reasignar('abc', { revisorId: revisor2.id, versionFila: 1 }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await reasignar(paraErrores.id, { revisorId: revisor2.id, versionFila: 1 }, personal.token))).toEqual([403, 'SIN_PERMISO']);
    expect(error(await reasignar(999999999, { revisorId: revisor2.id, versionFila: 1 }))).toEqual([404, 'NO_ENCONTRADO']);
  });
});
