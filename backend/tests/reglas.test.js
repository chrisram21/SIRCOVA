import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Collection, Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas crean por SQL las vacunas ZVT_HU24 (activa) y ZVT_HU24I (inactiva), e insertan en MongoDB reglas cuyo
// código empieza con ZVT_HU24, entre ellas una de la DDRISS ficticia ZVT_OTRA24. Las reglas que crean por la API
// llevan un código generado y un nombre que empieza con vitest-hu24-. Todo se borra al inicio y al final; las
// reglas de la semilla no se tocan.
const VACUNA = 'ZVT_HU24';
const VACUNA_INACTIVA = 'ZVT_HU24I';
const DDRISS_OTRA = 'ZVT_OTRA24';
const NACIONAL = { nivel: 'NACIONAL', ddriss_codigo: null };
const MENSAJE_VACUNAS = 'Indique * para todas las vacunas, o una lista de códigos sin repetir y sin *.';

let ddrissUsuario;
let token;
let tokenRevisor;
// Ids nuevos en cada carga de las reglas: la bitácora no se borra, y una fila de un caso no debe verse en otro.
const ids = {};

const reglas = async () => (await obtenerDb()).collection('reglas_validacion');

function reglaDePrueba({ _id, codigo, version, territorio, estado, vigencia, nombre = `ZVT ${codigo} v${version}` }) {
  return {
    _id,
    codigo,
    version: new Int32(version),
    nombre,
    tipo: 'RANGO',
    ambito: 'DETALLE',
    severidad: 'ADVERTENCIA',
    aplica_a: { vacunas: [VACUNA] },
    parametros: { minimo: 0, maximo: 100 * version },
    mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).',
    territorio,
    estado,
    vigencia,
    auditoria: {
      creado_por: new Int32(1),
      creado_en: vigencia.desde,
      publicado_por: estado === 'BORRADOR' ? null : new Int32(1),
      publicado_en: estado === 'BORRADOR' ? null : vigencia.desde,
      motivo_cambio: `vitest-hu24 v${version}`,
    },
  };
}

async function limpiar() {
  await (await reglas()).deleteMany({ $or: [{ codigo: /^ZVT_HU24/ }, { nombre: /^vitest-hu24-/ }] });
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [[VACUNA, VACUNA_INACTIVA]]);
}

async function preparar() {
  await pool.query(
    `INSERT INTO vacuna (codigo, nombre, activa)
     VALUES (?, 'vitest-hu24 Vacuna', TRUE), (?, 'vitest-hu24 Inactiva', FALSE)`,
    [VACUNA, VACUNA_INACTIVA],
  );
  await prepararReglas();
}

// Deja las reglas ZVT_HU24* como al empezar: las pruebas que publican les agregan versiones.
async function prepararReglas() {
  await (await reglas()).deleteMany({ codigo: /^ZVT_HU24/ });
  for (const clave of ['nacional', 'propiaV1', 'propiaV2', 'otra', 'borrador']) ids[clave] = new ObjectId();
  const propia = { nivel: 'DDRISS', ddriss_codigo: ddrissUsuario };
  const desde = (fecha) => ({ desde: new Date(fecha), hasta: null });
  await (await reglas()).insertMany([
    reglaDePrueba({ _id: ids.nacional, codigo: 'ZVT_HU24_NAC', version: 1, territorio: NACIONAL, estado: 'VIGENTE',
      vigencia: desde('2026-10-01T06:00:00Z') }),
    reglaDePrueba({ _id: ids.propiaV1, codigo: 'ZVT_HU24_PROPIA', version: 1, territorio: propia, estado: 'HISTORICO',
      vigencia: { desde: new Date('2026-10-01T06:00:00Z'), hasta: new Date('2026-10-15T15:00:00Z') } }),
    reglaDePrueba({ _id: ids.propiaV2, codigo: 'ZVT_HU24_PROPIA', version: 2, territorio: propia, estado: 'VIGENTE',
      vigencia: desde('2026-10-15T15:00:00Z') }),
    reglaDePrueba({ _id: ids.otra, codigo: 'ZVT_HU24_OTRA', version: 1,
      territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS_OTRA }, estado: 'VIGENTE',
      vigencia: desde('2026-10-01T06:00:00Z') }),
    reglaDePrueba({ _id: ids.borrador, codigo: 'ZVT_HU24_BORR', version: 1, territorio: NACIONAL, estado: 'BORRADOR',
      vigencia: desde('2026-11-01T06:00:00Z') }),
  ]);
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

