import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import request from 'supertest';
import { Collection, Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas crean por SQL las vacunas ZVT_HU35 (activa, con D1 a D3 activas y D4 inactiva) y ZVT_HU35I (inactiva),
// e insertan en MongoDB indicadores cuyo código empieza con ZVT_HU35, entre ellos uno de la DDRISS ficticia
// ZVT_OTRA35. Los que crean por la API llevan un código generado que contiene ZVT_HU35 (COB_ZVT_HU352) y un nombre
// que empieza con vitest-hu35-. Todo se borra al inicio y al final; los indicadores de la semilla no se tocan.
const VACUNA = 'ZVT_HU35';
const VACUNA_INACTIVA = 'ZVT_HU35I';
const DDRISS_OTRA = 'ZVT_OTRA35';
const NACIONAL = { nivel: 'NACIONAL', ddriss_codigo: null };

let ddrissUsuario;
let token;
let tokenRevisor;
// Ids nuevos en cada carga: la bitácora no se borra, y una fila de un caso no debe verse en otro.
const ids = {};

const indicadores = async () => (await obtenerDb()).collection('configuracion_indicadores');

const desde = (fecha) => ({ desde: new Date(fecha), hasta: null });

function auditoria(estado, fecha, version) {
  return {
    creado_por: new Int32(4),
    creado_en: fecha,
    publicado_por: estado === 'BORRADOR' ? null : new Int32(4),
    publicado_en: estado === 'BORRADOR' ? null : fecha,
    motivo_cambio: `vitest-hu35 v${version}`,
  };
}

function cobertura({ _id, codigo, version, territorio, estado, vigencia, dosis = 'D3', meta = 95 }) {
  return {
    _id,
    codigo,
    version: new Int32(version),
    nombre: `ZVT ${codigo} v${version}`,
    tipo_calculo: 'COBERTURA',
    aplica_a: [
      { vacuna: VACUNA, dosis, clasificacion_poblacion: 'MENOR_1', filtros_dimension: { grupo_edad: ['MENOR_1'] } },
    ],
    numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
    denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
    meta: { valor: meta, unidad: 'PORCENTAJE', comparador: '>', homogeneidad_municipal: true },
    umbrales: [
      { color: 'verde', desde: 90, hasta: null },
      { color: 'amarillo', desde: 80, hasta: 90 },
      { color: 'rojo', desde: 0, hasta: 80 },
    ],
    umbrales_provisionales: false,
    es_indicador_mapa: false,
    niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
    periodicidad: 'MENSUAL',
    alerta: { generar: false },
    es_estimacion: false,
    territorio,
    estado,
    vigencia,
    auditoria: auditoria(estado, vigencia.desde, version),
  };
}

function desercion({ _id, codigo, version, territorio, estado, vigencia }) {
  return {
    _id,
    codigo,
    version: new Int32(version),
    nombre: `ZVT ${codigo} v${version}`,
    tipo_calculo: 'DESERCION',
    aplica_a: [{ vacuna: VACUNA, dosis_inicial: 'D1', dosis_final: 'D3' }],
    numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
    denominador: { fuente: 'PRODUCCION' },
    meta: { valor: 10, unidad: 'PORCENTAJE', comparador: '<=' },
    umbrales: [
      { color: 'verde', desde: null, hasta: 10 * version },
      { color: 'amarillo', desde: 10 * version, hasta: 10 * version + 5 },
      { color: 'rojo', desde: 10 * version + 5, hasta: null },
    ],
    umbrales_provisionales: false,
    es_indicador_mapa: false,
    niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
    periodicidad: 'MENSUAL',
    alerta: { generar: false },
    es_estimacion: false,
    territorio,
    estado,
    vigencia,
    auditoria: auditoria(estado, vigencia.desde, version),
  };
}

async function limpiar() {
  await (await indicadores()).deleteMany({ $or: [{ codigo: /ZVT_HU35/ }, { nombre: /^vitest-hu35-/ }] });
  // Una corrida de otro archivo que coincida en el tiempo calcula estos indicadores (SPEC 44): sin esto, la vacuna no se borra.
  await pool.query(
    'DELETE ri FROM resultado_indicador ri JOIN vacuna v ON v.id = ri.vacuna_id WHERE v.codigo IN (?)',
    [[VACUNA, VACUNA_INACTIVA]],
  );
  await pool.query(
    'DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)',
    [[VACUNA, VACUNA_INACTIVA]],
  );
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [[VACUNA, VACUNA_INACTIVA]]);
}

