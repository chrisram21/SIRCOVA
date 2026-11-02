import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL enero de 2007 (abierto en la DDRISS 1), un reporte CERRADO de CS-1201 con su ciclo completo en el
// historial y un reporte de CS-1202 con su creación; el endpoint solo lee, así que nada pasa por la API. Todo se
// borra al inicio y al final.
const ANIO = 2007;
let personal;
let estadigrafa;
let administrador;
let epidemiologia;
let revisorOtraDdriss;
let reporteId;
let reporteOtro;

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
}

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base (la DDRISS no, así que otra DDRISS se simula con ddrissId).
async function tokenDe(condicion, parametros, ddrissId) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, r.nombre AS rol_nombre, u.rol_id, e.ddriss_id, e.establecimiento_id,
            e.municipio_id, CONCAT(e.nombres, ' ', e.apellidos) AS nombre
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE ${condicion} AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
    parametros,
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa (${parametros.join(', ')}) en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  const token = await tokenDePrueba(
    cuenta.id,
    {
      rol: cuenta.rol,
      permisos: permisos.map((p) => p.codigo),
      ddrissId: ddrissId ?? cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id,
      municipioId: cuenta.municipio_id,
    },
    { expiresIn: '10m' },
  );
  return { token, id: cuenta.id, nombre: cuenta.nombre, rol: { codigo: cuenta.rol, nombre: cuenta.rol_nombre } };
}
const deUsuario = (nombre, ddrissId) => tokenDe('u.nombre_usuario = ?', [nombre], ddrissId);

const leer = (id, credencial = estadigrafa, consulta = '') =>
  request(app).get(`/api/v1/reportes/${id}/historial${consulta}`).set('Authorization', `Bearer ${credencial.token}`);
const error = (res) => [res.status, res.body.error?.codigo];