const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
const enviar = (ruta, cuerpo, credencial = token) =>
  request(app).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);

async function filasBitacora(entidadId) {
  const [filas] = await pool.query(
    `SELECT accion, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND entidad = 'reglas_validacion' AND entidad_id = ?
      ORDER BY id`,
    [entidadId],
  );
  return filas.map((f) => ({ accion: f.accion, anteriores: f.valores_anteriores, nuevos: f.valores_nuevos }));
}

// Filas CREAR de las reglas creadas por la API con ese nombre (el id de un alta fallida no se conoce).
async function filasCrearConNombre(nombre) {
  const [[{ filas }]] = await pool.query(
    `SELECT COUNT(*) AS filas FROM bitacora
      WHERE entidad = 'reglas_validacion' AND accion = 'CREAR'
        AND JSON_UNQUOTE(JSON_EXTRACT(valores_nuevos, '$.nombre')) = ?`,
    [nombre],
  );
  return filas;
}

// Sin promoteValues el driver no convierte los enteros a number: se ve si se guardaron como int o como double.
const documentoCrudo = async (id) => (await reglas()).findOne({ _id: new ObjectId(id) }, { promoteValues: false });

// El que espera el servicio, calculado aparte: los códigos {TIPO}_{NN} de cualquier territorio y estado.
async function siguienteCodigo(tipo) {
  const codigos = await (await reglas()).distinct('codigo', { codigo: { $regex: `^${tipo}_[0-9]{2,}$` } });
  const mayor = Math.max(0, ...codigos.map((c) => Number(c.slice(tipo.length + 1))));
  return `${tipo}_${String(mayor + 1).padStart(2, '0')}`;
}

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  if (!res.body.usuario.permisos.includes('REGLA_CONSULTAR')) {
    throw new Error('El usuario de prueba no tiene REGLA_CONSULTAR: corra el 05 y vuelva a intentar');
  }
  token = res.body.token;
  const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = ?', [res.body.usuario.empleado.ddrissId]);
  ddrissUsuario = ddriss.codigo;
  tokenRevisor = await tokenDeLaSemilla('REVISOR');
  await limpiar();
  await preparar();
});

afterAll(limpiar);

