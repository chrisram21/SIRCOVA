import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2012 (abiertos en la DDRISS 1) y dos vacunas de dosis única con esquema nacional desde
// enero de 2012: ZVT_HU30 entra en el reporte nuevo y ZVT_HU30B se agrega. Una regla RANGO de DDRISS_SM
// (ADVERTENCIA, hasta 30 dosis) aplica solo a ZVT_HU30, así que cada reporte llega a revisión con una advertencia
// abierta. Cada reporte, de un mes propio de CS-1201, lo llevan por la API hasta EN_REVISION: cs1201 lo crea, lo
// guarda y lo envía, y la estadígrafa se lo asigna. Todo se borra al inicio y al final; las filas de la bitácora quedan.
const ANIO = 2012;
const VACUNAS = ['ZVT_HU30', 'ZVT_HU30B'];
const INCLUIDA = 'ZVT_HU30';
const REGLA = 'ZVT_HU30_AVISO';
const periodoIds = {};
const vacunaIds = {};
let municipioPropio;
let personal;
let estadigrafa;
let revisor2;
let ultimoMes = 0;

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: new Int32(1),
  publicado_en: new Date(),
  motivo_cambio: 'vitest-hu30',
});

const esquema = (codigo) => ({
  _id: new ObjectId(),
  vacuna: { id: new Int32(vacunaIds[codigo]), codigo, nombre: `vitest-hu30 ${codigo}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO}-01-01T00:00:00.000Z`), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  reglas: [],
  presentacion: { filas: 'dosis', columnas: ['seccion'] },
  auditoria: auditoria(),
  incluir_por_defecto: codigo === INCLUIDA,
  dimensiones: {
    dosis: [{ codigo: 'UNICA', etiqueta: 'Dosis única' }],
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
    desagregacion: [],
  },
  secciones: [{ codigo: 'UNICA', titulo: 'Única', orden: new Int32(1), grupo_edad: null, dosis: ['UNICA'] }],
  campos_adicionales: [],
});

