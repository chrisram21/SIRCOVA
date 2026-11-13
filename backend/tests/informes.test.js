import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import {
  columnasAgrupadas,
  columnasDelInforme,
  dimensionDeAgrupacion,
} from '../src/modulos/informes/informes.service.js';
import { claveCombinacion } from '../src/modulos/produccion/celdas.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// SPEC 62 (HU-45): la pantalla «Informes». Por SQL: la DDRISS ficticia ZVT_INF62 con su departamento (Z8), los
// municipios Z801 y Z802 (activos) y Z803 (inactivo), un municipio real de otro departamento para el establecimiento
// externo, establecimientos ZVT62-, las vacunas ZVT_SPEC62* y reportes de diciembre de 2085 a febrero de 2086 (años
// que ninguna otra prueba usa).
// En MongoDB, dos esquemas de captura de ZVT_SPEC62: el nacional desde enero de 2086 y el de la DDRISS desde febrero.
// SPEC 63 (HU-46): la vacuna ZVT_SPEC63, con un esquema nacional desde enero de 2086 que pide sexo en D1 y D2 y no
// en R1.
// Lo consulta la Autoridad nacional con ddrissId. Se borra al inicio y al final.
const ANIO = 2086;
const DDRISS_PRUEBA = 'ZVT_INF62';
const DEPARTAMENTO_PRUEBA = 'Z8';
const PREFIJO_EST = 'ZVT62-';
const VACUNAS_PRUEBA = ['ZVT_SPEC62', 'ZVT_SPEC62I', 'ZVT_SPEC62N', 'ZVT_SPEC63'];

const cuentas = {};
const ids = { municipios: {}, establecimientos: {}, distritos: {}, vacunas: {}, dosis: {}, periodos: {} };
let ddrissId;
let usuarioId;

// El 403 y el 200 de INFORME_CONSULTAR se prueban con una cuenta cualquiera de cada rol, buscada por SQL.
async function cuentaDelRol(rol) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN empleado e ON e.id = u.empleado_id
      WHERE r.codigo = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
        AND u.nombre_usuario NOT LIKE 'vitest%' AND (e.ddriss_id IS NOT NULL OR r.codigo = 'AUTORIDAD')
      ORDER BY e.ddriss_id IS NULL DESC, u.id
      LIMIT 1`,
    [rol],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa del rol ${rol} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  return {
    id: cuenta.id,
    ddrissId: cuenta.ddriss_id,
    token: await tokenDePrueba(
      cuenta.id,
      {
        rol: cuenta.rol, permisos: permisos.map((p) => p.codigo), ddrissId: cuenta.ddriss_id,
        establecimientoId: cuenta.establecimiento_id, municipioId: cuenta.municipio_id,
      },
      { expiresIn: '10m' },
    ),
  };
}

const consultar = (ruta, consulta = '', token = cuentas.AUTORIDAD.token) =>
  request(app)
    .get(`/api/v1/informes/${ruta}${consulta ? `?${consulta}` : ''}`)
    .set('Authorization', `Bearer ${token}`);
const opciones = (consulta = `ddrissId=${ddrissId}`, token) => consultar('opciones', consulta, token);

async function limpiar() {
  const delEstablecimiento = 'SELECT id FROM establecimiento WHERE codigo LIKE ?';
  const reportes = `SELECT id FROM reporte_produccion WHERE establecimiento_id IN (${delEstablecimiento})`;
  const prefijo = `${PREFIJO_EST}%`;
  await pool.query(
    `DELETE FROM detalle_dimension WHERE detalle_id IN (SELECT id FROM (SELECT id FROM detalle_produccion
       WHERE reporte_vacuna_id IN (SELECT id FROM reporte_vacuna WHERE reporte_id IN (${reportes}))) t)`,
    [prefijo],
  );
  await pool.query(
    `DELETE FROM detalle_produccion WHERE reporte_vacuna_id IN
       (SELECT id FROM (SELECT id FROM reporte_vacuna WHERE reporte_id IN (${reportes})) t)`,
    [prefijo],
  );
  await pool.query(`DELETE FROM reporte_vacuna WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`, [prefijo]);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`, [prefijo]);
  await pool.query('DELETE FROM establecimiento WHERE codigo LIKE ?', [prefijo]);
  const deLaDdriss = 'SELECT id FROM ddriss WHERE codigo = ?';
  const redes = `SELECT id FROM red WHERE ddriss_id IN (${deLaDdriss})`;
  await pool.query(`DELETE FROM red_municipio WHERE red_id IN (SELECT id FROM (${redes}) t)`, [DDRISS_PRUEBA]);
  await pool.query(`DELETE FROM red WHERE id IN (SELECT id FROM (${redes}) t)`, [DDRISS_PRUEBA]);
  await pool.query(`DELETE FROM distrito_salud WHERE ddriss_id IN (${deLaDdriss})`, [DDRISS_PRUEBA]);
  await pool.query(`DELETE FROM cierre_periodo WHERE ddriss_id IN (${deLaDdriss})`, [DDRISS_PRUEBA]);
  await pool.query('DELETE FROM periodo WHERE anio IN (?)', [[ANIO - 1, ANIO]]);
  await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS_PRUEBA]);
  await pool.query(
    'DELETE m FROM municipio m JOIN departamento d ON d.id = m.departamento_id WHERE d.codigo_ine = ?',
    [DEPARTAMENTO_PRUEBA],
  );
  await pool.query('DELETE FROM departamento WHERE codigo_ine = ?', [DEPARTAMENTO_PRUEBA]);
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [VACUNAS_PRUEBA]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS_PRUEBA]);
  await (await obtenerDb()).collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: VACUNAS_PRUEBA } });
}

const seccion = (grupoEdad, titulo, orden, dosis) => ({
  codigo: grupoEdad ?? 'GENERAL', titulo, orden: new Int32(orden), grupo_edad: grupoEdad, dosis,
});

const esquema = ({ version, territorio, desde, hasta = null, estado = 'VIGENTE', secciones }) => ({
  _id: new ObjectId(),
  vacuna: { id: new Int32(ids.vacunas.ZVT_SPEC62), codigo: 'ZVT_SPEC62', nombre: 'vitest-spec62 ZVT_SPEC62' },
  version: new Int32(version),
  territorio,
  estado,
  vigencia: { desde: new Date(desde), hasta: hasta && new Date(hasta) },
  version_anterior_id: null,
  basado_en: null,
  dimensiones: {
    dosis: ['D1', 'D2', 'R1'].map((codigo) => ({ codigo, etiqueta: codigo })),
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
    desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
  },
  ...(secciones ? { secciones } : {}),
  campos_adicionales: [],
  reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: new Int32(1) }],
  presentacion: { filas: 'dosis', columnas: ['seccion'] },
  auditoria: {
    creado_por: new Int32(1), creado_en: new Date(), publicado_por: new Int32(1), publicado_en: new Date(),
    motivo_cambio: 'vitest-spec62',
  },
});