describe('GET /reglas-validacion', () => {
  let filas;
  const fila = (codigo) => filas.find((f) => f.codigo === codigo);

  beforeAll(async () => {
    const res = await consultar('/reglas-validacion');
    expect(res.status).toBe(200);
    filas = res.body;
  });

  it('una regla nacional aplica tal cual, sin versión de la DDRISS', () => {
    expect(fila('CAMPOS_COMPLETOS')).toMatchObject({
      tipo: 'CAMPOS_COMPLETOS',
      ambito: 'VACUNA',
      aplica: {
        codigo: 'CAMPOS_COMPLETOS',
        version: 1,
        territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
        estado: 'VIGENTE',
        severidad: 'ERROR',
        vacunas: ['*'],
        parametros: { cero_explicito: true },
      },
      ultimaDdriss: null,
      vigenteNacional: { version: 1 },
    });
  });

  it('la versión de la DDRISS reemplaza a la nacional del mismo código', () => {
    expect(fila('VARIACION_HISTORICA')).toMatchObject({
      aplica: { version: 2, territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario }, estado: 'VIGENTE' },
      ultimaDdriss: { version: 2 },
      vigenteNacional: { version: 1 },
    });
  });

  it('una regla propia de la DDRISS trae su vigente y su última versión, sin nacional', () => {
    const propia = fila('ZVT_HU24_PROPIA');
    expect(propia).toMatchObject({
      tipo: 'RANGO',
      ambito: 'DETALLE',
      aplica: { id: ids.propiaV2.toString(), version: 2 },
      ultimaDdriss: { id: ids.propiaV2.toString(), version: 2 },
      vigenteNacional: null,
    });
    expect(propia.aplica).toEqual({
      id: ids.propiaV2.toString(),
      codigo: 'ZVT_HU24_PROPIA',
      version: 2,
      nombre: 'ZVT ZVT_HU24_PROPIA v2',
      descripcion: null,
      tipo: 'RANGO',
      ambito: 'DETALLE',
      severidad: 'ADVERTENCIA',
      vacunas: [VACUNA],
      parametros: { minimo: 0, maximo: 200 },
      mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).',
      territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
      estado: 'VIGENTE',
      vigencia: { desde: '2026-10-15T15:00:00.000Z', hasta: null },
      publicadoPor: { id: 1, nombreUsuario: expect.any(String) },
      publicadoEn: '2026-10-15T15:00:00.000Z',
      motivoCambio: 'vitest-hu24 v2',
    });
  });

  it('no trae reglas de otras DDRISS ni códigos que solo tienen borradores', () => {
    const codigos = filas.map((f) => f.codigo);
    expect(codigos).toContain('ZVT_HU24_NAC');
    expect(codigos).not.toContain('ZVT_HU24_OTRA');
    expect(codigos).not.toContain('ZVT_HU24_BORR');
    expect(codigos).not.toContain('RANGO_DOSIS_MES');
    expect(new Set(codigos).size).toBe(codigos.length);
  });

  it('las filas van ordenadas por el nombre de la versión que aplica', () => {
    const nombres = filas.map((f) => (f.aplica ?? f.ultimaDdriss).nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('un parámetro de consulta responde 400', async () => {
    const res = await consultar('/reglas-validacion?tipo=RANGO');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'Parámetro no permitido: tipo.' });
  });

  it('el Revisor recibe 403', async () => {
    const res = await consultar('/reglas-validacion', tokenRevisor);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('GET /reglas-validacion/{codigo}/historial', () => {
  it('trae las versiones de la DDRISS de la más reciente a la más antigua', async () => {
    const res = await consultar('/reglas-validacion/ZVT_HU24_PROPIA/historial');
    expect(res.status).toBe(200);
    expect(res.body.map((v) => [v.version, v.estado])).toEqual([[2, 'VIGENTE'], [1, 'HISTORICO']]);
    expect(res.body[1]).toMatchObject({
      id: ids.propiaV1.toString(),
      vigencia: { desde: '2026-10-01T06:00:00.000Z', hasta: '2026-10-15T15:00:00.000Z' },
      motivoCambio: 'vitest-hu24 v1',
      desactivacion: null,
    });
  });

  it('trae las versiones nacionales y las de la DDRISS del mismo código', async () => {
    const res = await consultar('/reglas-validacion/VARIACION_HISTORICA/historial');
    expect(res.status).toBe(200);
    expect(res.body.map((v) => [v.version, v.territorio.nivel])).toEqual([[2, 'DDRISS'], [1, 'NACIONAL']]);
  });

  it('una regla de otra DDRISS, un borrador, un código inexistente o mal formado responden 404', async () => {
    for (const codigo of ['ZVT_HU24_OTRA', 'ZVT_HU24_BORR', 'ZVT_HU24_NO_EXISTE', 'rango_01']) {
      const res = await consultar(`/reglas-validacion/${codigo}/historial`);
      expect(res.status, codigo).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
    }
  });

  it('un parámetro de consulta responde 400', async () => {
    const res = await consultar('/reglas-validacion/ZVT_HU24_PROPIA/historial?estado=VIGENTE');
    expect(res.status).toBe(400);
  });

  it('el Revisor recibe 403', async () => {
    const res = await consultar('/reglas-validacion/ZVT_HU24_PROPIA/historial', tokenRevisor);
    expect(res.status).toBe(403);
  });
});

describe('POST /reglas-validacion', () => {
  const rango = (cambios = {}) => ({
    tipo: 'RANGO',
    nombre: 'vitest-hu24-rango',
    descripcion: '  Advierte   cuando una celda supera 300 dosis. ',
    severidad: 'ADVERTENCIA',
    vacunas: [VACUNA],
    parametros: { maximo: 300, minimo: 0 },
    mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).',
    motivoCambio: 'vitest-hu24 alta',
    ...cambios,
  });

  it('guarda la versión 1 VIGENTE de la DDRISS con el código siguiente del tipo y deja CREAR', async () => {
    const codigo = await siguienteCodigo('RANGO');
    const res = await enviar('/reglas-validacion', rango());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo,
      version: 1,
      nombre: 'vitest-hu24-rango',
      descripcion: 'Advierte cuando una celda supera 300 dosis.',
      tipo: 'RANGO',
      ambito: 'DETALLE',
      severidad: 'ADVERTENCIA',
      vacunas: [VACUNA],
      parametros: { minimo: 0, maximo: 300 },
      territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
      estado: 'VIGENTE',
      vigencia: { hasta: null },
      publicadoPor: { id: expect.any(Number), nombreUsuario: process.env.PRUEBA_USUARIO },
      motivoCambio: 'vitest-hu24 alta',
    });
    expect(res.body.vigencia.desde).toBe(res.body.publicadoEn);

    const doc = await documentoCrudo(res.body.id);
    expect(doc.version).toBeInstanceOf(Int32);
    expect(doc.auditoria.creado_por).toBeInstanceOf(Int32);
    expect(doc.auditoria.publicado_por).toBeInstanceOf(Int32);
    expect(doc.vigencia.desde).toEqual(doc.auditoria.publicado_en);
    expect(doc.auditoria.creado_en).toEqual(doc.auditoria.publicado_en);
    expect(Object.keys(doc.parametros)).toEqual(['minimo', 'maximo']);

    const filas = await filasBitacora(res.body.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      accion: 'CREAR',
      anteriores: null,
      nuevos: { codigo, version: 1, estado: 'VIGENTE', publicadoPor: doc.auditoria.publicado_por.value },
    });

    const lista = await consultar('/reglas-validacion');
    const fila = lista.body.find((f) => f.codigo === codigo);
    expect(fila).toMatchObject({ aplica: { id: res.body.id }, vigenteNacional: null });
  });

  it('el alta siguiente del mismo tipo lleva el consecutivo siguiente', async () => {
    const primero = await siguienteCodigo('RANGO');
    const res = await enviar('/reglas-validacion', rango({ nombre: 'vitest-hu24-rango-2', descripcion: undefined }));
    expect(res.status).toBe(201);
    expect(res.body.codigo).toBe(primero);
    expect(res.body.descripcion).toBeNull();
    expect('descripcion' in (await documentoCrudo(res.body.id))).toBe(false);
    expect(await siguienteCodigo('RANGO')).not.toBe(primero);
  });

  it('un tipo sin parámetros no se crea', async () => {
    const res = await enviar('/reglas-validacion', rango({ tipo: 'NO_NEGATIVO', parametros: {} }));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({
      codigo: 'ENTRADA_INVALIDA',
      mensaje: 'Solo se crean reglas de tipo RANGO, SECUENCIA_DOSIS, VARIACION_HISTORICA o TOTAL_CUADRA.',
    });
  });

  it.each([
    ['un campo no permitido', { codigo: 'RANGO_99' }, 'Campo no permitido: codigo.'],
    ['un parámetro de más', { parametros: { minimo: 0, maximo: 300, tolerancia: 1 } },
      'Parámetro no permitido en una regla de tipo RANGO: tolerancia.'],
    ['un máximo menor que el mínimo', { parametros: { minimo: 10, maximo: 5 } },
      'El parámetro maximo debe ser un entero entre 11 y 100000.'],
    ['un marcador desconocido', { mensaje: 'La regla {total} de {vacuna} no se cumple.' },
      'El mensaje usa el marcador {total}, que no existe en las reglas de tipo RANGO.'],
    ['* con un código', { vacunas: ['*', VACUNA] }, MENSAJE_VACUNAS],
    ['una vacuna repetida', { vacunas: [VACUNA, VACUNA] }, MENSAJE_VACUNAS],
    ['sin vacunas', { vacunas: [] }, MENSAJE_VACUNAS],
    ['una severidad inválida', { severidad: 'AVISO' }, 'La severidad debe ser ERROR o ADVERTENCIA.'],
    ['un nombre corto', { nombre: 'ab' }, 'El nombre de la regla debe tener entre 3 y 100 caracteres.'],
    ['sin motivo', { motivoCambio: '  ' }, 'El motivo del cambio debe tener entre 1 y 300 caracteres.'],
  ])('%s responde 400', async (_caso, cambios, mensaje) => {
    const res = await enviar('/reglas-validacion', rango(cambios));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it.each([
    ['inactiva', VACUNA_INACTIVA],
    ['inexistente', 'ZVT_HU24_NO_EXISTE'],
  ])('una vacuna %s responde 422 REGLA_INVALIDA', async (_caso, vacuna) => {
    const res = await enviar('/reglas-validacion', rango({ vacunas: [vacuna] }));
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      codigo: 'REGLA_INVALIDA',
      mensaje: `La vacuna ${vacuna} no existe o está inactiva.`,
    });
  });

  it('si MongoDB falla, no queda la regla ni su fila de bitácora', async () => {
    const nombre = 'vitest-hu24-falla';
    const insertar = vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new Error('Falla simulada'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await enviar('/reglas-validacion', rango({ nombre }));
      expect(res.status).toBe(500);
    } finally {
      insertar.mockRestore();
      registro.mockRestore();
    }
    expect(await (await reglas()).countDocuments({ nombre })).toBe(0);
    expect(await filasCrearConNombre(nombre)).toBe(0);
  });

  it('el Revisor recibe 403', async () => {
    const res = await enviar('/reglas-validacion', rango({ nombre: 'vitest-hu24-revisor' }), tokenRevisor);
    expect(res.status).toBe(403);
  });
});