async function preparar() {
  const [alta] = await pool.query(
    `INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, 'vitest-hu35 Vacuna', 999, TRUE)`,
    [VACUNA],
  );
  await pool.query(
    `INSERT INTO dosis (vacuna_id, codigo, nombre, orden, completa_esquema, activa) VALUES
       (?, 'D1', 'Primera dosis', 1, FALSE, TRUE),
       (?, 'D2', 'Segunda dosis', 2, FALSE, TRUE),
       (?, 'D3', 'Tercera dosis', 3, TRUE, TRUE),
       (?, 'D4', 'Cuarta dosis', 4, FALSE, FALSE)`,
    [alta.insertId, alta.insertId, alta.insertId, alta.insertId],
  );
  const [inactiva] = await pool.query(
    `INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, 'vitest-hu35 Inactiva', FALSE)`,
    [VACUNA_INACTIVA],
  );
  await pool.query(
    `INSERT INTO dosis (vacuna_id, codigo, nombre, orden, completa_esquema) VALUES (?, 'D1', 'Primera dosis', 1, TRUE)`,
    [inactiva.insertId],
  );
  await prepararIndicadores();
}

// Deja los indicadores ZVT_HU35* como al empezar: las pruebas que publican les agregan versiones.
async function prepararIndicadores() {
  await (await indicadores()).deleteMany({ codigo: /^ZVT_HU35/ });
  for (const clave of ['nacional', 'propiaV1', 'propiaV2', 'otra', 'borrador']) ids[clave] = new ObjectId();
  const propia = { nivel: 'DDRISS', ddriss_codigo: ddrissUsuario };
  await (await indicadores()).insertMany([
    cobertura({ _id: ids.nacional, codigo: 'ZVT_HU35_NAC', version: 1, territorio: NACIONAL, estado: 'VIGENTE',
      vigencia: desde('2026-10-01T06:00:00Z') }),
    desercion({ _id: ids.propiaV1, codigo: 'ZVT_HU35_PROPIA', version: 1, territorio: propia, estado: 'HISTORICO',
      vigencia: { desde: new Date('2026-10-01T06:00:00Z'), hasta: new Date('2026-10-15T15:00:00Z') } }),
    desercion({ _id: ids.propiaV2, codigo: 'ZVT_HU35_PROPIA', version: 2, territorio: propia, estado: 'VIGENTE',
      vigencia: desde('2026-10-15T15:00:00Z') }),
    cobertura({ _id: ids.otra, codigo: 'ZVT_HU35_OTRA', version: 1, dosis: 'D2',
      territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS_OTRA }, estado: 'VIGENTE',
      vigencia: desde('2026-10-01T06:00:00Z') }),
    cobertura({ _id: ids.borrador, codigo: 'ZVT_HU35_BORR', version: 1, dosis: 'D1', territorio: NACIONAL,
      estado: 'BORRADOR', vigencia: desde('2026-11-01T06:00:00Z') }),
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
  const codigos = permisos.map((p) => p.codigo);
  const credencial = await tokenDePrueba(cuenta.id, {
    rol,
    permisos: codigos,
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  });
  return { token: credencial, permisos: codigos, ddrissId: cuenta.ddriss_id };
}

const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
const enviar = (ruta, cuerpo, credencial = token) =>
  request(app).post(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);

async function filasBitacora(entidadId) {
  const [filas] = await pool.query(
    `SELECT accion, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND entidad = 'configuracion_indicadores' AND entidad_id = ?
      ORDER BY id`,
    [entidadId],
  );
  return filas.map((f) => ({ accion: f.accion, anteriores: f.valores_anteriores, nuevos: f.valores_nuevos }));
}

// Filas CREAR de los indicadores creados por la API con ese nombre (el id de un alta fallida no se conoce).
async function filasCrearConNombre(nombre) {
  const [[{ filas }]] = await pool.query(
    `SELECT COUNT(*) AS filas FROM bitacora
      WHERE entidad = 'configuracion_indicadores' AND accion = 'CREAR'
        AND JSON_UNQUOTE(JSON_EXTRACT(valores_nuevos, '$.nombre')) = ?`,
    [nombre],
  );
  return filas;
}

// Sin promoteValues el driver no convierte los enteros a number: se ve si se guardaron como int o como double.
const documentoCrudo = async (id) =>
  (await indicadores()).findOne({ _id: new ObjectId(id) }, { promoteValues: false });

const MOTIVO = 'Prueba de vitest (HU-35).';
const MENSAJE_CORTES = 'Los cortes del semáforo deben ser dos números de 0 a 100, con un decimal como máximo, y el '
  + 'primero menor que el segundo.';
const avance = (cambios = {}) => ({
  tipoCalculo: 'AVANCE_META_MES',
  vacuna: VACUNA,
  nombre: 'vitest-hu35-avance',
  dosis: 'D2',
  clasificacionPoblacion: 'MENOR_1',
  cortes: [80, 90],
  motivoCambio: MOTIVO,
  ...cambios,
});
const desercionNueva = (cambios = {}) => ({
  tipoCalculo: 'DESERCION',
  vacuna: VACUNA,
  nombre: 'vitest-hu35-desercion',
  dosisInicial: 'D1',
  dosisFinal: 'D2',
  meta: 10,
  cortes: [10, 15],
  motivoCambio: MOTIVO,
  ...cambios,
});

beforeAll(async () => {
  const epidemiologia = await tokenDeLaSemilla('EPIDEMIOLOGIA');
  if (!epidemiologia.permisos.includes('INDICADOR_CONFIG_CONSULTAR')) {
    throw new Error('Epidemiología no tiene INDICADOR_CONFIG_CONSULTAR: corra el 05 y vuelva a intentar');
  }
  token = epidemiologia.token;
  const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = ?', [epidemiologia.ddrissId]);
  ddrissUsuario = ddriss.codigo;
  tokenRevisor = (await tokenDeLaSemilla('REVISOR')).token;
  await limpiar();
  await preparar();
});

afterAll(limpiar);

describe('GET /configuracion-indicadores', () => {
  let filas;
  const fila = (codigo) => filas.find((f) => f.codigo === codigo);

  beforeAll(async () => {
    const res = await consultar('/configuracion-indicadores');
    expect(res.status).toBe(200);
    filas = res.body;
  });

  it('un indicador nacional aplica tal cual, sin versión de la DDRISS', () => {
    expect(fila('COB_HEXA3')).toMatchObject({
      tipoCalculo: 'COBERTURA',
      vacuna: { codigo: 'HEXA', activa: true },
      aplica: {
        codigo: 'COB_HEXA3',
        version: 1,
        territorio: { nivel: 'NACIONAL', ddrissCodigo: null },
        estado: 'VIGENTE',
        dosis: 'D3',
        clasificacionPoblacion: 'MENOR_1',
        grupoEdad: 'MENOR_1',
        meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>' },
      },
      ultimaDdriss: null,
      vigenteNacional: { version: 1 },
    });
  });

  it('el borrador de AVANCE_HEXA3 no cuenta: aplica su versión 1', () => {
    const avance = fila('AVANCE_HEXA3');
    expect(avance.aplica).toMatchObject({
      version: 1,
      tipoCalculo: 'AVANCE_META_MES',
      denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
      meta: { valor: 100, comparador: '>=' },
      umbralesProvisionales: true,
      esIndicadorMapa: true,
      parametros: { mostrar_diferencia: true, redondeo: 'ARRIBA', minimo_cero: true },
      alerta: { generar: true, tipo: 'COBERTURA_BAJO_META', rolDestino: ['EPIDEMIOLOGIA', 'REVISOR'] },
    });
    expect(avance.aplica.umbrales).toHaveLength(3);
    expect(avance.vigenteNacional).toEqual({ version: 1 });
  });

  it('la deserción trae sus dos dosis y sus franjas tal cual', () => {
    expect(fila('DES_HEXA1_3').aplica).toMatchObject({
      dosis: null,
      dosisInicial: 'D1',
      dosisFinal: 'D3',
      clasificacionPoblacion: null,
      umbrales: [{ color: 'verde', desde: null, hasta: 10 }, { color: 'rojo', desde: 10, hasta: null }],
    });
  });

  it('los indicadores de prueba aplican según su territorio, con la vacuna de MySQL', () => {
    expect(fila('ZVT_HU35_NAC')).toMatchObject({
      vacuna: { codigo: VACUNA, nombre: 'vitest-hu35 Vacuna', activa: true },
      aplica: { version: 1, territorio: { nivel: 'NACIONAL' } },
      ultimaDdriss: null,
    });
    expect(fila('ZVT_HU35_PROPIA')).toMatchObject({
      tipoCalculo: 'DESERCION',
      aplica: { version: 2, territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario }, publicadoPor: { id: 4 } },
      ultimaDdriss: { version: 2 },
      vigenteNacional: null,
    });
  });

  it('no trae los indicadores de otra DDRISS ni los que solo tienen borrador', () => {
    expect(fila('ZVT_HU35_OTRA')).toBeUndefined();
    expect(fila('ZVT_HU35_BORR')).toBeUndefined();
  });

  it('ordena por vacuna y luego por tipo', () => {
    const hexa = filas.filter((f) => f.vacuna.codigo === 'HEXA').map((f) => f.codigo);
    expect(hexa).toEqual(['COB_HEXA3', 'AVANCE_HEXA3', 'BRECHA_HEXA3', 'DES_HEXA1_3', 'PROY_COB_HEXA3']);
    const nombres = filas.map((f) => f.vacuna.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('un parámetro desconocido responde 400', async () => {
    const res = await consultar('/configuracion-indicadores?vacuna=HEXA');
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'Parámetro no permitido: vacuna.' });
  });
});

describe('GET /configuracion-indicadores/{codigo}/historial', () => {
  it('trae las versiones de la DDRISS de la más reciente a la más antigua', async () => {
    const res = await consultar('/configuracion-indicadores/ZVT_HU35_PROPIA/historial');
    expect(res.status).toBe(200);
    expect(res.body.map((v) => [v.version, v.estado])).toEqual([[2, 'VIGENTE'], [1, 'HISTORICO']]);
    expect(res.body[1]).toMatchObject({
      vigencia: { desde: '2026-10-01T06:00:00.000Z', hasta: '2026-10-15T15:00:00.000Z' },
      motivoCambio: 'vitest-hu35 v1',
      desactivacion: null,
    });
  });

  it('el de otra DDRISS, un código inexistente o mal formado responde 404', async () => {
    for (const codigo of ['ZVT_HU35_OTRA', 'ZVT_HU35_NO_EXISTE', 'zvt-hu35', 'ZVT_HU35_BORR']) {
      const res = await consultar(`/configuracion-indicadores/${codigo}/historial`);
      expect(res.status, codigo).toBe(404);
    }
  });

  it('un parámetro desconocido responde 400', async () => {
    const res = await consultar('/configuracion-indicadores/ZVT_HU35_PROPIA/historial?estado=VIGENTE');
    expect(res.status).toBe(400);
  });
});

describe('GET /configuracion-indicadores/opciones', () => {
  let opciones;

  beforeAll(async () => {
    const res = await consultar('/configuracion-indicadores/opciones');
    expect(res.status).toBe(200);
    opciones = res.body;
  });

  it('trae las vacunas activas con sus dosis activas, sin las inactivas', () => {
    expect(opciones.vacunas.find((v) => v.codigo === VACUNA)).toEqual({
      codigo: VACUNA,
      nombre: 'vitest-hu35 Vacuna',
      dosis: [
        { codigo: 'D1', nombre: 'Primera dosis', orden: 1, completaEsquema: false },
        { codigo: 'D2', nombre: 'Segunda dosis', orden: 2, completaEsquema: false },
        { codigo: 'D3', nombre: 'Tercera dosis', orden: 3, completaEsquema: true },
      ],
    });
    expect(opciones.vacunas.find((v) => v.codigo === VACUNA_INACTIVA)).toBeUndefined();
  });

  it('trae las clasificaciones de población y los grupos de edad activos', async () => {
    const [clasificaciones] = await pool.query('SELECT codigo FROM clasificacion_poblacion ORDER BY id');
    expect(opciones.clasificaciones.map((c) => c.codigo)).toEqual(clasificaciones.map((c) => c.codigo));
    const dimension = await (await obtenerDb()).collection('catalogo_dimensiones').findOne({ codigo: 'grupo_edad' });
    const activos = dimension.valores.filter((v) => v.activo).sort((a, b) => a.orden - b.orden).map((v) => v.codigo);
    expect(opciones.gruposEdad.map((g) => g.codigo)).toEqual(activos);
    expect(activos).toContain('MENOR_1');
  });

  it('un parámetro desconocido responde 400', async () => {
    expect((await consultar('/configuracion-indicadores/opciones?activa=true')).status).toBe(400);
  });
});

describe('permisos', () => {
  it('sin INDICADOR_CONFIG_CONSULTAR responde 403', async () => {
    for (const ruta of [
      '/configuracion-indicadores',
      '/configuracion-indicadores/opciones',
      '/configuracion-indicadores/ZVT_HU35_PROPIA/historial',
    ]) {
      const res = await consultar(ruta, tokenRevisor);
      expect(res.status, ruta).toBe(403);
    }
  });
});

describe('POST /configuracion-indicadores', () => {
  const crear = (cuerpo, credencial) => enviar('/configuracion-indicadores', cuerpo, credencial);

  it('crea un avance con su código, la versión 1 de la DDRISS y los valores por defecto del tipo', async () => {
    const res = await crear(avance({ descripcion: '  Avance de prueba  ' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: `AVANCE_${VACUNA}2`,
      version: 1,
      nombre: 'vitest-hu35-avance',
      descripcion: 'Avance de prueba',
      tipoCalculo: 'AVANCE_META_MES',
      vacuna: { codigo: VACUNA, nombre: 'vitest-hu35 Vacuna', activa: true },
      dosis: 'D2',
      clasificacionPoblacion: 'MENOR_1',
      grupoEdad: null,
      numerador: { fuente: 'PRODUCCION', estadosReporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
      denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
      meta: { valor: 100, unidad: 'PORCENTAJE', comparador: '>=' },
      umbrales: [
        { color: 'verde', desde: 90, hasta: null },
        { color: 'amarillo', desde: 80, hasta: 90 },
        { color: 'rojo', desde: 0, hasta: 80 },
      ],
      umbralesProvisionales: false,
      esIndicadorMapa: false,
      parametros: { mostrar_diferencia: true, redondeo: 'ARRIBA', minimo_cero: true },
      alerta: { generar: false },
      esEstimacion: false,
      territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
      estado: 'VIGENTE',
      publicadoPor: { id: 4, nombreUsuario: 'epidemiologia' },
      motivoCambio: MOTIVO,
    });

    const crudo = await documentoCrudo(res.body.id);
    expect(crudo.version).toBeInstanceOf(Int32);
    expect(crudo.auditoria.creado_por).toBeInstanceOf(Int32);
    expect(crudo.auditoria.publicado_por).toBeInstanceOf(Int32);
    expect(crudo.vigencia.desde).toEqual(crudo.auditoria.publicado_en);
    expect(crudo.aplica_a).toEqual([{ vacuna: VACUNA, dosis: 'D2', clasificacion_poblacion: 'MENOR_1' }]);
    expect(crudo.meta.homogeneidad_municipal).toBe(true);
    expect(crudo.niveles).toEqual(['MUNICIPIO', 'DEPARTAMENTO']);
    expect(crudo.periodicidad).toBe('MENSUAL');

    const filas = await filasBitacora(res.body.id);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      accion: 'CREAR',
      anteriores: null,
      nuevos: { codigo: `AVANCE_${VACUNA}2`, publicadoPor: 4 },
    });
  });

  it('otro avance de la misma vacuna y dosis responde 409 con el código existente', async () => {
    const res = await crear(avance({ nombre: 'vitest-hu35-repetido', grupoEdad: 'MENOR_1' }));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        codigo: 'INDICADOR_DUPLICADO',
        mensaje: `Ya existe el indicador AVANCE_${VACUNA}2 para la misma vacuna y dosis; publique una versión de ese.`,
      },
      codigoExistente: `AVANCE_${VACUNA}2`,
    });
  });

  it('una cobertura que mide lo mismo que la nacional responde 409 con su código', async () => {
    const res = await crear({
      tipoCalculo: 'COBERTURA', vacuna: VACUNA, nombre: 'vitest-hu35-cobertura', dosis: 'D3',
      clasificacionPoblacion: '1_A_MENOR_2', prorrateo: 'MENSUAL_LINEAL', meta: 90, cortes: [70, 85], motivoCambio: MOTIVO,
    });
    expect(res.status).toBe(409);
    expect(res.body.codigoExistente).toBe('ZVT_HU35_NAC');
  });

  it('una cobertura anual convive con la mensual de la misma dosis y lleva COB_ANUAL (SPEC 60)', async () => {
    const anual = {
      tipoCalculo: 'COBERTURA', vacuna: VACUNA, nombre: 'vitest-hu35-cobertura-anual', dosis: 'D3',
      clasificacionPoblacion: 'MENOR_1', prorrateo: 'NINGUNO', meta: 95, cortes: [80, 90], motivoCambio: MOTIVO,
    };
    try {
      const alta = await crear(anual);
      expect(alta.status).toBe(201);
      expect(alta.body).toMatchObject({ codigo: `COB_ANUAL_${VACUNA}3`, denominador: { prorrateo: 'NINGUNO' } });

      const otra = await crear({ ...anual, nombre: 'vitest-hu35-cobertura-anual-2' });
      expect(otra.status).toBe(409);
      expect(otra.body).toMatchObject({ error: { codigo: 'INDICADOR_DUPLICADO' }, codigoExistente: `COB_ANUAL_${VACUNA}3` });
    } finally {
      // Sin borrarla, la versión NINGUNO de ZVT_HU35_NAC (D3) de una prueba posterior chocaría con esta.
      await (await indicadores()).deleteMany({ codigo: `COB_ANUAL_${VACUNA}3` });
    }
  });

  it('crea una deserción sin población ni prorrateo, con las franjas descendentes', async () => {
    const res = await crear(desercionNueva({ grupoEdad: 'MENOR_1' }));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: `DES_${VACUNA}1_2`,
      dosis: null,
      dosisInicial: 'D1',
      dosisFinal: 'D2',
      clasificacionPoblacion: null,
      grupoEdad: 'MENOR_1',
      denominador: { fuente: 'PRODUCCION' },
      meta: { valor: 10, comparador: '<=' },
      umbrales: [
        { color: 'verde', desde: null, hasta: 10 },
        { color: 'amarillo', desde: 10, hasta: 15 },
        { color: 'rojo', desde: 15, hasta: null },
      ],
    });
    const crudo = await documentoCrudo(res.body.id);
    expect(crudo.aplica_a).toEqual([
      { vacuna: VACUNA, dosis_inicial: 'D1', dosis_final: 'D2', filtros_dimension: { grupo_edad: ['MENOR_1'] } },
    ]);
    expect(crudo.parametros).toBeUndefined();
  });

  it.each([
    ['un tipo que no se crea', { tipoCalculo: 'PROYECCION' },
      'Solo se crean indicadores de tipo COBERTURA, AVANCE_META_MES, BRECHA o DESERCION.'],
    ['un campo desconocido', { codigo: 'X' }, 'Campo no permitido: codigo.'],
    ['la meta en un avance', { meta: 100 }, 'Los indicadores de tipo AVANCE_META_MES no llevan meta editable.'],
    ['cortes invertidos', { cortes: [90, 80] }, MENSAJE_CORTES],
    ['un nombre corto', { nombre: 'ab' }, 'El nombre del indicador debe tener entre 3 y 120 caracteres.'],
    ['sin motivo', { motivoCambio: '' }, 'El motivo del cambio debe tener entre 1 y 300 caracteres.'],
    ['una vacuna mal escrita', { vacuna: 'zvt hu35' },
      'vacuna debe ser un código en mayúsculas, dígitos y guion bajo.'],
  ])('rechaza con 400 %s', async (_caso, cambios, mensaje) => {
    const res = await crear(avance({ nombre: 'vitest-hu35-400', ...cambios }));
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('rechaza con 400 el prorrateo en una deserción y la dosis inicial después de la final', async () => {
    let res = await crear(desercionNueva({ prorrateo: 'NINGUNO' }));
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('Los indicadores de tipo DESERCION no llevan prorrateo.');
    res = await crear(desercionNueva({ dosisInicial: 'D3', dosisFinal: 'D1' }));
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('La dosis inicial debe ir antes que la final.');
  });

  it.each([
    ['una vacuna inactiva', { vacuna: VACUNA_INACTIVA }, `La vacuna ${VACUNA_INACTIVA} no existe o está inactiva.`],
    ['una dosis inactiva', { dosis: 'D4' }, `La dosis D4 no existe o está inactiva en ${VACUNA}.`],
    ['un grupo de población que no existe', { clasificacionPoblacion: 'ZVT_NO' },
      'El grupo de población ZVT_NO no existe.'],
    ['un grupo de edad que no existe', { grupoEdad: 'ZVT_NO' }, 'El grupo de edad ZVT_NO no existe o está inactivo.'],
  ])('rechaza con 422 %s', async (_caso, cambios, mensaje) => {
    const res = await crear(avance({ nombre: 'vitest-hu35-422', dosis: 'D1', ...cambios }));
    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ codigo: 'INDICADOR_INVALIDO', mensaje });
  });

  it('si MongoDB falla, no queda el indicador ni su fila de bitácora', async () => {
    const nombre = 'vitest-hu35-falla';
    const insertar = vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new Error('Falla simulada'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await crear(avance({ nombre, dosis: 'D1' }));
      expect(res.status).toBe(500);
    } finally {
      insertar.mockRestore();
      registro.mockRestore();
    }
    expect(await (await indicadores()).countDocuments({ nombre })).toBe(0);
    expect(await filasCrearConNombre(nombre)).toBe(0);
  });

  it('sin INDICADOR_CONFIG_EDITAR responde 403', async () => {
    const res = await crear(avance({ nombre: 'vitest-hu35-revisor', dosis: 'D1' }), tokenRevisor);
    expect(res.status).toBe(403);
  });
});