async function agregarFila(reporte, anterior, nuevo, usuario, comentario, fecha) {
  const [creada] = await pool.query(
    `INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, usuario_id, comentario, fecha)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reporte, anterior, nuevo, usuario.id, comentario, fecha],
  );
  return creada.insertId;
}

beforeAll(async () => {
  await limpiar();
  personal = await deUsuario('cs1201');
  estadigrafa = await deUsuario('estadigrafa');
  revisorOtraDdriss = await deUsuario('estadigrafa', 999999);
  administrador = await tokenDe("r.codigo = 'ADMINISTRADOR' AND e.ddriss_id = ?", [1]);
  epidemiologia = await tokenDe("r.codigo = 'EPIDEMIOLOGIA' AND e.ddriss_id = ?", [1]);

  const [periodo] = await pool.query(
    `INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, 1, '${ANIO}-01-01', '${ANIO}-01-31')`,
    [ANIO],
  );
  await pool.query(
    `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, '2099-12-31', 'ABIERTO')`,
    [periodo.insertId],
  );
  const [creado] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por)
     SELECT id, ?, 'CERRADO', ? FROM establecimiento WHERE codigo = 'CS-1201'`,
    [periodo.insertId, personal.id],
  );
  reporteId = creado.insertId;
  const [otro] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por)
     SELECT id, ?, 'BORRADOR', 1 FROM establecimiento WHERE codigo = 'CS-1202'`,
    [periodo.insertId],
  );
  reporteOtro = otro.insertId;

  // Fuera de orden a propósito: la creación se inserta al final y las dos últimas filas comparten el segundo.
  await agregarFila(reporteId, 'BORRADOR', 'ENVIADO', personal, null, `${ANIO}-02-02 09:00:00`);
  await agregarFila(reporteId, 'ENVIADO', 'EN_REVISION', estadigrafa, 'vitest-hu34 asignado', `${ANIO}-02-03 08:30:00`);
  await agregarFila(reporteId, 'EN_REVISION', 'APROBADO', estadigrafa, null, `${ANIO}-02-04 11:15:00`);
  await agregarFila(reporteId, 'APROBADO', 'CERRADO', estadigrafa, 'Cierre del periodo.', `${ANIO}-02-10 16:00:00`);
  await agregarFila(reporteId, 'CERRADO', 'RECTIFICACION', estadigrafa, 'vitest-hu34 autorizada', `${ANIO}-03-01 10:00:00`);
  await agregarFila(reporteId, 'RECTIFICACION', 'CERRADO', estadigrafa, 'vitest-hu34 aplicada', `${ANIO}-03-01 10:00:00`);
  await agregarFila(reporteId, null, 'BORRADOR', personal, null, `${ANIO}-01-05 10:00:00`);
  await agregarFila(reporteOtro, null, 'BORRADOR', administrador, null, `${ANIO}-01-06 10:00:00`);
}, 60000);

afterAll(async () => {
  await limpiar();
});

describe('GET /reportes/{id}/historial', () => {
  it('el Personal lee el historial de su reporte, del más antiguo al más reciente', async () => {
    const res = await leer(reporteId, personal);
    expect(res.status).toBe(200);
    expect(res.body.map((f) => [f.estadoAnterior, f.estadoNuevo])).toEqual([
      [null, 'BORRADOR'],
      ['BORRADOR', 'ENVIADO'],
      ['ENVIADO', 'EN_REVISION'],
      ['EN_REVISION', 'APROBADO'],
      ['APROBADO', 'CERRADO'],
      ['CERRADO', 'RECTIFICACION'],
      ['RECTIFICACION', 'CERRADO'],
    ]);
    const [creacion, envio, asignacion] = res.body;
    expect(creacion).toEqual({
      id: expect.any(Number),
      estadoAnterior: null,
      estadoNuevo: 'BORRADOR',
      usuario: { id: personal.id, nombre: personal.nombre, rol: personal.rol },
      fecha: `${ANIO}-01-05T10:00:00.000Z`,
      comentario: null,
    });
    expect(envio.fecha).toBe(`${ANIO}-02-02T09:00:00.000Z`);
    expect(asignacion.usuario).toEqual({ id: estadigrafa.id, nombre: estadigrafa.nombre, rol: estadigrafa.rol });
    expect(asignacion.comentario).toBe('vitest-hu34 asignado');
    // A igual fecha, por id.
    expect(res.body[5].id).toBeLessThan(res.body[6].id);
  });

  it('el revisor y el administrador de la DDRISS lo leen', async () => {
    const delRevisor = await leer(reporteId, estadigrafa);
    expect(delRevisor.status).toBe(200);
    expect(delRevisor.body).toHaveLength(7);
    const delAdministrador = await leer(reporteOtro, administrador);
    expect(delAdministrador.status).toBe(200);
    expect(delAdministrador.body).toHaveLength(1);
    expect(delAdministrador.body[0].usuario.rol.codigo).toBe('ADMINISTRADOR');
  });

  it('responde 404 fuera del ámbito o si el reporte no existe', async () => {
    expect(error(await leer(reporteOtro, personal))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await leer(reporteId, revisorOtraDdriss))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await leer(2147483000))).toEqual([404, 'NO_ENCONTRADO']);
  });

  it('responde 403 sin REPORTE_CONSULTAR y 400 con un id inválido o un parámetro', async () => {
    expect(error(await leer(reporteId, epidemiologia))).toEqual([403, 'SIN_PERMISO']);
    expect(error(await leer('abc'))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await leer(0))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await leer(reporteId, estadigrafa, '?estado=CERRADO'))).toEqual([400, 'ENTRADA_INVALIDA']);
  });
});

describe('historial_estado_reporte inmutable (script 09)', () => {
  it('rechaza un UPDATE y permite el DELETE de la limpieza', async () => {
    const id = await agregarFila(reporteOtro, 'BORRADOR', 'ENVIADO', personal, 'vitest-hu34 borrar', `${ANIO}-01-07 10:00:00`);
    await expect(
      pool.query("UPDATE historial_estado_reporte SET comentario = 'vitest-hu34 cambiado' WHERE id = ?", [id]),
    ).rejects.toThrow('El historial de estados no se puede modificar.');
    const [[fila]] = await pool.query('SELECT comentario FROM historial_estado_reporte WHERE id = ?', [id]);
    expect(fila.comentario).toBe('vitest-hu34 borrar');
    const [borrado] = await pool.query('DELETE FROM historial_estado_reporte WHERE id = ?', [id]);
    expect(borrado.affectedRows).toBe(1);
  });
});
