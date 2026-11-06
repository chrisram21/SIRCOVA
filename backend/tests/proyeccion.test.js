import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Proyección al cierre del año (SPEC 47). Todo por SQL y MongoDB, como corridas.test.js: los meses de 2003 en la
// DDRISS 1 (enero a abril CERRADO, mayo ABIERTO con fecha límite de 2099), la vacuna ZVT_HU39 (D1), reportes con sus
// celdas, la población de 2003 y, en MongoDB, la cobertura ZVT_HU39_COB, su proyección ZVT_HU39_PROY y tres
// proyecciones que no se pueden calcular. Todo se borra al inicio y al final; las filas de la bitácora quedan. Las
// corridas también calculan los indicadores de la semilla, sin producción en 2003: las pruebas solo miran ZVT_HU39_*.
const ANIO = 2003;
const VACUNA = 'ZVT_HU39';
const FUTURA = '2099-12-31';
const MUNICIPIO_SM = 1;
const MUNICIPIO_SP = 2;
const COB = 'ZVT_HU39_COB';
const PROY = 'ZVT_HU39_PROY';
const SIN_BASE = 'ZVT_HU39_PROY_SIN_BASE';
const BASE_DE_OTRO_TIPO = 'ZVT_HU39_PROY_TIPO';
const OTRO_METODO = 'ZVT_HU39_PROY_METODO';
// San Marcos: 400; el resto del territorio: 100.
const POBLACION_SM = 400;
const POBLACION_OTROS = 100;

const periodoIds = {};
let cuenta;
let ddrissUsuario;
let vacunaId;
let dosisD1;
let territorio;

const coleccion = async () => (await obtenerDb()).collection('configuracion_indicadores');
const dosDigitos = (n) => String(n).padStart(2, '0');

function indicador({ codigo, tipo, aplica, denominador, meta, parametros, umbrales }) {
  const fecha = new Date();
  return {
    _id: new ObjectId(),
    codigo,
    version: new Int32(1),
    nombre: `vitest-hu39 ${codigo}`,
    tipo_calculo: tipo,
    aplica_a: [{ vacuna: VACUNA, ...aplica }],
    numerador: tipo === 'PROYECCION'
      ? { fuente: 'INDICADOR' }
      : { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
    denominador,
    meta,
    ...(umbrales ? { umbrales } : {}),
    ...(parametros ? { parametros } : {}),
    umbrales_provisionales: false,
    es_indicador_mapa: false,
    niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
    periodicidad: 'MENSUAL',
    alerta: { generar: false },
    es_estimacion: tipo === 'PROYECCION',
    territorio: { nivel: 'DDRISS', ddriss_codigo: ddrissUsuario },
    estado: 'VIGENTE',
    vigencia: { desde: fecha, hasta: null },
    auditoria: {
      creado_por: new Int32(4), creado_en: fecha, publicado_por: new Int32(4), publicado_en: fecha, motivo_cambio: 'vitest-hu39',
    },
  };
}

// La base cuenta solo los menores de 1 año; la proyección no tiene filtro propio (como PROY_COB_HEXA3) y lo toma de ella.
const cobertura = () => indicador({
  codigo: COB, tipo: 'COBERTURA',
  aplica: { dosis: 'D1', clasificacion_poblacion: 'MENOR_1', filtros_dimension: { grupo_edad: ['MENOR_1'] } },
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
  meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>', homogeneidad_municipal: true },
  umbrales: [
    { color: 'verde', desde: 90, hasta: null },
    { color: 'amarillo', desde: 80, hasta: 90 },
    { color: 'rojo', desde: 0, hasta: 80 },
  ],
});
const proyeccion = (codigo, parametros) => indicador({
  codigo, tipo: 'PROYECCION',
  aplica: { dosis: 'D1', clasificacion_poblacion: 'MENOR_1' },
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'NINGUNO' },
  meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>' },
  parametros: {
    indicador_base: COB, metodo: 'PROMEDIO_MOVIL', meses_ventana: new Int32(3), horizonte: 'FIN_DE_ANIO', ...parametros,
  },
});

