import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { CALCULADORES } from '../src/modulos/indicadores/calculadores.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Todo por SQL y MongoDB, sin la API de captura: los meses de 2006 en la DDRISS 1 (enero y febrero CERRADO, marzo
// ABIERTO con fecha límite de 2099), la vacuna ZVT_HU36 (D1 y D2), reportes ya CERRADO con sus celdas, la población de
// 2006 y cuatro indicadores ZVT_HU36_* de la DDRISS en MongoDB. Además, la DDRISS ficticia ZVT_OTRA36 con una corrida
// propia para el ámbito. Todo se borra al inicio y al final (las corridas de 2006 y sus resultados antes que los
// meses); las filas de la bitácora quedan. Las corridas también calculan los indicadores de la semilla, que en 2006 no
// tienen producción: las pruebas solo miran los ZVT_HU36_*.
const ANIO = 2006;
const VACUNA = 'ZVT_HU36';
const DDRISS_OTRA = 'ZVT_OTRA36';
const FUTURA = '2099-12-31';
const MUNICIPIO_SM = 1;
const MUNICIPIO_SP = 2;
const COB = 'ZVT_HU36_COB';
const AVANCE = 'ZVT_HU36_AV';
const DES = 'ZVT_HU36_DES';
const BRECHA = 'ZVT_HU36_BRECHA';

const periodoIds = {};
const cuentas = {};
let vacunaId;
let dosisIds;
let ddrissUsuario;
let ddrissOtraId;
let corridaOtraId;
let migrantesId;
let otroDepartamentoId;
let territorio;

const coleccion = async () => (await obtenerDb()).collection('configuracion_indicadores');
const dosDigitos = (n) => String(n).padStart(2, '0');

const UMBRALES = [
  { color: 'verde', desde: 90, hasta: null },
  { color: 'amarillo', desde: 80, hasta: 90 },
  { color: 'rojo', desde: 0, hasta: 80 },
];

function indicador({ codigo, version = 1, tipo, aplica, denominador, meta, estado = 'VIGENTE', umbrales = UMBRALES }) {
  const fecha = new Date();
  return {
    _id: new ObjectId(),
    codigo,
    version: new Int32(version),
    nombre: `vitest-hu36 ${codigo} v${version}`,
    tipo_calculo: tipo,
    aplica_a: [{ vacuna: VACUNA, ...aplica }],
    numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
    denominador,
    meta,
    ...(umbrales ? { umbrales } : {}),
    umbrales_provisionales: false,
    es_indicador_mapa: false,
    niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
    periodicidad: 'MENSUAL',
    alerta: { generar: false },
    es_estimacion: false,
    territorio: { nivel: 'DDRISS', ddriss_codigo: ddrissUsuario },
    estado,
    vigencia: { desde: fecha, hasta: null },
    auditoria: {
      creado_por: new Int32(4), creado_en: fecha, publicado_por: new Int32(4), publicado_en: fecha, motivo_cambio: 'vitest-hu36',
    },
  };
}

// COBERTURA de D2 con la población anual de 1_A_MENOR_2 y sin filtro de edad; AVANCE de D2 contra MENOR_1, solo
// menores de 1 año.
const cobertura = (version = 1, metaValor = 95) => indicador({
  codigo: COB, version, tipo: 'COBERTURA',
  aplica: { dosis: 'D2', clasificacion_poblacion: '1_A_MENOR_2' },
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'NINGUNO' },
  meta: { valor: metaValor, unidad: 'PORCENTAJE', comparador: '>', homogeneidad_municipal: true },
});
// El avance es además el indicador del mapa, con rangos provisionales (SPEC 50).
const avance = () => ({
  ...indicador({
    codigo: AVANCE, tipo: 'AVANCE_META_MES',
    aplica: { dosis: 'D2', clasificacion_poblacion: 'MENOR_1', filtros_dimension: { grupo_edad: ['MENOR_1'] } },
    denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
    meta: { valor: 100, unidad: 'PORCENTAJE', comparador: '>=', homogeneidad_municipal: true },
  }),
  es_indicador_mapa: true,
  umbrales_provisionales: true,
});
// DESERCION de D1 a D2, sin filtro y con el semáforo descendente de DES_HEXA1_3. Con corte a febrero: San Marcos
// 20 → 19 (5 %), San Pedro sin D1 y con D2 (no calculable) y la departamental 20 → 28 (−40 %); con corte a marzo,
// San Pedro 4 → 9 (−125 %).
const desercion = () => indicador({
  codigo: DES, tipo: 'DESERCION',
  aplica: { dosis_inicial: 'D1', dosis_final: 'D2' },
  denominador: { fuente: 'PRODUCCION' },
  meta: { valor: 10, unidad: 'PORCENTAJE', comparador: '<=' },
  umbrales: [{ color: 'verde', desde: null, hasta: 10 }, { color: 'rojo', desde: 10, hasta: null }],
});
// BRECHA de D2 contra la población anual de 1_A_MENOR_2, sin semáforo (como BRECHA_HEXA3). Con meta 5 %, San Marcos
// (19 de 240) y San Pedro (9 de 120) la pasan y los demás municipios (0 de 120) no.
const brecha = () => indicador({
  codigo: BRECHA, tipo: 'BRECHA', umbrales: null,
  aplica: { dosis: 'D2', clasificacion_poblacion: '1_A_MENOR_2' },
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'NINGUNO' },
  meta: { valor: 5, unidad: 'PORCENTAJE', comparador: '>' },
});

