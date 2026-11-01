import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2013 (abiertos en la DDRISS 1) y tres vacunas de dosis única con esquema nacional desde
// enero de 2013: ZVT_HU29A entra en el reporte nuevo, ZVT_HU29B y ZVT_HU29C se agregan. Una regla RANGO de DDRISS_SM
// (ERROR, hasta 100 dosis) aplica solo a ZVT_HU29A. Cada reporte, de un mes propio de CS-1201, lo llevan por la API
// hasta CORRECCION_SOLICITADA: cs1201 lo crea, agrega ZVT_HU29B y lo envía, y la estadígrafa se lo asigna y lo devuelve
// con una observación general y una de ZVT_HU29B. Todo se borra al inicio y al final; las filas de la bitácora quedan.
const ANIO = 2013;
const VACUNAS = ['ZVT_HU29A', 'ZVT_HU29B', 'ZVT_HU29C'];
const INCLUIDA = 'ZVT_HU29A';
const REGLA = 'ZVT_HU29_RANGO';
const periodoIds = {};
const vacunaIds = {};
let municipioPropio;
let personal;
let estadigrafa;
let ultimoMes = 0;

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: new Int32(1),
  publicado_en: new Date(),
  motivo_cambio: 'vitest-hu29',
});

const esquema = (codigo) => ({
  _id: new ObjectId(),
  vacuna: { id: new Int32(vacunaIds[codigo]), codigo, nombre: `vitest-hu29 ${codigo}` },
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
  nombre: `vitest-hu29 ${REGLA}`,
  tipo: 'RANGO',
  ambito: 'DETALLE',
  severidad: 'ERROR',
  aplica_a: { vacunas: [INCLUIDA] },
  parametros: { minimo: 0, maximo: 100 },
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
  await db.collection('reglas_validacion').deleteMany({ codigo: /^ZVT_HU29/ });
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
      `vitest-hu29 ${codigo}`,
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
const guardar = (reporte, codigo, cantidad) =>
  api('put', `/reportes/${reporte.id}/vacunas/${vacunaIds[codigo]}`).send({
    versionFila: reporte.versionFila,
    celdas: [{ dosisCodigo: 'UNICA', municipioProcedenciaId: municipioPropio, dimensiones: {}, cantidad }],
  });
const agregar = (reporte, codigo) =>
  api('post', `/reportes/${reporte.id}/vacunas`).send({ vacunaId: vacunaIds[codigo], versionFila: reporte.versionFila });
const quitar = (reporte, codigo) =>
  api('delete', `/reportes/${reporte.id}/vacunas/${vacunaIds[codigo]}?versionFila=${reporte.versionFila}`);
const corregir = (reporte, credencial) => transicion(reporte, { estadoDestino: 'BORRADOR' }, credencial);
const devolver = (reporte, observaciones) =>
  transicion(reporte, { estadoDestino: 'CORRECCION_SOLICITADA', observaciones }, estadigrafa);

const OBSERVACIONES = () => [
  { vacunaId: null, texto: 'vitest-hu29 Revise las cantidades del mes.' },
  { vacunaId: vacunaIds.ZVT_HU29B, texto: 'vitest-hu29 ZVT_HU29B parece alta.' },
];

// Un reporte nuevo de CS-1201 en el mes siguiente, llevado por la API hasta CORRECCION_SOLICITADA.
async function reporteDevuelto() {
  ultimoMes += 1;
  const creado = await api('post', '/reportes').send({ periodoId: periodoIds[ultimoMes] });
  expect(creado.status, JSON.stringify(creado.body)).toBe(201);
  const reporte = { id: creado.body.id, versionFila: creado.body.versionFila, mes: ultimoMes };
  await paso(reporte, agregar(reporte, 'ZVT_HU29B'), 201);
  await paso(reporte, guardar(reporte, 'ZVT_HU29A', 40));
  await paso(reporte, guardar(reporte, 'ZVT_HU29B', 60));
  await paso(reporte, transicion(reporte, { estadoDestino: 'ENVIADO' }));
  await paso(reporte, transicion(reporte, { estadoDestino: 'EN_REVISION', revisorId: estadigrafa.id }, estadigrafa));
  await paso(reporte, devolver(reporte, OBSERVACIONES()));
  return reporte;
}

const enBase = async (reporteId) => {
  const [[fila]] = await pool.query(
    'SELECT estado, version_fila, revisor_id, UNIX_TIMESTAMP(asignado_en) AS asignado FROM reporte_produccion WHERE id = ?',
    [reporteId],
  );
  return fila;
};
const historial = async (reporteId) => {
  const [filas] = await pool.query(
    'SELECT estado_anterior, estado_nuevo, usuario_id FROM historial_estado_reporte WHERE reporte_id = ? ORDER BY id',
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

describe('corregir un reporte devuelto (SPEC 37)', () => {
  beforeAll(async () => {
    await limpiar();
    await preparar();
    personal = await tokenDe('cs1201');
    estadigrafa = await tokenDe('estadigrafa');
    const [[establecimiento]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
    municipioPropio = establecimiento.municipio_id;
  }, 120000);

  afterAll(limpiar, 60000);

  describe('el Personal corrige', () => {
    let reporte;
    let antes;

    beforeAll(async () => {
      reporte = await reporteDevuelto();
      antes = await enBase(reporte.id);
    }, 120000);

    it('pasa a BORRADOR con su historial y su CAMBIO_ESTADO, y el revisor no cambia', async () => {
      const res = await corregir(reporte);

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body).toMatchObject({ id: reporte.id, estado: 'BORRADOR', versionFila: reporte.versionFila + 1 });
      expect(await enBase(reporte.id)).toEqual({
        estado: 'BORRADOR',
        version_fila: reporte.versionFila + 1,
        revisor_id: estadigrafa.id,
        asignado: antes.asignado,
      });
      expect((await historial(reporte.id)).at(-1)).toEqual({
        estado_anterior: 'CORRECCION_SOLICITADA',
        estado_nuevo: 'BORRADOR',
        usuario_id: personal.id,
      });
      expect((await cambiosDeEstado(reporte.id)).at(-1)).toEqual({
        usuario_id: personal.id,
        valores_anteriores: { estado: 'CORRECCION_SOLICITADA' },
        valores_nuevos: { estado: 'BORRADOR' },
      });
      reporte.versionFila = res.body.versionFila;
    });

    it('después se guarda, se agrega y se quita una vacuna, pero no la que tiene observaciones', async () => {
      await paso(reporte, guardar(reporte, 'ZVT_HU29A', 45));
      await paso(reporte, agregar(reporte, 'ZVT_HU29C'), 201);
      await paso(reporte, quitar(reporte, 'ZVT_HU29C'));

      expect(error(await quitar(reporte, 'ZVT_HU29B'))).toEqual([409, 'VACUNA_CON_OBSERVACIONES']);
    });

    it('un reporte que ya está en BORRADOR responde 422 TRANSICION_NO_PERMITIDA', async () => {
      expect(error(await corregir(reporte))).toEqual([422, 'TRANSICION_NO_PERMITIDA']);
    });
  });

  describe('lo que se rechaza', () => {
    let reporte;

    beforeAll(async () => {
      reporte = await reporteDevuelto();
    }, 120000);

    // Un rechazo no deja historial ni CAMBIO_ESTADO, y el reporte sigue igual.
    async function sinCambios(prueba) {
      const [estado, filas, cambios] = await Promise.all([enBase(reporte.id), historial(reporte.id), cambiosDeEstado(reporte.id)]);
      await prueba();
      expect(await enBase(reporte.id)).toEqual(estado);
      expect(await historial(reporte.id)).toHaveLength(filas.length);
      expect(await cambiosDeEstado(reporte.id)).toHaveLength(cambios.length);
    }

    it('el Revisor recibe 403 SIN_PERMISO', () =>
      sinCambios(async () => {
        expect(error(await corregir(reporte, estadigrafa))).toEqual([403, 'SIN_PERMISO']);
      }));

    it('con una versionFila vieja responde 409 REPORTE_DESACTUALIZADO', () =>
      sinCambios(async () => {
        const res = await transicion({ ...reporte, versionFila: reporte.versionFila - 1 }, { estadoDestino: 'BORRADOR' });
        expect(error(res)).toEqual([409, 'REPORTE_DESACTUALIZADO']);
      }));

    it('con observaciones en el cuerpo responde 400', () =>
      sinCambios(async () => {
        const res = await transicion(reporte, { estadoDestino: 'BORRADOR', observaciones: [] });
        expect(error(res)).toEqual([400, 'ENTRADA_INVALIDA']);
      }));

    it('con el mes CERRADO responde 409 PERIODO_CERRADO', () =>
      sinCambios(async () => {
        await pool.query(
          "UPDATE cierre_periodo SET estado = 'CERRADO', cerrado_por = 2, cerrado_en = ? WHERE periodo_id = ? AND ddriss_id = 1",
          [`${ANIO}-12-20 16:00:00`, periodoIds[reporte.mes]],
        );
        try {
          expect(error(await corregir(reporte))).toEqual([409, 'PERIODO_CERRADO']);
        } finally {
          await pool.query(
            "UPDATE cierre_periodo SET estado = 'ABIERTO', cerrado_por = NULL, cerrado_en = NULL WHERE periodo_id = ? AND ddriss_id = 1",
            [periodoIds[reporte.mes]],
          );
        }
      }));

    it('un reporte ENVIADO responde 422 TRANSICION_NO_PERMITIDA', async () => {
      ultimoMes += 1;
      const creado = await api('post', '/reportes').send({ periodoId: periodoIds[ultimoMes] });
      const enviado = { id: creado.body.id, versionFila: creado.body.versionFila };
      await paso(enviado, guardar(enviado, 'ZVT_HU29A', 10));
      await paso(enviado, transicion(enviado, { estadoDestino: 'ENVIADO' }));

      expect(error(await corregir(enviado))).toEqual([422, 'TRANSICION_NO_PERMITIDA']);
      expect((await enBase(enviado.id)).estado).toBe('ENVIADO');
    }, 60000);
  });

  describe('reenviar el reporte corregido', () => {
    let reporte;

    beforeAll(async () => {
      reporte = await reporteDevuelto();
      await paso(reporte, corregir(reporte));
      await paso(reporte, guardar(reporte, 'ZVT_HU29B', 55));
    }, 120000);

    it('sin errores queda ENVIADO con el mismo revisor y las observaciones atendidas', async () => {
      const res = await transicion(reporte, { estadoDestino: 'ENVIADO' });

      expect(res.status, JSON.stringify(res.body)).toBe(200);
      expect(res.body.estado).toBe('ENVIADO');
      reporte.versionFila = res.body.versionFila;
      expect((await enBase(reporte.id)).revisor_id).toBe(estadigrafa.id);
      const observaciones = await api('get', `/reportes/${reporte.id}/observaciones`);
      expect(observaciones.body).toHaveLength(2);
      for (const observacion of observaciones.body) {
        expect(observacion.atendida).toBe(true);
        expect(Math.abs(Date.parse(observacion.atendidaEn) - Date.now())).toBeLessThan(5 * 60 * 1000);
      }
      expect((await cambiosDeEstado(reporte.id)).at(-1)).toMatchObject({
        usuario_id: personal.id,
        valores_anteriores: { estado: 'BORRADOR' },
        valores_nuevos: { estado: 'ENVIADO', errores: 0, observacionesAtendidas: 2 },
      });
    });

    it('el historial tiene, en orden, la creación, cada envío, la asignación, la devolución y la corrección', async () => {
      expect(await historial(reporte.id)).toEqual([
        { estado_anterior: null, estado_nuevo: 'BORRADOR', usuario_id: personal.id },
        { estado_anterior: 'BORRADOR', estado_nuevo: 'ENVIADO', usuario_id: personal.id },
        { estado_anterior: 'ENVIADO', estado_nuevo: 'EN_REVISION', usuario_id: estadigrafa.id },
        { estado_anterior: 'EN_REVISION', estado_nuevo: 'CORRECCION_SOLICITADA', usuario_id: estadigrafa.id },
        { estado_anterior: 'CORRECCION_SOLICITADA', estado_nuevo: 'BORRADOR', usuario_id: personal.id },
        { estado_anterior: 'BORRADOR', estado_nuevo: 'ENVIADO', usuario_id: personal.id },
      ]);
    });

    it('una segunda devolución tiene sus propias observaciones pendientes y las de la primera siguen atendidas', async () => {
      await paso(reporte, transicion(reporte, { estadoDestino: 'EN_REVISION', revisorId: estadigrafa.id }, estadigrafa));
      await paso(reporte, devolver(reporte, [{ vacunaId: null, texto: 'vitest-hu29 Segunda revisión.' }]));

      const res = await api('get', `/reportes/${reporte.id}/observaciones`);
      expect(res.body.map((o) => [o.texto, o.atendida])).toEqual([
        ['vitest-hu29 Segunda revisión.', false],
        ['vitest-hu29 Revise las cantidades del mes.', true],
        ['vitest-hu29 ZVT_HU29B parece alta.', true],
      ]);
    }, 60000);
  });

  describe('reenviar con errores de validación', () => {
    let reporte;

    beforeAll(async () => {
      reporte = await reporteDevuelto();
      await paso(reporte, corregir(reporte));
      await paso(reporte, guardar(reporte, 'ZVT_HU29A', 150));
    }, 120000);

    it('responde 422 REPORTE_CON_ERRORES, deja los resultados y las observaciones siguen pendientes', async () => {
      const res = await transicion(reporte, { estadoDestino: 'ENVIADO' });

      expect(error(res)).toEqual([422, 'REPORTE_CON_ERRORES']);
      expect(res.body.validacion.errores).toBeGreaterThan(0);
      expect((await enBase(reporte.id)).estado).toBe('BORRADOR');
      const [resultados] = await pool.query(
        "SELECT severidad, estado FROM resultado_validacion WHERE reporte_id = ? AND regla_codigo = ?",
        [reporte.id, REGLA],
      );
      expect(resultados).toEqual([{ severidad: 'ERROR', estado: 'ABIERTO' }]);
      const observaciones = await api('get', `/reportes/${reporte.id}/observaciones`);
      expect(observaciones.body.map((o) => [o.atendida, o.atendidaEn])).toEqual([
        [false, null],
        [false, null],
      ]);
      const ultimo = (await cambiosDeEstado(reporte.id)).at(-1);
      expect(ultimo.valores_nuevos).toEqual({ estado: 'BORRADOR' });
    });
  });
});
