import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { esquemasDelPeriodo } from '../src/modulos/configuracion/esquemas.service.js';

// Las pruebas crean por SQL las vacunas ZVT_HU19 (activa), ZVT_HU19I (inactiva) y ZVT_HU19T (activa, con su
// primer esquema desde septiembre de 2022), y en MongoDB la dimensión zvt_hu19 y los esquemas de esas vacunas,
// todos con vigencias de 2022. También crean los meses de 2022 en periodo, con su estado en la DDRISS 1, y los
// reportes de ese año. Todo se borra al inicio y al final; las filas de la bitácora quedan. Los reportes los crea
// cs1201 (CS-1201), una cuenta de la semilla: la prueba firma su token sin iniciar sesión. Los esquemas de la
// semilla empiezan en 2026, así que en 2022 solo aplican los de prueba.
const VACUNA = 'ZVT_HU19';
const VACUNA_INACTIVA = 'ZVT_HU19I';
const VACUNA_TARDIA = 'ZVT_HU19T';
const VACUNAS = [VACUNA, VACUNA_INACTIVA, VACUNA_TARDIA];
const DIMENSION = 'zvt_hu19';
const DDRISS = 'DDRISS_SM';

const vacunaIds = {};
const ids = {
  nacionalV1: new ObjectId(),
  nacionalV2: new ObjectId(),
  ddrissV3: new ObjectId(),
  inactiva: new ObjectId(),
  tardia: new ObjectId(),
};

const utc = (fecha) => new Date(`${fecha}T00:00:00.000Z`);
const NACIONAL = { nivel: 'NACIONAL', ddriss_codigo: null };
const DE_LA_DDRISS = { nivel: 'DDRISS', ddriss_codigo: DDRISS };

function esquemaDePrueba({ _id, codigo, version, territorio, estado, desde, hasta = null }) {
  return {
    _id,
    vacuna: { id: new Int32(vacunaIds[codigo]), codigo, nombre: `vitest-hu19 ${codigo}` },
    version: new Int32(version),
    territorio,
    estado,
    vigencia: { desde: utc(desde), hasta: hasta && utc(hasta) },
    version_anterior_id: null,
    basado_en: null,
    dimensiones: {
      dosis: [
        { codigo: 'D1', etiqueta: 'Primera dosis' },
        { codigo: 'D2', etiqueta: 'Segunda dosis' },
        {
          codigo: 'R1',
          etiqueta: 'Primer refuerzo',
          desagregacion: [
            { dimension: 'grupo_edad', valores: ['1_A_5'] },
            { dimension: 'sexo', valores: ['M', 'F'] },
          ],
        },
      ],
      procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
      desagregacion: [
        { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
        { dimension: DIMENSION, valores: ['A'], etiqueta: 'Condición ZVT' },
      ],
    },
    secciones: [
      { codigo: 'MENOR_1', titulo: '< 1 año', orden: new Int32(1), grupo_edad: 'MENOR_1', dosis: ['D1', 'D2'] },
      { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: new Int32(2), grupo_edad: '1_A_5', dosis: ['D1', 'D2', 'R1'] },
    ],
    campos_adicionales: [],
    reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: new Int32(1) }],
    presentacion: { filas: 'dosis', columnas: ['seccion', DIMENSION] },
    auditoria: { creado_por: new Int32(1), creado_en: new Date(), publicado_por: null, publicado_en: null, motivo_cambio: null },
  };
}

const ANIO = 2022;
const ESTABLECIMIENTO = 'CS-1201';
// Mes → estado en la DDRISS 1 (sin estado: el mes no está abierto en ella).
const MESES = { 1: 'ABIERTO', 2: 'ABIERTO', 3: 'EN_CIERRE', 4: 'ABIERTO', 5: 'CERRADO', 6: null, 7: 'ABIERTO' };
const periodoIds = {};

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiarReportes() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
}

async function limpiar() {
  await limpiarReportes();
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query('UPDATE establecimiento SET activo = TRUE, reporta_5c = TRUE WHERE codigo = ?', [ESTABLECIMIENTO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: VACUNAS } });
  await db.collection('catalogo_dimensiones').deleteMany({ codigo: DIMENSION });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [VACUNAS]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS]);
}

