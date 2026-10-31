import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2017 (abiertos en la DDRISS 1) y la vacuna ZVT_HU26 (dosis única) con su esquema
// nacional desde enero de 2017, e insertan en MongoDB dos reglas RANGO de DDRISS_SM solo para ella: hasta 100 dosis
// (ERROR) y hasta 30 (ADVERTENCIA). Los reportes los crea cs1201 con su token firmado sin iniciar sesión. Todo se
// borra al inicio y al final; las filas de la bitácora quedan. Los esquemas de la semilla empiezan en 2026.
const VACUNA = 'ZVT_HU26';
const ANIO = 2017;
const MESES = [1, 2, 3, 4, 5, 6];
const esquemaId = new ObjectId();
const periodoIds = {};
let vacunaId;
let municipioPropio;
let personal;
let otro;
let revisor;

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: new Int32(1),
  publicado_en: new Date(),
  motivo_cambio: 'vitest-hu26',
});

const esquema = () => ({
  _id: esquemaId,
  vacuna: { id: new Int32(vacunaId), codigo: VACUNA, nombre: `vitest-hu26 ${VACUNA}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO}-01-01T00:00:00.000Z`), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  reglas: [],
  presentacion: { filas: 'dosis', columnas: ['seccion'] },
  auditoria: auditoria(),
  dimensiones: {
    dosis: [{ codigo: 'UNICA', etiqueta: 'Dosis única' }],
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
    desagregacion: [],
  },
  secciones: [{ codigo: 'UNICA', titulo: 'Única', orden: new Int32(1), grupo_edad: null, dosis: ['UNICA'] }],
  campos_adicionales: [],
});

const regla = (codigo, severidad, maximo) => ({
  _id: new ObjectId(),
  codigo,
  version: new Int32(1),
  nombre: `vitest-hu26 ${codigo}`,
  tipo: 'RANGO',
  ambito: 'DETALLE',
  severidad,
  aplica_a: { vacunas: [VACUNA] },
  parametros: { minimo: 0, maximo },
  mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango ({minimo} a {maximo}).',
  territorio: { nivel: 'DDRISS', ddriss_codigo: 'DDRISS_SM' },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO}-01-01T00:00:00.000Z`), hasta: null },
  auditoria: auditoria(),
});

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  // resultado_validacion e historial_estado_reporte no caen en cascada con el reporte.
  await pool.query(`DELETE FROM resultado_validacion WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': VACUNA });
  await db.collection('reglas_validacion').deleteMany({ codigo: /^ZVT_HU26/ });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
}

