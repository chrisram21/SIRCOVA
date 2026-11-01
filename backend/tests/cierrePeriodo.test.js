import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { pasarMesesVencidos } from '../src/modulos/revision/cierre.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2011, abiertos en la DDRISS 1, cada uno con la fecha límite que pide su caso (diciembre
// queda sin abrir). La tarea se prueba con hoy = HOY, que solo alcanza los meses de 2011 (los demás archivos usan
// fechas límite de 2099). Los reportes de CS-1201 van por la API con la vacuna ZVT_HU31C (esquema nacional desde
// enero de 2011) mientras el mes está abierto, y después el mes pasa a EN_CIERRE por SQL; los de otros
// establecimientos, que solo cuentan para el cierre, se insertan por SQL. Todo se borra al inicio y al final; las
// filas de la bitácora quedan.
const ANIO = 2011;
const HOY = '2011-12-31';
const FUTURA = '2099-12-31';
// Del 1 al 3, la tarea y la defensa al crear: vencida para la tarea; la de hoy no vence; la de enero de 2012 sobrevive
// a la tarea pero ya pasó en la vida real. Del 4 al 11, un mes por caso del cierre.
const FECHAS_LIMITE = { 1: '2011-02-10', 2: HOY, 3: '2012-01-15' };
for (let mes = 4; mes <= 11; mes += 1) FECHAS_LIMITE[mes] = FUTURA;
const VACUNA = 'ZVT_HU31C';
const periodoIds = {};
let vacunaId;
let municipioPropio;
let otros;
let personal;
let estadigrafa;

const esquema = () => ({
  _id: new ObjectId(),
  vacuna: { id: new Int32(vacunaId), codigo: VACUNA, nombre: `vitest-hu31 ${VACUNA}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO}-01-01T00:00:00.000Z`), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  reglas: [],
  presentacion: { filas: 'dosis', columnas: ['seccion'] },
  auditoria: {
    creado_por: new Int32(1),
    creado_en: new Date(),
    publicado_por: new Int32(1),
    publicado_en: new Date(),
    motivo_cambio: 'vitest-hu31',
  },
  incluir_por_defecto: true,
  dimensiones: {
    dosis: [{ codigo: 'UNICA', etiqueta: 'Dosis única' }],
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
    desagregacion: [],
  },
  secciones: [{ codigo: 'UNICA', titulo: 'Única', orden: new Int32(1), grupo_edad: null, dosis: ['UNICA'] }],
  campos_adicionales: [],
});

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  // Ni las observaciones, ni los resultados, ni el historial caen en cascada con el reporte.
  await pool.query(`DELETE FROM observacion_revision WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM resultado_validacion WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': VACUNA });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
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
    if (FECHAS_LIMITE[mes]) {
      await pool.query(
        "INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, ?, 'ABIERTO')",
        [periodo.insertId, FECHAS_LIMITE[mes]],
      );
    }
  }
  const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, ?, TRUE)', [
    VACUNA,
    `vitest-hu31 ${VACUNA}`,
  ]);
  vacunaId = vacuna.insertId;
  await pool.query("INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, 'UNICA', 'Dosis única', 1, TRUE)", [
    vacunaId,
  ]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertOne(esquema());
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

const api = (metodo, ruta, credencial = personal) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial.token}`);
const error = (res) => [res.status, res.body.error?.codigo];
const cerrar = (mes, credencial = estadigrafa) => api('post', `/periodos/${periodoIds[mes]}/cerrar`, credencial);

// Cada llamada que sube versionFila la deja en reporte.versionFila.
async function paso(reporte, prueba, estado = 200) {
  const res = await prueba;
  expect(res.status, JSON.stringify(res.body)).toBe(estado);
  if (res.body.versionFila) reporte.versionFila = res.body.versionFila;
  return res;
}
const transicion = (reporte, cuerpo, credencial = personal) =>
  api('post', `/reportes/${reporte.id}/transiciones`, credencial).send({ versionFila: reporte.versionFila, ...cuerpo });
const guardar = (reporte, cantidad) =>
  api('put', `/reportes/${reporte.id}/vacunas/${vacunaId}`).send({
    versionFila: reporte.versionFila,
    celdas: [{ dosisCodigo: 'UNICA', municipioProcedenciaId: municipioPropio, dimensiones: {}, cantidad }],
  });