// Uno histórico sin secciones (anterior a la v0.4) cubre diciembre de 2085; el nacional, desde enero; y el de la
// DDRISS, desde febrero (con las secciones desordenadas y las dosis al revés).
async function prepararEsquemas() {
  await (await obtenerDb()).collection('esquemas_captura').insertMany([
    esquema({
      version: 3,
      territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
      estado: 'HISTORICO',
      desde: `${ANIO - 1}-12-01T00:00:00.000Z`,
      hasta: `${ANIO - 1}-12-31T00:00:00.000Z`,
    }),
    esquema({
      version: 1,
      territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
      desde: `${ANIO}-01-01T00:00:00.000Z`,
      secciones: [seccion(null, 'General', 1, ['D1', 'D2'])],
    }),
    esquema({
      version: 2,
      territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS_PRUEBA },
      desde: `${ANIO}-02-01T00:00:00.000Z`,
      secciones: [seccion('1_A_5', 'De 1 a < 6 años', 2, ['D1']), seccion('MENOR_1', '< 1 año', 1, ['D2', 'D1'])],
    }),
    {
      ...esquema({ version: 1, territorio: { nivel: 'NACIONAL', ddriss_codigo: null }, desde: `${ANIO}-01-01` }),
      vacuna: { id: new Int32(ids.vacunas.ZVT_SPEC63), codigo: 'ZVT_SPEC63', nombre: 'vitest-spec62 ZVT_SPEC63' },
      dimensiones: {
        dosis: [
          { codigo: 'D1', etiqueta: 'D1' },
          { codigo: 'D2', etiqueta: 'D2' },
          { codigo: 'R1', etiqueta: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }] },
        ],
        procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
        desagregacion: [
          { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
          { dimension: 'sexo', valores: ['F', 'M'] },
        ],
      },
      secciones: [
        seccion('MENOR_1', '< 1 año', 1, ['D1', 'D2', 'R1']),
        seccion('1_A_5', 'De 1 a < 6 años', 2, ['D1']),
      ],
    },
  ]);
}

async function insertar(sql, valores) {
  const [r] = await pool.query(sql, valores);
  return r.insertId;
}