async function preparar() {
  for (const mes of MESES) {
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
      [periodo.insertId, `${ANIO}-${dosDigitos(mes + 1)}-10`],
    );
  }
  const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, ?, TRUE)', [
    VACUNA,
    `vitest-hu26 ${VACUNA}`,
  ]);
  vacunaId = vacuna.insertId;
  await pool.query("INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, 'UNICA', 'Dosis única', 1, TRUE)", [
    vacunaId,
  ]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertOne(esquema());
  await db.collection('reglas_validacion').insertMany([
    regla('ZVT_HU26_RANGO', 'ERROR', 100),
    regla('ZVT_HU26_AVISO', 'ADVERTENCIA', 30),
  ]);
}

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function tokenDe(condicion, valor) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE ${condicion} = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
    [valor],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa para ${valor} en la base de prueba`);
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
  return { token, usuarioId: cuenta.id };
}

const conToken = (prueba, credencial) => prueba.set('Authorization', `Bearer ${credencial}`);
const transicion = (reporteId, cuerpo, credencial = personal.token) =>
  conToken(request(app).post(`/api/v1/reportes/${reporteId}/transiciones`), credencial).send(cuerpo);
const enviar = (reporte, credencial) =>
  transicion(reporte.id, { estadoDestino: 'ENVIADO', versionFila: reporte.versionFila }, credencial);
const error = (res) => [res.status, res.body.error?.codigo];

async function crearReporte(mes, cantidad) {
  const creado = await conToken(request(app).post('/api/v1/reportes'), personal.token).send({ periodoId: periodoIds[mes] });
  expect(creado.status).toBe(201);
  const guardado = await conToken(request(app).put(`/api/v1/reportes/${creado.body.id}/vacunas/${vacunaId}`), personal.token).send({
    versionFila: creado.body.versionFila,
    celdas: [{ dosisCodigo: 'UNICA', municipioProcedenciaId: municipioPropio, dimensiones: {}, cantidad }],
  });
  expect(guardado.status).toBe(200);
  return { id: creado.body.id, versionFila: guardado.body.versionFila };
}

const enBase = async (reporteId) => {
  const [[fila]] = await pool.query(
    'SELECT estado, version_fila, UNIX_TIMESTAMP(enviado_en) AS enviado FROM reporte_produccion WHERE id = ?',
    [reporteId],
  );
  return fila;
};
// Sin la fila de la creación (NULL → BORRADOR).
const historial = async (reporteId) => {
  const [filas] = await pool.query(
    `SELECT estado_anterior, estado_nuevo, usuario_id, comentario FROM historial_estado_reporte
      WHERE reporte_id = ? AND estado_anterior IS NOT NULL`,
    [reporteId],
  );
  return filas;
};
// Solo los de las reglas de prueba: las de la semilla (VARIACION_HISTORICA) también ven los envíos de 2017.
const deLasReglasDePrueba = (lista) => lista.filter((r) => (r.regla_codigo ?? r.regla.codigo).startsWith('ZVT_HU26'));
const resultados = async (reporteId) => {
  const [filas] = await pool.query(
    'SELECT regla_codigo, severidad, estado FROM resultado_validacion WHERE reporte_id = ? ORDER BY id',
    [reporteId],
  );
  return deLasReglasDePrueba(filas);
};
const bitacora = async (accion, reporteId) => {
  const [filas] = await pool.query(
    "SELECT usuario_id, modulo, valores_anteriores, valores_nuevos FROM bitacora WHERE accion = ? AND entidad = 'reporte_produccion' AND entidad_id = ?",
    [accion, String(reporteId)],
  );
  return filas;
};
const cambiarMes = (mes, estado) =>
  pool.query(
    'UPDATE cierre_periodo SET estado = ?, cerrado_por = ?, cerrado_en = ? WHERE periodo_id = ? AND ddriss_id = 1',
    [estado, estado === 'CERRADO' ? 2 : null, estado === 'CERRADO' ? `${ANIO}-12-20 16:00:00` : null, periodoIds[mes]],
  );

describe('POST /reportes/{id}/transiciones', () => {
  beforeAll(async () => {
    await limpiar();
    await preparar();
    personal = await tokenDe('u.nombre_usuario', 'cs1201');
    otro = await tokenDe('u.nombre_usuario', 'cs1202');
    revisor = await tokenDe('r.codigo', 'REVISOR');
    const [[municipio]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
    municipioPropio = municipio.municipio_id;
  }, 120000);

  afterAll(limpiar, 60000);

  describe('un reporte sin errores y con una advertencia', () => {
    let reporte;

    beforeAll(async () => {
      reporte = await crearReporte(1, 50);
    }, 60000);

    it('pasa a ENVIADO con enviado_en, su historial y su CAMBIO_ESTADO; la advertencia sigue ABIERTO', async () => {
      const res = await enviar(reporte);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: reporte.id, estado: 'ENVIADO', versionFila: reporte.versionFila + 1 });
      const fila = await enBase(reporte.id);
      expect(fila).toMatchObject({ estado: 'ENVIADO', version_fila: reporte.versionFila + 1 });
      expect(Math.abs(Number(fila.enviado) * 1000 - Date.now())).toBeLessThan(5 * 60 * 1000);
      expect(await historial(reporte.id)).toEqual([
        { estado_anterior: 'BORRADOR', estado_nuevo: 'ENVIADO', usuario_id: personal.usuarioId, comentario: null },
      ]);
      expect(await resultados(reporte.id)).toEqual([
        { regla_codigo: 'ZVT_HU26_AVISO', severidad: 'ADVERTENCIA', estado: 'ABIERTO' },
      ]);
      const cambios = await bitacora('CAMBIO_ESTADO', reporte.id);
      expect(cambios).toHaveLength(1);
      expect(cambios[0]).toMatchObject({
        usuario_id: personal.usuarioId,
        modulo: 'REVISION',
        valores_anteriores: { estado: 'BORRADOR' },
        valores_nuevos: { estado: 'ENVIADO', errores: 0, advertencias: 1 },
      });
      reporte.versionFila = res.body.versionFila;
    });

    it('ya enviado, guardar, agregar o quitar una vacuna y validar responden 409 REPORTE_NO_EDITABLE', async () => {
      const ruta = `/api/v1/reportes/${reporte.id}`;
      const guardar = conToken(request(app).put(`${ruta}/vacunas/${vacunaId}`), personal.token).send({
        versionFila: reporte.versionFila,
        celdas: [],
      });
      const agregar = conToken(request(app).post(`${ruta}/vacunas`), personal.token).send({
        vacunaId,
        versionFila: reporte.versionFila,
      });
      const quitar = conToken(request(app).delete(`${ruta}/vacunas/${vacunaId}?versionFila=${reporte.versionFila}`), personal.token);
      const validar = conToken(request(app).post(`${ruta}/validar`), personal.token);

      for (const res of [await guardar, await agregar, await quitar, await validar]) {
        expect(error(res)).toEqual([409, 'REPORTE_NO_EDITABLE']);
      }
    });

    it('enviarlo de nuevo responde 422 TRANSICION_NO_PERMITIDA', async () => {
      const res = await enviar(reporte);

      expect(error(res)).toEqual([422, 'TRANSICION_NO_PERMITIDA']);
      expect(res.body.error.mensaje).toBe('El reporte no puede pasar de Enviado a Enviado.');
      expect(await historial(reporte.id)).toHaveLength(1);
    });
  });

  describe('un reporte en borrador con un error', () => {
    let reporte;

    beforeAll(async () => {
      reporte = await crearReporte(2, 150);
    }, 60000);

    it('responde 422 REPORTE_CON_ERRORES con la validación, sigue en BORRADOR y sus resultados quedan escritos', async () => {
      const res = await enviar(reporte);

      expect(error(res)).toEqual([422, 'REPORTE_CON_ERRORES']);
      expect(res.body.error.mensaje).toBe('El reporte tiene 1 error de validación. Corríjalo para poder enviarlo.');
      expect(res.body.validacion).toMatchObject({ errores: 1, corregidos: 0 });
      expect(deLasReglasDePrueba(res.body.validacion.resultados).map((r) => r.regla.codigo)).toEqual([
        'ZVT_HU26_RANGO',
        'ZVT_HU26_AVISO',
      ]);
      expect(await enBase(reporte.id)).toMatchObject({ estado: 'BORRADOR', version_fila: reporte.versionFila, enviado: null });
      expect((await resultados(reporte.id)).map((r) => `${r.regla_codigo} ${r.estado}`)).toEqual([
        'ZVT_HU26_RANGO ABIERTO',
        'ZVT_HU26_AVISO ABIERTO',
      ]);
      expect(await bitacora('VALIDAR', reporte.id)).toHaveLength(1);
      expect(await bitacora('CAMBIO_ESTADO', reporte.id)).toHaveLength(0);
      expect(await historial(reporte.id)).toHaveLength(0);
    });

    it('un destino distinto de ENVIADO responde 422 TRANSICION_NO_DISPONIBLE', async () => {
      const res = await transicion(reporte.id, { estadoDestino: 'APROBADO', versionFila: reporte.versionFila });
      expect(error(res)).toEqual([422, 'TRANSICION_NO_DISPONIBLE']);
    });

    it('un cuerpo con claves de más, sin versionFila o con un destino inválido responde 400', async () => {
      const casos = [
        { estadoDestino: 'ENVIADO', versionFila: reporte.versionFila, motivo: 'x' },
        { estadoDestino: 'ENVIADO' },
        { estadoDestino: 'ENVIADO', versionFila: '3' },
        { estadoDestino: 'PUBLICADO', versionFila: reporte.versionFila },
        { estadoDestino: 'ENVIADO', versionFila: reporte.versionFila, comentario: 'x'.repeat(1001) },
      ];
      for (const cuerpo of casos) {
        expect(error(await transicion(reporte.id, cuerpo))).toEqual([400, 'ENTRADA_INVALIDA']);
      }
      expect(error(await conToken(request(app).post('/api/v1/reportes/abc/transiciones'), personal.token).send({
        estadoDestino: 'ENVIADO',
        versionFila: 1,
      }))).toEqual([400, 'ENTRADA_INVALIDA']);
    });

    it('un reporte de otro establecimiento responde 404', async () => {
      expect(error(await enviar(reporte, otro.token))).toEqual([404, 'NO_ENCONTRADO']);
    });

    it('el Revisor recibe 403 al pedir ENVIADO y queda su ACCESO_DENEGADO', async () => {
      const contar = async () => {
        const [[{ total }]] = await pool.query(
          "SELECT COUNT(*) AS total FROM bitacora WHERE accion = 'ACCESO_DENEGADO' AND usuario_id = ? AND entidad_id = 'REPORTE_ENVIAR'",
          [revisor.usuarioId],
        );
        return Number(total);
      };
      const antes = await contar();

      expect(error(await enviar(reporte, revisor.token))).toEqual([403, 'SIN_PERMISO']);
      expect(await contar()).toBe(antes + 1);
    });
  });

  it('una versionFila vieja responde 409 REPORTE_DESACTUALIZADO', async () => {
    const reporte = await crearReporte(3, 10);
    const res = await enviar({ ...reporte, versionFila: reporte.versionFila - 1 });

    expect(error(res)).toEqual([409, 'REPORTE_DESACTUALIZADO']);
    expect(await enBase(reporte.id)).toMatchObject({ estado: 'BORRADOR' });
  }, 60000);

  it('con el mes CERRADO responde 409 PERIODO_CERRADO; EN_CIERRE deja enviar', async () => {
    const cerrado = await crearReporte(4, 10);
    const enCierre = await crearReporte(5, 10);
    await cambiarMes(4, 'CERRADO');
    await cambiarMes(5, 'EN_CIERRE');

    expect(error(await enviar(cerrado))).toEqual([409, 'PERIODO_CERRADO']);
    const res = await enviar(enCierre);
    expect(res.status).toBe(200);
    expect(res.body.estado).toBe('ENVIADO');
  }, 60000);

  it('dos envíos en paralelo con la misma versionFila: uno pasa, el otro responde 409 o 422 y queda un historial', async () => {
    const reporte = await crearReporte(6, 10);
    const respuestas = await Promise.all([enviar(reporte), enviar(reporte)]);

    const estados = respuestas.map((r) => r.status).sort();
    expect(estados[0]).toBe(200);
    expect([409, 422]).toContain(estados[1]);
    expect(await historial(reporte.id)).toHaveLength(1);
    expect(await enBase(reporte.id)).toMatchObject({ estado: 'ENVIADO', version_fila: reporte.versionFila + 1 });
  }, 60000);
});