const regla = () => ({
  _id: new ObjectId(),
  codigo: REGLA,
  version: new Int32(1),
  nombre: `vitest-hu30 ${REGLA}`,
  tipo: 'RANGO',
  ambito: 'DETALLE',
  severidad: 'ADVERTENCIA',
  aplica_a: { vacunas: [INCLUIDA] },
  parametros: { minimo: 0, maximo: 30 },
  mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango ({minimo} a {maximo}).',
  territorio: { nivel: 'DDRISS', ddriss_codigo: 'DDRISS_SM' },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO}-01-01T00:00:00.000Z`), hasta: null },
  auditoria: auditoria(),
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
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: VACUNAS } });
  await db.collection('reglas_validacion').deleteMany({ codigo: /^ZVT_HU30/ });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [VACUNAS]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS]);
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
      [periodo.insertId, `${ANIO + 1}-01-10`],
    );
  }
  for (const [i, codigo] of VACUNAS.entries()) {
    const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, ?, ?, TRUE)', [
      codigo,
      `vitest-hu30 ${codigo}`,
      i + 1,
    ]);
    vacunaIds[codigo] = vacuna.insertId;
    await pool.query("INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, 'UNICA', 'Dosis única', 1, TRUE)", [
      vacuna.insertId,
    ]);
  }
  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertMany(VACUNAS.map(esquema));
  await db.collection('reglas_validacion').insertOne(regla());
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
  api('put', `/reportes/${reporte.id}/vacunas/${vacunaIds[INCLUIDA]}`).send({
    versionFila: reporte.versionFila,
    celdas: [{ dosisCodigo: 'UNICA', municipioProcedenciaId: municipioPropio, dimensiones: {}, cantidad }],
  });
const aprobar = (reporte, cuerpo = {}, credencial = estadigrafa) =>
  transicion(reporte, { estadoDestino: 'APROBADO', ...cuerpo }, credencial);

// Un reporte nuevo de CS-1201 en el mes siguiente, llevado por la API hasta ENVIADO o EN_REVISION.
async function reporteDe(hasta = 'EN_REVISION') {
  ultimoMes += 1;
  const creado = await api('post', '/reportes').send({ periodoId: periodoIds[ultimoMes] });
  expect(creado.status, JSON.stringify(creado.body)).toBe(201);
  const reporte = { id: creado.body.id, versionFila: creado.body.versionFila };
  await paso(reporte, guardar(reporte, 50));
  await paso(reporte, transicion(reporte, { estadoDestino: 'ENVIADO' }));
  if (hasta === 'EN_REVISION') {
    await paso(reporte, transicion(reporte, { estadoDestino: 'EN_REVISION', revisorId: estadigrafa.id }, estadigrafa));
  }
  return reporte;
}

const enBase = async (reporteId) => {
  const [[fila]] = await pool.query(
    `SELECT estado, version_fila, revisor_id, aprobado_por, UNIX_TIMESTAMP(aprobado_en) AS aprobado,
            UNIX_TIMESTAMP(asignado_en) AS asignado
       FROM reporte_produccion WHERE id = ?`,
    [reporteId],
  );
  return fila;
};
const historial = async (reporteId) => {
  const [filas] = await pool.query(
    'SELECT estado_anterior, estado_nuevo, usuario_id, comentario FROM historial_estado_reporte WHERE reporte_id = ? ORDER BY id',
    [reporteId],
  );
  return filas;
};
const cambiosDeEstado = async (reporteId) => {
  const [filas] = await pool.query(
    "SELECT usuario_id, valores_anteriores, valores_nuevos FROM bitacora WHERE accion = 'CAMBIO_ESTADO' AND entidad = 'reporte_produccion' AND entidad_id = ? ORDER BY id",
    [String(reporteId)],
  );
  return filas;
};
const advertenciasAbiertas = async (reporteId) => {
  const [[{ total }]] = await pool.query(
    "SELECT COUNT(*) AS total FROM resultado_validacion WHERE reporte_id = ? AND severidad = 'ADVERTENCIA' AND estado = 'ABIERTO'",
    [reporteId],
  );
  return Number(total);
};

describe('aprobar un reporte (SPEC 38)', () => {
  beforeAll(async () => {
    await limpiar();
    await preparar();
    personal = await tokenDe('cs1201');
    estadigrafa = await tokenDe('estadigrafa');
    revisor2 = await tokenDe('revisor2');
    const [[establecimiento]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
    municipioPropio = establecimiento.municipio_id;
  }, 120000);

  afterAll(limpiar, 60000);

  describe('el revisor asignado aprueba con comentario', () => {
    let reporte;
    let antes;

    beforeAll(async () => {
      reporte = await reporteDe();
      antes = await enBase(reporte.id);
    }, 120000);

    it('queda APROBADO con aprobado_por, aprobado_en, su historial y su CAMBIO_ESTADO con las advertencias', async () => {
      const advertencias = await advertenciasAbiertas(reporte.id);
      expect(advertencias).toBeGreaterThan(0);

      const res = await aprobar(reporte, { comentario: '  vitest-hu30 Cifras coherentes.  ' });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ id: reporte.id, estado: 'APROBADO', versionFila: reporte.versionFila + 1 });
      const fila = await enBase(reporte.id);
      expect(fila).toMatchObject({
        estado: 'APROBADO',
        version_fila: reporte.versionFila + 1,
        revisor_id: estadigrafa.id,
        aprobado_por: estadigrafa.id,
        asignado: antes.asignado,
      });
      expect(fila.aprobado).not.toBeNull();
      expect((await historial(reporte.id)).at(-1)).toEqual({
        estado_anterior: 'EN_REVISION',
        estado_nuevo: 'APROBADO',
        usuario_id: estadigrafa.id,
        comentario: 'vitest-hu30 Cifras coherentes.',
      });
      expect((await cambiosDeEstado(reporte.id)).at(-1)).toEqual({
        usuario_id: estadigrafa.id,
        valores_anteriores: { estado: 'EN_REVISION' },
        valores_nuevos: { estado: 'APROBADO', advertencias },
      });
      reporte.versionFila = res.body.versionFila;
    });

    it('aprobado, guardar, agregar o quitar una vacuna y validar responden 409 REPORTE_NO_EDITABLE', async () => {
      const respuestas = await Promise.all([
        guardar(reporte, 20),
        api('post', `/reportes/${reporte.id}/vacunas`).send({ vacunaId: vacunaIds.ZVT_HU30B, versionFila: reporte.versionFila }),
        api('delete', `/reportes/${reporte.id}/vacunas/${vacunaIds[INCLUIDA]}?versionFila=${reporte.versionFila}`),
        api('post', `/reportes/${reporte.id}/validar`),
      ]);

      expect(respuestas.map(error)).toEqual(Array(4).fill([409, 'REPORTE_NO_EDITABLE']));
    });

    it('aprobado, volver a aprobar o devolver responde 422 TRANSICION_NO_PERMITIDA', async () => {
      expect(error(await aprobar(reporte))).toEqual([422, 'TRANSICION_NO_PERMITIDA']);
      const devolver = await transicion(
        reporte,
        { estadoDestino: 'CORRECCION_SOLICITADA', observaciones: [{ vacunaId: null, texto: 'x' }] },
        estadigrafa,
      );
      expect(error(devolver)).toEqual([422, 'TRANSICION_NO_PERMITIDA']);
    });
  });

  it('sin comentario, el historial queda con comentario NULL', async () => {
    const reporte = await reporteDe();

    await paso(reporte, aprobar(reporte));

    expect((await historial(reporte.id)).at(-1)).toMatchObject({ estado_nuevo: 'APROBADO', comentario: null });
  }, 120000);

  describe('lo que se rechaza', () => {
    let reporte;

    beforeAll(async () => {
      reporte = await reporteDe();
    }, 120000);

    // Un rechazo no deja historial ni CAMBIO_ESTADO, y el reporte sigue igual y sin aprobador.
    async function sinCambios(prueba) {
      const [estado, filas, cambios] = await Promise.all([enBase(reporte.id), historial(reporte.id), cambiosDeEstado(reporte.id)]);
      await prueba();
      const despues = await enBase(reporte.id);
      expect(despues).toEqual(estado);
      expect(despues.aprobado_por).toBeNull();
      expect(await historial(reporte.id)).toHaveLength(filas.length);
      expect(await cambiosDeEstado(reporte.id)).toHaveLength(cambios.length);
    }

    it('otro revisor recibe 403 NO_ES_REVISOR_ASIGNADO sin ACCESO_DENEGADO', () =>
      sinCambios(async () => {
        const denegados = async () => {
          const [[{ total }]] = await pool.query(
            "SELECT COUNT(*) AS total FROM bitacora WHERE accion = 'ACCESO_DENEGADO' AND usuario_id = ?",
            [revisor2.id],
          );
          return Number(total);
        };
        const previos = await denegados();
        const res = await aprobar(reporte, {}, revisor2);
        expect(error(res)).toEqual([403, 'NO_ES_REVISOR_ASIGNADO']);
        expect(res.body.error.mensaje).toBe('Solo el revisor asignado puede hacer esto con el reporte.');
        expect(await denegados()).toBe(previos);
      }));

    it('el Personal recibe 403 SIN_PERMISO', () =>
      sinCambios(async () => {
        expect(error(await aprobar(reporte, {}, personal))).toEqual([403, 'SIN_PERMISO']);
      }));

    it('con una versionFila vieja responde 409 REPORTE_DESACTUALIZADO', () =>
      sinCambios(async () => {
        const res = await aprobar({ ...reporte, versionFila: reporte.versionFila - 1 });
        expect(error(res)).toEqual([409, 'REPORTE_DESACTUALIZADO']);
      }));

    it('con observaciones o revisorId en el cuerpo responde 400', () =>
      sinCambios(async () => {
        expect(error(await aprobar(reporte, { observaciones: [] }))).toEqual([400, 'ENTRADA_INVALIDA']);
        expect(error(await aprobar(reporte, { revisorId: estadigrafa.id }))).toEqual([400, 'ENTRADA_INVALIDA']);
      }));

    it('un reporte ENVIADO responde 422 TRANSICION_NO_PERMITIDA', async () => {
      const enviado = await reporteDe('ENVIADO');

      expect(error(await aprobar(enviado))).toEqual([422, 'TRANSICION_NO_PERMITIDA']);
      expect(await enBase(enviado.id)).toMatchObject({ estado: 'ENVIADO', aprobado_por: null });
    }, 120000);
  });
});
