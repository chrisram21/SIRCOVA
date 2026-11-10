import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { RELOJ, mesGuatemala } from '../src/modulos/revision/rectificaciones.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 1999 y reportes CERRADO de CS-1201 (establecimiento 1) y CS-1206 (6), y fijan RELOJ en
// 1999 para no contar las solicitudes reales ni las de otros archivos. Todo se borra al inicio y al final; las filas
// de la bitácora quedan.
const ANIO = 1999;
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
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${DEL_ANIO}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${DEL_ANIO}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
}

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
  return { token, id: cuenta.id };
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