describe('POST /configuracion-indicadores/{codigo}/versiones', () => {
  const publicar = (codigo, cuerpo, credencial) =>
    enviar(`/configuracion-indicadores/${codigo}/versiones`, cuerpo, credencial);
  const versionPropia = (cambios = {}) => ({
    versionBase: 2,
    nombre: 'ZVT ZVT_HU35_PROPIA v2',
    dosisInicial: 'D1',
    dosisFinal: 'D3',
    meta: 10,
    cortes: [12, 18],
    motivoCambio: MOTIVO,
    ...cambios,
  });
  const versionNacional = (cambios = {}) => ({
    versionBase: 1,
    nombre: 'ZVT ZVT_HU35_NAC v1',
    dosis: 'D3',
    clasificacionPoblacion: 'MENOR_1',
    grupoEdad: 'MENOR_1',
    prorrateo: 'MENSUAL_LINEAL',
    meta: 90,
    cortes: [80, 90],
    motivoCambio: MOTIVO,
    ...cambios,
  });
  const versionesDe = async (codigo) => (await indicadores()).find({ codigo }).sort({ version: 1 }).toArray();

  beforeEach(prepararIndicadores);

  it('publica la versión siguiente y pasa la anterior de la DDRISS a HISTORICO sin cambiar su contenido', async () => {
    const antes = await documentoCrudo(ids.propiaV2.toString());
    const res = await publicar('ZVT_HU35_PROPIA', versionPropia());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: 'ZVT_HU35_PROPIA',
      version: 3,
      estado: 'VIGENTE',
      tipoCalculo: 'DESERCION',
      territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
      umbrales: [
        { color: 'verde', desde: null, hasta: 12 },
        { color: 'amarillo', desde: 12, hasta: 18 },
        { color: 'rojo', desde: 18, hasta: null },
      ],
    });

    const nueva = await documentoCrudo(res.body.id);
    const anterior = await documentoCrudo(ids.propiaV2.toString());
    expect(anterior.estado).toBe('HISTORICO');
    expect(anterior.vigencia.hasta).toEqual(nueva.vigencia.desde);
    const { estado: _e, vigencia: _v, ...restoAntes } = antes;
    const { estado: _e2, vigencia: _v2, ...restoDespues } = anterior;
    expect(restoDespues).toEqual(restoAntes);
    expect(nueva.numerador).toEqual(antes.numerador);
    expect(nueva.alerta).toEqual(antes.alerta);
    expect(nueva.niveles).toEqual(antes.niveles);
    expect(nueva.version).toBeInstanceOf(Int32);

    expect((await filasBitacora(res.body.id)).map((f) => f.accion)).toEqual(['CREAR']);
    expect(await filasBitacora(ids.propiaV2.toString())).toEqual([{
      accion: 'ACTUALIZAR',
      anteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
      nuevos: { estado: 'HISTORICO', vigencia: { hasta: nueva.vigencia.desde.toISOString() } },
    }]);
  });

  it('una versión de un indicador nacional es de la DDRISS y no toca la nacional', async () => {
    const res = await publicar('ZVT_HU35_NAC', versionNacional());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      version: 2,
      territorio: { nivel: 'DDRISS', ddrissCodigo: ddrissUsuario },
      meta: { valor: 90, comparador: '>' },
    });
    expect((await documentoCrudo(ids.nacional.toString())).estado).toBe('VIGENTE');
    const fila = (await consultar('/configuracion-indicadores')).body.find((f) => f.codigo === 'ZVT_HU35_NAC');
    expect(fila).toMatchObject({ aplica: { version: 2 }, vigenteNacional: { version: 1 } });
    expect((await filasBitacora(res.body.id)).map((f) => f.accion)).toEqual(['CREAR']);
  });

  it('una versionBase vieja responde 409 y un contenido igual al que aplica responde 422', async () => {
    let res = await publicar('ZVT_HU35_PROPIA', versionPropia({ versionBase: 1 }));
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'INDICADOR_DESACTUALIZADO',
      mensaje: 'El indicador ZVT_HU35_PROPIA cambió mientras lo editaba; vuelva a abrirlo.',
    });
    res = await publicar('ZVT_HU35_PROPIA', versionPropia({ cortes: [20, 25] }));
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('INDICADOR_SIN_CAMBIOS');
    expect(await versionesDe('ZVT_HU35_PROPIA')).toHaveLength(2);
  });

  it.each([
    ['el tipo', { tipoCalculo: 'DESERCION' }, 'Campo no permitido: tipoCalculo.'],
    ['la vacuna', { vacuna: VACUNA }, 'Campo no permitido: vacuna.'],
    ['sin versionBase', { versionBase: undefined }, 'versionBase debe ser un número entero positivo.'],
  ])('%s en el cuerpo responde 400', async (_caso, cambios, mensaje) => {
    const res = await publicar('ZVT_HU35_PROPIA', versionPropia(cambios));
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe(mensaje);
  });

  it('pasar a la dosis de otro código que aplica responde 409 con ese código', async () => {
    const alta = await enviar('/configuracion-indicadores', {
      tipoCalculo: 'COBERTURA', vacuna: VACUNA, nombre: 'vitest-hu35-cobertura-d1', dosis: 'D1',
      clasificacionPoblacion: 'MENOR_1', prorrateo: 'MENSUAL_LINEAL', meta: 90, cortes: [70, 85], motivoCambio: MOTIVO,
    });
    expect(alta.status).toBe(201);
    const res = await publicar('ZVT_HU35_NAC', versionNacional({ dosis: 'D1' }));
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: { codigo: 'INDICADOR_DUPLICADO' }, codigoExistente: alta.body.codigo });
  });

  it('un código de otra DDRISS responde 404', async () => {
    const res = await publicar('ZVT_HU35_OTRA', versionNacional({ dosis: 'D2' }));
    expect(res.status).toBe(404);
  });

  it('de dos versiones a la vez, una se publica y la otra responde 409', async () => {
    const [a, b] = await Promise.all([
      publicar('ZVT_HU35_PROPIA', versionPropia({ cortes: [11, 16] })),
      publicar('ZVT_HU35_PROPIA', versionPropia({ cortes: [13, 19] })),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const vigentes = (await versionesDe('ZVT_HU35_PROPIA')).filter((d) => d.estado === 'VIGENTE');
    expect(vigentes).toHaveLength(1);
  });

  it('si falla la versión nueva, la anterior sigue VIGENTE y no quedan filas de bitácora', async () => {
    const antes = await documentoCrudo(ids.propiaV2.toString());
    const insertar = vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new Error('Falla simulada'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await publicar('ZVT_HU35_PROPIA', versionPropia());
      expect(res.status).toBe(500);
    } finally {
      insertar.mockRestore();
      registro.mockRestore();
    }
    expect(await documentoCrudo(ids.propiaV2.toString())).toEqual(antes);
    expect(await versionesDe('ZVT_HU35_PROPIA')).toHaveLength(2);
    expect(await filasBitacora(ids.propiaV2.toString())).toEqual([]);
  });

  it('sin INDICADOR_CONFIG_EDITAR responde 403', async () => {
    const res = await publicar('ZVT_HU35_PROPIA', versionPropia(), tokenRevisor);
    expect(res.status).toBe(403);
  });
});

