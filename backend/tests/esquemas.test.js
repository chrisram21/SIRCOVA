import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from 'supertest';
import { Collection, Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';
import {
  cargarReferencias,
  leerContenido,
  MENSAJES_COHERENCIA as M,
  revisarCoherencia,
} from '../src/modulos/configuracion/esquemas.service.js';

// Las pruebas crean por SQL las vacunas ZVT_HU16 (activa) y ZVT_HU16I (inactiva), y en MongoDB la dimensión
// zvt_hu16 y esquemas de esas vacunas, entre ellos un borrador de la DDRISS ficticia ZVT_OTRA. Todo se borra al
// inicio y al final. No tocan los esquemas de la semilla ni el borrador Hexavalente v3 del 04.
const VACUNA = 'ZVT_HU16';
const VACUNA_INACTIVA = 'ZVT_HU16I';
const DIMENSION = 'zvt_hu16';
const DDRISS_OTRA = 'ZVT_OTRA';
const HEXA_V2 = '66f8a1c2e4b0a1b2c3d4e5f6';

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: null,
  publicado_en: null,
  motivo_cambio: null,
});

let vacunaId;
let vacunaInactivaId;
let ddrissUsuario;
const ids = { vigenteNacional: new ObjectId(), borradorOtra: new ObjectId() };

function esquemaDePrueba({ _id, version, territorio, estado, vigencia }) {
  return {
    _id,
    vacuna: { id: new Int32(vacunaId), codigo: VACUNA, nombre: 'vitest-hu16 Vacuna' },
    version: new Int32(version),
    territorio,
    estado,
    vigencia,
    version_anterior_id: null,
    basado_en: null,
    dimensiones: {
      dosis: [
        { codigo: 'D1', etiqueta: 'Primera dosis' },
        { codigo: 'R1', etiqueta: 'Primer refuerzo', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
      ],
      procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
      desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
    },
    secciones: [
      { codigo: 'MENOR_1', titulo: '< 1 año', orden: new Int32(1), grupo_edad: 'MENOR_1', dosis: ['D1'] },
      { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: new Int32(2), grupo_edad: '1_A_5', dosis: ['D1', 'R1'] },
    ],
    campos_adicionales: [
      { clave: 'total_dosis_declarado', etiqueta: 'Total declarado', tipo: 'entero', requerido: true, minimo: new Int32(0), maximo: null },
    ],
    reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: new Int32(1) }],
    presentacion: { filas: 'dosis', columnas: ['seccion'], subtabla_por: 'procedencia' },
    auditoria: auditoria(),
  };
}

async function limpiar() {
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: [VACUNA, VACUNA_INACTIVA] } });
  await db.collection('catalogo_dimensiones').deleteMany({ codigo: DIMENSION });
  const codigos = [VACUNA, VACUNA_INACTIVA];
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [codigos]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [codigos]);
}

async function preparar() {
  const [vacuna] = await pool.query(
    "INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, 'vitest-hu16 Vacuna', TRUE)",
    [VACUNA],
  );
  vacunaId = vacuna.insertId;
  await pool.query(
    `INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES
       (?, 'D1', 'Primera dosis', 1, TRUE), (?, 'D2', 'Segunda dosis', 2, TRUE),
       (?, 'D3', 'Tercera dosis', 3, FALSE), (?, 'R1', 'Primer refuerzo', 4, TRUE)`,
    [vacunaId, vacunaId, vacunaId, vacunaId],
  );
  const [inactiva] = await pool.query(
    "INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, 'vitest-hu16 Vacuna inactiva', FALSE)",
    [VACUNA_INACTIVA],
  );
  vacunaInactivaId = inactiva.insertId;
  await pool.query("INSERT INTO dosis (vacuna_id, codigo, nombre, orden) VALUES (?, 'D1', 'Primera dosis', 1)", [
    vacunaInactivaId,
  ]);

  const db = await obtenerDb();
  await db.collection('catalogo_dimensiones').insertOne({
    codigo: DIMENSION,
    nombre: 'ZVT HU-16',
    tipo: 'CATEGORICA',
    activo: true,
    valores: [
      { codigo: 'A', etiqueta: 'Valor A', orden: new Int32(1), activo: true },
      { codigo: 'B', etiqueta: 'Valor B', orden: new Int32(2), activo: false },
    ],
    auditoria: auditoria(),
  });
  await db.collection('esquemas_captura').insertMany([
    esquemaDePrueba({
      _id: ids.vigenteNacional,
      version: 1,
      territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
      estado: 'VIGENTE',
      vigencia: { desde: new Date('2026-10-01'), hasta: null },
    }),
    esquemaDePrueba({
      _id: ids.borradorOtra,
      version: 2,
      territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS_OTRA },
      estado: 'BORRADOR',
      vigencia: { desde: new Date('2026-11-01'), hasta: null },
    }),
  ]);
}

let token;
let tokenEpidemiologia;
let tokenRevisor;