async function preparar() {
  const departamentoId = await insertar("INSERT INTO departamento (codigo_ine, nombre) VALUES (?, 'vitest-spec62')", [
    DEPARTAMENTO_PRUEBA,
  ]);
  ids.departamento = departamentoId;
  ddrissId = await insertar(
    "INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-spec62', ?, TRUE)",
    [DDRISS_PRUEBA, departamentoId],
  );
  for (const [ine, activo] of [['Z801', true], ['Z802', true], ['Z803', false]]) {
    ids.municipios[ine] = await insertar(
      'INSERT INTO municipio (departamento_id, codigo_ine, nombre, activo) VALUES (?, ?, ?, ?)',
      [departamentoId, ine, `vitest-spec62-${ine}`, activo],
    );
  }
  const [[externo]] = await pool.query(
    `SELECT id, codigo_ine, nombre FROM municipio
      WHERE codigo_ine <> '9999' AND activo = TRUE AND codigo_ine NOT LIKE 'Z%' ORDER BY id LIMIT 1`,
  );
  ids.municipios.externo = externo.id;
  ids.externo = externo;

  ids.red = await insertar("INSERT INTO red (ddriss_id, codigo, nombre) VALUES (?, 'RED_01', 'vitest-spec62 Red')", [
    ddrissId,
  ]);
  await pool.query('INSERT INTO red_municipio (red_id, municipio_id) VALUES (?, ?)', [ids.red, ids.municipios.Z802]);
  const [[redAjena]] = await pool.query('SELECT id FROM red WHERE ddriss_id <> ? ORDER BY id LIMIT 1', [ddrissId]);
  ids.redAjena = redAjena?.id;

  // Z801 tiene dos distritos activos; el de Z802 está inactivo, así que Z802 queda «Sin distrito».
  const distrito =
    'INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre, activo) VALUES (?, ?, ?, ?, ?)';
  for (const [clave, municipio, activo] of [['1', 'Z801', true], ['1b', 'Z801', true], ['2', 'Z802', false]]) {
    ids.distritos[clave] = await insertar(distrito, [
      ddrissId, ids.municipios[municipio], `ZVT62-DS${clave}`, `vitest-spec62 Distrito ${clave}`, activo,
    ]);
  }

  // [clave, municipio, reporta_5c, solo_cobertura, es_externo]; PS no envía 5C ni produce: no es fila.
  const ESTABLECIMIENTOS = [
    ['CS1', 'Z801', true, false, false],
    ['HOSP', 'Z801', true, true, false],
    ['CS2', 'Z802', true, false, false],
    ['PS', 'Z802', false, false, false],
    ['EXT', 'externo', false, false, true],
  ];
  for (const [clave, municipio, reporta5c, soloCobertura, externoEs] of ESTABLECIMIENTOS) {
    ids.establecimientos[clave] = await insertar(
      `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, municipio_id,
         reporta_produccion, reporta_5c, solo_cobertura, es_externo, activo)
       VALUES (?, ?, 1, ?, ?, TRUE, ?, ?, ?, TRUE)`,
      [
        `${PREFIJO_EST}${clave}`, `vitest-spec62 ${clave}`, ddrissId, ids.municipios[municipio],
        reporta5c, soloCobertura, externoEs,
      ],
    );
  }

  // ZVT_SPEC62I está inactiva pero tiene producción; ZVT_SPEC62N está inactiva y no tiene.
  const VACUNAS = [
    ['ZVT_SPEC62', true, 900], ['ZVT_SPEC62I', false, 1], ['ZVT_SPEC62N', false, 1], ['ZVT_SPEC63', true, 901],
  ];
  for (const [codigo, activa, orden] of VACUNAS) {
    ids.vacunas[codigo] = await insertar(
      'INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, ?, ?, ?)',
      [codigo, `vitest-spec62 ${codigo}`, orden, activa],
    );
  }
  // [vacuna, código, orden, activa]
  const DOSIS = [
    ['ZVT_SPEC62', 'D1', 1, true], ['ZVT_SPEC62', 'D2', 2, true], ['ZVT_SPEC62', 'R1', 3, false],
    ['ZVT_SPEC62I', 'D1', 1, true], ['ZVT_SPEC62I', 'D2', 2, false], ['ZVT_SPEC62N', 'D1', 1, true],
    ['ZVT_SPEC63', 'D1', 1, true], ['ZVT_SPEC63', 'D2', 2, true], ['ZVT_SPEC63', 'R1', 3, true],
  ];
  for (const [vacuna, codigo, orden, activa] of DOSIS) {
    ids.dosis[`${vacuna}.${codigo}`] = await insertar(
      'INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, ?, ?, ?, ?)',
      [ids.vacunas[vacuna], codigo, codigo, orden, activa],
    );
  }

  // Diciembre de 2085 y enero cerrados, febrero en cierre y marzo sin cierre_periodo de la DDRISS.
  const MESES = [
    ['dic', ANIO - 1, 12, 'CERRADO'], [1, ANIO, 1, 'CERRADO'], [2, ANIO, 2, 'EN_CIERRE'], [3, ANIO, 3, null],
  ];
  for (const [clave, anio, mes, estado] of MESES) {
    const inicio = `${anio}-${String(mes).padStart(2, '0')}-01`;
    ids.periodos[clave] = await insertar(
      'INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, LAST_DAY(?))',
      [anio, mes, inicio, inicio],
    );
    if (estado) {
      await pool.query(
        `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
         VALUES (?, ?, '2099-12-31', ?, ?, ?)`,
        estado === 'CERRADO'
          ? [ids.periodos[clave], ddrissId, estado, usuarioId, new Date()]
          : [ids.periodos[clave], ddrissId, estado, null, null],
      );
    }
  }

  // [establecimiento, mes, estado, [[vacuna.dosis, procedencia, grupo de edad, cantidad, otras dimensiones]]]
  // ZVT_SPEC63 (SPEC 63): en enero, CS1 aplica D1 a 5 + 6 + 3 niñas en dos grupos de edad y dos procedencias; R1 no
  // tiene sexo; el hospital, 10 niñas; en febrero, CS2 (aprobado) un niño.
  const M1 = 'MENOR_1';
  const F = { sexo: 'F' };
  const REPORTES = [
    ['CS1', 'dic', 'CERRADO', [['ZVT_SPEC62.D1', 'Z801', M1, 4]]],
    ['CS2', 'dic', 'RECTIFICACION', [['ZVT_SPEC62.D1', 'Z802', M1, 8], ['ZVT_SPEC62.D1', 'Z801', M1, 1]]],
    ['CS1', 1, 'CERRADO', [
      ['ZVT_SPEC62.D1', 'Z801', M1, 10], ['ZVT_SPEC62.D1', 'Z802', M1, 3], ['ZVT_SPEC62.D1', 'migrantes', M1, 2],
      ['ZVT_SPEC62.D2', 'Z801', M1, 6], ['ZVT_SPEC62.D1', 'Z801', '1_A_5', 5],
      ['ZVT_SPEC63.D1', 'Z801', M1, 5, F], ['ZVT_SPEC63.D1', 'Z801', '1_A_5', 6, F],
      ['ZVT_SPEC63.D1', 'Z802', M1, 3, F], ['ZVT_SPEC63.D1', 'Z801', M1, 4, { sexo: 'M' }],
      ['ZVT_SPEC63.D2', 'Z801', M1, 2, F], ['ZVT_SPEC63.R1', 'Z801', M1, 7],
    ]],
    ['HOSP', 1, 'CERRADO', [
      ['ZVT_SPEC62.D1', 'Z801', M1, 20], ['ZVT_SPEC62.D1', 'Z802', M1, 7], ['ZVT_SPEC63.D1', 'Z801', M1, 10, F],
    ]],
    ['EXT', 1, 'CERRADO', [['ZVT_SPEC62.D1', 'Z801', M1, 2], ['ZVT_SPEC62.D2', 'externo', M1, 4]]],
    ['CS2', 2, 'APROBADO', [['ZVT_SPEC62.D1', 'Z802', M1, 9], ['ZVT_SPEC63.D1', 'Z802', M1, 1, { sexo: 'M' }]]],
    ['CS1', 2, 'BORRADOR', [['ZVT_SPEC62.D1', 'Z801', M1, 100]]],
    ['EXT', 2, 'APROBADO', [['ZVT_SPEC62I.D1', 'externo', null, 3]]],
  ];
  const [[migrantes]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '9999'");
  ids.municipios.migrantes = migrantes.id;
  for (const [establecimiento, mes, estado, celdas] of REPORTES) {
    const reporteId = await insertar(
      'INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por) VALUES (?, ?, ?, ?)',
      [ids.establecimientos[establecimiento], ids.periodos[mes], estado, usuarioId],
    );
    const porVacuna = new Map();
    for (const [llave, procedencia, grupoEdad, cantidad, otras = {}] of celdas) {
      const dimensiones = { ...(grupoEdad ? { grupo_edad: grupoEdad } : {}), ...otras };
      const vacuna = llave.split('.')[0];
      if (!porVacuna.has(vacuna)) {
        porVacuna.set(vacuna, await insertar(
          `INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version)
           VALUES (?, ?, '000000000000000000000000', 1)`,
          [reporteId, ids.vacunas[vacuna]],
        ));
      }
      const detalleId = await insertar(
        `INSERT INTO detalle_produccion
           (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          porVacuna.get(vacuna), ids.dosis[llave], ids.municipios[procedencia],
          claveCombinacion(dimensiones), cantidad, usuarioId,
        ],
      );
      for (const [dimension, valor] of Object.entries(dimensiones)) {
        await pool.query(
          'INSERT INTO detalle_dimension (detalle_id, dimension_codigo, valor_codigo) VALUES (?, ?, ?)',
          [detalleId, dimension, valor],
        );
      }
    }
  }
}

beforeAll(async () => {
  for (const rol of ['AUTORIDAD', 'REVISOR', 'EPIDEMIOLOGIA', 'ESTABLECIMIENTO', 'ADMINISTRADOR']) {
    cuentas[rol] = await cuentaDelRol(rol);
  }
  usuarioId = cuentas.EPIDEMIOLOGIA.id;
  await limpiar();
  await preparar();
  await prepararEsquemas();
}, 60000);

afterAll(limpiar, 60000);

describe('GET /informes/opciones (SPEC 62)', () => {
  it('trae los meses de la DDRISS, del más reciente al más antiguo, sin los no habilitados', async () => {
    const res = await opciones();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meses).toEqual([
      { anio: ANIO, mes: 2, estado: 'EN_CIERRE' },
      { anio: ANIO, mes: 1, estado: 'CERRADO' },
      { anio: ANIO - 1, mes: 12, estado: 'CERRADO' },
    ]);
  });

  it('los municipios son los activos del departamento más los de aplicación con producción', async () => {
    const res = await opciones();
    expect(res.body.municipios).toHaveLength(3);
    expect(res.body.municipios).toEqual(
      expect.arrayContaining([
        { id: ids.municipios.Z801, codigoIne: 'Z801', nombre: 'vitest-spec62-Z801' },
        { id: ids.municipios.Z802, codigoIne: 'Z802', nombre: 'vitest-spec62-Z802' },
        { id: ids.externo.id, codigoIne: ids.externo.codigo_ine, nombre: ids.externo.nombre },
      ]),
    );
  });

  it('las vacunas son las activas más las inactivas con producción, sin sus dosis', async () => {
    const res = await opciones();
    const codigos = res.body.vacunas.map((v) => v.codigo);
    expect(codigos).toContain('ZVT_SPEC62');
    expect(codigos).not.toContain('ZVT_SPEC62N');
    expect(res.body.vacunas.filter((v) => !v.activa).map((v) => v.codigo)).toEqual(['ZVT_SPEC62I']);
    expect(codigos.at(-1)).toBe('ZVT_SPEC62I');
    expect(res.body.vacunas.find((v) => v.codigo === 'ZVT_SPEC62')).toEqual({
      codigo: 'ZVT_SPEC62',
      nombre: 'vitest-spec62 ZVT_SPEC62',
      activa: true,
    });
  });

  it('las dimensiones son las activas del catálogo sin el grupo de edad, por nombre (SPEC 63)', async () => {
    const [res, activas] = await Promise.all([
      opciones(),
      (await obtenerDb()).collection('catalogo_dimensiones').find({ activo: true }).toArray(),
    ]);
    const esperadas = activas
      .filter((d) => d.codigo !== 'grupo_edad')
      .map((d) => ({ codigo: d.codigo, nombre: d.nombre }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
    expect(res.body.dimensiones).toEqual(esperadas);
    expect(res.body.dimensiones).toContainEqual({ codigo: 'sexo', nombre: 'Sexo' });
    expect(res.body.dimensiones.map((d) => d.codigo)).not.toContain('grupo_edad');
  });

  it('la Autoridad nacional debe mandar ddrissId', async () => {
    const res = await opciones('');
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('un rol con DDRISS consulta la suya y no puede mandar ddrissId', async () => {
    const propia = await opciones('', cuentas.EPIDEMIOLOGIA.token);
    expect(propia.status, JSON.stringify(propia.body)).toBe(200);
    expect(propia.body.municipios.some((m) => m.codigoIne.startsWith(DEPARTAMENTO_PRUEBA))).toBe(false);
    const ajena = await opciones(`ddrissId=${ddrissId}`, cuentas.EPIDEMIOLOGIA.token);
    expect(ajena.status).toBe(400);
  });

  it('un parámetro desconocido responde 400', async () => {
    const res = await opciones(`ddrissId=${ddrissId}&anio=${ANIO}`);
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('Parámetro no permitido: anio.');
  });

  it('el Revisor y Epidemiología con su DDRISS, y la Autoridad nacional con ddrissId, tienen acceso', async () => {
    for (const rol of ['REVISOR', 'EPIDEMIOLOGIA']) {
      const res = await opciones('', cuentas[rol].token);
      expect(res.status, `${rol}: ${JSON.stringify(res.body)}`).toBe(200);
    }
    expect((await opciones()).status).toBe(200);
  });

  it('el Personal del establecimiento y el Administrador reciben 403', async () => {
    for (const rol of ['ESTABLECIMIENTO', 'ADMINISTRADOR']) {
      const res = await opciones('', cuentas[rol].token);
      expect(res.status, rol).toBe(403);
    }
  });
});

describe('columnasDelInforme (SPEC 62)', () => {
  const VACUNA = { codigo: 'ZVT_SPEC62', nombre: 'vitest-spec62 ZVT_SPEC62' };
  const dosis = (vacuna, codigo) => ({ id: ids.dosis[`${vacuna}.${codigo}`], codigo });
  const columna = (vacuna, codigo, seccion) => ({
    vacuna: { codigo: vacuna, nombre: `vitest-spec62 ${vacuna}` }, seccion, valor: null, dosis: dosis(vacuna, codigo),
  });
  const MENOR_1 = { grupoEdad: 'MENOR_1', titulo: '< 1 año' };
  const DE_1_A_5 = { grupoEdad: '1_A_5', titulo: 'De 1 a < 6 años' };
  const conDato = (vacuna, codigo, grupoEdad) => ({
    vacunaId: ids.vacunas[vacuna], dosisId: ids.dosis[`${vacuna}.${codigo}`], grupoEdad,
  });
  const columnas = (hasta, extra = {}) =>
    columnasDelInforme({ ddrissId, vacunaCodigo: 'ZVT_SPEC62', hasta: { anio: ANIO, mes: hasta }, ...extra });

  it('sigue las secciones del esquema de la DDRISS que cubre el último mes, con las dosis por su orden', async () => {
    expect(await columnas(2)).toEqual([
      columna('ZVT_SPEC62', 'D1', MENOR_1),
      columna('ZVT_SPEC62', 'D2', MENOR_1),
      columna('ZVT_SPEC62', 'D1', DE_1_A_5),
    ]);
  });

  it('antes del esquema de la DDRISS usa el nacional; una sección sin edad lleva su título', async () => {
    const general = { grupoEdad: null, titulo: 'General' };
    expect(await columnas(1)).toEqual([columna('ZVT_SPEC62', 'D1', general), columna('ZVT_SPEC62', 'D2', general)]);
  });

  it('un esquema sin secciones las deduce de sus grupos de edad, con el título del catálogo', async () => {
    const resultado = await columnasDelInforme({
      ddrissId, vacunaCodigo: 'ZVT_SPEC62', hasta: { anio: ANIO - 1, mes: 12 },
    });
    const menor1 = { grupoEdad: 'MENOR_1', titulo: 'Menores de 1 año' };
    const de1a5 = { grupoEdad: '1_A_5', titulo: 'De 1 a menos de 6 años' };
    expect(resultado).toEqual([
      columna('ZVT_SPEC62', 'D1', menor1), columna('ZVT_SPEC62', 'D2', menor1), columna('ZVT_SPEC62', 'R1', menor1),
      columna('ZVT_SPEC62', 'D1', de1a5), columna('ZVT_SPEC62', 'D2', de1a5), columna('ZVT_SPEC62', 'R1', de1a5),
    ]);
  });

  it('las combinaciones con datos fuera del esquema van al final de su vacuna', async () => {
    const conDatos = [
      conDato('ZVT_SPEC62', 'D1', 'ZVT_GRUPO'),
      conDato('ZVT_SPEC62', 'R1', '1_A_MENOR_2'),
      conDato('ZVT_SPEC62', 'D1', 'MENOR_1'),
      conDato('ZVT_SPEC62', 'D2', null),
    ];
    const resultado = await columnas(2, { conDatos });
    expect(resultado.slice(3)).toEqual([
      columna('ZVT_SPEC62', 'D2', null),
      columna('ZVT_SPEC62', 'R1', { grupoEdad: '1_A_MENOR_2', titulo: 'De 1 a menos de 2 años' }),
      columna('ZVT_SPEC62', 'D1', { grupoEdad: 'ZVT_GRUPO', titulo: 'ZVT_GRUPO' }),
    ]);
    expect(resultado).toHaveLength(6);
  });

  it('una vacuna sin esquema lleva sus dosis activas sin sección, más las que tienen datos', async () => {
    const hasta = { anio: ANIO, mes: 2 };
    const sinDatos = await columnasDelInforme({ ddrissId, vacunaCodigo: 'ZVT_SPEC62I', hasta });
    expect(sinDatos).toEqual([columna('ZVT_SPEC62I', 'D1', null)]);
    const conDatos = [conDato('ZVT_SPEC62I', 'D2', null)];
    expect(await columnasDelInforme({ ddrissId, vacunaCodigo: 'ZVT_SPEC62I', hasta, conDatos })).toEqual([
      columna('ZVT_SPEC62I', 'D1', null),
      columna('ZVT_SPEC62I', 'D2', null),
    ]);
  });

  it('con todas las vacunas van las activas y, al final, las inactivas con datos', async () => {
    const conDatos = [conDato('ZVT_SPEC62I', 'D1', null)];
    const resultado = await columnasDelInforme({ ddrissId, hasta: { anio: ANIO, mes: 2 }, conDatos });
    const vacunas = [...new Set(resultado.map((c) => c.vacuna.codigo))];
    expect(vacunas).toContain(VACUNA.codigo);
    expect(vacunas).not.toContain('ZVT_SPEC62N');
    expect(vacunas.at(-1)).toBe('ZVT_SPEC62I');
    expect(resultado.filter((c) => c.vacuna.codigo === VACUNA.codigo)).toEqual(await columnas(2));
  });
});

describe('columnasAgrupadas (SPEC 63)', () => {
  const HASTA = { anio: ANIO, mes: 2 };
  let sexo;
  const columna = (vacuna, codigo, valor, etiqueta) => ({
    vacuna: { codigo: vacuna, nombre: `vitest-spec62 ${vacuna}` },
    seccion: null,
    valor: { codigo: valor, etiqueta },
    dosis: { id: ids.dosis[`${vacuna}.${codigo}`], codigo },
  });
  const conDato = (vacuna, codigo, valor) => ({
    vacunaId: ids.vacunas[vacuna], dosisId: ids.dosis[`${vacuna}.${codigo}`], valor,
  });
  const agrupadas = (vacunaCodigo, conDatos = []) =>
    columnasAgrupadas({ ddrissId, vacunaCodigo, hasta: HASTA, dimension: sexo, conDatos });

  beforeAll(async () => {
    sexo = await dimensionDeAgrupacion('sexo');
  });

  it('dimensionDeAgrupacion trae los valores por su orden del catálogo', async () => {
    const doc = await (await obtenerDb()).collection('catalogo_dimensiones').findOne({ codigo: 'sexo' });
    const esperados = [...doc.valores].sort((a, b) => a.orden - b.orden).map((v) => v.codigo);
    expect(sexo.nombre).toBe(doc.nombre);
    expect(sexo.valores.map((v) => v.codigo)).toEqual(esperados);
  });

  it('los valores van por el orden del catálogo, cada uno con las dosis que lo piden y sin R1', async () => {
    const etiqueta = new Map(sexo.valores.map((v) => [v.codigo, v.etiqueta]));
    const esperadas = sexo.valores
      .filter((v) => ['F', 'M'].includes(v.codigo))
      .flatMap((v) => ['D1', 'D2'].map((d) => columna('ZVT_SPEC63', d, v.codigo, etiqueta.get(v.codigo))));
    expect(await agrupadas('ZVT_SPEC63')).toEqual(esperadas);
  });

  it('las combinaciones con datos fuera del esquema van al final de su vacuna', async () => {
    const conDatos = [
      conDato('ZVT_SPEC63', 'D1', 'ZVT_SEXO'),
      conDato('ZVT_SPEC63', 'R1', 'F'),
      conDato('ZVT_SPEC63', 'D1', 'M'),
    ];
    const resultado = await agrupadas('ZVT_SPEC63', conDatos);
    const femenino = sexo.valores.find((v) => v.codigo === 'F').etiqueta;
    expect(resultado).toHaveLength(6);
    expect(resultado.slice(4)).toEqual([
      columna('ZVT_SPEC63', 'R1', 'F', femenino),
      columna('ZVT_SPEC63', 'D1', 'ZVT_SEXO', 'ZVT_SEXO'),
    ]);
  });

  it('una vacuna que no registra la dimensión no tiene columnas', async () => {
    expect(await agrupadas('ZVT_SPEC62')).toEqual([]);
  });

  it('una vacuna sin esquema solo lleva las combinaciones con datos', async () => {
    expect(await agrupadas('ZVT_SPEC62I')).toEqual([]);
    const femenino = sexo.valores.find((v) => v.codigo === 'F').etiqueta;
    expect(await agrupadas('ZVT_SPEC62I', [conDato('ZVT_SPEC62I', 'D1', 'F')])).toEqual([
      columna('ZVT_SPEC62I', 'D1', 'F', femenino),
    ]);
  });

  it('con todas las vacunas solo salen las que registran la dimensión', async () => {
    const resultado = await agrupadas(null);
    const vacunas = new Set(resultado.map((c) => c.vacuna.codigo));
    expect(vacunas.has('ZVT_SPEC63')).toBe(true);
    expect(vacunas.has('ZVT_SPEC62')).toBe(false);
    expect(resultado.every((c) => c.seccion === null && c.valor !== null)).toBe(true);
    expect(resultado.filter((c) => c.vacuna.codigo === 'ZVT_SPEC63')).toEqual(await agrupadas('ZVT_SPEC63'));
  });
});

describe('GET /informes/produccion por municipio y departamento (SPEC 62)', () => {
  const informe = (consulta, token) => consultar('produccion', `ddrissId=${ddrissId}&${consulta}`, token);
  const ENERO_A_FEBRERO = `desde=${ANIO}-01&hasta=${ANIO}-02&vacuna=ZVT_SPEC62`;
  const fila = (res, municipio) => res.body.filas.find((f) => f.id === ids.municipios[municipio]);
  const idsDeFilas = (res) => res.body.filas.map((f) => f.id).sort((a, b) => a - b);
  const idsDe = (...municipios) => municipios.map((m) => ids.municipios[m]).sort((a, b) => a - b);
  // Suma las cantidades de una fila por código de dosis (todas las secciones juntas).
  const porDosis = (res, cantidades) =>
    res.body.columnas.reduce(
      (suma, c, i) => ({ ...suma, [c.dosis.codigo]: (suma[c.dosis.codigo] ?? 0) + cantidades[i] }),
      {},
    );
  const FEBRERO_EN_CIERRE = [{ anio: ANIO, mes: 2, estado: 'EN_CIERRE' }];

  async function deLaVista(vista, columna, { desde, hasta, estados }) {
    const [filas] = await pool.query(
      `SELECT d.codigo, SUM(v.${columna}) AS cantidad FROM ${vista} v JOIN dosis d ON d.id = v.dosis_id
        WHERE v.ddriss_id = ? AND v.vacuna_id = ? AND v.anio = ? AND v.mes BETWEEN ? AND ? ${estados ?? ''}
        GROUP BY d.codigo`,
      [ddrissId, ids.vacunas.ZVT_SPEC62, ANIO, desde, hasta],
    );
    return Object.fromEntries(filas.map((f) => [f.codigo, Number(f.cantidad)]));
  }

  it('población propia por municipio: el grupo de edad va en su columna y el hospital no suma', async () => {
    const res = await informe(`informe=poblacion-propia&${ENERO_A_FEBRERO}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.columnas.map((c) => `${c.seccion.titulo} ${c.dosis.codigo}`)).toEqual([
      '< 1 año D1', '< 1 año D2', 'De 1 a < 6 años D1',
    ]);
    expect(idsDeFilas(res)).toEqual(idsDe('Z801', 'Z802', 'externo'));
    expect(fila(res, 'Z801')).toEqual({
      id: ids.municipios.Z801, codigo: 'Z801', nombre: 'vitest-spec62-Z801', municipio: null,
      fueraDelConsolidado: false, cantidades: [10, 6, 5],
    });
    expect(fila(res, 'Z802').cantidades).toEqual([0, 0, 0]);
    expect(fila(res, 'externo').cantidades).toEqual([0, 4, 0]);
    expect(res.body.total).toEqual({ cantidades: [10, 10, 5] });
    expect(res.body.dosisFueraDelConsolidado).toBe(20);
    expect(res.body.mesesSinCerrar).toEqual(FEBRERO_EN_CIERRE);
    expect(res.body.preliminar).toBe(false);
    expect(res.body).toMatchObject({
      informe: 'poblacion-propia', nivel: 'municipio', incluirAprobados: false,
      desde: { anio: ANIO, mes: 1 }, hasta: { anio: ANIO, mes: 2 },
    });
  });

  it('con aprobados, población propia y producción total coinciden con v_consolidado_establecimiento', async () => {
    for (const [tipo, columna] of [['poblacion-propia', 'dosis_poblacion_propia'], ['total', 'dosis_total']]) {
      const res = await informe(`informe=${tipo}&${ENERO_A_FEBRERO}&incluirAprobados=true`);
      expect(res.status, JSON.stringify(res.body)).toBe(200);
      const vista = await deLaVista('v_consolidado_establecimiento', columna, { desde: 1, hasta: 2 });
      expect(porDosis(res, res.body.total.cantidades), tipo).toEqual(vista);
      expect(res.body.preliminar).toBe(true);
    }
  });

  it('producción total por municipio incluye Migrantes y otros municipios en el de aplicación', async () => {
    const res = await informe(`informe=total&${ENERO_A_FEBRERO}`);
    expect(fila(res, 'Z801').cantidades).toEqual([15, 6, 5]);
    expect(fila(res, 'externo').cantidades).toEqual([2, 4, 0]);
    expect(res.body.dosisFueraDelConsolidado).toBe(27);
  });

  it('sin aprobados, el informe por residencia coincide con v_produccion_atribuida e incluye el hospital', async () => {
    const res = await informe(`informe=residencia&${ENERO_A_FEBRERO}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(idsDeFilas(res)).toEqual(idsDe('Z801', 'Z802'));
    expect(fila(res, 'Z801').cantidades).toEqual([32, 6, 5]);
    expect(fila(res, 'Z802').cantidades).toEqual([10, 0, 0]);
    expect(res.body.dosisFueraDelConsolidado).toBe(0);
    const vista = await deLaVista('v_produccion_atribuida', 'dosis_atribuidas', { desde: 1, hasta: 2 });
    expect(porDosis(res, res.body.total.cantidades)).toEqual(vista);
  });

  it('un reporte APROBADO solo cuenta con la casilla, y entonces el informe es preliminar', async () => {
    const febrero = `informe=total&desde=${ANIO}-02&hasta=${ANIO}-02&vacuna=ZVT_SPEC62`;
    const sin = await informe(febrero);
    expect(sin.body.total.cantidades.every((n) => n === 0)).toBe(true);
    expect(sin.body.mesesSinCerrar).toEqual(FEBRERO_EN_CIERRE);
    expect(sin.body.preliminar).toBe(false);
    const con = await informe(`${febrero}&incluirAprobados=true`);
    expect(fila(con, 'Z802').cantidades).toEqual([9, 0, 0]);
    expect(con.body.total.cantidades).toEqual([9, 0, 0]);
    expect(con.body.preliminar).toBe(true);
  });

  it('un rango que cruza años suma diciembre y cuenta los reportes en rectificación', async () => {
    const res = await informe(`informe=residencia&desde=${ANIO - 1}-12&hasta=${ANIO}-01&vacuna=ZVT_SPEC62`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(porDosis(res, fila(res, 'Z801').cantidades)).toEqual({ D1: 42, D2: 6 });
    expect(porDosis(res, fila(res, 'Z802').cantidades)).toEqual({ D1: 18, D2: 0 });
    expect(res.body.mesesSinCerrar).toEqual([]);
  });

  it('el nivel departamento da una sola fila con el total', async () => {
    const res = await informe(`informe=poblacion-propia&${ENERO_A_FEBRERO}&nivel=departamento`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filas).toEqual([{
      id: ids.departamento, codigo: DEPARTAMENTO_PRUEBA, nombre: 'vitest-spec62', municipio: null,
      fueraDelConsolidado: false, cantidades: [10, 10, 5],
    }]);
    expect(res.body.total.cantidades).toEqual([10, 10, 5]);
  });

  it('la red y los municipios elegidos recortan las filas y el total', async () => {
    const base = `informe=poblacion-propia&${ENERO_A_FEBRERO}&incluirAprobados=true`;
    const red = await informe(`${base}&redId=${ids.red}`);
    expect(idsDeFilas(red)).toEqual(idsDe('Z802'));
    expect(red.body.total.cantidades).toEqual([9, 0, 0]);
    expect(red.body.dosisFueraDelConsolidado).toBe(0);
    const elegido = await informe(`${base}&municipioIds=${ids.municipios.Z801}`);
    expect(idsDeFilas(elegido)).toEqual(idsDe('Z801'));
    expect(elegido.body.total.cantidades).toEqual([10, 6, 5]);
    expect(elegido.body.dosisFueraDelConsolidado).toBe(20);
    const cruce = await informe(`${base}&redId=${ids.red}&municipioIds=${ids.municipios.Z801}`);
    expect(cruce.body.filas).toEqual([]);
    expect(cruce.body.total.cantidades).toEqual([0, 0, 0]);
  });

  it('los parámetros que faltan o no son válidos responden 400', async () => {
    const casos = [
      `desde=${ANIO}-01&hasta=${ANIO}-02`,
      `informe=otro&desde=${ANIO}-01&hasta=${ANIO}-02`,
      `informe=total&desde=${ANIO}-02&hasta=${ANIO}-01`,
      `informe=total&desde=${ANIO}-1&hasta=${ANIO}-02`,
      `informe=total&hasta=${ANIO}-02`,
      `informe=residencia&desde=${ANIO}-01&hasta=${ANIO}-02&nivel=establecimiento`,
      `informe=total&desde=${ANIO}-01&hasta=${ANIO}-02&municipioIds=1,1`,
      `informe=total&desde=${ANIO}-01&hasta=${ANIO}-02&incluirAprobados=si`,
      `informe=total&desde=${ANIO}-01&hasta=${ANIO}-02&anio=${ANIO}`,
    ];
    for (const caso of casos) {
      const res = await informe(caso);
      expect(res.status, caso).toBe(400);
      expect(res.body.error.codigo, caso).toBe('ENTRADA_INVALIDA');
    }
  });

  it('un mes sin habilitar, una vacuna que no existe o una red de otra DDRISS responden 404', async () => {
    const casos = [
      `informe=total&desde=${ANIO}-01&hasta=${ANIO}-03`,
      `informe=total&desde=${ANIO}-01&hasta=${ANIO}-02&vacuna=ZVT_NO_EXISTE`,
      ...(ids.redAjena ? [`informe=total&desde=${ANIO}-01&hasta=${ANIO}-02&redId=${ids.redAjena}`] : []),
    ];
    for (const caso of casos) {
      const res = await informe(caso);
      expect(res.status, caso).toBe(404);
      expect(res.body.error.codigo, caso).toBe('NO_ENCONTRADO');
    }
  });

  it('el Personal del establecimiento y el Administrador reciben 403', async () => {
    for (const rol of ['ESTABLECIMIENTO', 'ADMINISTRADOR']) {
      const res = await consultar('produccion', `informe=total&desde=${ANIO}-01&hasta=${ANIO}-02`, cuentas[rol].token);
      expect(res.status, rol).toBe(403);
    }
  });
});

describe('GET /informes/produccion por distrito y establecimiento (SPEC 62)', () => {
  const informe = (consulta) => consultar('produccion', `ddrissId=${ddrissId}&${consulta}`);
  const ENERO_A_FEBRERO = `desde=${ANIO}-01&hasta=${ANIO}-02&vacuna=ZVT_SPEC62`;
  const deEstablecimiento = (res, clave) => res.body.filas.find((f) => f.id === ids.establecimientos[clave]);
  const municipio = (clave) => ({ id: ids.municipios[clave], nombre: `vitest-spec62-${clave}` });

  it('por distrito, cada uno lleva los datos de su municipio y el total no los cuenta dos veces', async () => {
    const res = await informe(`informe=residencia&${ENERO_A_FEBRERO}&nivel=distrito`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.filas).toEqual([
      {
        id: ids.distritos['1'], codigo: 'ZVT62-DS1', nombre: 'vitest-spec62 Distrito 1', municipio: municipio('Z801'),
        fueraDelConsolidado: false, cantidades: [32, 6, 5],
      },
      {
        id: ids.distritos['1b'], codigo: 'ZVT62-DS1b', nombre: 'vitest-spec62 Distrito 1b',
        municipio: municipio('Z801'), fueraDelConsolidado: false, cantidades: [32, 6, 5],
      },
      {
        id: null, codigo: null, nombre: 'Sin distrito', municipio: null, fueraDelConsolidado: false,
        cantidades: [10, 0, 0],
      },
    ]);
    expect(res.body.total.cantidades).toEqual([42, 6, 5]);
  });

  it('por distrito, el municipio externo cae en «Sin distrito» y el hospital no suma', async () => {
    const res = await informe(`informe=poblacion-propia&${ENERO_A_FEBRERO}&nivel=distrito`);
    expect(res.body.filas.map((f) => f.cantidades)).toEqual([[10, 6, 5], [10, 6, 5], [0, 4, 0]]);
    expect(res.body.total.cantidades).toEqual([10, 10, 5]);
    expect(res.body.dosisFueraDelConsolidado).toBe(20);
  });

  it('por distrito, la red deja solo los distritos de sus municipios', async () => {
    const res = await informe(`informe=residencia&${ENERO_A_FEBRERO}&nivel=distrito&redId=${ids.red}`);
    expect(res.body.filas.map((f) => f.nombre)).toEqual(['Sin distrito']);
    expect(res.body.total.cantidades).toEqual([10, 0, 0]);
  });

  it('por establecimiento salen los que envían 5C, el hospital fuera del total y el externo con datos', async () => {
    const res = await informe(`informe=poblacion-propia&${ENERO_A_FEBRERO}&nivel=establecimiento`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const orden = res.body.filas.map((f) => f.id);
    expect([...orden].sort((a, b) => a - b)).toEqual(
      ['CS1', 'HOSP', 'CS2', 'EXT'].map((c) => ids.establecimientos[c]).sort((a, b) => a - b),
    );
    const posicion = (clave) => orden.indexOf(ids.establecimientos[clave]);
    expect(posicion('CS1')).toBeLessThan(posicion('HOSP'));
    expect(posicion('HOSP')).toBeLessThan(posicion('CS2'));
    expect(deEstablecimiento(res, 'CS1')).toEqual({
      id: ids.establecimientos.CS1, codigo: 'ZVT62-CS1', nombre: 'vitest-spec62 CS1', municipio: municipio('Z801'),
      fueraDelConsolidado: false, cantidades: [10, 6, 5],
    });
    expect(deEstablecimiento(res, 'HOSP')).toMatchObject({ fueraDelConsolidado: true, cantidades: [20, 0, 0] });
    expect(deEstablecimiento(res, 'CS2').cantidades).toEqual([0, 0, 0]);
    expect(deEstablecimiento(res, 'EXT').cantidades).toEqual([0, 4, 0]);
    expect(res.body.total.cantidades).toEqual([10, 10, 5]);
    expect(res.body.dosisFueraDelConsolidado).toBe(20);
  });

  it('por establecimiento, la red recorta por el municipio del establecimiento', async () => {
    const res = await informe(
      `informe=total&${ENERO_A_FEBRERO}&nivel=establecimiento&redId=${ids.red}&incluirAprobados=true`,
    );
    expect(res.body.filas.map((f) => f.id)).toEqual([ids.establecimientos.CS2]);
    expect(res.body.filas[0].cantidades).toEqual([9, 0, 0]);
    expect(res.body.dosisFueraDelConsolidado).toBe(0);
  });
});

describe('GET /informes/produccion agrupado por una dimensión (SPEC 63)', () => {
  const informe = (consulta) => consultar('produccion', `ddrissId=${ddrissId}&${consulta}`);
  const ENERO = `desde=${ANIO}-01&hasta=${ANIO}-01&vacuna=ZVT_SPEC63`;
  const POR_SEXO = `${ENERO}&agrupacion=sexo`;
  let orden;
  // Las cantidades de una fila en el orden de `orden` (valor.dosis).
  const enOrden = (res, cantidades) => {
    const llaves = res.body.columnas.map((c) => `${c.valor.codigo}.${c.dosis.codigo}`);
    return orden.map((llave) => cantidades[llaves.indexOf(llave)]);
  };
  const deMunicipio = (res, ine) => res.body.filas.find((f) => f.id === ids.municipios[ine]);
  const deEstablecimiento = (res, clave) => res.body.filas.find((f) => f.id === ids.establecimientos[clave]);

  beforeAll(async () => {
    const sexo = await dimensionDeAgrupacion('sexo');
    const valores = sexo.valores.map((v) => v.codigo).filter((v) => ['F', 'M'].includes(v));
    orden = valores.flatMap((v) => [`${v}.D1`, `${v}.D2`]);
  });
  // Lo esperado se escribe como { 'F.D1': n, … } y se pasa al orden del catálogo.
  const esperado = (cantidades) => orden.map((llave) => cantidades[llave] ?? 0);

  it('cada sexo suma todas las edades: 5 + 6 + 3 niñas = 14, sin R1 y sin el hospital', async () => {
    const res = await informe(`informe=total&${POR_SEXO}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.agrupacion).toEqual({ codigo: 'sexo', nombre: 'Sexo' });
    expect(res.body.columnas.map((c) => `${c.valor.codigo}.${c.dosis.codigo}`)).toEqual(orden);
    expect(res.body.columnas.every((c) => c.seccion === null)).toBe(true);
    const lleno = esperado({ 'F.D1': 14, 'F.D2': 2, 'M.D1': 4 });
    expect(enOrden(res, deMunicipio(res, 'Z801').cantidades)).toEqual(lleno);
    expect(enOrden(res, deMunicipio(res, 'Z802').cantidades)).toEqual(esperado({}));
    expect(enOrden(res, res.body.total.cantidades)).toEqual(lleno);
    expect(res.body.dosisFueraDelConsolidado).toBe(10);
  });

  it('la suma de los valores de cada dosis es igual a su total sin agrupar', async () => {
    const [agrupado, sinAgrupar] = await Promise.all([
      informe(`informe=total&${POR_SEXO}`),
      informe(`informe=total&${ENERO}`),
    ]);
    const porDosis = (res) =>
      res.body.columnas.reduce(
        (suma, c, i) => ({ ...suma, [c.dosis.codigo]: (suma[c.dosis.codigo] ?? 0) + res.body.total.cantidades[i] }),
        {},
      );
    expect(sinAgrupar.body.agrupacion).toBeNull();
    expect(sinAgrupar.body.columnas.every((c) => c.valor === null)).toBe(true);
    expect(porDosis(sinAgrupar)).toEqual({ D1: 18, D2: 2, R1: 7 });
    expect(porDosis(agrupado)).toEqual({ D1: 18, D2: 2 });
  });

  it('población propia y residencia agrupan con sus reglas; en residencia el hospital suma', async () => {
    const propia = await informe(`informe=poblacion-propia&${POR_SEXO}`);
    expect(enOrden(propia, propia.body.total.cantidades)).toEqual(esperado({ 'F.D1': 11, 'F.D2': 2, 'M.D1': 4 }));
    const residencia = await informe(`informe=residencia&${POR_SEXO}`);
    expect(enOrden(residencia, deMunicipio(residencia, 'Z801').cantidades)).toEqual(
      esperado({ 'F.D1': 21, 'F.D2': 2, 'M.D1': 4 }),
    );
    expect(enOrden(residencia, deMunicipio(residencia, 'Z802').cantidades)).toEqual(esperado({ 'F.D1': 3 }));
    expect(enOrden(residencia, residencia.body.total.cantidades)).toEqual(
      esperado({ 'F.D1': 24, 'F.D2': 2, 'M.D1': 4 }),
    );
    expect(residencia.body.dosisFueraDelConsolidado).toBe(0);
  });

  it('funciona por departamento, distrito y establecimiento', async () => {
    const lleno = esperado({ 'F.D1': 14, 'F.D2': 2, 'M.D1': 4 });
    const departamento = await informe(`informe=total&${POR_SEXO}&nivel=departamento`);
    expect(departamento.body.filas).toHaveLength(1);
    expect(enOrden(departamento, departamento.body.filas[0].cantidades)).toEqual(lleno);

    const distrito = await informe(`informe=total&${POR_SEXO}&nivel=distrito`);
    const porDistrito = (id) => distrito.body.filas.find((f) => f.id === id).cantidades;
    expect(enOrden(distrito, porDistrito(ids.distritos['1']))).toEqual(lleno);
    expect(enOrden(distrito, porDistrito(ids.distritos['1b']))).toEqual(lleno);
    expect(enOrden(distrito, distrito.body.total.cantidades)).toEqual(lleno);

    const establecimiento = await informe(`informe=total&${POR_SEXO}&nivel=establecimiento`);
    expect(enOrden(establecimiento, deEstablecimiento(establecimiento, 'CS1').cantidades)).toEqual(lleno);
    const hospital = deEstablecimiento(establecimiento, 'HOSP');
    expect(hospital.fueraDelConsolidado).toBe(true);
    expect(enOrden(establecimiento, hospital.cantidades)).toEqual(esperado({ 'F.D1': 10 }));
    expect(enOrden(establecimiento, establecimiento.body.total.cantidades)).toEqual(lleno);
    expect(establecimiento.body.dosisFueraDelConsolidado).toBe(10);
  });

  it('con aprobados cuenta el niño de febrero', async () => {
    const res = await informe(
      `informe=total&desde=${ANIO}-01&hasta=${ANIO}-02&vacuna=ZVT_SPEC63&agrupacion=sexo&incluirAprobados=true`,
    );
    expect(enOrden(res, res.body.total.cantidades)).toEqual(esperado({ 'F.D1': 14, 'F.D2': 2, 'M.D1': 5 }));
    expect(res.body.preliminar).toBe(true);
  });

  it('una vacuna que no registra la dimensión da columnas y cantidades vacías', async () => {
    const res = await informe(`informe=total&desde=${ANIO}-01&hasta=${ANIO}-01&vacuna=ZVT_SPEC62&agrupacion=sexo`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.columnas).toEqual([]);
    expect(res.body.filas.length).toBeGreaterThan(0);
    expect(res.body.filas.every((f) => f.cantidades.length === 0)).toBe(true);
    expect(res.body.total.cantidades).toEqual([]);
  });

  it('con todas las vacunas solo salen las que registran la dimensión', async () => {
    const res = await informe(`informe=total&desde=${ANIO}-01&hasta=${ANIO}-01&agrupacion=sexo`);
    const vacunas = new Set(res.body.columnas.map((c) => c.vacuna.codigo));
    expect(vacunas.has('ZVT_SPEC63')).toBe(true);
    expect(vacunas.has('ZVT_SPEC62')).toBe(false);
  });

  it('el grupo de edad o un código mal escrito responden 400, y una dimensión inexistente 404', async () => {
    for (const agrupacion of ['grupo_edad', 'Sexo', 'sexo&agrupacion=sexo']) {
      const res = await informe(`informe=total&${ENERO}&agrupacion=${agrupacion}`);
      expect(res.status, agrupacion).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
    const res = await informe(`informe=total&${ENERO}&agrupacion=zvt_no_existe`);
    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });
});