async function limpiar() {
  const corridas = 'SELECT c.id FROM corrida_calculo c LEFT JOIN ddriss d ON d.id = c.ddriss_id WHERE c.anio = ? OR d.codigo = ?';
  await pool.query(`DELETE FROM resultado_indicador WHERE corrida_id IN (SELECT id FROM (${corridas}) t)`, [ANIO, DDRISS_OTRA]);
  await pool.query(`DELETE FROM corrida_calculo WHERE id IN (SELECT id FROM (${corridas}) t)`, [ANIO, DDRISS_OTRA]);
  // Una corrida de otro archivo (otro año) también calcula ZVT_HU36_*: sin esto, la vacuna no se borra.
  await pool.query('DELETE ri FROM resultado_indicador ri JOIN vacuna v ON v.id = ri.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS_OTRA]);
  await pool.query(
    'DELETE r FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ?',
    [ANIO],
  );
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query('DELETE FROM poblacion_objetivo WHERE anio = ?', [ANIO]);
  await (await coleccion()).deleteMany({ codigo: /^ZVT_HU36/ });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
}

// Un reporte en el estado del caso con sus celdas: [dosis, procedencia, grupo_edad, cantidad].
async function reporte(establecimientoId, mes, estado, celdas) {
  const [alta] = await pool.query(
    'INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en) VALUES (?, ?, ?, 1, NOW())',
    [establecimientoId, periodoIds[mes], estado],
  );
  const [rv] = await pool.query(
    'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES (?, ?, ?, 1)',
    [alta.insertId, vacunaId, new ObjectId().toString()],
  );
  for (const [dosis, procedencia, grupo, cantidad] of celdas) {
    const [detalle] = await pool.query(
      `INSERT INTO detalle_produccion (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [rv.insertId, dosisIds[dosis], procedencia, `grupo_edad=${grupo}`, cantidad],
    );
    await pool.query("INSERT INTO detalle_dimension (detalle_id, dimension_codigo, valor_codigo) VALUES (?, 'grupo_edad', ?)", [
      detalle.insertId,
      grupo,
    ]);
  }
}

async function preparar() {
  for (let mes = 1; mes <= 12; mes += 1) {
    const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
    const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
      ANIO, mes, `${ANIO}-${dosDigitos(mes)}-01`, `${ANIO}-${dosDigitos(mes)}-${fin}`,
    ]);
    periodoIds[mes] = periodo.insertId;
  }
  // Cerrados un día antes, para que cerrado_en quede antes de cualquier corrida.
  for (const mes of [1, 2]) {
    await pool.query(
      `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
       VALUES (?, 1, ?, 'CERRADO', 1, DATE_SUB(NOW(), INTERVAL 1 DAY))`,
      [periodoIds[mes], FUTURA],
    );
  }
  await pool.query("INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, ?, 'ABIERTO')", [
    periodoIds[3], FUTURA,
  ]);

  const [vacuna] = await pool.query("INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, 'vitest-hu36 Vacuna', 999, TRUE)", [
    VACUNA,
  ]);
  vacunaId = vacuna.insertId;
  const [d1] = await pool.query(
    "INSERT INTO dosis (vacuna_id, codigo, nombre, orden, completa_esquema, activa) VALUES (?, 'D1', 'Primera dosis', 1, FALSE, TRUE)",
    [vacunaId],
  );
  const [d2] = await pool.query(
    "INSERT INTO dosis (vacuna_id, codigo, nombre, orden, completa_esquema, activa) VALUES (?, 'D2', 'Segunda dosis', 2, TRUE, TRUE)",
    [vacunaId],
  );
  dosisIds = { D1: d1.insertId, D2: d2.insertId };

  const [[migrantes]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '9999'");
  migrantesId = migrantes.id;
  const [[otro]] = await pool.query(
    "SELECT m.id FROM municipio m JOIN ddriss d ON d.id = 1 WHERE m.departamento_id <> d.departamento_id AND m.codigo_ine <> '9999' LIMIT 1",
  );
  otroDepartamentoId = otro.id;
  const [[hospital]] = await pool.query('SELECT id FROM establecimiento WHERE ddriss_id = 1 AND solo_cobertura = TRUE LIMIT 1');
  const [[cs1201]] = await pool.query("SELECT id FROM establecimiento WHERE codigo = 'CS-1201'");
  const [[cs1202]] = await pool.query("SELECT id FROM establecimiento WHERE codigo = 'CS-1202'");

  // Enero, CS-1201: lo propio, un vecino, Migrantes y otro departamento (estos dos no cuentan) y una D1.
  await reporte(cs1201.id, 1, 'CERRADO', [
    ['D2', MUNICIPIO_SM, 'MENOR_1', 10],
    ['D2', MUNICIPIO_SM, '1_A_5', 4],
    ['D2', MUNICIPIO_SP, 'MENOR_1', 3],
    ['D2', migrantesId, 'MENOR_1', 7],
    ['D2', otroDepartamentoId, 'MENOR_1', 2],
    ['D1', MUNICIPIO_SM, 'MENOR_1', 20],
  ]);
  // Enero, Hospital de San Marcos (solo_cobertura): sí cuenta para la cobertura.
  await reporte(hospital.id, 1, 'CERRADO', [['D2', MUNICIPIO_SM, 'MENOR_1', 5]]);
  // Febrero: CS-1202 cerrado cuenta; CS-1201 aprobado (todavía no cerrado) no.
  await reporte(cs1202.id, 2, 'CERRADO', [['D2', MUNICIPIO_SP, 'MENOR_1', 6]]);
  await reporte(cs1201.id, 2, 'APROBADO', [['D2', MUNICIPIO_SM, 'MENOR_1', 100]]);
  // Marzo, mes abierto, con un reporte ya cerrado: solo entra con corte a marzo.
  await reporte(cs1201.id, 3, 'CERRADO', [['D2', MUNICIPIO_SM, 'MENOR_1', 8], ['D1', MUNICIPIO_SP, 'MENOR_1', 4]]);

  // 1_A_MENOR_2: 120 en todo el territorio y 240 en San Marcos. MENOR_1: solo San Marcos (120).
  territorio = (await pool.query(
    "SELECT m.id FROM municipio m JOIN ddriss d ON d.id = 1 WHERE m.activo = TRUE AND m.departamento_id = d.departamento_id AND m.codigo_ine <> '9999'",
  ))[0].map((m) => m.id);
  const [[{ id: deUnoADos }]] = await pool.query("SELECT id FROM clasificacion_poblacion WHERE codigo = '1_A_MENOR_2'");
  const [[{ id: menorDeUno }]] = await pool.query("SELECT id FROM clasificacion_poblacion WHERE codigo = 'MENOR_1'");
  await pool.query(
    'INSERT INTO poblacion_objetivo (municipio_id, anio, clasificacion_poblacion_id, cantidad, fuente, registrado_por) VALUES ?',
    [[
      ...territorio.map((id) => [id, ANIO, deUnoADos, id === MUNICIPIO_SM ? 240 : 120, 'vitest-hu36', 1]),
      [MUNICIPIO_SM, ANIO, menorDeUno, 120, 'vitest-hu36', 1],
    ]],
  );

  await (await coleccion()).insertMany([cobertura(), avance(), desercion(), brecha()]);

  const [otra] = await pool.query("INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-hu36 Otra', 3, TRUE)", [
    DDRISS_OTRA,
  ]);
  ddrissOtraId = otra.insertId;
  const [corridaOtra] = await pool.query(
    "INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, motivo, estado, finalizada_en, vigente) VALUES (?, ?, 1, 'MANUAL', 'COMPLETADA', NOW(), TRUE)",
    [ddrissOtraId, ANIO],
  );
  corridaOtraId = corridaOtra.insertId;
}

// Una cuenta de la semilla con sus datos y permisos reales (autenticar los compara con la base).
async function tokenDe(nombreUsuario) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN empleado e ON e.id = u.empleado_id
      WHERE u.nombre_usuario = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE`,
    [nombreUsuario],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa ${nombreUsuario} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  const codigos = permisos.map((p) => p.codigo);
  const token = await tokenDePrueba(
    cuenta.id,
    {
      rol: cuenta.rol, permisos: codigos, ddrissId: cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id, municipioId: cuenta.municipio_id,
    },
    { expiresIn: '10m' },
  );
  return { token, id: cuenta.id, permisos: codigos };
}

const api = (metodo, ruta, cuenta = cuentas.epidemiologia) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${cuenta.token}`);
const calcular = (mesHasta, cuenta) => api('post', '/indicadores/corridas', cuenta).send({ anio: ANIO, mesHasta });
const delIndicador = (resultados, codigo) => resultados.filter((r) => r.indicadorCodigo === codigo);
const deMunicipio = (resultados, codigo, municipioId) =>
  delIndicador(resultados, codigo).find((r) => (r.municipio?.id ?? null) === municipioId);

async function corridaCalculada(mesHasta) {
  const res = await calcular(mesHasta);
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body;
}

beforeAll(async () => {
  for (const nombre of ['epidemiologia', 'estadigrafa', 'admin.prueba', 'autoridad.sm', 'autoridad.nacional', 'cs1201']) {
    cuentas[nombre] = await tokenDe(nombre);
  }
  if (!cuentas.epidemiologia.permisos.includes('INDICADOR_CALCULAR')) {
    throw new Error('Epidemiología no tiene INDICADOR_CALCULAR: corra el 05 y vuelva a intentar');
  }
  const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = 1');
  ddrissUsuario = ddriss.codigo;
  await limpiar();
  await preparar();
}, 60000);

afterAll(limpiar, 60000);

describe('POST /indicadores/corridas', () => {
  let corrida;
  let resultados;

  beforeAll(async () => {
    corrida = await corridaCalculada(2);
    resultados = (await api('get', `/indicadores/corridas/${corrida.id}`)).body.resultados;
  });

  it('crea una corrida COMPLETADA, vigente y no parcial de la DDRISS, con la versión usada y los omitidos', async () => {
    expect(corrida).toMatchObject({
      ddriss: { id: 1, codigo: ddrissUsuario },
      anio: ANIO,
      mesHasta: 2,
      motivo: 'MANUAL',
      estado: 'COMPLETADA',
      vigente: true,
      parcial: false,
      mesesSinCerrar: [],
      disparadaPor: { id: cuentas.epidemiologia.id },
    });
    expect(corrida.indicadores).toContainEqual({
      codigo: COB, version: 1, nombre: `vitest-hu36 ${COB} v1`, tipoCalculo: 'COBERTURA',
      esIndicadorMapa: false, umbrales: UMBRALES, umbralesProvisionales: false,
    });
    expect(corrida.indicadores).toContainEqual({
      codigo: DES, version: 1, nombre: `vitest-hu36 ${DES} v1`, tipoCalculo: 'DESERCION',
      esIndicadorMapa: false, umbrales: desercion().umbrales, umbralesProvisionales: false,
    });
    expect(corrida.omitidos.map((o) => o.codigo)).not.toContain(DES);
    expect(corrida.totalResultados).toBe(resultados.length);
  });

  it('da lo que necesita el mapa: el codigoIne de cada municipio y la marca y los umbrales de cada versión', () => {
    expect(deMunicipio(resultados, COB, MUNICIPIO_SM).municipio).toEqual({
      id: MUNICIPIO_SM, nombre: 'San Marcos', codigoIne: '1201',
    });
    expect(deMunicipio(resultados, COB, null).municipio).toBeNull();
    expect(delIndicador(resultados, COB).every((r) => r.municipio === null || /^\d{4}$/.test(r.municipio.codigoIne)))
      .toBe(true);
    const porCodigo = Object.fromEntries(corrida.indicadores.map((i) => [i.codigo, i]));
    expect(porCodigo[AVANCE]).toMatchObject({ esIndicadorMapa: true, umbrales: UMBRALES, umbralesProvisionales: true });
    expect(porCodigo[BRECHA]).toMatchObject({ esIndicadorMapa: false, umbrales: [] });
  });

  it('atribuye por procedencia: Migrantes y otro departamento no cuentan, el hospital sí y lo aprobado no', () => {
    // San Marcos: 10 + 4 (CS-1201) + 5 (hospital); San Pedro: 3 (vecino en enero) + 6 (febrero).
    expect(deMunicipio(resultados, COB, MUNICIPIO_SM)).toMatchObject({ numerador: 19, denominador: 240 });
    expect(deMunicipio(resultados, COB, MUNICIPIO_SP)).toMatchObject({ numerador: 9, denominador: 120 });
    const municipios = delIndicador(resultados, COB).map((r) => r.municipio?.id ?? null);
    expect(municipios).not.toContain(migrantesId);
    expect(municipios).not.toContain(otroDepartamentoId);
    expect(municipios).toHaveLength(territorio.length + 1);
  });

  it('cobertura con población anual, brecha y color; la departamental suma todo el territorio', () => {
    expect(deMunicipio(resultados, COB, MUNICIPIO_SM)).toEqual({
      indicadorCodigo: COB,
      indicadorVersion: 1,
      tipoCalculo: 'COBERTURA',
      municipio: { id: MUNICIPIO_SM, nombre: 'San Marcos', codigoIne: '1201' },
      vacuna: { codigo: VACUNA, nombre: 'vitest-hu36 Vacuna' },
      dosis: 'D2',
      filtroDimensiones: '',
      anio: ANIO,
      mes: 2,
      numerador: 19,
      denominador: 240,
      valor: 7.9167,
      meta: 95,
      brechaDosis: 209,
      cumpleMeta: false,
      calculable: true,
      color: 'rojo',
      esProyeccion: false,
      mayorACien: false,
      metaDosis: 228,
      excedenteDosis: 0,
      sumaBrechasMunicipales: null,
      proyeccion: null,
    });
    const poblacion = 240 + 120 * (territorio.length - 1);
    expect(resultados.find((r) => r.indicadorCodigo === COB)).toMatchObject({
      municipio: null, numerador: 28, denominador: poblacion, valor: Number(((28 / poblacion) * 100).toFixed(4)),
    });
  });

  it('el avance usa la meta del mes y el filtro de edad; sin población la fila no es calculable', () => {
    expect(deMunicipio(resultados, AVANCE, MUNICIPIO_SM)).toMatchObject({
      filtroDimensiones: 'grupo_edad=MENOR_1',
      numerador: 15,
      denominador: 20,
      valor: 75,
      meta: 100,
      brechaDosis: 5,
      cumpleMeta: false,
      color: 'rojo',
      calculable: true,
    });
    expect(deMunicipio(resultados, AVANCE, MUNICIPIO_SP)).toMatchObject({
      numerador: 9, denominador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null, calculable: false, color: null,
    });
    expect(deMunicipio(resultados, AVANCE, null)).toMatchObject({ numerador: 24, calculable: false });
    expect(deMunicipio(resultados, AVANCE, MUNICIPIO_SP)).toMatchObject({ metaDosis: null, excedenteDosis: null });
    expect(deMunicipio(resultados, AVANCE, null).sumaBrechasMunicipales).toBeNull();
  });

  it('calcula BRECHA: lo que falta o el excedente por municipio, y la suma municipal en la departamental', () => {
    expect(corrida.indicadores.map((i) => i.codigo)).toContain(BRECHA);
    expect(corrida.omitidos.map((o) => o.codigo)).not.toContain(BRECHA);

    expect(deMunicipio(resultados, BRECHA, MUNICIPIO_SM)).toMatchObject({
      tipoCalculo: 'BRECHA', numerador: 19, denominador: 240, valor: 7.9167, meta: 5, brechaDosis: 0, cumpleMeta: true,
      metaDosis: 12, excedenteDosis: 7, color: null, sumaBrechasMunicipales: null,
    });
    expect(deMunicipio(resultados, BRECHA, MUNICIPIO_SP)).toMatchObject({ brechaDosis: 0, metaDosis: 6, excedenteDosis: 3 });
    const sinDosis = delIndicador(resultados, BRECHA).filter((r) => r.municipio && r.numerador === 0);
    expect(sinDosis).toHaveLength(territorio.length - 2);
    expect(sinDosis.every((r) => r.brechaDosis === 6 && r.metaDosis === 6 && r.excedenteDosis === 0)).toBe(true);

    // Contra el total, los excedentes de San Marcos y San Pedro compensan; en la suma municipal, no.
    const poblacion = 240 + 120 * (territorio.length - 1);
    const metaTotal = Math.ceil(Number(((5 / 100) * poblacion).toFixed(6)));
    expect(deMunicipio(resultados, BRECHA, null)).toMatchObject({
      numerador: 28, metaDosis: metaTotal, brechaDosis: metaTotal - 28, excedenteDosis: 0,
      sumaBrechasMunicipales: 6 * (territorio.length - 2),
    });
  });

  it('calcula DESERCION: la pérdida entre D1 y D2 por municipio, sin población y con la dosis final', () => {
    expect(deMunicipio(resultados, DES, MUNICIPIO_SM)).toEqual({
      indicadorCodigo: DES,
      indicadorVersion: 1,
      tipoCalculo: 'DESERCION',
      municipio: { id: MUNICIPIO_SM, nombre: 'San Marcos', codigoIne: '1201' },
      vacuna: { codigo: VACUNA, nombre: 'vitest-hu36 Vacuna' },
      dosis: 'D2',
      filtroDimensiones: '',
      anio: ANIO,
      mes: 2,
      numerador: 1,
      denominador: 20,
      valor: 5,
      meta: 10,
      brechaDosis: null,
      cumpleMeta: true,
      calculable: true,
      color: 'verde',
      esProyeccion: false,
      mayorACien: false,
      metaDosis: null,
      excedenteDosis: null,
      sumaBrechasMunicipales: null,
      proyeccion: null,
    });
    // San Pedro tiene D2 y no D1: no es calculable, sin hacer fallar la corrida.
    expect(deMunicipio(resultados, DES, MUNICIPIO_SP)).toMatchObject({
      numerador: -9, denominador: 0, valor: null, meta: null, cumpleMeta: null, calculable: false, color: null,
    });
    const sinDosis = delIndicador(resultados, DES).filter((r) => r.municipio && r.numerador === 0);
    expect(sinDosis).toHaveLength(territorio.length - 2);
    expect(sinDosis.every((r) => r.calculable === false)).toBe(true);
    // La departamental suma 20 D1 y 28 D2: más finales que iniciales da un valor negativo, que cumple.
    expect(deMunicipio(resultados, DES, null)).toMatchObject({
      numerador: -8, denominador: 20, valor: -40, meta: 10, brechaDosis: null, cumpleMeta: true, calculable: true, color: 'verde',
    });
  });

  it('la deserción coincide con las D1 y D2 de v_produccion_atribuida', async () => {
    const [filas] = await pool.query(
      `SELECT municipio_id, SUM(IF(dosis_id = ?, dosis_atribuidas, 0)) AS d1, SUM(IF(dosis_id = ?, dosis_atribuidas, 0)) AS d2
         FROM v_produccion_atribuida
        WHERE ddriss_id = 1 AND anio = ? AND mes <= 2 AND vacuna_id = ? GROUP BY municipio_id`,
      [dosisIds.D1, dosisIds.D2, ANIO, vacunaId],
    );
    for (const fila of filas) {
      expect(deMunicipio(resultados, DES, fila.municipio_id)).toMatchObject({
        numerador: Number(fila.d1) - Number(fila.d2), denominador: Number(fila.d1),
      });
    }
    expect(filas.length).toBeGreaterThan(0);
  });

  it('el numerador sin filtro coincide con v_produccion_atribuida', async () => {
    const [filas] = await pool.query(
      `SELECT municipio_id, SUM(dosis_atribuidas) AS dosis FROM v_produccion_atribuida
        WHERE ddriss_id = 1 AND anio = ? AND mes <= 2 AND vacuna_id = ? AND dosis_id = ? GROUP BY municipio_id`,
      [ANIO, vacunaId, dosisIds.D2],
    );
    for (const fila of filas) {
      expect(deMunicipio(resultados, COB, fila.municipio_id).numerador).toBe(Number(fila.dosis));
    }
    expect(filas.length).toBeGreaterThan(0);
  });

  it('deja CALCULAR_INDICADORES en la bitácora', async () => {
    const [[fila]] = await pool.query(
      "SELECT usuario_id, modulo, valores_nuevos FROM bitacora WHERE entidad = 'corrida_calculo' AND entidad_id = ? AND accion = 'CALCULAR_INDICADORES'",
      [String(corrida.id)],
    );
    expect(fila).toMatchObject({ usuario_id: cuentas.epidemiologia.id, modulo: 'INDICADORES' });
    expect(fila.valores_nuevos).toMatchObject({
      ddrissId: 1, anio: ANIO, mesHasta: 2, motivo: 'MANUAL', estado: 'COMPLETADA', parcial: false,
      resultados: corrida.totalResultados,
    });
    expect(fila.valores_nuevos.indicadores).toContainEqual({ codigo: COB, version: 1 });
  });
});

describe('vigencia y versiones', () => {
  it('la corrida nueva queda vigente, la anterior no, y GET /indicadores/resultados lee la vigente', async () => {
    const primera = await corridaCalculada(2);
    const segunda = await corridaCalculada(2);

    const [filas] = await pool.query('SELECT id, vigente FROM corrida_calculo WHERE id IN (?)', [[primera.id, segunda.id]]);
    expect(Object.fromEntries(filas.map((f) => [f.id, Boolean(f.vigente)]))).toEqual({ [primera.id]: false, [segunda.id]: true });

    const res = await api('get', `/indicadores/resultados?anio=${ANIO}&mes=2&indicador=${COB}&municipioId=${MUNICIPIO_SM}`);
    expect(res.status).toBe(200);
    expect(res.body.corrida.id).toBe(segunda.id);
    expect(res.body.resultados).toHaveLength(1);
    expect(res.body.resultados[0]).toMatchObject({ indicadorCodigo: COB, numerador: 19 });

    // Con municipioId no viene la fila departamental, así que tampoco la suma municipal.
    const brechaSm = await api('get', `/indicadores/resultados?anio=${ANIO}&mes=2&indicador=${BRECHA}&municipioId=${MUNICIPIO_SM}`);
    expect(brechaSm.body.resultados).toHaveLength(1);
    expect(brechaSm.body.resultados[0]).toMatchObject({ municipio: { id: MUNICIPIO_SM }, excedenteDosis: 7, sumaBrechasMunicipales: null });
  });

  it('una versión publicada después no cambia los resultados guardados; la corrida siguiente usa la nueva', async () => {
    const antes = await corridaCalculada(2);
    const indicadores = await coleccion();
    await indicadores.updateOne({ codigo: COB, version: 1 }, { $set: { estado: 'HISTORICO', 'vigencia.hasta': new Date() } });
    await indicadores.insertOne(cobertura(2, 5));

    const despues = await corridaCalculada(2);
    const guardada = (await api('get', `/indicadores/corridas/${antes.id}`)).body.resultados;
    const nueva = (await api('get', `/indicadores/corridas/${despues.id}`)).body.resultados;

    expect(deMunicipio(guardada, COB, MUNICIPIO_SM)).toMatchObject({ indicadorVersion: 1, meta: 95, cumpleMeta: false });
    expect(deMunicipio(nueva, COB, MUNICIPIO_SM)).toMatchObject({ indicadorVersion: 2, meta: 5, cumpleMeta: true, brechaDosis: 0 });
  });

  it('con un mes sin cerrar la corrida es parcial y cuenta lo que ya está cerrado', async () => {
    const corrida = await corridaCalculada(3);
    expect(corrida).toMatchObject({ parcial: true, mesesSinCerrar: [3] });
    const { resultados } = (await api('get', `/indicadores/corridas/${corrida.id}`)).body;
    expect(deMunicipio(resultados, COB, MUNICIPIO_SM).numerador).toBe(27);
    // La D1 de San Pedro en marzo: 4 iniciales contra 9 finales.
    expect(deMunicipio(resultados, DES, MUNICIPIO_SP)).toMatchObject({
      numerador: -5, denominador: 4, valor: -125, cumpleMeta: true, calculable: true, color: 'verde',
    });
  });

  it('dos corridas al mismo tiempo terminan las dos y queda una sola vigente', async () => {
    const [a, b] = await Promise.all([calcular(1), calcular(1, cuentas.estadigrafa)]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const [[{ vigentes }]] = await pool.query(
      'SELECT COUNT(*) AS vigentes FROM corrida_calculo WHERE ddriss_id = 1 AND anio = ? AND mes_hasta = 1 AND vigente = TRUE',
      [ANIO],
    );
    expect(Number(vigentes)).toBe(1);
  });

  it('si el cálculo falla queda una corrida FALLIDA sin resultados, con su bitácora, y responde 500', async () => {
    const vigenteAntes = (await api('get', `/indicadores/resultados?anio=${ANIO}&mes=2`)).body.corrida.id;
    const espia = vi.spyOn(CALCULADORES, 'COBERTURA').mockImplementation(() => {
      throw new Error('vitest-hu36 fallo');
    });
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await calcular(2);
      expect(res.status).toBe(500);
    } finally {
      espia.mockRestore();
      silencio.mockRestore();
    }
    const [[fallida]] = await pool.query(
      `SELECT c.id, c.estado, c.vigente, c.disparada_por, (SELECT COUNT(*) FROM resultado_indicador r WHERE r.corrida_id = c.id) AS resultados
         FROM corrida_calculo c WHERE c.ddriss_id = 1 AND c.anio = ? ORDER BY c.id DESC LIMIT 1`,
      [ANIO],
    );
    expect(fallida).toMatchObject({ estado: 'FALLIDA', vigente: 0, disparada_por: cuentas.epidemiologia.id });
    expect(Number(fallida.resultados)).toBe(0);
    const [[bitacora]] = await pool.query(
      "SELECT valores_nuevos FROM bitacora WHERE entidad = 'corrida_calculo' AND entidad_id = ? AND accion = 'CALCULAR_INDICADORES'",
      [String(fallida.id)],
    );
    expect(bitacora.valores_nuevos).toMatchObject({ estado: 'FALLIDA', error: 'vitest-hu36 fallo' });
    expect((await api('get', `/indicadores/resultados?anio=${ANIO}&mes=2`)).body.corrida.id).toBe(vigenteAntes);
  });
});

describe('errores, permisos y ámbito', () => {
  it('rechaza un cuerpo inválido (400) y un mes fuera del calendario (422)', async () => {
    const error = async (cuerpo) => {
      const res = await api('post', '/indicadores/corridas').send(cuerpo);
      return [res.status, res.body.error?.codigo, res.body.error?.mensaje];
    };
    expect(await error({ anio: ANIO, mesHasta: 2, motivo: 'x' })).toEqual([400, 'ENTRADA_INVALIDA', 'Campo no permitido: motivo.']);
    expect(await error({ anio: ANIO, mesHasta: 13 })).toEqual([
      400, 'ENTRADA_INVALIDA', 'El mes de corte debe ser un número de 1 a 12.',
    ]);
    expect(await error({ anio: 1999, mesHasta: 1 })).toEqual([
      400, 'ENTRADA_INVALIDA', 'El año debe ser un número de 2000 a 2100.',
    ]);
    expect(await error({ anio: 2004, mesHasta: 5 })).toEqual([
      422, 'CORRIDA_INVALIDA', 'El mes 5 de 2004 no está en el calendario.',
    ]);
  });

  it('el Revisor y el Administrador calculan; el Personal y la Autoridad no', async () => {
    expect((await calcular(1, cuentas.estadigrafa)).status).toBe(201);
    expect((await calcular(1, cuentas['admin.prueba'])).status).toBe(201);
    expect((await calcular(1, cuentas.cs1201)).status).toBe(403);
    expect((await calcular(1, cuentas['autoridad.sm'])).status).toBe(403);
  });

  it('una corrida de otra DDRISS responde 404, y la Autoridad nacional la consulta con ddrissId', async () => {
    expect((await api('get', `/indicadores/corridas/${corridaOtraId}`)).status).toBe(404);
    expect((await api('get', '/indicadores/corridas/999999999')).status).toBe(404);

    const nacional = cuentas['autoridad.nacional'];
    expect((await api('get', `/indicadores/corridas/${corridaOtraId}`, nacional)).status).toBe(200);
    const lista = await api('get', `/indicadores/corridas?anio=${ANIO}&ddrissId=${ddrissOtraId}`, nacional);
    expect(lista.status).toBe(200);
    expect(lista.body).toMatchObject({ total: 1, pagina: 1, porPagina: 20 });
    expect(lista.body.elementos[0]).toMatchObject({ id: corridaOtraId, ddriss: { codigo: DDRISS_OTRA }, parcial: true });
    expect((await api('get', `/indicadores/corridas?anio=${ANIO}`, nacional)).status).toBe(400);
  });

  it('GET /indicadores/corridas lista las de la DDRISS del usuario y rechaza ddrissId y parámetros desconocidos', async () => {
    const res = await api('get', `/indicadores/corridas?anio=${ANIO}&mesHasta=2&porPagina=2`, cuentas['autoridad.sm']);
    expect(res.status).toBe(200);
    expect(res.body.elementos).toHaveLength(2);
    expect(res.body.total).toBeGreaterThanOrEqual(5);
    expect(res.body.elementos.every((c) => c.ddriss.id === 1 && c.mesHasta === 2)).toBe(true);
    expect(res.body.elementos[0]).not.toHaveProperty('resultados');

    expect((await api('get', `/indicadores/corridas?anio=${ANIO}&ddrissId=1`)).status).toBe(400);
    expect((await api('get', `/indicadores/corridas?anio=${ANIO}&x=1`)).status).toBe(400);
    expect((await api('get', '/indicadores/corridas')).status).toBe(400);
    expect((await api('get', `/indicadores/corridas?anio=${ANIO}`, cuentas.cs1201)).status).toBe(403);
  });

  it('GET /indicadores/resultados sin corrida vigente responde corrida null', async () => {
    const res = await api('get', `/indicadores/resultados?anio=${ANIO}&mes=11`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ corrida: null, resultados: [] });
    expect((await api('get', `/indicadores/resultados?anio=${ANIO}`)).status).toBe(400);
    expect((await api('get', `/indicadores/resultados?anio=${ANIO}&mes=2&indicador=cob`)).status).toBe(400);
  });
});

describe('mayorACien (SPEC 52)', () => {
  // Una corrida de diciembre de 2006 insertada por SQL, con las versiones 1 de la semilla: solo cobertura, avance y
  // brecha con valor mayor a 100 se marcan; ni la deserción ni la proyección, aunque pasen de 100.
  it('marca las filas de cobertura, avance y brecha con valor mayor a 100, también la departamental', async () => {
    const [insercion] = await pool.query(
      `INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, motivo, estado, finalizada_en, vigente)
       VALUES ((SELECT id FROM ddriss WHERE codigo = ?), ?, 12, 'MANUAL', 'COMPLETADA', NOW(), TRUE)`,
      [ddrissUsuario, ANIO],
    );
    const filas = [
      ['COB_HEXA3', MUNICIPIO_SM, 105.2, false],
      ['COB_HEXA3', MUNICIPIO_SP, 100, false],
      ['COB_HEXA3', null, 100.0001, false],
      ['AVANCE_HEXA3', MUNICIPIO_SM, 102.8, false],
      ['BRECHA_HEXA3', MUNICIPIO_SM, 101, false],
      ['DES_HEXA1_3', MUNICIPIO_SM, 120, false],
      ['PROY_COB_HEXA3', MUNICIPIO_SM, 130, true],
    ];
    await pool.query(
      `INSERT INTO resultado_indicador
         (corrida_id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, anio, mes, es_proyeccion,
          numerador, denominador, valor, meta, brecha_dosis, cumple_meta)
       VALUES ?`,
      [filas.map(([codigo, municipio, valor, proyeccion]) => [
        insercion.insertId, codigo, 1, municipio, vacunaId, null, ANIO, 12, proyeccion, valor, 100, valor, 95, 0, true,
      ])],
    );

    const res = await api('get', `/indicadores/resultados?anio=${ANIO}&mes=12`);

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const marca = (codigo, municipioId) => deMunicipio(res.body.resultados, codigo, municipioId).mayorACien;
    expect(marca('COB_HEXA3', MUNICIPIO_SM)).toBe(true);
    expect(marca('COB_HEXA3', MUNICIPIO_SP)).toBe(false);
    expect(marca('COB_HEXA3', null)).toBe(true);
    expect(marca('AVANCE_HEXA3', MUNICIPIO_SM)).toBe(true);
    expect(marca('BRECHA_HEXA3', MUNICIPIO_SM)).toBe(true);
    expect(marca('DES_HEXA1_3', MUNICIPIO_SM)).toBe(false);
    expect(marca('PROY_COB_HEXA3', MUNICIPIO_SM)).toBe(false);
  });
});