describe('desactivar y activar', () => {
  const desactivar = (codigo, cuerpo, credencial) =>
    enviar(`/configuracion-indicadores/${codigo}/desactivar`, cuerpo, credencial);
  const activar = (codigo, cuerpo, credencial) =>
    enviar(`/configuracion-indicadores/${codigo}/activar`, cuerpo, credencial);
  const motivo = 'Epidemiología usará el indicador nacional (vitest).';

  beforeEach(prepararIndicadores);

  it('desactivar deja el indicador sin versión que aplique y guarda el motivo en la bitácora', async () => {
    const res = await desactivar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: motivo });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      codigo: 'ZVT_HU35_PROPIA',
      aplica: null,
      ultimaDdriss: { version: 2, estado: 'HISTORICO' },
      vigenteNacional: null,
    });
    const [fila] = await filasBitacora(ids.propiaV2.toString());
    expect(fila).toMatchObject({
      accion: 'DESACTIVAR',
      anteriores: { estado: 'VIGENTE', vigencia: { hasta: null } },
      nuevos: { estado: 'HISTORICO', motivoCambio: motivo },
    });
    const historial = (await consultar('/configuracion-indicadores/ZVT_HU35_PROPIA/historial')).body;
    expect(historial[0].desactivacion).toMatchObject({ por: { id: 4, nombreUsuario: 'epidemiologia' }, motivo });
    expect(historial[1].desactivacion).toBeNull();
  });

  it('desactivar la versión de la DDRISS de un indicador nacional vuelve a aplicar la nacional', async () => {
    const version = await enviar('/configuracion-indicadores/ZVT_HU35_NAC/versiones', {
      versionBase: 1, nombre: 'ZVT ZVT_HU35_NAC v1', dosis: 'D3', clasificacionPoblacion: 'MENOR_1',
      grupoEdad: 'MENOR_1', prorrateo: 'NINGUNO', meta: 95, cortes: [80, 90], motivoCambio: MOTIVO,
    });
    expect(version.status).toBe(201);
    const res = await desactivar('ZVT_HU35_NAC', { version: 2, motivoCambio: motivo });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      aplica: { version: 1, territorio: { nivel: 'NACIONAL' } },
      ultimaDdriss: { version: 2, estado: 'HISTORICO' },
    });
  });

  it('un indicador nacional sin versión de la DDRISS no se desactiva', async () => {
    const res = await desactivar('ZVT_HU35_NAC', { version: 1, motivoCambio: motivo });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'INDICADOR_SIN_VERSION_PROPIA',
      mensaje: 'Su DDRISS no tiene una versión activa de este indicador; los indicadores nacionales no se desactivan.',
    });
  });

  it('una versión que no es la VIGENTE responde 409 y un cuerpo de más responde 400', async () => {
    let res = await desactivar('ZVT_HU35_PROPIA', { version: 1, motivoCambio: motivo });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('INDICADOR_DESACTUALIZADO');
    res = await desactivar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: motivo, meta: 5 });
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('Campo no permitido: meta.');
  });

  it('activar publica la versión siguiente con el contenido de la última y deja REACTIVAR', async () => {
    expect((await desactivar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: motivo })).status).toBe(200);
    const anterior = await documentoCrudo(ids.propiaV2.toString());
    const res = await activar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: 'Se vuelve a usar (vitest).' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ version: 3, estado: 'VIGENTE', motivoCambio: 'Se vuelve a usar (vitest).' });

    const nueva = await documentoCrudo(res.body.id);
    for (const campo of ['nombre', 'tipo_calculo', 'aplica_a', 'numerador', 'denominador', 'meta', 'umbrales',
      'alerta', 'niveles', 'territorio']) {
      expect(nueva[campo], campo).toEqual(anterior[campo]);
    }
    expect(nueva.version).toBeInstanceOf(Int32);
    expect((await filasBitacora(res.body.id)).map((f) => f.accion)).toEqual(['REACTIVAR']);

    const otraVez = await activar('ZVT_HU35_PROPIA', { version: 3, motivoCambio: motivo });
    expect(otraVez.status).toBe(409);
    expect(otraVez.body.error).toEqual({
      codigo: 'INDICADOR_SIN_VERSION_PROPIA',
      mensaje: 'Solo se activa un indicador de su DDRISS que esté desactivado.',
    });
  });

  it('activar una copia cuya dosis se desactivó responde 422', async () => {
    expect((await desactivar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: motivo })).status).toBe(200);
    const apagar = (activa) => pool.query(
      `UPDATE dosis d JOIN vacuna v ON v.id = d.vacuna_id SET d.activa = ? WHERE v.codigo = ? AND d.codigo = 'D3'`,
      [activa, VACUNA],
    );
    await apagar(false);
    try {
      const res = await activar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: motivo });
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'INDICADOR_INVALIDO',
        mensaje: `La dosis D3 no existe o está inactiva en ${VACUNA}.`,
      });
    } finally {
      await apagar(true);
    }
  });

  it('sin INDICADOR_CONFIG_EDITAR responde 403', async () => {
    expect((await desactivar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: motivo }, tokenRevisor)).status)
      .toBe(403);
    expect((await activar('ZVT_HU35_PROPIA', { version: 2, motivoCambio: motivo }, tokenRevisor)).status).toBe(403);
  });
});