async function preparar() {
  for (const [mes, estado] of Object.entries(MESES).map(([m, e]) => [Number(m), e])) {
    const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
    const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
      ANIO,
      mes,
      `${ANIO}-${dosDigitos(mes)}-01`,
      `${ANIO}-${dosDigitos(mes)}-${fin}`,
    ]);
    periodoIds[mes] = periodo.insertId;
    if (estado === null) continue;
    await pool.query(
      `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
       VALUES (?, 1, ?, ?, ?, ?)`,
      [
        periodo.insertId,
        `${ANIO}-${dosDigitos(mes + 1)}-10`,
        estado,
        estado === 'CERRADO' ? 2 : null,
        estado === 'CERRADO' ? `${ANIO}-${dosDigitos(mes + 1)}-20 16:00:00` : null,
      ],
    );
  }

  for (const [codigo, activa] of [[VACUNA, true], [VACUNA_INACTIVA, false], [VACUNA_TARDIA, true]]) {
    const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, ?, ?)', [
      codigo,
      `vitest-hu19 ${codigo}`,
      activa,
    ]);
    vacunaIds[codigo] = vacuna.insertId;
    await pool.query(
      `INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES
         (?, 'D1', 'Primera dosis', 1, TRUE), (?, 'D2', 'Segunda dosis', 2, TRUE), (?, 'R1', 'Primer refuerzo', 3, TRUE)`,
      [vacuna.insertId, vacuna.insertId, vacuna.insertId],
    );
  }

  const db = await obtenerDb();
  await db.collection('catalogo_dimensiones').insertOne({
    codigo: DIMENSION,
    nombre: 'ZVT HU-19',
    tipo: 'CATEGORICA',
    activo: true,
    valores: [
      { codigo: 'A', etiqueta: 'Valor A', orden: new Int32(1), activo: true },
      { codigo: 'B', etiqueta: 'Valor B', orden: new Int32(2), activo: true },
    ],
    auditoria: { creado_por: new Int32(1), creado_en: new Date(), publicado_por: null, publicado_en: null, motivo_cambio: null },
  });
  await db.collection('esquemas_captura').insertMany([
    esquemaDePrueba({
      _id: ids.nacionalV1, codigo: VACUNA, version: 1, territorio: NACIONAL, estado: 'HISTORICO',
      desde: '2022-02-01', hasta: '2022-05-31',
    }),
    esquemaDePrueba({ _id: ids.nacionalV2, codigo: VACUNA, version: 2, territorio: NACIONAL, estado: 'VIGENTE', desde: '2022-06-01' }),
    esquemaDePrueba({ _id: ids.ddrissV3, codigo: VACUNA, version: 3, territorio: DE_LA_DDRISS, estado: 'VIGENTE', desde: '2022-04-01' }),
    esquemaDePrueba({
      _id: ids.inactiva, codigo: VACUNA_INACTIVA, version: 1, territorio: NACIONAL, estado: 'VIGENTE', desde: '2022-01-01',
    }),
    esquemaDePrueba({ _id: ids.tardia, codigo: VACUNA_TARDIA, version: 1, territorio: NACIONAL, estado: 'VIGENTE', desde: '2022-09-01' }),
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
  const token = jwt.sign(
    {
      rol: cuenta.rol,
      permisos: permisos.map((p) => p.codigo),
      ddrissId: cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id,
      municipioId: cuenta.municipio_id,
    },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(cuenta.id), expiresIn: '10m' },
  );
  return { token, usuarioId: cuenta.id, permisos: permisos.map((p) => p.codigo) };
}

let personal;
let revisor;

const crear = (cuerpo, credencial = personal.token) =>
  request(app).post('/api/v1/reportes').set('Authorization', `Bearer ${credencial}`).send(cuerpo);