describe('POST /reglas-validacion/{codigo}/versiones', () => {
  beforeEach(prepararReglas);

  // El contenido de las reglas de prueba, con otro máximo.
  const version = (cambios = {}) => ({
    versionBase: 2,
    nombre: 'vitest-hu24-version',
    severidad: 'ERROR',
    vacunas: [VACUNA],
    parametros: { minimo: 0, maximo: 250 },
    mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).',
    motivoCambio: 'vitest-hu24 versión',
    ...cambios,
  });
  const publicar = (codigo, cuerpo, credencial) => enviar(`/reglas-validacion/${codigo}/versiones`, cuerpo, credencial);
  const sinFechas = ({ estado, vigencia, ...resto }) => resto;
  const versionesDe = async (codigo) =>
    (await reglas()).find({ codigo }, { promoteValues: false }).sort({ version: 1 }).toArray();

  it('guarda la versión siguiente de la DDRISS y pasa a HISTORICO la anterior sin cambiar su contenido', async () => {
    const antes = await documentoCrudo(ids.propiaV2.toString());
    const res = await publicar('ZVT_HU24_PROPIA', version());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: 'ZVT_HU24_PROPIA',
      version: 3,
      nombre: 'vitest-hu24-version',
      tipo: 'RANGO',
      ambito: 'DETALLE',
      severidad: 'ERROR',
      parametros: { minimo: 0, maximo: 250 },
      territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
      estado: 'VIGENTE',
      vigencia: { hasta: null },
      motivoCambio: 'vitest-hu24 versión',
    });

    const anterior = await documentoCrudo(ids.propiaV2.toString());
    expect(anterior.estado).toBe('HISTORICO');
    expect(anterior.vigencia.hasta.toISOString()).toBe(res.body.vigencia.desde);
    expect(sinFechas(anterior)).toEqual(sinFechas(antes));
    expect(anterior.vigencia.desde).toEqual(antes.vigencia.desde);

    expect((await filasBitacora(res.body.id)).map((f) => f.accion)).toEqual(['CREAR']);
    expect(await filasBitacora(ids.propiaV2.toString())).toEqual([
      {
        accion: 'ACTUALIZAR',
        anteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
        nuevos: { estado: 'HISTORICO', vigencia: { hasta: res.body.vigencia.desde } },
      },
    ]);
  });

  it('una versión de una regla nacional es de la DDRISS y no toca la nacional', async () => {
    const nacional = await documentoCrudo(ids.nacional.toString());
    const res = await publicar('ZVT_HU24_NAC', version({ versionBase: 1 }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 2, territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario } });
    expect(await documentoCrudo(ids.nacional.toString())).toEqual(nacional);
    expect(await filasBitacora(ids.nacional.toString())).toEqual([]);

    const fila = (await consultar('/reglas-validacion')).body.find((f) => f.codigo === 'ZVT_HU24_NAC');
    expect(fila).toMatchObject({
      aplica: { id: res.body.id },
      ultimaDdriss: { version: 2 },
      vigenteNacional: { version: 1 },
    });
  });

  it('la versión sigue a la mayor del país, aunque sea de otra DDRISS o un borrador', async () => {
    await (await reglas()).insertOne(reglaDePrueba({
      _id: new ObjectId(), codigo: 'ZVT_HU24_NAC', version: 7,
      territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS_OTRA }, estado: 'BORRADOR',
      vigencia: { desde: new Date('2026-11-01T06:00:00Z'), hasta: null },
    }));
    const res = await publicar('ZVT_HU24_NAC', version({ versionBase: 1 }));
    expect(res.status).toBe(201);
    expect(res.body.version).toBe(8);
  });

  it('una versionBase vieja responde 409 REGLA_DESACTUALIZADA y no escribe', async () => {
    const res = await publicar('ZVT_HU24_PROPIA', version({ versionBase: 1 }));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'REGLA_DESACTUALIZADA',
      mensaje: 'La regla ZVT_HU24_PROPIA cambió mientras la editaba; vuelva a abrirla.',
    });
    expect(await versionesDe('ZVT_HU24_PROPIA')).toHaveLength(2);
  });

  it('un contenido igual al de la versión que aplica responde 422 REGLA_SIN_CAMBIOS', async () => {
    const igual = version({
      nombre: 'ZVT ZVT_HU24_PROPIA v2',
      severidad: 'ADVERTENCIA',
      parametros: { maximo: 200, minimo: 0 },
      motivoCambio: 'Otro motivo no cuenta',
    });
    const res = await publicar('ZVT_HU24_PROPIA', igual);
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      codigo: 'REGLA_SIN_CAMBIOS',
      mensaje: 'La versión no cambia nada de la que aplica.',
    });
  });

  it.each([
    ['el tipo', { tipo: 'RANGO' }, 'Campo no permitido: tipo.'],
    ['el código', { codigo: 'ZVT_HU24_PROPIA' }, 'Campo no permitido: codigo.'],
    ['sin versionBase', { versionBase: undefined }, 'versionBase debe ser un número entero positivo.'],
    ['un parámetro de otro tipo', { parametros: { tolerancia: 1 } },
      'Parámetro no permitido en una regla de tipo RANGO: tolerancia.'],
  ])('%s responde 400', async (_caso, cambios, mensaje) => {
    const res = await publicar('ZVT_HU24_PROPIA', version(cambios));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('una vacuna inactiva responde 422 REGLA_INVALIDA', async () => {
    const res = await publicar('ZVT_HU24_PROPIA', version({ vacunas: [VACUNA_INACTIVA] }));
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('REGLA_INVALIDA');
  });

  it('una regla de otra DDRISS o inexistente responde 404', async () => {
    for (const codigo of ['ZVT_HU24_OTRA', 'ZVT_HU24_BORR', 'ZVT_HU24_NO_EXISTE']) {
      const res = await publicar(codigo, version({ versionBase: 1 }));
      expect(res.status, codigo).toBe(404);
    }
  });

  it('dos versiones a la vez: una se publica y la otra responde 409; queda un solo VIGENTE de la DDRISS', async () => {
    const respuestas = await Promise.all([
      publicar('ZVT_HU24_PROPIA', version({ parametros: { minimo: 0, maximo: 260 } })),
      publicar('ZVT_HU24_PROPIA', version({ parametros: { minimo: 0, maximo: 270 } })),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409).body.error.codigo).toBe('REGLA_DESACTUALIZADA');
    const versiones = await versionesDe('ZVT_HU24_PROPIA');
    expect(versiones.map((v) => [Number(v.version), v.estado])).toEqual([
      [1, 'HISTORICO'],
      [2, 'HISTORICO'],
      [3, 'VIGENTE'],
    ]);
  });

  it('si falla la versión nueva, la anterior sigue VIGENTE y no quedan filas de bitácora', async () => {
    const antes = await documentoCrudo(ids.propiaV2.toString());
    const insertar = vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new Error('Falla simulada'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await publicar('ZVT_HU24_PROPIA', version());
      expect(res.status).toBe(500);
    } finally {
      insertar.mockRestore();
      registro.mockRestore();
    }
    expect(await documentoCrudo(ids.propiaV2.toString())).toEqual(antes);
    expect(await versionesDe('ZVT_HU24_PROPIA')).toHaveLength(2);
    expect(await filasBitacora(ids.propiaV2.toString())).toEqual([]);
  });

  it('el Revisor recibe 403', async () => {
    const res = await publicar('ZVT_HU24_PROPIA', version(), tokenRevisor);
    expect(res.status).toBe(403);
  });
});