// Un reporte de CS-1201 en el mes, llevado por la API hasta BORRADOR (guardado) o APROBADO.
async function reporteDe(mes, hasta) {
  const creado = await api('post', '/reportes').send({ periodoId: periodoIds[mes] });
  expect(creado.status, JSON.stringify(creado.body)).toBe(201);
  const reporte = { id: creado.body.id, versionFila: creado.body.versionFila };
  await paso(reporte, guardar(reporte, 5));
  if (hasta === 'APROBADO') {
    await paso(reporte, transicion(reporte, { estadoDestino: 'ENVIADO' }));
    await paso(reporte, transicion(reporte, { estadoDestino: 'EN_REVISION', revisorId: estadigrafa.id }, estadigrafa));
    await paso(reporte, transicion(reporte, { estadoDestino: 'APROBADO' }, estadigrafa));
  }
  return reporte;
}

// Un reporte de otro establecimiento de la DDRISS, directo en el estado del caso.
async function reporteSql(mes, indice, estado) {
  const [res] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en)
     VALUES (?, ?, ?, 1, ${estado === 'BORRADOR' ? 'NULL' : 'NOW()'})`,
    [otros[indice], periodoIds[mes], estado],
  );
  return res.insertId;
}

const enCierre = (mes) =>
  pool.query("UPDATE cierre_periodo SET estado = 'EN_CIERRE' WHERE periodo_id = ? AND ddriss_id = 1", [periodoIds[mes]]);

async function enBase(reporteId) {
  const [[fila]] = await pool.query(
    'SELECT estado, version_fila, UNIX_TIMESTAMP(cerrado_en) AS cerrado FROM reporte_produccion WHERE id = ?',
    [reporteId],
  );
  return fila;
}

async function cierreDe(mes) {
  const [[fila]] = await pool.query(
    `SELECT id, estado, cerrado_por, UNIX_TIMESTAMP(cerrado_en) AS cerrado
       FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = 1`,
    [periodoIds[mes]],
  );
  return fila;
}

async function bitacoraDe(cierreId) {
  const [filas] = await pool.query(
    `SELECT usuario_id, modulo, accion, valores_anteriores AS anteriores, valores_nuevos AS nuevos
       FROM bitacora WHERE entidad = 'cierre_periodo' AND entidad_id = ? ORDER BY id`,
    [String(cierreId)],
  );
  return filas;
}

describe('cierre del periodo (HU-31)', () => {
  beforeAll(async () => {
    await limpiar();
    await preparar();
    personal = await tokenDe('cs1201');
    estadigrafa = await tokenDe('estadigrafa');
    const [[establecimiento]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
    municipioPropio = establecimiento.municipio_id;
    const [filas] = await pool.query(
      "SELECT id FROM establecimiento WHERE ddriss_id = 1 AND codigo <> 'CS-1201' AND activo = TRUE ORDER BY id LIMIT 3",
    );
    otros = filas.map((f) => f.id);
  }, 120000);

  afterAll(limpiar, 60000);

  describe('defensa al crear', () => {
    it('un mes ABIERTO con la fecha límite vencida no admite reportes nuevos', async () => {
      const res = await api('post', '/reportes').send({ periodoId: periodoIds[3] });
      expect(error(res)).toEqual([409, 'PERIODO_NO_ABIERTO']);
      expect((await cierreDe(3)).estado).toBe('ABIERTO');
      const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM reporte_produccion WHERE periodo_id = ?', [
        periodoIds[3],
      ]);
      expect(total).toBe(0);
    });
  });

  describe('paso automático a EN_CIERRE', () => {
    it('pasa el mes vencido, deja su bitácora sin usuario y no toca el que vence hoy', async () => {
      const vencido = await cierreDe(1);
      const deHoy = await cierreDe(2);
      expect(await pasarMesesVencidos(HOY)).toBe(1);

      expect((await cierreDe(1)).estado).toBe('EN_CIERRE');
      expect((await cierreDe(2)).estado).toBe('ABIERTO');
      expect(await bitacoraDe(vencido.id)).toEqual([
        {
          usuario_id: null,
          modulo: 'CONFIGURACION',
          accion: 'ACTUALIZAR',
          anteriores: { estado: 'ABIERTO' },
          nuevos: { estado: 'EN_CIERRE' },
        },
      ]);
      expect(await bitacoraDe(deHoy.id)).toEqual([]);
    });

    it('correrla otra vez no cambia nada ni repite la bitácora', async () => {
      const vencido = await cierreDe(1);
      expect(await pasarMesesVencidos(HOY)).toBe(0);
      expect(await bitacoraDe(vencido.id)).toHaveLength(1);
    });
  });

  describe('cierre final', () => {
    let aprobado;
    let borradorAjeno;
    let antes;
    let res;

    beforeAll(async () => {
      aprobado = await reporteDe(4, 'APROBADO');
      borradorAjeno = await reporteSql(4, 0, 'BORRADOR');
      await enCierre(4);
      antes = await enBase(aprobado.id);
      res = await cerrar(4);
    }, 120000);

    it('cierra el mes y pasa el aprobado a CERRADO; el borrador nunca enviado no lo impide y sigue igual', async () => {
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ id: periodoIds[4], estado: 'CERRADO', reportesCerrados: 1 });
      expect(res.body.cerradoEn).not.toBeNull();

      const cierre = await cierreDe(4);
      expect(cierre).toMatchObject({ estado: 'CERRADO', cerrado_por: estadigrafa.id });
      expect(cierre.cerrado).not.toBeNull();
      const despues = await enBase(aprobado.id);
      expect(despues).toMatchObject({ estado: 'CERRADO', version_fila: antes.version_fila + 1 });
      expect(despues.cerrado).not.toBeNull();
      expect((await enBase(borradorAjeno)).estado).toBe('BORRADOR');
    });

    it('deja el historial y la CAMBIO_ESTADO del reporte y la ACTUALIZAR del mes', async () => {
      const [historial] = await pool.query(
        `SELECT estado_anterior, estado_nuevo, usuario_id, comentario FROM historial_estado_reporte
          WHERE reporte_id = ? ORDER BY id DESC LIMIT 1`,
        [aprobado.id],
      );
      expect(historial).toEqual([
        { estado_anterior: 'APROBADO', estado_nuevo: 'CERRADO', usuario_id: estadigrafa.id, comentario: 'Cierre del periodo.' },
      ]);
      const cierre = await cierreDe(4);
      const [cambios] = await pool.query(
        `SELECT usuario_id, modulo, valores_anteriores, valores_nuevos FROM bitacora
          WHERE accion = 'CAMBIO_ESTADO' AND entidad = 'reporte_produccion' AND entidad_id = ? ORDER BY id DESC LIMIT 1`,
        [String(aprobado.id)],
      );
      expect(cambios).toEqual([
        {
          usuario_id: estadigrafa.id,
          modulo: 'REVISION',
          valores_anteriores: { estado: 'APROBADO' },
          valores_nuevos: { estado: 'CERRADO', cierrePeriodoId: cierre.id },
        },
      ]);
      expect(await bitacoraDe(cierre.id)).toEqual([
        {
          usuario_id: estadigrafa.id,
          modulo: 'REVISION',
          accion: 'ACTUALIZAR',
          anteriores: { estado: 'EN_CIERRE' },
          nuevos: { estado: 'CERRADO', reportesCerrados: 1 },
        },
      ]);
    });

    it('ya cerrado, el reporte no se edita ni se valida y el mes no se vuelve a cerrar', async () => {
      const respuestas = await Promise.all([guardar(aprobado, 7), api('post', `/reportes/${aprobado.id}/validar`)]);
      expect(respuestas.map(error)).toEqual(Array(2).fill([409, 'REPORTE_NO_EDITABLE']));
      expect(error(await cerrar(4))).toEqual([409, 'PERIODO_YA_CERRADO']);
    });

    it('un mes sin aprobados también se cierra, y su borrador nunca enviado ya no se guarda', async () => {
      const borrador = await reporteDe(5, 'BORRADOR');
      await enCierre(5);
      const cerrado = await cerrar(5);
      expect(cerrado.status, JSON.stringify(cerrado.body)).toBe(200);
      expect(cerrado.body.reportesCerrados).toBe(0);
      expect((await enBase(borrador.id)).estado).toBe('BORRADOR');
      expect(error(await guardar(borrador, 7))).toEqual([409, 'PERIODO_CERRADO']);
    }, 60000);
  });

  describe('reportes en el ciclo', () => {
    let reporteId;

    beforeAll(async () => {
      reporteId = await reporteSql(6, 0, 'ENVIADO');
      await reporteSql(6, 1, 'APROBADO');
      await enCierre(6);
    });

    // El BORRADOR conserva enviado_en: es uno devuelto en corrección.
    it.each(['ENVIADO', 'EN_REVISION', 'CORRECCION_SOLICITADA', 'BORRADOR'])(
      'un reporte %s ya enviado impide el cierre con 409 y faltanPorAprobar',
      async (estado) => {
        await pool.query('UPDATE reporte_produccion SET estado = ? WHERE id = ?', [estado, reporteId]);
        const res = await cerrar(6);
        expect(error(res)).toEqual([409, 'PERIODO_CON_PENDIENTES']);
        expect(res.body).toMatchObject({ faltanPorAprobar: 1, error: { mensaje: 'Falta 1 reporte por aprobar.' } });
        expect((await cierreDe(6)).estado).toBe('EN_CIERRE');
        const [aprobados] = await pool.query(
          "SELECT id FROM reporte_produccion WHERE periodo_id = ? AND estado = 'APROBADO'",
          [periodoIds[6]],
        );
        expect(aprobados).toHaveLength(1);
      },
    );

    it('la bandeja trae el resumen del cierre, igual con y sin filtro de municipio', async () => {
      await reporteSql(6, 2, 'EN_REVISION');
      const todos = await api('get', `/revision/bandeja?periodoId=${periodoIds[6]}`, estadigrafa);
      expect(todos.status, JSON.stringify(todos.body)).toBe(200);
      expect(todos.body.cierre).toEqual({
        estado: 'EN_CIERRE',
        fechaLimiteEnvio: FUTURA,
        establecimientos: todos.body.conteos.TODOS,
        aprobados: 1,
        cerrados: 0,
        faltanPorAprobar: 2,
      });
      const filtrada = await api(
        'get',
        `/revision/bandeja?periodoId=${periodoIds[6]}&municipioId=${municipioPropio}&grupo=APROBADO`,
        estadigrafa,
      );
      expect(filtrada.body.cierre).toEqual(todos.body.cierre);
      const res = await cerrar(6);
      expect(res.body).toMatchObject({ faltanPorAprobar: 2, error: { mensaje: 'Faltan 2 reportes por aprobar.' } });
    });
  });

  describe('errores', () => {
    it('un mes ABIERTO responde 409 PERIODO_NO_EN_CIERRE', async () => {
      expect(error(await cerrar(7))).toEqual([409, 'PERIODO_NO_EN_CIERRE']);
      expect((await cierreDe(7)).estado).toBe('ABIERTO');
    });

    it('un mes sin cierre_periodo de la DDRISS responde 404', async () => {
      expect(error(await cerrar(12))).toEqual([404, 'NO_ENCONTRADO']);
    });

    it('el Personal responde 403, y un cuerpo con campos o un id inválido 400', async () => {
      await enCierre(8);
      expect(error(await cerrar(8, personal))).toEqual([403, 'SIN_PERMISO']);
      expect(error(await cerrar(8).send({ comentario: 'x' }))).toEqual([400, 'ENTRADA_INVALIDA']);
      expect(error(await api('post', '/periodos/abc/cerrar', estadigrafa))).toEqual([400, 'ENTRADA_INVALIDA']);
      expect((await cierreDe(8)).estado).toBe('EN_CIERRE');
    });
  });

  describe('un envío y un cierre a la vez', () => {
    it('terminan en un estado coherente', async () => {
      const reporte = await reporteDe(9, 'BORRADOR');
      await enCierre(9);
      const [envio, cierre] = await Promise.all([transicion(reporte, { estadoDestino: 'ENVIADO' }), cerrar(9)]);
      const estadoReporte = (await enBase(reporte.id)).estado;
      const estadoMes = (await cierreDe(9)).estado;
      if (envio.status === 200) {
        expect(error(cierre)).toEqual([409, 'PERIODO_CON_PENDIENTES']);
        expect([estadoReporte, estadoMes]).toEqual(['ENVIADO', 'EN_CIERRE']);
      } else {
        expect(cierre.status, JSON.stringify(cierre.body)).toBe(200);
        expect(error(envio)).toEqual([409, 'PERIODO_CERRADO']);
        expect([estadoReporte, estadoMes]).toEqual(['BORRADOR', 'CERRADO']);
      }
    }, 60000);
  });
});