const consultar = (ruta, credencial = personal.token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
async function filasBitacora(reporteId) {
  const [filas] = await pool.query(
    `SELECT accion, usuario_id, valores_nuevos FROM bitacora
      WHERE modulo = 'PRODUCCION' AND entidad = 'reporte_produccion' AND entidad_id = ? ORDER BY id`,
    [String(reporteId)],
  );
  return filas.map((f) => ({ accion: f.accion, usuarioId: f.usuario_id, nuevos: leerJson(f.valores_nuevos) }));
}
async function reportesDelMes(mes) {
  const [filas] = await pool.query('SELECT id FROM reporte_produccion WHERE periodo_id = ?', [periodoIds[mes]]);
  return filas;
}
const cambiarEstablecimiento = (campo, valor) =>
  pool.query(`UPDATE establecimiento SET ${campo} = ? WHERE codigo = ?`, [valor, ESTABLECIMIENTO]);

beforeAll(async () => {
  await limpiar();
  await preparar();
  personal = await tokenDe('u.nombre_usuario', 'cs1201');
  revisor = await tokenDe('r.codigo', 'REVISOR');
}, 60000);

afterAll(limpiar, 60000);

describe('esquemasDelPeriodo', () => {
  const resolver = (fecha, ddriss = DDRISS) => esquemasDelPeriodo([VACUNA, VACUNA_TARDIA, 'ZVT_HU19S'], ddriss, utc(fecha));

  it('antes del esquema de la DDRISS, da el nacional que cubre la fecha aunque sea HISTORICO', async () => {
    const esquemas = await resolver('2022-02-01');
    expect(esquemas.get(VACUNA)).toEqual({ id: ids.nacionalV1.toString(), version: 1 });
  });

  it('con un esquema de la DDRISS que cubre la fecha, gana sobre el nacional', async () => {
    expect((await resolver('2022-04-01')).get(VACUNA)).toEqual({ id: ids.ddrissV3.toString(), version: 3 });
    expect((await resolver('2022-07-01')).get(VACUNA)).toEqual({ id: ids.ddrissV3.toString(), version: 3 });
  });

  it('sin DDRISS, o con otra, da el nacional de la fecha', async () => {
    expect((await resolver('2022-07-01', null)).get(VACUNA)).toEqual({ id: ids.nacionalV2.toString(), version: 2 });
    expect((await resolver('2022-03-01', 'ZVT_OTRA')).get(VACUNA)).toEqual({ id: ids.nacionalV1.toString(), version: 1 });
  });

  it('una vacuna sin esquema, o con su primer desde posterior a la fecha, no aparece', async () => {
    const febrero = await resolver('2022-02-01');
    expect(febrero.has('ZVT_HU19S')).toBe(false);
    expect(febrero.has(VACUNA_TARDIA)).toBe(false);
    expect((await resolver('2022-09-01')).get(VACUNA_TARDIA)).toEqual({ id: ids.tardia.toString(), version: 1 });
  });

  it('antes de cualquier vigencia no da nada, y sin vacunas devuelve un Map vacío', async () => {
    expect((await resolver('2022-01-01')).size).toBe(0);
    expect((await esquemasDelPeriodo([], DDRISS, utc('2022-02-01'))).size).toBe(0);
  });
});

describe('POST /reportes', () => {
  it('crea el reporte en BORRADOR con las vacunas activas que tienen esquema para el mes, su historial y su bitácora', async () => {
    const res = await crear({ periodoId: periodoIds[2] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      establecimiento: { codigo: ESTABLECIMIENTO },
      periodo: { id: periodoIds[2], anio: ANIO, mes: 2, estado: 'ABIERTO', fechaLimiteEnvio: `${ANIO}-03-10` },
      estado: 'BORRADOR',
      numeroRectificacion: 0,
      versionFila: 1,
    });
    // Sin ZVT_HU19I (inactiva) ni ZVT_HU19T (su esquema empieza en septiembre); en 2022 no aplica ningún otro.
    expect(res.body.vacunas.map((v) => [v.vacuna.codigo, v.esquema])).toEqual([
      [VACUNA, { id: ids.nacionalV1.toString(), version: 1 }],
    ]);

    const [[historial]] = await pool.query(
      'SELECT estado_anterior, estado_nuevo, usuario_id FROM historial_estado_reporte WHERE reporte_id = ?',
      [res.body.id],
    );
    expect(historial).toEqual({ estado_anterior: null, estado_nuevo: 'BORRADOR', usuario_id: personal.usuarioId });
    const filas = await filasBitacora(res.body.id);
    expect(filas.map((f) => [f.accion, f.usuarioId])).toEqual([['CREAR', personal.usuarioId]]);
    expect(filas[0].nuevos).toMatchObject({ id: res.body.id, estado: 'BORRADOR', vacunas: [{ vacuna: { codigo: VACUNA } }] });
  });

  it('un segundo reporte del mismo mes responde 409 REPORTE_EXISTENTE', async () => {
    const res = await crear({ periodoId: periodoIds[2] });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ codigo: 'REPORTE_EXISTENTE', mensaje: 'Ya existe el reporte de este mes.' });
    expect(await reportesDelMes(2)).toHaveLength(1);
  });

  it('dos altas en paralelo del mismo mes: una 201 y otra 409, con el esquema de la DDRISS', async () => {
    const respuestas = await Promise.all([crear({ periodoId: periodoIds[4] }), crear({ periodoId: periodoIds[4] })]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    const creada = respuestas.find((r) => r.status === 201);
    expect(creada.body.vacunas.map((v) => v.esquema)).toEqual([{ id: ids.ddrissV3.toString(), version: 3 }]);
    expect(await reportesDelMes(4)).toHaveLength(1);
  });

  it.each([
    ['en cierre', 3],
    ['cerrado', 5],
    ['sin abrir en la DDRISS', 6],
  ])('un mes %s responde 409 PERIODO_NO_ABIERTO', async (_, mes) => {
    const res = await crear({ periodoId: periodoIds[mes] });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ codigo: 'PERIODO_NO_ABIERTO', mensaje: 'El mes no está abierto para reportes.' });
    expect(await reportesDelMes(mes)).toHaveLength(0);
  });

  it('un periodo que no existe responde 404', async () => {
    const res = await crear({ periodoId: 65000 });
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El periodo no existe.' });
  });

  it('un mes sin ningún esquema responde 422 SIN_ESQUEMAS y no deja nada escrito', async () => {
    const res = await crear({ periodoId: periodoIds[1] });
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      codigo: 'SIN_ESQUEMAS',
      mensaje: 'No hay formularios de captura publicados para este mes.',
    });
    expect(await reportesDelMes(1)).toHaveLength(0);
  });

  it('un establecimiento que no envía el 5C responde 422 y uno inactivo 409', async () => {
    try {
      await cambiarEstablecimiento('reporta_5c', false);
      const noReporta = await crear({ periodoId: periodoIds[7] });
      expect(noReporta.status).toBe(422);
      expect(noReporta.body.error).toEqual({
        codigo: 'ESTABLECIMIENTO_NO_REPORTA',
        mensaje: 'Su establecimiento no envía el formulario 5C.',
      });
      await cambiarEstablecimiento('activo', false);
      const inactivo = await crear({ periodoId: periodoIds[7] });
      expect(inactivo.status).toBe(409);
      expect(inactivo.body.error).toEqual({
        codigo: 'ESTABLECIMIENTO_INACTIVO',
        mensaje: 'Su establecimiento está desactivado y no puede crear reportes.',
      });
    } finally {
      await cambiarEstablecimiento('reporta_5c', true);
      await cambiarEstablecimiento('activo', true);
    }
    expect(await reportesDelMes(7)).toHaveLength(0);
  });

  it.each([
    ['con establecimientoId', () => ({ periodoId: periodoIds[7], establecimientoId: 1 }), 'Campo no permitido: establecimientoId.'],
    ['sin periodoId', () => ({}), 'periodoId debe ser un número entero positivo.'],
    ['con periodoId de texto', () => ({ periodoId: String(periodoIds[7]) }), 'periodoId debe ser un número entero positivo.'],
  ])('un cuerpo %s responde 400', async (_, cuerpo, mensaje) => {
    const res = await crear(cuerpo());
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('sin REPORTE_CREAR (el Revisor) responde 403', async () => {
    expect(revisor.permisos).not.toContain('REPORTE_CREAR');
    const res = await crear({ periodoId: periodoIds[7] }, revisor.token);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('desactivar una vacuna después de crear el reporte no lo cambia', async () => {
    const [{ id }] = await reportesDelMes(2);
    try {
      await pool.query('UPDATE vacuna SET activa = FALSE WHERE codigo = ?', [VACUNA]);
      const res = await consultar(`/reportes/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.vacunas.map((v) => v.vacuna.codigo)).toEqual([VACUNA]);
    } finally {
      await pool.query('UPDATE vacuna SET activa = TRUE WHERE codigo = ?', [VACUNA]);
    }
  });
});

describe('GET /reportes y GET /reportes/{id}', () => {
  let otro;
  let reporteId;

  beforeAll(async () => {
    otro = await tokenDe('u.nombre_usuario', 'cs1202');
    [{ id: reporteId }] = await reportesDelMes(2);
  });

  it('la lista filtrada por periodoId trae el reporte del establecimiento con la forma paginada', async () => {
    const res = await consultar(`/reportes?periodoId=${periodoIds[2]}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      elementos: [
        {
          id: reporteId,
          establecimiento: { id: expect.any(Number), codigo: ESTABLECIMIENTO, nombre: expect.any(String) },
          periodo: { id: periodoIds[2], anio: ANIO, mes: 2 },
          estado: 'BORRADOR',
          actualizadoEn: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/),
        },
      ],
      total: 1,
      pagina: 1,
      porPagina: 20,
    });
  });

  it('sin filtros solo trae reportes del establecimiento, del mes más reciente al más antiguo', async () => {
    const res = await consultar('/reportes?porPagina=100');
    expect(res.status).toBe(200);
    expect(res.body.elementos.every((r) => r.establecimiento.codigo === ESTABLECIMIENTO)).toBe(true);
    const claves = res.body.elementos.map((r) => r.periodo.anio * 100 + r.periodo.mes);
    expect(claves).toEqual([...claves].sort((a, b) => b - a));
    const borradores = await consultar(`/reportes?estado=BORRADOR&periodoId=${periodoIds[4]}`);
    expect(borradores.body.total).toBe(1);
  });

  it('una página fuera de rango responde 200 sin elementos y con el total real', async () => {
    const res = await consultar(`/reportes?periodoId=${periodoIds[2]}&pagina=5`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ elementos: [], total: 1, pagina: 5 });
  });

  it.each([
    ['estado=ENVIADA', 'estado debe ser BORRADOR, ENVIADO, EN_REVISION, CORRECCION_SOLICITADA, APROBADO, CERRADO o RECTIFICACION.'],
    ['establecimientoId=2', 'Parámetro no permitido: establecimientoId.'],
    ['periodoId=abc', 'periodoId debe ser un número entero positivo.'],
    ['estado=BORRADOR&estado=ENVIADO', 'estado no se puede repetir.'],
    ['porPagina=101', 'porPagina debe ser un número entero entre 1 y 100.'],
  ])('%s responde 400', async (consulta, mensaje) => {
    const res = await consultar(`/reportes?${consulta}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('otro establecimiento no ve el reporte en la lista y recibe 404 en el detalle', async () => {
    const lista = await consultar(`/reportes?periodoId=${periodoIds[2]}`, otro.token);
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ elementos: [], total: 0 });
    const detalle = await consultar(`/reportes/${reporteId}`, otro.token);
    expect(detalle.status).toBe(404);
    expect(detalle.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('el detalle trae el periodo con su estado y fecha límite, y las vacunas con su versión', async () => {
    const res = await consultar(`/reportes/${reporteId}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: reporteId,
      establecimiento: { codigo: ESTABLECIMIENTO },
      periodo: { id: periodoIds[2], anio: ANIO, mes: 2, estado: 'ABIERTO', fechaLimiteEnvio: `${ANIO}-03-10` },
      estado: 'BORRADOR',
      numeroRectificacion: 0,
      versionFila: 1,
      creadoEn: expect.any(String),
      actualizadoEn: expect.any(String),
    });
    expect(res.body.vacunas).toEqual([
      {
        id: expect.any(Number),
        vacuna: { id: vacunaIds[VACUNA], codigo: VACUNA, nombre: `vitest-hu19 ${VACUNA}` },
        esquema: { id: ids.nacionalV1.toString(), version: 1 },
        dosis: expect.any(Array),
        dimensiones: expect.any(Array),
      },
    ]);
  });

  it.each([['inexistente', '999999999'], ['con un id que no es número', 'abc']])('un reporte %s responde 404', async (_, id) => {
    const res = await consultar(`/reportes/${id}`);
    expect(res.status).toBe(404);
  });

  it('sin REPORTE_CONSULTAR (el Revisor) la lista y el detalle responden 403', async () => {
    expect(revisor.permisos).not.toContain('REPORTE_CONSULTAR');
    expect((await consultar('/reportes', revisor.token)).status).toBe(403);
    expect((await consultar(`/reportes/${reporteId}`, revisor.token)).status).toBe(403);
  });
});