const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
const enviar = (metodo, ruta, cuerpo, credencial = token) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
async function filasBitacora(entidadId) {
  const [filas] = await pool.query(
    `SELECT accion, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND entidad = 'esquemas_captura' AND entidad_id = ?
      ORDER BY id`,
    [entidadId],
  );
  return filas.map((f) => ({ accion: f.accion, anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
}
async function filasDeLaVacuna(accion) {
  const [[{ filas }]] = await pool.query(
    `SELECT COUNT(*) AS filas FROM bitacora
      WHERE entidad = 'esquemas_captura' AND accion = ?
        AND JSON_UNQUOTE(JSON_EXTRACT(COALESCE(valores_nuevos, valores_anteriores), '$.vacuna.codigo')) = ?`,
    [accion, VACUNA],
  );
  return filas;
}

// Sin promoteValues el driver no convierte los enteros a number: se ve si se guardaron como int o como double.
const documentoCrudo = async (id) =>
  (await obtenerDb()).collection('esquemas_captura').findOne({ _id: new ObjectId(id) }, { promoteValues: false });
const borradoresDeLaDdriss = async () =>
  (await obtenerDb())
    .collection('esquemas_captura')
    .find({ 'vacuna.codigo': VACUNA, estado: 'BORRADOR', 'territorio.ddriss_codigo': ddrissUsuario })
    .toArray();
// En cualquier estado: una prueba deja un borrador como VIGENTE para simular su publicación.
const borrarEsquemasDeLaDdriss = async () =>
  (await obtenerDb())
    .collection('esquemas_captura')
    .deleteMany({ 'vacuna.codigo': VACUNA, 'territorio.ddriss_codigo': ddrissUsuario });

// Un cuerpo válido para empezar vacío. Las dosis y los valores van desordenados a propósito: se guardan en el orden
// de MySQL y del catálogo.
const vacio = (cambios = {}) => ({
  vacunaId,
  procedencia: { modo: 'PROPIO_Y_OTROS' },
  dosis: [{ codigo: 'D2' }, { codigo: 'D1', desagregacion: null }],
  desagregacion: [
    { dimension: DIMENSION, valores: ['A'] },
    { dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'] },
  ],
  secciones: [
    { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D2', 'D1'] },
    { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D2'] },
  ],
  ...cambios,
});

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function tokenDeLaSemilla(rol) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE r.codigo = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
    [rol],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa con el rol ${rol} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  return await tokenDePrueba(cuenta.id, {
    rol,
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  });
}

function clavesConGuionBajo(valor) {
  if (Array.isArray(valor)) return valor.flatMap(clavesConGuionBajo);
  if (valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([clave, hijo]) => [...(clave.includes('_') ? [clave] : []), ...clavesConGuionBajo(hijo)]);
}

beforeAll(async () => {
  await limpiar();
  await preparar();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = ?', [res.body.usuario.empleado.ddrissId]);
  ddrissUsuario = ddriss.codigo;
  tokenEpidemiologia = await tokenDeLaSemilla('EPIDEMIOLOGIA');
  tokenRevisor = await tokenDeLaSemilla('REVISOR');
});

afterAll(limpiar);

describe('GET /esquemas-captura', () => {
  it('trae una fila por vacuna activa con su vigente que aplica y el borrador de la DDRISS, ordenadas por nombre', async () => {
    const res = await consultar('/esquemas-captura');
    expect(res.status).toBe(200);

    const [activas] = await pool.query('SELECT codigo FROM vacuna WHERE activa = TRUE');
    expect(res.body.map((f) => f.vacuna.codigo).sort()).toEqual(activas.map((v) => v.codigo).sort());
    const nombres = res.body.map((f) => f.vacuna.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));

    const hexa = res.body.find((f) => f.vacuna.codigo === 'HEXA');
    expect(hexa.vigente).toEqual({
      id: HEXA_V2,
      version: 2,
      territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
      vigenciaDesde: '2026-10-01',
    });
    expect(ddrissUsuario).toBe('DDRISS_SM');
    expect(hexa.borrador).toMatchObject({ version: 3 });
    expect(hexa.borrador.creadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // El borrador de otra DDRISS no se ve: ZVT_HU16 solo tiene su vigente nacional.
    const prueba = res.body.find((f) => f.vacuna.codigo === VACUNA);
    expect(prueba).toEqual({
      vacuna: { id: vacunaId, codigo: VACUNA, nombre: 'vitest-hu16 Vacuna', activa: true },
      vigente: {
        id: ids.vigenteNacional.toString(),
        version: 1,
        territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
        vigenciaDesde: '2026-10-01',
      },
      borrador: null,
    });
    expect(res.body.some((f) => f.vacuna.codigo === VACUNA_INACTIVA)).toBe(false);
  });

  it('el vigente de la DDRISS del usuario prevalece sobre el nacional', async () => {
    const propio = new ObjectId();
    const esquemas = (await obtenerDb()).collection('esquemas_captura');
    await esquemas.insertOne(
      esquemaDePrueba({
        _id: propio,
        version: 3,
        territorio: { nivel: 'DDRISS', ddriss_codigo: ddrissUsuario },
        estado: 'VIGENTE',
        vigencia: { desde: new Date('2026-10-01'), hasta: null },
      }),
    );
    try {
      const res = await consultar('/esquemas-captura');
      const prueba = res.body.find((f) => f.vacuna.codigo === VACUNA);
      expect(prueba.vigente).toEqual({
        id: propio.toString(),
        version: 3,
        territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
        vigenciaDesde: '2026-10-01',
      });
    } finally {
      await esquemas.deleteOne({ _id: propio });
    }
  });

  it('un parámetro responde 400', async () => {
    const res = await consultar('/esquemas-captura?estado=VIGENTE');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'Parámetro no permitido: estado.' });
  });
});

describe('GET /esquemas-captura/{id}', () => {
  it('un vigente trae su vigencia y todo en camelCase', async () => {
    const res = await consultar(`/esquemas-captura/${ids.vigenteNacional}`);
    expect(res.status).toBe(200);
    expect(clavesConGuionBajo(res.body)).toEqual([]);
    expect(res.body).toMatchObject({
      id: ids.vigenteNacional.toString(),
      vacuna: { id: vacunaId, codigo: VACUNA },
      version: 1,
      territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
      estado: 'VIGENTE',
      vigencia: { desde: '2026-10-01', hasta: null },
      versionAnteriorId: null,
      basadoEn: null,
      procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
      desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta: null }],
      reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: 1, severidadOverride: null }],
      presentacion: { filas: 'dosis', columnas: ['seccion'], subtablaPor: 'procedencia' },
      creadoPor: 1,
    });
    expect(res.body.dosis).toEqual([
      { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
      {
        codigo: 'R1',
        etiqueta: 'Primer refuerzo',
        desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'], etiqueta: null }],
      },
    ]);
    expect(res.body.secciones[1]).toEqual({
      codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: 2, grupoEdad: '1_A_5', dosis: ['D1', 'R1'],
    });
    expect(res.body.camposAdicionales[0]).toMatchObject({ clave: 'total_dosis_declarado', tipo: 'entero', minimo: 0 });
  });

  it('trae la etiqueta de la desagregación general y de una dosis cuando el documento la tiene', async () => {
    const id = new ObjectId();
    const doc = esquemaDePrueba({
      _id: id,
      version: 3,
      territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
      estado: 'HISTORICO',
      vigencia: { desde: new Date('2026-01-01'), hasta: new Date('2026-09-30') },
    });
    doc.dimensiones.desagregacion[0].etiqueta = 'Edad del vacunado';
    doc.dimensiones.dosis[1].desagregacion[0].etiqueta = 'Edad del refuerzo';
    const db = await obtenerDb();
    await db.collection('esquemas_captura').insertOne(doc);
    try {
      const res = await consultar(`/esquemas-captura/${id}`);
      expect(res.status).toBe(200);
      expect(res.body.desagregacion).toEqual([
        { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta: 'Edad del vacunado' },
      ]);
      expect(res.body.dosis[0].desagregacion).toBeNull();
      expect(res.body.dosis[1].desagregacion).toEqual([
        { dimension: 'grupo_edad', valores: ['1_A_5'], etiqueta: 'Edad del refuerzo' },
      ]);
    } finally {
      await db.collection('esquemas_captura').deleteOne({ _id: id });
    }
  });

  it('un borrador de la DDRISS trae vigencia null', async () => {
    const lista = await consultar('/esquemas-captura');
    const { borrador } = lista.body.find((f) => f.vacuna.codigo === 'HEXA');
    const res = await consultar(`/esquemas-captura/${borrador.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      estado: 'BORRADOR',
      vigencia: null,
      territorio: { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' },
      basadoEn: { esquemaId: HEXA_V2, version: 2 },
    });
  });

  it.each([
    ['de otra DDRISS', () => ids.borradorOtra.toString()],
    ['inexistente', () => new ObjectId().toString()],
    ['con un id que no es un ObjectId', () => 'abc'],
  ])('un esquema %s responde 404', async (_, id) => {
    const res = await consultar(`/esquemas-captura/${id()}`);
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });
});

describe('permisos', () => {
  it('sin ESQUEMA_CONSULTAR, las dos consultas responden 403', async () => {
    const lista = await consultar('/esquemas-captura', tokenEpidemiologia);
    const uno = await consultar(`/esquemas-captura/${ids.vigenteNacional}`, tokenEpidemiologia);
    expect(lista.status).toBe(403);
    expect(uno.status).toBe(403);
  });
});

describe('POST /esquemas-captura', () => {
  afterEach(borrarEsquemasDeLaDdriss);

  // El cuerpo de una copia del vigente nacional de prueba, tal como lo armaría el editor.
  const copia = () => ({
    vacunaId,
    copiaDe: ids.vigenteNacional.toString(),
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: false },
    dosis: [
      { codigo: 'D1', desagregacion: null },
      { codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
    ],
    desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
    secciones: [
      { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1'] },
      { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D1', 'R1'] },
    ],
  });

  it('crea un borrador vacío de la DDRISS con lo que calcula el backend y una fila CREAR', async () => {
    const res = await enviar('post', '/esquemas-captura', vacio());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      vacuna: { id: vacunaId, codigo: VACUNA, nombre: 'vitest-hu16 Vacuna' },
      version: 3,
      territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
      estado: 'BORRADOR',
      vigencia: null,
      versionAnteriorId: null,
      basadoEn: null,
      procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: true },
      dosis: [
        { codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: null },
        { codigo: 'D2', etiqueta: 'Segunda dosis', desagregacion: null },
      ],
      desagregacion: [
        { dimension: DIMENSION, valores: ['A'] },
        { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
      ],
      secciones: [
        { codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1', 'D2'] },
        { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: 2, grupoEdad: '1_A_5', dosis: ['D2'] },
      ],
      camposAdicionales: [],
      reglas: [
        { codigo: 'CAMPOS_COMPLETOS', version: 1 },
        { codigo: 'DIMENSIONES_VALIDAS', version: 1 },
        { codigo: 'NO_NEGATIVO', version: 1 },
      ],
      presentacion: { filas: 'dosis', columnas: ['seccion', DIMENSION] },
    });

    const crudo = await documentoCrudo(res.body.id);
    for (const entero of [crudo.version, crudo.vacuna.id, crudo.secciones[0].orden, crudo.reglas[0].version, crudo.auditoria.creado_por]) {
      expect(entero).toBeInstanceOf(Int32);
    }
    const [anio, mes] = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date()).split('-').map(Number);
    expect(crudo.vigencia).toEqual({ desde: new Date(Date.UTC(anio, mes, 1)), hasta: null });

    const filas = await filasBitacora(res.body.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ accion: 'CREAR', anteriores: null, nuevos: { version: 3, estado: 'BORRADOR', vacuna: { codigo: VACUNA } } });
  });

  it('una copia del vigente nacional guarda basadoEn y conserva sus reglas, campos adicionales y subtabla_por', async () => {
    const res = await enviar('post', '/esquemas-captura', copia());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      basadoEn: { esquemaId: ids.vigenteNacional.toString(), version: 1 },
      versionAnteriorId: null,
      procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: false },
      reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: 1 }],
      presentacion: { filas: 'dosis', columnas: ['seccion'], subtablaPor: 'procedencia' },
    });
    expect(res.body.camposAdicionales).toEqual([
      { clave: 'total_dosis_declarado', etiqueta: 'Total declarado', tipo: 'entero', requerido: true, minimo: 0, maximo: null },
    ]);
    const crudo = await documentoCrudo(res.body.id);
    expect(crudo.basado_en.version).toBeInstanceOf(Int32);
    expect(crudo.campos_adicionales[0].minimo).toBeInstanceOf(Int32);
  });

  it('una segunda alta de la misma vacuna responde 409 BORRADOR_EXISTENTE', async () => {
    expect((await enviar('post', '/esquemas-captura', vacio())).status).toBe(201);
    const res = await enviar('post', '/esquemas-captura', copia());
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'BORRADOR_EXISTENTE',
      mensaje: 'Ya existe un borrador del esquema de vitest-hu16 Vacuna para su DDRISS.',
    });
  });

  it('copiaDe de un esquema que no es el vigente que aplica responde 409 BASE_DESACTUALIZADA', async () => {
    const res = await enviar('post', '/esquemas-captura', { ...copia(), copiaDe: ids.borradorOtra.toString() });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'BASE_DESACTUALIZADA',
      mensaje: 'El esquema vigente de vitest-hu16 Vacuna cambió; vuelva a abrir la copia.',
    });
  });

  it.each([
    ['la dosis D3 está inactiva', () => vacio({ dosis: [{ codigo: 'D1' }, { codigo: 'D2' }, { codigo: 'D3' }] }), M.dosisInactiva('D3', VACUNA)],
    [
      'el valor B de la dimensión está inactivo',
      () => vacio({ desagregacion: [{ dimension: DIMENSION, valores: ['A', 'B'] }, { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }] }),
      M.valorInactivo('B', DIMENSION),
    ],
    ['la vacuna está inactiva', () => vacio({ vacunaId: vacunaInactivaId }), M.vacunaInactiva],
  ])('responde 422 ESQUEMA_INVALIDO si %s', async (_, cuerpo, mensaje) => {
    const res = await enviar('post', '/esquemas-captura', cuerpo());
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ codigo: 'ESQUEMA_INVALIDO', mensaje });
    expect(await borradoresDeLaDdriss()).toEqual([]);
  });

  it.each([
    ['un campo no permitido', () => ({ ...vacio(), reglas: [] }), 'Campo no permitido: reglas.'],
    ['una dosis repetida', () => vacio({ dosis: [{ codigo: 'D1' }, { codigo: 'D1' }] }), 'La dosis D1 está repetida.'],
    [
      'un modo de procedencia inválido',
      () => vacio({ procedencia: { modo: 'OTRO' } }),
      'El modo de procedencia debe ser MUNICIPIO_DETALLADO o PROPIO_Y_OTROS.',
    ],
    [
      'un título de sección vacío',
      () => vacio({ secciones: [{ titulo: '  ', grupoEdad: 'MENOR_1', dosis: ['D1'] }] }),
      'El título de la sección debe tener entre 1 y 60 caracteres.',
    ],
    ['un vacunaId que no es un número', () => vacio({ vacunaId: '5' }), 'vacunaId debe ser un número entero positivo.'],
  ])('responde 400 con %s', async (_, cuerpo, mensaje) => {
    const res = await enviar('post', '/esquemas-captura', cuerpo());
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('una vacuna inexistente responde 404', async () => {
    const res = await enviar('post', '/esquemas-captura', vacio({ vacunaId: 65000 }));
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('dos altas en paralelo de la misma vacuna: una 201 y otra 409, y queda un solo borrador', async () => {
    const respuestas = await Promise.all([
      enviar('post', '/esquemas-captura', vacio()),
      enviar('post', '/esquemas-captura', vacio()),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409).body.error.codigo).toBe('BORRADOR_EXISTENTE');
    expect(await borradoresDeLaDdriss()).toHaveLength(1);
  });

  it('si otra DDRISS ocupa la misma versión entre la lectura y la escritura, responde 409 y no deja la fila', async () => {
    const antes = await filasDeLaVacuna('CREAR');
    const original = Collection.prototype.insertOne;
    const insertar = vi.spyOn(Collection.prototype, 'insertOne').mockImplementationOnce(async function (doc, ...resto) {
      await original.call(this, { ...doc, _id: new ObjectId(), territorio: { nivel: 'DDRISS', ddriss_codigo: 'ZVT_TERCERA' } });
      return original.call(this, doc, ...resto);
    });
    try {
      const res = await enviar('post', '/esquemas-captura', vacio());
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        codigo: 'BORRADOR_EXISTENTE',
        mensaje: 'Se creó otra versión de vitest-hu16 Vacuna al mismo tiempo; intente de nuevo.',
      });
    } finally {
      insertar.mockRestore();
      await (await obtenerDb()).collection('esquemas_captura').deleteMany({ 'territorio.ddriss_codigo': 'ZVT_TERCERA' });
    }
    expect(await borradoresDeLaDdriss()).toEqual([]);
    expect(await filasDeLaVacuna('CREAR')).toBe(antes);
  });

  it('si MongoDB falla, no queda el borrador ni su fila de bitácora', async () => {
    const antes = await filasDeLaVacuna('CREAR');
    const insertar = vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new Error('Falla simulada'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await enviar('post', '/esquemas-captura', vacio());
      expect(res.status).toBe(500);
    } finally {
      insertar.mockRestore();
      registro.mockRestore();
    }
    expect(await borradoresDeLaDdriss()).toEqual([]);
    expect(await filasDeLaVacuna('CREAR')).toBe(antes);
  });

  it('el Revisor también crea borradores', async () => {
    const res = await enviar('post', '/esquemas-captura', vacio(), tokenRevisor);
    expect(res.status).toBe(201);
  });

  it('sin ESQUEMA_CREAR responde 403', async () => {
    const res = await enviar('post', '/esquemas-captura', vacio(), tokenEpidemiologia);
    expect(res.status).toBe(403);
  });
});

describe('PUT y DELETE /esquemas-captura/{id}', () => {
  afterEach(borrarEsquemasDeLaDdriss);

  // El PUT lleva el mismo contenido que el POST, sin vacunaId.
  const contenido = (cambios = {}) => {
    const cuerpo = vacio(cambios);
    delete cuerpo.vacunaId;
    return cuerpo;
  };
  const crear = async () => {
    const res = await enviar('post', '/esquemas-captura', vacio());
    expect(res.status).toBe(201);
    return res.body.id;
  };
  const otroTitulo = () =>
    contenido({
      secciones: [
        { titulo: 'Menores de 1 año', grupoEdad: 'MENOR_1', dosis: ['D1', 'D2'] },
        { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D2'] },
      ],
    });

  it('un PUT que cambia una sección deja ACTUALIZAR y no toca basadoEn, reglas, auditoría ni la vigencia', async () => {
    const id = await crear();
    const antes = await documentoCrudo(id);
    const res = await enviar('put', `/esquemas-captura/${id}`, otroTitulo());
    expect(res.status).toBe(200);
    expect(res.body.secciones[0]).toMatchObject({ codigo: 'MENOR_1', titulo: 'Menores de 1 año', orden: 1 });

    const despues = await documentoCrudo(id);
    for (const campo of ['basado_en', 'reglas', 'campos_adicionales', 'auditoria', 'vigencia', 'version', 'version_anterior_id']) {
      expect(despues[campo]).toEqual(antes[campo]);
    }
    expect(despues.secciones[0].orden).toBeInstanceOf(Int32);

    const filas = await filasBitacora(id);
    expect(filas.map((f) => f.accion)).toEqual(['CREAR', 'ACTUALIZAR']);
    expect(filas[1].anteriores.secciones[0].titulo).toBe('< 1 año');
    expect(filas[1].nuevos.secciones[0].titulo).toBe('Menores de 1 año');
    expect(Object.keys(filas[1].nuevos)).toEqual(['secciones']);
  });

  it('un PUT sin cambios responde 200 y no deja filas', async () => {
    const id = await crear();
    // El mismo contenido con otro orden en el cuerpo: se guarda igual.
    const res = await enviar('put', `/esquemas-captura/${id}`, contenido());
    expect(res.status).toBe(200);
    expect((await filasBitacora(id)).map((f) => f.accion)).toEqual(['CREAR']);
  });

  it('un PUT conserva la etiqueta de una desagregación, y null o vacía no se guarda', async () => {
    const id = await crear();
    const conEtiqueta = contenido({
      desagregacion: [
        { dimension: DIMENSION, valores: ['A'], etiqueta: '  Condición   especial ' },
        { dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'], etiqueta: null },
      ],
    });
    const res = await enviar('put', `/esquemas-captura/${id}`, conEtiqueta);
    expect(res.status).toBe(200);
    expect(res.body.desagregacion).toEqual([
      { dimension: DIMENSION, valores: ['A'], etiqueta: 'Condición especial' },
      { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta: null },
    ]);
    const crudo = await documentoCrudo(id);
    expect(crudo.dimensiones.desagregacion[0].etiqueta).toBe('Condición especial');
    expect('etiqueta' in crudo.dimensiones.desagregacion[1]).toBe(false);

    // Reenviar lo que devolvió la API (como hace el editor) no cambia nada.
    const reenvio = await enviar('put', `/esquemas-captura/${id}`, {
      procedencia: res.body.procedencia,
      dosis: res.body.dosis.map(({ codigo, desagregacion }) => ({ codigo, desagregacion })),
      desagregacion: res.body.desagregacion,
      secciones: res.body.secciones.map(({ titulo, grupoEdad, dosis }) => ({ titulo, grupoEdad, dosis })),
    });
    expect(reenvio.status).toBe(200);
    expect((await filasBitacora(id)).map((f) => f.accion)).toEqual(['CREAR', 'ACTUALIZAR']);

    const vacia = contenido({
      desagregacion: [
        { dimension: DIMENSION, valores: ['A'], etiqueta: '   ' },
        { dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'] },
      ],
    });
    const sinEtiqueta = await enviar('put', `/esquemas-captura/${id}`, vacia);
    expect(sinEtiqueta.body.desagregacion[0].etiqueta).toBeNull();
  });

  it.each([
    ['no es texto', 5],
    ['tiene más de 120 caracteres', 'x'.repeat(121)],
  ])('un PUT con una etiqueta que %s responde 400', async (_, etiqueta) => {
    const id = await crear();
    const res = await enviar(
      'put',
      `/esquemas-captura/${id}`,
      contenido({ desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta }] }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      codigo: 'ENTRADA_INVALIDA',
      mensaje: 'La etiqueta de grupo_edad debe ser un texto de hasta 120 caracteres.',
    });
  });

  it('un PUT que agrega una dimensión recalcula la presentación', async () => {
    const id = await crear();
    const res = await enviar(
      'put',
      `/esquemas-captura/${id}`,
      contenido({ desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }] }),
    );
    expect(res.status).toBe(200);
    expect(res.body.presentacion).toEqual({ filas: 'dosis', columnas: ['seccion'] });
  });

  it('un PUT con vacunaId responde 400 y uno incoherente responde 422', async () => {
    const id = await crear();
    const conVacuna = await enviar('put', `/esquemas-captura/${id}`, { ...contenido(), vacunaId });
    expect(conVacuna.status).toBe(400);
    expect(conVacuna.body.error.mensaje).toBe('Campo no permitido: vacunaId.');

    const incoherente = await enviar('put', `/esquemas-captura/${id}`, contenido({ dosis: [{ codigo: 'D1' }, { codigo: 'D2' }, { codigo: 'D3' }] }));
    expect(incoherente.status).toBe(422);
    expect(incoherente.body.error).toEqual({ codigo: 'ESQUEMA_INVALIDO', mensaje: M.dosisInactiva('D3', VACUNA) });
  });

  it.each([
    ['put', () => contenido()],
    ['delete', () => undefined],
  ])('%s sobre el vigente nacional responde 409 y sobre un borrador de otra DDRISS responde 404', async (metodo, cuerpo) => {
    const nacional = await enviar(metodo, `/esquemas-captura/${ids.vigenteNacional}`, cuerpo());
    expect(nacional.status).toBe(409);
    expect(nacional.body.error.codigo).toBe('ESQUEMA_NO_EDITABLE');
    const otra = await enviar(metodo, `/esquemas-captura/${ids.borradorOtra}`, cuerpo());
    expect(otra.status).toBe(404);
  });

  it('si el borrador se publica entre la lectura y la escritura, el PUT responde 409 y no deja la fila', async () => {
    const id = await crear();
    const original = Collection.prototype.updateOne;
    const actualizar = vi.spyOn(Collection.prototype, 'updateOne').mockImplementationOnce(async function (filtro, ...resto) {
      await original.call(this, { _id: new ObjectId(id) }, { $set: { estado: 'VIGENTE' } });
      return original.call(this, filtro, ...resto);
    });
    try {
      const res = await enviar('put', `/esquemas-captura/${id}`, otroTitulo());
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('ESQUEMA_NO_EDITABLE');
    } finally {
      actualizar.mockRestore();
    }
    expect((await filasBitacora(id)).map((f) => f.accion)).toEqual(['CREAR']);
    expect((await documentoCrudo(id)).secciones[0].titulo).toBe('< 1 año');
  });

  it('DELETE responde 204, borra el borrador y deja ELIMINAR con el documento completo', async () => {
    const id = await crear();
    const res = await enviar('delete', `/esquemas-captura/${id}`);
    expect(res.status).toBe(204);
    expect(await documentoCrudo(id)).toBeNull();
    const filas = await filasBitacora(id);
    expect(filas.map((f) => f.accion)).toEqual(['CREAR', 'ELIMINAR']);
    expect(filas[1].nuevos).toBeNull();
    expect(filas[1].anteriores).toMatchObject({ id, version: 3, estado: 'BORRADOR', vacuna: { codigo: VACUNA } });
    expect(filas[1].anteriores.secciones).toHaveLength(2);
  });

  it('sin ESQUEMA_EDITAR, PUT y DELETE responden 403', async () => {
    const id = await crear();
    expect((await enviar('put', `/esquemas-captura/${id}`, contenido(), tokenEpidemiologia)).status).toBe(403);
    expect((await enviar('delete', `/esquemas-captura/${id}`, undefined, tokenEpidemiologia)).status).toBe(403);
    expect(await documentoCrudo(id)).not.toBeNull();
  });
});

// Las reglas se prueban sin escribir en las bases, con una vacuna y un catálogo armados aquí.
describe('reglas de coherencia', () => {
  const valor = (codigo, orden, activo = true) => ({ codigo, etiqueta: codigo, orden, activo });
  const largo = (n) => `${'d'.repeat(29)}${n}`;
  const referencias = () => ({
    vacuna: { id: 1, codigo: 'ZVT', nombre: 'Vacuna', activa: true },
    dosis: [
      { codigo: 'D1', nombre: 'Primera dosis', orden: 1, activa: true },
      { codigo: 'D2', nombre: 'Segunda dosis', orden: 2, activa: true },
      { codigo: 'D3', nombre: 'Tercera dosis', orden: 3, activa: false },
      { codigo: 'R1', nombre: 'Primer refuerzo', orden: 4, activa: true },
    ],
    dimensiones: [
      { codigo: 'grupo_edad', activo: true, valores: [valor('MENOR_1', 1), valor('1_A_5', 2), valor('INACT', 3, false)] },
      { codigo: 'sexo', activo: true, valores: [valor('F', 1), valor('M', 2)] },
      { codigo: 'apagada', activo: false, valores: [valor('A', 1)] },
      // Cinco dimensiones de 30 caracteres con un valor de 30: su combinación pasa de 255.
      ...[1, 2, 3, 4, 5].map((n) => ({ codigo: largo(n), activo: true, valores: [valor('V'.repeat(30), 1)] })),
    ],
  });
  const valido = () => ({
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
    dosis: [
      { codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
      { codigo: 'D1', desagregacion: null },
    ],
    desagregacion: [
      { dimension: 'sexo', valores: ['M', 'F'] },
      { dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'] },
    ],
    secciones: [
      { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1'] },
      { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['R1', 'D1'] },
    ],
  });
  // Sin desagregación por edad: una sola sección sin grupo.
  const sinEdad = (c) => {
    c.desagregacion = [{ dimension: 'sexo', valores: ['F'] }];
    c.dosis = [{ codigo: 'D1', desagregacion: null }];
    c.secciones = [{ titulo: 'General', grupoEdad: null, dosis: ['D1'] }];
  };
  const dosisDe = (c, codigo) => c.dosis.find((d) => d.codigo === codigo);

  it('un esquema válido sale con las dosis en el orden de MySQL, los valores en el del catálogo y las secciones numeradas', () => {
    const { dimensiones, secciones } = revisarCoherencia(valido(), referencias());
    expect(dimensiones.dosis).toEqual([
      { codigo: 'D1', etiqueta: 'Primera dosis' },
      { codigo: 'R1', etiqueta: 'Primer refuerzo', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
    ]);
    expect(dimensiones.desagregacion).toEqual([
      { dimension: 'sexo', valores: ['F', 'M'] },
      { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
    ]);
    expect(dimensiones.procedencia).toEqual({ modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true });
    expect(secciones.map((s) => ({ ...s, orden: s.orden.value }))).toEqual([
      { codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupo_edad: 'MENOR_1', dosis: ['D1'] },
      { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: 2, grupo_edad: '1_A_5', dosis: ['D1', 'R1'] },
    ]);
    expect(secciones[0].orden).toBeInstanceOf(Int32);
  });

  it('sin grupo de edad, la única sección se llama GENERAL', () => {
    const contenido = valido();
    sinEdad(contenido);
    expect(revisarCoherencia(contenido, referencias()).secciones[0]).toMatchObject({ codigo: 'GENERAL', grupo_edad: null });
  });

  const masDimensionesLargas = (c) => {
    c.desagregacion.push(...[1, 2, 3, 4, 5].map((n) => ({ dimension: largo(n), valores: ['V'.repeat(30)] })));
  };

  it.each([
    ['la vacuna está inactiva', (c, r) => { r.vacuna.activa = false; }, M.vacunaInactiva],
    ['no hay dosis', (c) => { c.dosis = []; }, M.sinDosis],
    ['una dosis está inactiva', (c) => { c.dosis.push({ codigo: 'D3', desagregacion: null }); }, M.dosisInactiva('D3', 'ZVT')],
    ['una dosis no existe', (c) => { c.dosis.push({ codigo: 'D9', desagregacion: null }); }, M.dosisInactiva('D9', 'ZVT')],
    [
      'una dimensión está inactiva',
      (c) => { c.desagregacion.push({ dimension: 'apagada', valores: ['A'] }); },
      M.dimensionInactiva('apagada'),
    ],
    [
      'una dimensión no existe',
      (c) => { c.desagregacion.push({ dimension: 'no_existe', valores: ['A'] }); },
      M.dimensionInactiva('no_existe'),
    ],
    ['un valor está inactivo', (c) => { c.desagregacion[1].valores.push('INACT'); }, M.valorInactivo('INACT', 'grupo_edad')],
    ['un valor no existe', (c) => { c.desagregacion[0].valores.push('X'); }, M.valorInactivo('X', 'sexo')],
    [
      'la desagregación de una dosis usa un valor inactivo',
      (c) => { dosisDe(c, 'R1').desagregacion[0].valores.push('INACT'); },
      M.valorInactivo('INACT', 'grupo_edad'),
    ],
    [
      'la desagregación de una dosis no trae grupo de edad',
      (c) => { dosisDe(c, 'R1').desagregacion = [{ dimension: 'sexo', valores: ['F'] }]; },
      M.dosisSinEdad('R1'),
    ],
    ['una dosis sin desagregar en una vacuna por edad', (c) => { dosisDe(c, 'R1').desagregacion = []; }, M.dosisSinEdad('R1')],
    [
      'la desagregación de una dosis trae grupo de edad y la vacuna no',
      (c) => {
        sinEdad(c);
        c.dosis[0].desagregacion = [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }];
      },
      M.dosisConEdad('D1'),
    ],
    ['no hay secciones', (c) => { c.secciones = []; }, M.sinSecciones],
    [
      'una sección usa una dosis que no está en el esquema',
      (c) => { c.secciones[0].dosis.push('D2'); },
      M.dosisAjena('< 1 año', 'D2'),
    ],
    ['una dosis no está en ninguna sección', (c) => { c.dosis.push({ codigo: 'D2', desagregacion: null }); }, M.dosisSinSeccion('D2')],
    ['una sección no tiene grupo de edad', (c) => { c.secciones[0].grupoEdad = null; }, M.seccionSinGrupo('< 1 año')],
    ['dos secciones usan el mismo grupo', (c) => { c.secciones[1].grupoEdad = 'MENOR_1'; }, M.grupoRepetido('MENOR_1')],
    [
      'una dosis no admite el grupo de su sección',
      (c) => { c.secciones[0].dosis.push('R1'); },
      M.grupoNoPermitido('R1', 'MENOR_1', '< 1 año'),
    ],
    [
      'sin grupo de edad hay dos secciones',
      (c) => {
        sinEdad(c);
        c.secciones.push({ titulo: 'Otra', grupoEdad: null, dosis: ['D1'] });
      },
      M.unaSeccion,
    ],
    [
      'sin grupo de edad la sección tiene grupo',
      (c) => {
        sinEdad(c);
        c.secciones[0].grupoEdad = 'MENOR_1';
      },
      M.seccionConGrupo('General'),
    ],
    ['la combinación de una dosis pasa de 255 caracteres', masDimensionesLargas, M.combinacionLarga('D1')],
  ])('responde 422 si %s', (_, cambiar, mensaje) => {
    const contenido = valido();
    const datos = referencias();
    cambiar(contenido, datos);
    expect(() => revisarCoherencia(contenido, datos)).toThrow(
      expect.objectContaining({ status: 422, codigo: 'ESQUEMA_INVALIDO', message: mensaje }),
    );
  });

  // Los vigentes nacionales del 02 y del 04, pasados al formato del cuerpo, con la vacuna y el catálogo reales.
  it.each(['HEXA', 'BCG', 'VPH', 'TD', 'POLIO', 'ROTA', 'SPR', 'NEUMO'])(
    'el esquema vigente de %s de la semilla cumple las reglas',
    async (codigo) => {
      const doc = await (await obtenerDb())
        .collection('esquemas_captura')
        .findOne({ 'vacuna.codigo': codigo, estado: 'VIGENTE', 'territorio.nivel': 'NACIONAL' });
      const { dimensiones } = doc;
      const cuerpo = {
        procedencia: {
          modo: dimensiones.procedencia.modo,
          permiteNoEspecificado: dimensiones.procedencia.permite_no_especificado,
        },
        dosis: dimensiones.dosis.map((d) => ({ codigo: d.codigo, desagregacion: d.desagregacion ?? null })),
        desagregacion: dimensiones.desagregacion,
        secciones: doc.secciones.map((s) => ({ titulo: s.titulo, grupoEdad: s.grupo_edad ?? null, dosis: s.dosis })),
      };
      const datos = await cargarReferencias(doc.vacuna.id);
      expect(() => revisarCoherencia(leerContenido(cuerpo), datos)).not.toThrow();
    },
  );
});
