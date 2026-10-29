import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Collection, Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas crean por SQL la vacuna ZVT_HU17, los 12 meses de 2090 en periodo (la vigencia no admite meses
// pasados) y junio de 2018 (un mes pasado que está en el calendario), y en MongoDB un vigente nacional de ZVT_HU17 y
// un borrador de la DDRISS ficticia ZVT_OTRA17. Todo se borra al inicio y al final. No tocan los esquemas de la
// semilla ni el borrador Hexavalente v3 del 04.
const VACUNA = 'ZVT_HU17';
const DDRISS_OTRA = 'ZVT_OTRA17';
const ANIO_PRUEBA = 2090;
const MES_PASADO = { anio: 2018, mes: 6 };
const MOTIVO = 'vitest-hu17 Cambio de prueba.';
const HEXA_V1 = '66f8a1c2e4b0a1b2c3d4e5f5';
const HEXA_V2 = '66f8a1c2e4b0a1b2c3d4e5f6';

let vacunaId;
let ddrissUsuario;
let ddrissIdUsuario;
const ids = { vigenteNacional: new ObjectId(), borradorOtra: new ObjectId() };

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: null,
  publicado_en: null,
  motivo_cambio: null,
});

function esquemaDePrueba({ _id, version, territorio, estado, vigencia }) {
  return {
    _id,
    vacuna: { id: new Int32(vacunaId), codigo: VACUNA, nombre: 'vitest-hu17 Vacuna' },
    version: new Int32(version),
    territorio,
    estado,
    vigencia,
    version_anterior_id: null,
    basado_en: null,
    dimensiones: {
      dosis: [
        { codigo: 'D1', etiqueta: 'Primera dosis' },
        { codigo: 'D2', etiqueta: 'Segunda dosis' },
      ],
      procedencia: { modo: 'PROPIO_Y_OTROS', permite_no_especificado: true },
      desagregacion: [],
    },
    secciones: [
      { codigo: 'GENERAL', titulo: 'General', orden: new Int32(1), grupo_edad: null, dosis: ['D1', 'D2'] },
    ],
    campos_adicionales: [],
    reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: new Int32(1) }],
    presentacion: { filas: 'dosis', columnas: [] },
    auditoria: auditoria(),
  };
}

async function limpiar() {
  await (await obtenerDb()).collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $regex: `^${VACUNA}` } });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO_PRUEBA]);
  await pool.query('DELETE FROM periodo WHERE anio = ? AND mes = ?', [MES_PASADO.anio, MES_PASADO.mes]);
}