describe('etiquetas de GET /reportes/{id}', () => {
  let reporteId;
  const vacunaDelReporte = async () => {
    const res = await consultar(`/reportes/${reporteId}`);
    expect(res.status).toBe(200);
    return res.body.vacunas.find((v) => v.vacuna.codigo === VACUNA);
  };

  beforeAll(async () => {
    [{ id: reporteId }] = await reportesDelMes(2);
  });

  it('trae las dosis del esquema y sus dimensiones con las etiquetas, una sola vez cada una', async () => {
    const vacuna = await vacunaDelReporte();
    expect(vacuna.dosis).toEqual([
      { codigo: 'D1', nombre: 'Primera dosis', orden: 1, activa: true },
      { codigo: 'D2', nombre: 'Segunda dosis', orden: 2, activa: true },
      { codigo: 'R1', nombre: 'Primer refuerzo', orden: 3, activa: true },
    ]);
    expect(vacuna.dimensiones.map((d) => [d.codigo, d.etiqueta])).toEqual([
      ['grupo_edad', null],
      ['sexo', null],
      [DIMENSION, 'Condición ZVT'],
    ]);
    // Solo los valores que usa el esquema, en el orden del catálogo.
    const valores = Object.fromEntries(vacuna.dimensiones.map((d) => [d.codigo, d.valores.map((v) => v.codigo)]));
    expect(valores).toEqual({ grupo_edad: ['MENOR_1', '1_A_5'], sexo: ['M', 'F'], [DIMENSION]: ['A'] });
    const zvt = vacuna.dimensiones.find((d) => d.codigo === DIMENSION);
    expect(zvt).toEqual({
      codigo: DIMENSION,
      nombre: 'ZVT HU-19',
      etiqueta: 'Condición ZVT',
      valores: [{ codigo: 'A', etiqueta: 'Valor A', orden: 1, activo: true }],
    });
    expect(vacuna.dimensiones.find((d) => d.codigo === 'sexo').valores.map((v) => v.etiqueta)).toEqual([
      'Masculino',
      'Femenino',
    ]);
  });

  it('una dosis o un valor desactivados después de crear el reporte siguen apareciendo con su marca', async () => {
    const db = await obtenerDb();
    try {
      await pool.query("UPDATE dosis SET activa = FALSE WHERE vacuna_id = ? AND codigo = 'R1'", [vacunaIds[VACUNA]]);
      await db
        .collection('catalogo_dimensiones')
        .updateOne({ codigo: DIMENSION, 'valores.codigo': 'A' }, { $set: { 'valores.$.activo': false } });
      const vacuna = await vacunaDelReporte();
      expect(vacuna.dosis.find((d) => d.codigo === 'R1')).toEqual({ codigo: 'R1', nombre: 'Primer refuerzo', orden: 3, activa: false });
      expect(vacuna.dimensiones.find((d) => d.codigo === DIMENSION).valores).toEqual([
        { codigo: 'A', etiqueta: 'Valor A', orden: 1, activo: false },
      ]);
    } finally {
      await pool.query("UPDATE dosis SET activa = TRUE WHERE vacuna_id = ? AND codigo = 'R1'", [vacunaIds[VACUNA]]);
      await db
        .collection('catalogo_dimensiones')
        .updateOne({ codigo: DIMENSION, 'valores.codigo': 'A' }, { $set: { 'valores.$.activo': true } });
    }
  });

  it('salen de la versión fijada en el reporte, no de la vigente', async () => {
    const db = await obtenerDb();
    // Solo para la prueba: la v2 vigente usa otra etiqueta y el valor B; el reporte de febrero quedó con la v1.
    await db.collection('esquemas_captura').updateOne(
      { _id: ids.nacionalV2 },
      { $set: { 'dimensiones.desagregacion.1': { dimension: DIMENSION, valores: ['A', 'B'], etiqueta: 'Otra etiqueta' } } },
    );
    const vacuna = await vacunaDelReporte();
    expect(vacuna.esquema).toEqual({ id: ids.nacionalV1.toString(), version: 1 });
    expect(vacuna.dimensiones.find((d) => d.codigo === DIMENSION)).toMatchObject({
      etiqueta: 'Condición ZVT',
      valores: [{ codigo: 'A' }],
    });
  });

  it('el Personal las obtiene sin los permisos del catálogo de configuración', () => {
    for (const permiso of ['DIMENSION_CONSULTAR', 'VACUNA_CONSULTAR', 'ESQUEMA_CONSULTAR']) {
      expect(personal.permisos).not.toContain(permiso);
    }
  });

  it('un esquema que ya no está en MongoDB deja la vacuna sin dosis ni dimensiones, sin fallar', async () => {
    const [[fila]] = await pool.query('SELECT id, esquema_mongo_id FROM reporte_vacuna WHERE reporte_id = ?', [reporteId]);
    const ausente = new ObjectId().toString();
    try {
      await pool.query('UPDATE reporte_vacuna SET esquema_mongo_id = ? WHERE id = ?', [ausente, fila.id]);
      const vacuna = await vacunaDelReporte();
      expect(vacuna).toMatchObject({ esquema: { id: ausente }, dosis: [], dimensiones: [] });
    } finally {
      await pool.query('UPDATE reporte_vacuna SET esquema_mongo_id = ? WHERE id = ?', [fila.esquema_mongo_id, fila.id]);
    }
  });
});