async function limpiar() {
  const corridas = 'SELECT id FROM corrida_calculo WHERE anio = ?';
  await pool.query(`DELETE FROM resultado_indicador WHERE corrida_id IN (SELECT id FROM (${corridas}) t)`, [ANIO]);
  await pool.query(`DELETE FROM corrida_calculo WHERE id IN (SELECT id FROM (${corridas}) t)`, [ANIO]);
  // Una corrida de otro archivo (otro año) también calcula ZVT_HU39_*: sin esto, la vacuna no se borra.
  await pool.query('DELETE ri FROM resultado_indicador ri JOIN vacuna v ON v.id = ri.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE r FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query('DELETE FROM poblacion_objetivo WHERE anio = ?', [ANIO]);
  await (await coleccion()).deleteMany({ codigo: /^ZVT_HU39/ });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
}

// Un reporte en el estado del caso con sus celdas de D1: [procedencia, grupo_edad, cantidad].
async function reporte(establecimientoId, mes, estado, celdas) {
  const [alta] = await pool.query(
    'INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en) VALUES (?, ?, ?, 1, NOW())',
    [establecimientoId, periodoIds[mes], estado],
  );
  const [rv] = await pool.query(
    'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES (?, ?, ?, 1)',
    [alta.insertId, vacunaId, new ObjectId().toString()],
  );
  for (const [procedencia, grupo, cantidad] of celdas) {
    const [detalle] = await pool.query(
      `INSERT INTO detalle_produccion (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [rv.insertId, dosisD1, procedencia, `grupo_edad=${grupo}`, cantidad],
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
  for (const mes of [1, 2, 3, 4]) {
    await pool.query(
      `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
       VALUES (?, 1, ?, 'CERRADO', 1, DATE_SUB(NOW(), INTERVAL 1 DAY))`,
      [periodoIds[mes], FUTURA],
    );
  }
  await pool.query("INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, ?, 'ABIERTO')", [
    periodoIds[5], FUTURA,
  ]);

  const [vacuna] = await pool.query("INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, 'vitest-hu39 Vacuna', 999, TRUE)", [
    VACUNA,
  ]);
  vacunaId = vacuna.insertId;
  const [d1] = await pool.query(
    "INSERT INTO dosis (vacuna_id, codigo, nombre, orden, completa_esquema, activa) VALUES (?, 'D1', 'Dosis única', 1, TRUE, TRUE)",
    [vacunaId],
  );
  dosisD1 = d1.insertId;

  const [[cs1201]] = await pool.query("SELECT id FROM establecimiento WHERE codigo = 'CS-1201'");
  // San Marcos, menores de 1 año: 10, 20, 30 y 40 de enero a abril. En enero, 1000 de 1 a 5 años que la base no cuenta
  // (la proyección no tiene filtro propio). San Pedro: 6 en enero y 6 en marzo.
  await reporte(cs1201.id, 1, 'CERRADO', [
    [MUNICIPIO_SM, 'MENOR_1', 10], [MUNICIPIO_SM, '1_A_5', 1000], [MUNICIPIO_SP, 'MENOR_1', 6],
  ]);
  await reporte(cs1201.id, 2, 'CERRADO', [[MUNICIPIO_SM, 'MENOR_1', 20]]);
  await reporte(cs1201.id, 3, 'CERRADO', [[MUNICIPIO_SM, 'MENOR_1', 30], [MUNICIPIO_SP, 'MENOR_1', 6]]);
  await reporte(cs1201.id, 4, 'CERRADO', [[MUNICIPIO_SM, 'MENOR_1', 40]]);
  // Mayo, mes abierto: el reporte aprobado (sin cerrar) no cuenta.
  await reporte(cs1201.id, 5, 'APROBADO', [[MUNICIPIO_SM, 'MENOR_1', 500]]);

  territorio = (await pool.query(
    "SELECT m.id FROM municipio m JOIN ddriss d ON d.id = 1 WHERE m.activo = TRUE AND m.departamento_id = d.departamento_id AND m.codigo_ine <> '9999'",
  ))[0].map((m) => m.id);
  const [[{ id: menorDeUno }]] = await pool.query("SELECT id FROM clasificacion_poblacion WHERE codigo = 'MENOR_1'");
  await pool.query(
    'INSERT INTO poblacion_objetivo (municipio_id, anio, clasificacion_poblacion_id, cantidad, fuente, registrado_por) VALUES ?',
    [territorio.map((id) => [id, ANIO, menorDeUno, id === MUNICIPIO_SM ? POBLACION_SM : POBLACION_OTROS, 'vitest-hu39', 1])],
  );

  await (await coleccion()).insertMany([
    cobertura(),
    proyeccion(PROY),
    proyeccion(SIN_BASE, { indicador_base: 'ZVT_HU39_NO_EXISTE' }),
    proyeccion(BASE_DE_OTRO_TIPO, { indicador_base: 'DES_HEXA1_3' }),
    proyeccion(OTRO_METODO, { metodo: 'REGRESION' }),
  ]);
}

async function tokenDe(nombreUsuario) {
  const [[fila]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN empleado e ON e.id = u.empleado_id
      WHERE u.nombre_usuario = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE`,
    [nombreUsuario],
  );
  if (!fila) throw new Error(`No hay una cuenta activa ${nombreUsuario} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [fila.rol_id],
  );
  const codigos = permisos.map((p) => p.codigo);
  const token = await tokenDePrueba(
    fila.id,
    {
      rol: fila.rol, permisos: codigos, ddrissId: fila.ddriss_id,
      establecimientoId: fila.establecimiento_id, municipioId: fila.municipio_id,
    },
    { expiresIn: '10m' },
  );
  return { token, permisos: codigos };
}

const api = (metodo, ruta) => request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${cuenta.token}`);
const delIndicador = (resultados, codigo) => resultados.filter((r) => r.indicadorCodigo === codigo);
const deMunicipio = (resultados, codigo, municipioId) =>
  delIndicador(resultados, codigo).find((r) => (r.municipio?.id ?? null) === municipioId);

// Calcula con corte a mesHasta y devuelve la corrida con sus resultados.
async function corridaConResultados(mesHasta) {
  const res = await api('post', '/indicadores/corridas').send({ anio: ANIO, mesHasta });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const detalle = await api('get', `/indicadores/corridas/${res.body.id}`);
  expect(detalle.status).toBe(200);
  return detalle.body;
}

beforeAll(async () => {
  cuenta = await tokenDe('epidemiologia');
  if (!cuenta.permisos.includes('INDICADOR_CALCULAR')) {
    throw new Error('Epidemiología no tiene INDICADOR_CALCULAR: corra el 05 y vuelva a intentar');
  }
  const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = 1');
  ddrissUsuario = ddriss.codigo;
  await limpiar();
  await preparar();
}, 60000);

afterAll(limpiar, 60000);

describe('PROYECCION con corte a abril', () => {
  let corrida;

  beforeAll(async () => {
    corrida = await corridaConResultados(4);
  });

  it('calcula la proyección y omite, con su motivo, las que no se pueden calcular', () => {
    expect(corrida).toMatchObject({ estado: 'COMPLETADA', parcial: false, mesesSinCerrar: [] });
    expect(corrida.indicadores).toContainEqual({
      codigo: PROY, version: 1, nombre: `vitest-hu39 ${PROY}`, tipoCalculo: 'PROYECCION',
    });
    expect(corrida.omitidos.map((o) => o.codigo)).not.toContain(PROY);
    expect(corrida.omitidos).toEqual(expect.arrayContaining([
      { codigo: SIN_BASE, motivo: 'El indicador base ZVT_HU39_NO_EXISTE no aplica a la DDRISS.' },
      { codigo: BASE_DE_OTRO_TIPO, motivo: 'El indicador base DES_HEXA1_3 no es de cobertura, avance ni brecha.' },
      { codigo: OTRO_METODO, motivo: 'El método REGRESION hasta FIN_DE_ANIO no está disponible.' },
    ]));
  });

  it('San Marcos: 100 acumuladas y ritmo 30 (febrero a abril) dan 340 dosis, 85 % y 40 que faltarían', () => {
    expect(deMunicipio(corrida.resultados, PROY, MUNICIPIO_SM)).toMatchObject({
      tipoCalculo: 'PROYECCION',
      vacuna: { codigo: VACUNA },
      dosis: 'D1',
      filtroDimensiones: 'grupo_edad=MENOR_1',
      anio: ANIO,
      mes: 4,
      esProyeccion: true,
      numerador: 340,
      denominador: POBLACION_SM,
      valor: 85,
      meta: 95,
      brechaDosis: 40,
      cumpleMeta: false,
      calculable: true,
      color: null,
      proyeccion: { indicadorBase: COB, mesesVentana: 3, mesesUsados: [2, 3, 4], dosisAcumuladas: 100, ritmoMensual: 30 },
    });
  });

  it('San Pedro y la departamental suman las proyecciones de cada municipio', () => {
    // San Pedro: 12 acumuladas, 6 en la ventana (ritmo 2): 12 + 2 × 8 = 28. Departamental: 340 + 28 = 368.
    expect(deMunicipio(corrida.resultados, PROY, MUNICIPIO_SP)).toMatchObject({
      numerador: 28, denominador: POBLACION_OTROS, valor: 28, brechaDosis: 67, cumpleMeta: false,
      proyeccion: { dosisAcumuladas: 12, ritmoMensual: 2 },
    });
    const poblacionTotal = POBLACION_SM + POBLACION_OTROS * (territorio.length - 1);
    expect(deMunicipio(corrida.resultados, PROY, null)).toMatchObject({
      numerador: 368, denominador: poblacionTotal, esProyeccion: true,
      proyeccion: { dosisAcumuladas: 112, ritmoMensual: 32 },
    });
    expect(delIndicador(corrida.resultados, PROY)).toHaveLength(territorio.length + 1);
  });

  it('la base cuenta lo mismo que la proyección y sus filas no son estimación', () => {
    expect(deMunicipio(corrida.resultados, COB, MUNICIPIO_SM)).toMatchObject({
      numerador: 100, esProyeccion: false, proyeccion: null,
    });
  });

  it('guarda las filas de la proyección con es_proyeccion = TRUE', async () => {
    const [filas] = await pool.query(
      'SELECT indicador_codigo, es_proyeccion, COUNT(*) AS filas FROM resultado_indicador WHERE corrida_id = ? AND indicador_codigo IN (?, ?) GROUP BY indicador_codigo, es_proyeccion',
      [corrida.id, PROY, COB],
    );
    expect(filas.map((f) => [f.indicador_codigo, Boolean(f.es_proyeccion), Number(f.filas)]).sort()).toEqual([
      [COB, false, territorio.length + 1],
      [PROY, true, territorio.length + 1],
    ]);
  });
});

describe('ventana de meses cerrados', () => {
  it('con corte a mayo (abierto) la ventana sigue siendo febrero a abril: mayo no cuenta como 0', async () => {
    const corrida = await corridaConResultados(5);

    expect(corrida).toMatchObject({ parcial: true, mesesSinCerrar: [5] });
    // 100 + 30 × 7; con mayo en la ventana como 0, el ritmo sería 23,33.
    expect(deMunicipio(corrida.resultados, PROY, MUNICIPIO_SM)).toMatchObject({
      mes: 5, numerador: 310, valor: 77.5,
      proyeccion: { mesesUsados: [2, 3, 4], dosisAcumuladas: 100, ritmoMensual: 30 },
    });
  });

  it('con corte a febrero la ventana solo tiene enero y febrero', async () => {
    const corrida = await corridaConResultados(2);

    // 30 acumuladas y ritmo 15: 30 + 15 × 10 = 180.
    expect(deMunicipio(corrida.resultados, PROY, MUNICIPIO_SM)).toMatchObject({
      numerador: 180, valor: 45,
      proyeccion: { mesesUsados: [1, 2], dosisAcumuladas: 30, ritmoMensual: 15 },
    });
  });
});

describe('GET /indicadores/resultados de una proyección', () => {
  it('trae proyeccion al filtrar por el indicador, y también por municipio', async () => {
    const res = await api('get', `/indicadores/resultados?anio=${ANIO}&mes=4&indicador=${PROY}`);

    expect(res.status).toBe(200);
    expect(res.body.resultados).toHaveLength(territorio.length + 1);
    expect(res.body.resultados.every((r) => r.indicadorCodigo === PROY && r.esProyeccion)).toBe(true);
    expect(deMunicipio(res.body.resultados, PROY, MUNICIPIO_SM).proyeccion).toEqual({
      indicadorBase: COB, mesesVentana: 3, mesesUsados: [2, 3, 4], dosisAcumuladas: 100, ritmoMensual: 30,
    });

    const sm = await api('get', `/indicadores/resultados?anio=${ANIO}&mes=4&indicador=${PROY}&municipioId=${MUNICIPIO_SM}`);
    expect(sm.status).toBe(200);
    expect(sm.body.resultados).toHaveLength(1);
    expect(sm.body.resultados[0]).toMatchObject({
      numerador: 340,
      proyeccion: { mesesUsados: [2, 3, 4], dosisAcumuladas: 100, ritmoMensual: 30 },
    });
  });
});