describe('desactivar y activar', () => {
  beforeEach(prepararReglas);

  const MOTIVO = 'vitest-hu24 cambio de estado';
  const desactivar = (codigo, cuerpo, credencial) =>
    enviar(`/reglas-validacion/${codigo}/desactivar`, cuerpo, credencial);
  const activar = (codigo, cuerpo, credencial) => enviar(`/reglas-validacion/${codigo}/activar`, cuerpo, credencial);

  it('desactivar deja la regla propia sin versión que aplique y guarda el motivo en la bitácora', async () => {
    const res = await desactivar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      codigo: 'ZVT_HU24_PROPIA',
      aplica: null,
      ultimaDdriss: { id: ids.propiaV2.toString(), version: 2, estado: 'HISTORICO' },
      vigenteNacional: null,
    });
    const hasta = res.body.ultimaDdriss.vigencia.hasta;
    expect(hasta).not.toBeNull();

    const doc = await documentoCrudo(ids.propiaV2.toString());
    expect(doc.estado).toBe('HISTORICO');
    expect(doc.auditoria.motivo_cambio).toBe('vitest-hu24 v2');
    expect(await filasBitacora(ids.propiaV2.toString())).toEqual([
      {
        accion: 'DESACTIVAR',
        anteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
        nuevos: { estado: 'HISTORICO', vigencia: { hasta }, motivoCambio: MOTIVO },
      },
    ]);

    const historial = await consultar('/reglas-validacion/ZVT_HU24_PROPIA/historial');
    expect(historial.body[0].desactivacion).toEqual({
      en: expect.any(String),
      por: { id: expect.any(Number), nombreUsuario: process.env.PRUEBA_USUARIO },
      motivo: MOTIVO,
    });
    expect(Math.abs(new Date(historial.body[0].desactivacion.en) - new Date(hasta))).toBeLessThan(60_000);
    expect(historial.body[1].desactivacion).toBeNull();
  });

  it('desactivar la versión de la DDRISS de una regla nacional vuelve a aplicar la nacional', async () => {
    const publicada = await enviar('/reglas-validacion/ZVT_HU24_NAC/versiones', {
      versionBase: 1,
      nombre: 'vitest-hu24-nac-ddriss',
      severidad: 'ERROR',
      vacunas: ['*'],
      parametros: { minimo: 0, maximo: 50 },
      mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).',
      motivoCambio: MOTIVO,
    });
    expect(publicada.status).toBe(201);

    const res = await desactivar('ZVT_HU24_NAC', { version: publicada.body.version, motivoCambio: MOTIVO });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      aplica: { id: ids.nacional.toString(), version: 1, territorio: { nivel: 'NACIONAL' } },
      ultimaDdriss: { id: publicada.body.id, estado: 'HISTORICO' },
      vigenteNacional: { version: 1 },
    });
  });

  it('una regla nacional sin versión de la DDRISS no se desactiva', async () => {
    const res = await desactivar('ZVT_HU24_NAC', { version: 1, motivoCambio: MOTIVO });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'REGLA_SIN_VERSION_PROPIA',
      mensaje: 'Su DDRISS no tiene una versión activa de esta regla; las reglas nacionales no se desactivan.',
    });
    expect((await documentoCrudo(ids.nacional.toString())).estado).toBe('VIGENTE');
  });

  it('desactivar con una versión que ya no es la vigente responde 409 REGLA_DESACTUALIZADA', async () => {
    const res = await desactivar('ZVT_HU24_PROPIA', { version: 1, motivoCambio: MOTIVO });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('REGLA_DESACTUALIZADA');
    expect((await documentoCrudo(ids.propiaV2.toString())).estado).toBe('VIGENTE');
  });

  it('si MongoDB falla al desactivar, la versión sigue VIGENTE y no queda la fila', async () => {
    const actualizar = vi.spyOn(Collection.prototype, 'updateOne').mockRejectedValueOnce(new Error('Falla simulada'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await desactivar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO });
      expect(res.status).toBe(500);
    } finally {
      actualizar.mockRestore();
      registro.mockRestore();
    }
    expect((await documentoCrudo(ids.propiaV2.toString())).estado).toBe('VIGENTE');
    expect(await filasBitacora(ids.propiaV2.toString())).toEqual([]);
  });

  it('activar publica la versión siguiente con el contenido de la última y deja REACTIVAR', async () => {
    expect((await desactivar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO })).status).toBe(200);
    const anterior = (await consultar('/reglas-validacion/ZVT_HU24_PROPIA/historial')).body[0];

    const res = await activar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: 'vitest-hu24 reactivación' });
    expect(res.status).toBe(201);
    const campos = [
      'nombre', 'descripcion', 'tipo', 'ambito', 'severidad', 'vacunas', 'parametros', 'mensaje', 'territorio',
    ];
    for (const campo of campos) expect(res.body[campo], campo).toEqual(anterior[campo]);
    expect(res.body).toMatchObject({ version: 3, estado: 'VIGENTE', motivoCambio: 'vitest-hu24 reactivación' });
    expect((await filasBitacora(res.body.id)).map((f) => f.accion)).toEqual(['REACTIVAR']);
    expect((await documentoCrudo(ids.propiaV2.toString())).estado).toBe('HISTORICO');

    const otraVez = await activar('ZVT_HU24_PROPIA', { version: 3, motivoCambio: MOTIVO });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error).toEqual({
      codigo: 'REGLA_SIN_VERSION_PROPIA',
      mensaje: 'Solo se activa una regla de su DDRISS que esté desactivada.',
    });
  });

  it('activar con una versión que no es la última de la DDRISS responde 409 REGLA_DESACTUALIZADA', async () => {
    await desactivar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO });
    const res = await activar('ZVT_HU24_PROPIA', { version: 1, motivoCambio: MOTIVO });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('REGLA_DESACTUALIZADA');
  });

  it('una regla sin versiones de la DDRISS no se activa', async () => {
    const res = await activar('ZVT_HU24_NAC', { version: 1, motivoCambio: MOTIVO });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('REGLA_SIN_VERSION_PROPIA');
  });

  it('activar una copia con una vacuna que se desactivó después responde 422', async () => {
    await desactivar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO });
    await pool.query('UPDATE vacuna SET activa = FALSE WHERE codigo = ?', [VACUNA]);
    try {
      const res = await activar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO });
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'REGLA_INVALIDA',
        mensaje: `La vacuna ${VACUNA} no existe o está inactiva.`,
      });
    } finally {
      await pool.query('UPDATE vacuna SET activa = TRUE WHERE codigo = ?', [VACUNA]);
    }
    expect(await (await reglas()).countDocuments({ codigo: 'ZVT_HU24_PROPIA' })).toBe(2);
  });

  it.each([
    ['un campo no permitido', { version: 2, motivoCambio: MOTIVO, severidad: 'ERROR' },
      'Campo no permitido: severidad.'],
    ['sin version', { motivoCambio: MOTIVO }, 'version debe ser un número entero positivo.'],
    ['sin motivo', { version: 2, motivoCambio: '' }, 'El motivo del cambio debe tener entre 1 y 300 caracteres.'],
  ])('%s responde 400', async (_caso, cuerpo, mensaje) => {
    for (const enviarCambio of [desactivar, activar]) {
      const res = await enviarCambio('ZVT_HU24_PROPIA', cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
    }
  });

  it('una regla de otra DDRISS responde 404 y el Revisor recibe 403', async () => {
    expect((await desactivar('ZVT_HU24_OTRA', { version: 1, motivoCambio: MOTIVO })).status).toBe(404);
    expect((await activar('ZVT_HU24_OTRA', { version: 1, motivoCambio: MOTIVO })).status).toBe(404);
    expect((await desactivar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO }, tokenRevisor)).status).toBe(403);
    expect((await activar('ZVT_HU24_PROPIA', { version: 2, motivoCambio: MOTIVO }, tokenRevisor)).status).toBe(403);
  });
});