async function preparar() {
  const [vacuna] = await pool.query("INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, 'vitest-hu17 Vacuna', TRUE)", [
    VACUNA,
  ]);
  vacunaId = vacuna.insertId;
  await pool.query(
    `INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES
       (?, 'D1', 'Primera dosis', 1, TRUE), (?, 'D2', 'Segunda dosis', 2, TRUE)`,
    [vacunaId, vacunaId],
  );
  const meses = Array.from({ length: 12 }, (_, i) => {
    const mes = String(i + 1).padStart(2, '0');
    const ultimo = new Date(Date.UTC(ANIO_PRUEBA, i + 1, 0)).getUTCDate();
    return [ANIO_PRUEBA, i + 1, `${ANIO_PRUEBA}-${mes}-01`, `${ANIO_PRUEBA}-${mes}-${ultimo}`];
  });
  meses.push([MES_PASADO.anio, MES_PASADO.mes, '2018-06-01', '2018-06-30']);
  await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES ?', [meses]);

  await (await obtenerDb()).collection('esquemas_captura').insertMany([
    esquemaDePrueba({
      _id: ids.vigenteNacional,
      version: 1,
      territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
      estado: 'VIGENTE',
      vigencia: { desde: new Date('2026-01-01'), hasta: null },
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
const enviar = (ruta, cuerpo, credencial = token) =>
  request(app).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);
const publicar = (id, cuerpo, credencial) => enviar(`/esquemas-captura/${id}/publicar`, cuerpo, credencial);

// Un borrador vacío de ZVT_HU17 para la DDRISS del usuario, creado con POST (SPEC 19).
async function crearBorrador(credencial = token) {
  const res = await enviar(
    '/esquemas-captura',
    {
      vacunaId,
      procedencia: { modo: 'PROPIO_Y_OTROS' },
      dosis: [{ codigo: 'D1' }, { codigo: 'D2' }],
      desagregacion: [],
      secciones: [{ titulo: 'General', grupoEdad: null, dosis: ['D1', 'D2'] }],
    },
    credencial,
  );
  if (res.status !== 201) throw new Error(`No se pudo crear el borrador (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body.id;
}

// Sin promoteValues el driver no convierte los enteros a number: se ve si se guardaron como int.
const documentoCrudo = async (id) =>
  (await obtenerDb()).collection('esquemas_captura').findOne({ _id: new ObjectId(id) }, { promoteValues: false });
const vigentesDeLaDdriss = async () =>
  (await obtenerDb())
    .collection('esquemas_captura')
    .countDocuments({ 'vacuna.codigo': VACUNA, estado: 'VIGENTE', 'territorio.ddriss_codigo': ddrissUsuario });

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

async function motivoGuardado(id) {
  const doc = await (await obtenerDb()).collection('esquemas_captura').findOne({ _id: new ObjectId(id) });
  return doc.auditoria.motivo_cambio ?? null;
}

async function idDeVacuna(codigo) {
  const [[vacuna]] = await pool.query('SELECT id FROM vacuna WHERE codigo = ?', [codigo]);
  return vacuna.id;
}

beforeAll(async () => {
  await limpiar();
  await preparar();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  ddrissIdUsuario = res.body.usuario.empleado.ddrissId;
  const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = ?', [ddrissIdUsuario]);
  ddrissUsuario = ddriss.codigo;
  tokenEpidemiologia = await tokenDeLaSemilla('EPIDEMIOLOGIA');
  tokenRevisor = await tokenDeLaSemilla('REVISOR');
});

afterAll(limpiar);

describe('GET /esquemas-captura/historial', () => {
  it('trae las versiones nacionales y de la DDRISS de la más nueva a la más vieja, con los reportes de la DDRISS', async () => {
    const hexaId = await idDeVacuna('HEXA');
    const res = await consultar(`/esquemas-captura/historial?vacunaId=${hexaId}`);
    expect(res.status).toBe(200);
    expect(res.body.vacuna).toEqual({ id: hexaId, codigo: 'HEXA', nombre: 'Hexavalente', activa: true });
    expect(ddrissUsuario).toBe('DDRISS_SM');
    expect(res.body.versiones.map((v) => [v.version, v.estado, v.territorio.nivel])).toEqual([
      [3, 'BORRADOR', 'DDRISS'],
      [2, 'VIGENTE', 'NACIONAL'],
      [1, 'HISTORICO', 'NACIONAL'],
    ]);

    const [borrador, v2, v1] = res.body.versiones;
    expect(borrador).toMatchObject({
      vigencia: null,
      basadoEn: { esquemaId: HEXA_V2, version: 2 },
      publicadoPor: null,
      publicadoEn: null,
      reportes: 0,
    });
    // Un borrador devuelve el motivo que tenga guardado (el del 04 trae uno); el que crea el SPEC 19 no trae.
    expect(borrador.motivoCambio).toBe(await motivoGuardado(borrador.id));
    const [[publicador]] = await pool.query('SELECT nombre_usuario FROM usuario WHERE id = 1');
    expect(v2).toMatchObject({
      id: HEXA_V2,
      vigencia: { desde: '2026-10-01', hasta: null },
      versionAnteriorId: HEXA_V1,
      publicadoPor: { id: 1, nombreUsuario: publicador.nombre_usuario },
    });
    expect(v2.motivoCambio).toMatch(/1 a < 6 años/);
    expect(v2.publicadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    // Los reportes de la semilla guardan Hexavalente v1: la versión que usaron se sigue contando.
    const [[{ esperados }]] = await pool.query(
      `SELECT COUNT(*) AS esperados FROM reporte_vacuna rv
         JOIN reporte_produccion rp ON rp.id = rv.reporte_id
         JOIN establecimiento e ON e.id = rp.establecimiento_id
        WHERE rv.esquema_mongo_id = ? AND e.ddriss_id = ?`,
      [HEXA_V1, ddrissIdUsuario],
    );
    expect(v1).toMatchObject({ id: HEXA_V1, vigencia: { desde: '2026-01-01', hasta: '2026-09-30' } });
    expect(v1.reportes).toBeGreaterThanOrEqual(1);
    expect(v1.reportes).toBe(Number(esperados));
    expect(Object.keys(v1).sort()).toEqual(
      [
        'id', 'version', 'territorio', 'estado', 'vigencia', 'versionAnteriorId', 'basadoEn', 'creadoEn',
        'publicadoPor', 'publicadoEn', 'motivoCambio', 'reportes',
      ].sort(),
    );
  });

  it('no trae las versiones de otras DDRISS', async () => {
    const res = await consultar(`/esquemas-captura/historial?vacunaId=${vacunaId}`);
    expect(res.status).toBe(200);
    expect(res.body.versiones).toHaveLength(1);
    expect(res.body.versiones[0]).toMatchObject({
      id: ids.vigenteNacional.toString(),
      version: 1,
      estado: 'VIGENTE',
      territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
      reportes: 0,
    });
  });

  it.each([
    ['sin vacunaId', ''],
    ['con un vacunaId no numérico', '?vacunaId=abc'],
    ['con vacunaId 0', '?vacunaId=0'],
    ['con vacunaId repetido', '?vacunaId=1&vacunaId=2'],
    ['con un parámetro desconocido', '?vacunaId=1&estado=VIGENTE'],
  ])('responde 400 %s', async (_, consulta) => {
    const res = await consultar(`/esquemas-captura/historial${consulta}`);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('una vacuna inexistente responde 404', async () => {
    const [[{ mayor }]] = await pool.query('SELECT MAX(id) AS mayor FROM vacuna');
    const res = await consultar(`/esquemas-captura/historial?vacunaId=${mayor + 1000}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La vacuna no existe.' });
  });

  it('sin ESQUEMA_CONSULTAR responde 403', async () => {
    const res = await consultar(`/esquemas-captura/historial?vacunaId=${vacunaId}`, tokenEpidemiologia);
    expect(res.status).toBe(403);
  });
});

describe('respuestas de los esquemas', () => {
  it('GET /esquemas-captura trae el inicio de la vigencia del vigente que aplica', async () => {
    const res = await consultar('/esquemas-captura');
    expect(res.status).toBe(200);
    const prueba = res.body.find((f) => f.vacuna.codigo === VACUNA);
    expect(prueba.vigente).toEqual({
      id: ids.vigenteNacional.toString(),
      version: 1,
      territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
      vigenciaDesde: '2026-01-01',
    });
  });

  it('GET /esquemas-captura/{id} trae la publicación de una versión publicada y null en un borrador', async () => {
    const [[publicador]] = await pool.query('SELECT nombre_usuario FROM usuario WHERE id = 1');
    const publicada = await consultar(`/esquemas-captura/${HEXA_V2}`);
    expect(publicada.status).toBe(200);
    expect(publicada.body.publicadoPor).toEqual({ id: 1, nombreUsuario: publicador.nombre_usuario });
    expect(publicada.body.publicadoEn).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(publicada.body.motivoCambio).toMatch(/1 a < 6 años/);

    const hexa = (await consultar('/esquemas-captura')).body.find((f) => f.vacuna.codigo === 'HEXA');
    const borrador = await consultar(`/esquemas-captura/${hexa.borrador.id}`);
    expect(borrador.body).toMatchObject({
      estado: 'BORRADOR',
      publicadoPor: null,
      publicadoEn: null,
      motivoCambio: await motivoGuardado(hexa.borrador.id),
    });
  });
});

// Los casos van en orden y comparten estado: A se publica primero, B lo reemplaza, C reemplaza a B y D queda para
// el fallo de MongoDB y la publicación del Revisor.
describe('POST /esquemas-captura/{id}/publicar', () => {
  const borradores = {};

  it('la primera publicación de la DDRISS deja el borrador VIGENTE y no toca el nacional', async () => {
    borradores.a = await crearBorrador();
    const nacionalAntes = await documentoCrudo(ids.vigenteNacional.toString());

    const res = await publicar(borradores.a, { vigenciaDesde: '2090-01-01', motivoCambio: `  ${MOTIVO} ` });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: borradores.a,
      estado: 'VIGENTE',
      vigencia: { desde: '2090-01-01', hasta: null },
      versionAnteriorId: null,
      publicadoPor: { id: Number(jwt.decode(token).sub) },
      motivoCambio: MOTIVO,
    });

    const doc = await documentoCrudo(borradores.a);
    expect(doc.estado).toBe('VIGENTE');
    expect(doc.vigencia).toEqual({ desde: new Date('2090-01-01'), hasta: null });
    expect(doc.version_anterior_id).toBeNull();
    expect(doc.auditoria.publicado_por).toBeInstanceOf(Int32);
    expect(doc.auditoria.publicado_en).toBeInstanceOf(Date);
    expect(doc.auditoria.motivo_cambio).toBe(MOTIVO);
    expect(await documentoCrudo(ids.vigenteNacional.toString())).toEqual(nacionalAntes);

    const filas = await filasBitacora(borradores.a);
    expect(filas.map((f) => f.accion)).toEqual(['CREAR', 'PUBLICAR_ESQUEMA']);
    expect(filas[1]).toMatchObject({
      anteriores: { estado: 'BORRADOR' },
      nuevos: {
        estado: 'VIGENTE',
        vigencia: { desde: '2090-01-01', hasta: null },
        versionAnteriorId: null,
        motivoCambio: MOTIVO,
      },
    });
  });

  it('la segunda publicación pasa la anterior a HISTORICO sin cambiar el resto del documento', async () => {
    borradores.b = await crearBorrador();
    const anteriorAntes = await documentoCrudo(borradores.a);

    const res = await publicar(borradores.b, { vigenciaDesde: '2090-03-01', motivoCambio: MOTIVO });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'VIGENTE', versionAnteriorId: borradores.a });

    expect(await documentoCrudo(borradores.a)).toEqual({
      ...anteriorAntes,
      estado: 'HISTORICO',
      vigencia: { ...anteriorAntes.vigencia, hasta: new Date('2090-02-28') },
    });
    expect((await documentoCrudo(borradores.b)).version_anterior_id).toEqual(new ObjectId(borradores.a));
    expect(await vigentesDeLaDdriss()).toBe(1);

    const filasAnterior = await filasBitacora(borradores.a);
    expect(filasAnterior.map((f) => f.accion)).toEqual(['CREAR', 'PUBLICAR_ESQUEMA', 'ACTUALIZAR']);
    expect(filasAnterior.at(-1)).toMatchObject({
      anteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
      nuevos: { estado: 'HISTORICO', vigencia: { hasta: '2090-02-28' } },
    });
    expect((await filasBitacora(borradores.b)).map((f) => f.accion)).toEqual(['CREAR', 'PUBLICAR_ESQUEMA']);
  });

  it('el historial muestra las versiones publicadas con su estado y su vigencia', async () => {
    const res = await consultar(`/esquemas-captura/historial?vacunaId=${vacunaId}`);
    expect(res.body.versiones.map((v) => [v.id, v.estado, v.vigencia])).toEqual([
      [borradores.b, 'VIGENTE', { desde: '2090-03-01', hasta: null }],
      [borradores.a, 'HISTORICO', { desde: '2090-01-01', hasta: '2090-02-28' }],
      [ids.vigenteNacional.toString(), 'VIGENTE', { desde: '2026-01-01', hasta: null }],
    ]);
    expect(res.body.versiones[0].motivoCambio).toBe(MOTIVO);
  });

  it.each([
    ['un día distinto del 1', '2090-06-15', 'La vigencia debe empezar el día 1 de un mes.'],
    ['otro formato', '2090/06/01', 'La vigencia debe ser una fecha AAAA-MM-DD.'],
    ['una fecha que no existe', '2090-02-30', 'La vigencia debe ser una fecha AAAA-MM-DD.'],
    ['un número', 20900601, 'La vigencia debe ser una fecha AAAA-MM-DD.'],
  ])('una vigencia con %s responde 400', async (_, vigenciaDesde, mensaje) => {
    borradores.c ??= await crearBorrador();
    const res = await publicar(borradores.c, { vigenciaDesde, motivoCambio: MOTIVO });
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it.each([
    ['un mes que no está en el calendario', '2089-01-01', 'El mes 2089-01 no está en el calendario de periodos.'],
    ['un mes anterior al actual', '2018-06-01', 'La vigencia no puede empezar antes del mes actual.'],
    [
      'el mismo mes del vigente de la DDRISS',
      '2090-03-01',
      'La vigencia debe empezar después del 01/03/2090, cuando empezó la versión 4 de su DDRISS.',
    ],
    [
      'un mes anterior al del vigente de la DDRISS',
      '2090-02-01',
      'La vigencia debe empezar después del 01/03/2090, cuando empezó la versión 4 de su DDRISS.',
    ],
  ])('una vigencia con %s responde 422', async (_, vigenciaDesde, mensaje) => {
    const res = await publicar(borradores.c, { vigenciaDesde, motivoCambio: MOTIVO });
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ codigo: 'VIGENCIA_INVALIDA', mensaje });
  });

  it.each([
    ['sin motivo', { vigenciaDesde: '2090-06-01' }],
    ['con un motivo de 301 caracteres', { vigenciaDesde: '2090-06-01', motivoCambio: 'a'.repeat(301) }],
    ['sin vigencia', { motivoCambio: MOTIVO }],
    ['con un campo extra', { vigenciaDesde: '2090-06-01', motivoCambio: MOTIVO, estado: 'VIGENTE' }],
  ])('un cuerpo %s responde 400', async (_, cuerpo) => {
    const res = await publicar(borradores.c, cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('vuelve a pasar las reglas de coherencia: una dosis desactivada después de guardar responde 422', async () => {
    await pool.query("UPDATE dosis SET activa = FALSE WHERE vacuna_id = ? AND codigo = 'D2'", [vacunaId]);
    try {
      const res = await publicar(borradores.c, { vigenciaDesde: '2090-06-01', motivoCambio: MOTIVO });
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'ESQUEMA_INVALIDO',
        mensaje: `La dosis D2 no es una dosis activa de ${VACUNA}.`,
      });
    } finally {
      await pool.query("UPDATE dosis SET activa = TRUE WHERE vacuna_id = ? AND codigo = 'D2'", [vacunaId]);
    }
    expect((await documentoCrudo(borradores.c)).estado).toBe('BORRADOR');
  });

  it.each([
    ['un VIGENTE de la DDRISS', () => borradores.b],
    ['un HISTORICO', () => borradores.a],
    ['el vigente nacional', () => ids.vigenteNacional.toString()],
  ])('publicar %s responde 409', async (_, id) => {
    const res = await publicar(id(), { vigenciaDesde: '2090-06-01', motivoCambio: MOTIVO });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({ codigo: 'ESQUEMA_NO_EDITABLE', mensaje: 'Solo se publica un borrador de su DDRISS.' });
  });

  it('el borrador de otra DDRISS responde 404', async () => {
    const res = await publicar(ids.borradorOtra.toString(), { vigenciaDesde: '2090-06-01', motivoCambio: MOTIVO });
    expect(res.status).toBe(404);
  });

  it('dos publicaciones en paralelo del mismo borrador: una 200 y otra 409, y queda un solo VIGENTE', async () => {
    const cuerpo = { vigenciaDesde: '2090-06-01', motivoCambio: MOTIVO };
    const respuestas = await Promise.all([publicar(borradores.c, cuerpo), publicar(borradores.c, cuerpo)]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await vigentesDeLaDdriss()).toBe(1);
    expect((await documentoCrudo(borradores.c)).estado).toBe('VIGENTE');
    expect((await documentoCrudo(borradores.b)).estado).toBe('HISTORICO');
    expect((await filasBitacora(borradores.c)).filter((f) => f.accion === 'PUBLICAR_ESQUEMA')).toHaveLength(1);
    expect((await filasBitacora(borradores.b)).filter((f) => f.accion === 'ACTUALIZAR')).toHaveLength(1);
  });

  it('si MongoDB falla a mitad, ninguno de los dos documentos cambia y no queda la bitácora', async () => {
    borradores.d = await crearBorrador();
    const [vigenteAntes, borradorAntes] = await Promise.all([documentoCrudo(borradores.c), documentoCrudo(borradores.d)]);
    const filasAntes = (await filasBitacora(borradores.c)).length;

    // El primer updateOne (el anterior a HISTORICO) pasa; el segundo falla dentro de la transacción.
    const original = Collection.prototype.updateOne;
    let llamadas = 0;
    const espia = vi.spyOn(Collection.prototype, 'updateOne').mockImplementation(function (...args) {
      llamadas += 1;
      if (llamadas === 2) return Promise.reject(new Error('fallo simulado de MongoDB'));
      return original.apply(this, args);
    });
    try {
      const res = await publicar(borradores.d, { vigenciaDesde: '2090-09-01', motivoCambio: MOTIVO });
      expect(res.status).toBe(500);
    } finally {
      espia.mockRestore();
    }
    expect(llamadas).toBe(2);

    expect(await documentoCrudo(borradores.c)).toEqual(vigenteAntes);
    expect(await documentoCrudo(borradores.d)).toEqual(borradorAntes);
    expect((await filasBitacora(borradores.c)).length).toBe(filasAntes);
    expect((await filasBitacora(borradores.d)).map((f) => f.accion)).toEqual(['CREAR']);
  });

  it('el Revisor puede publicar', async () => {
    const [[revisor]] = await pool.query(
      `SELECT d.codigo FROM ddriss d
         JOIN empleado e ON e.ddriss_id = d.id
         JOIN usuario u ON u.empleado_id = e.id
        WHERE u.id = ?`,
      [jwt.decode(tokenRevisor).sub],
    );
    expect(revisor.codigo).toBe(ddrissUsuario);
    const res = await publicar(borradores.d, { vigenciaDesde: '2090-09-01', motivoCambio: MOTIVO }, tokenRevisor);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'VIGENTE', versionAnteriorId: borradores.c });
  });

  it('sin ESQUEMA_PUBLICAR responde 403', async () => {
    const res = await publicar(borradores.d, { vigenciaDesde: '2090-12-01', motivoCambio: MOTIVO }, tokenEpidemiologia);
    expect(res.status).toBe(403);
  });

  it('una versión HISTORICO que usan los reportes de la semilla se sigue consultando completa', async () => {
    const res = await consultar(`/esquemas-captura/${HEXA_V1}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ estado: 'HISTORICO', vigencia: { desde: '2026-01-01', hasta: '2026-09-30' } });
    expect(res.body.dosis.map((d) => d.codigo)).toEqual(['D1', 'D2', 'D3']);
  });
});
