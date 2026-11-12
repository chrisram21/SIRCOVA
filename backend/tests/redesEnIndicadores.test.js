import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// SPEC 60: la fila «Total de la red» de GET /indicadores/resultados. Todo por SQL y MongoDB, sin el motor: la DDRISS
// ficticia ZVT_RED60 con su propio departamento (Z6) y cuatro municipios (Z601 a Z604), la red activa Red A (Z601 y
// Z602), la Red B inactiva y una corrida vigente de julio de 2088 (un año que ninguna otra prueba usa) con cinco indicadores ZVT_HU60_* (de esa DDRISS,
// para que el motor de otras pruebas no los calcule). Las filas se insertan con los valores ya calculados. Los
// consulta la Autoridad nacional con ddrissId. Todo se borra al inicio y al final.
const ANIO = 2088;
const MES = 7;
const DDRISS_PRUEBA = 'ZVT_RED60';
const DEPARTAMENTO_PRUEBA = 'Z6';
const MUNICIPIOS_PRUEBA = ['Z601', 'Z602', 'Z603', 'Z604'];
const VACUNA_ID = 2;
const COB = 'ZVT_HU60_COB';
const AVANCE = 'ZVT_HU60_AV';
const BRECHA = 'ZVT_HU60_BRECHA';
const DES = 'ZVT_HU60_DES';
const PROY = 'ZVT_HU60_PROY';

const cuentas = {};
const municipios = {};
const redes = {};
let ddrissId;

const UMBRALES = [
  { color: 'verde', desde: 90, hasta: null },
  { color: 'amarillo', desde: 80, hasta: 90 },
  { color: 'rojo', desde: 0, hasta: 80 },
];
const coleccion = async () => (await obtenerDb()).collection('configuracion_indicadores');

function indicador({ codigo, tipo, aplica, denominador, meta, umbrales = UMBRALES, parametros }) {
  const fecha = new Date();
  return {
    _id: new ObjectId(),
    codigo,
    version: new Int32(1),
    nombre: `vitest-hu60 ${codigo}`,
    tipo_calculo: tipo,
    aplica_a: [{ vacuna: 'HEXA', ...aplica }],
    numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
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
    territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS_PRUEBA },
    estado: 'VIGENTE',
    vigencia: { desde: fecha, hasta: null },
    auditoria: {
      creado_por: new Int32(4), creado_en: fecha, publicado_por: new Int32(4), publicado_en: fecha, motivo_cambio: 'vitest-hu60',
    },
  };
}

const poblacion = (prorrateo) => ({ fuente: 'POBLACION_OBJETIVO', prorrateo });
const INDICADORES = [
  indicador({
    codigo: COB, tipo: 'COBERTURA', aplica: { dosis: 'D3', clasificacion_poblacion: 'MENOR_1' },
    denominador: poblacion('NINGUNO'), meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>' },
  }),
  indicador({
    codigo: AVANCE, tipo: 'AVANCE_META_MES', aplica: { dosis: 'D3', clasificacion_poblacion: 'MENOR_1' },
    denominador: poblacion('MENSUAL_LINEAL'), meta: { valor: 100, unidad: 'PORCENTAJE', comparador: '>=' },
  }),
  indicador({
    codigo: BRECHA, tipo: 'BRECHA', aplica: { dosis: 'D3', clasificacion_poblacion: 'MENOR_1' }, umbrales: null,
    denominador: poblacion('NINGUNO'), meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>' },
  }),
  indicador({
    codigo: DES, tipo: 'DESERCION', aplica: { dosis_inicial: 'D1', dosis_final: 'D3' },
    denominador: { fuente: 'PRODUCCION' }, meta: { valor: 10, unidad: 'PORCENTAJE', comparador: '<=' },
    umbrales: [{ color: 'verde', desde: null, hasta: 10 }, { color: 'rojo', desde: 10, hasta: null }],
  }),
  indicador({
    codigo: PROY, tipo: 'PROYECCION', aplica: { dosis: 'D3', clasificacion_poblacion: 'MENOR_1' }, umbrales: null,
    denominador: poblacion('NINGUNO'), meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>' },
    parametros: { indicador_base: COB, metodo: 'PROMEDIO_MOVIL', meses_ventana: new Int32(3), horizonte: 'FIN_DE_ANIO' },
  }),
];

// [codigo, municipio (null = departamental), numerador, denominador, valor, meta, brechaDosis, cumpleMeta]. Lo que la
// red no suma (Z603) cambia la departamental, no la de la red.
const FILAS = [
  [COB, null, 100, 400, 25, 95, 280, false],
  [COB, 'Z601', 60, 100, 60, 95, 35, false],
  [COB, 'Z602', 30, 100, 30, 95, 65, false],
  [COB, 'Z603', 10, 200, 5, 95, 180, false],
  [AVANCE, null, 140, 210, 66.6667, 100, 70, false],
  [AVANCE, 'Z601', 120, 100, 120, 100, 0, true],
  [AVANCE, 'Z602', 10, 10, 100, 100, 0, true],
  [AVANCE, 'Z603', 10, 100, 10, 100, 90, false],
  [BRECHA, null, 69, null, null, null, null, null],
  [BRECHA, 'Z601', 60, 100, 60, 95, 35, false],
  [BRECHA, 'Z602', 9, null, null, null, null, null],
  [DES, null, 20, 100, 20, 10, null, false],
  [DES, 'Z601', 5, 50, 10, 10, null, true],
  [DES, 'Z602', 15, 50, 30, 10, null, false],
  [PROY, null, 300, 400, 75, 95, 80, false],
  [PROY, 'Z601', 150, 100, 150, 95, 0, true],
];

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
  return tokenDePrueba(
    cuenta.id,
    {
      rol: cuenta.rol, permisos: permisos.map((p) => p.codigo), ddrissId: cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id, municipioId: cuenta.municipio_id,
    },
    { expiresIn: '10m' },
  );
}

const resultados = (consulta, token = cuentas.nacional) =>
  request(app).get(`/api/v1/indicadores/resultados?${consulta}`).set('Authorization', `Bearer ${token}`);
const deLaRed = (consulta) => resultados(`anio=${ANIO}&mes=${MES}&ddrissId=${ddrissId}&${consulta}`);
const filaDeRed = (lista, codigo) => lista.find((r) => r.indicadorCodigo === codigo && r.red !== null);

async function limpiar() {
  await (await coleccion()).deleteMany({ codigo: /^ZVT_HU60_/ });
  const delDdriss = 'SELECT c.id FROM corrida_calculo c JOIN ddriss d ON d.id = c.ddriss_id WHERE d.codigo = ?';
  await pool.query(`DELETE FROM resultado_indicador WHERE corrida_id IN (SELECT id FROM (${delDdriss}) t)`, [DDRISS_PRUEBA]);
  await pool.query(`DELETE FROM corrida_calculo WHERE id IN (SELECT id FROM (${delDdriss}) t)`, [DDRISS_PRUEBA]);
  const redesDelDdriss = 'SELECT r.id FROM red r JOIN ddriss d ON d.id = r.ddriss_id WHERE d.codigo = ?';
  await pool.query(`DELETE FROM red_municipio WHERE red_id IN (SELECT id FROM (${redesDelDdriss}) t)`, [DDRISS_PRUEBA]);
  await pool.query(`DELETE FROM red_trazadora WHERE red_id IN (SELECT id FROM (${redesDelDdriss}) t)`, [DDRISS_PRUEBA]);
  await pool.query(`DELETE FROM red WHERE id IN (SELECT id FROM (${redesDelDdriss}) t)`, [DDRISS_PRUEBA]);
  await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS_PRUEBA]);
  await pool.query(
    'DELETE m FROM municipio m JOIN departamento d ON d.id = m.departamento_id WHERE d.codigo_ine = ?',
    [DEPARTAMENTO_PRUEBA],
  );
  await pool.query('DELETE FROM departamento WHERE codigo_ine = ?', [DEPARTAMENTO_PRUEBA]);
}

async function preparar() {
  const [departamento] = await pool.query("INSERT INTO departamento (codigo_ine, nombre) VALUES (?, 'vitest-hu60')", [
    DEPARTAMENTO_PRUEBA,
  ]);
  const [ddriss] = await pool.query(
    "INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-hu60', ?, TRUE)",
    [DDRISS_PRUEBA, departamento.insertId],
  );
  ddrissId = ddriss.insertId;
  for (const ine of MUNICIPIOS_PRUEBA) {
    const [m] = await pool.query('INSERT INTO municipio (departamento_id, codigo_ine, nombre, activo) VALUES (?, ?, ?, TRUE)', [
      departamento.insertId, ine, `vitest-hu60-${ine}`,
    ]);
    municipios[ine] = m.insertId;
  }
  const [redA] = await pool.query("INSERT INTO red (ddriss_id, codigo, nombre) VALUES (?, 'RED_01', 'vitest-hu60 Red A')", [ddrissId]);
  redes.a = redA.insertId;
  await pool.query('INSERT INTO red_municipio (red_id, municipio_id) VALUES (?, ?), (?, ?)', [
    redes.a, municipios.Z601, redes.a, municipios.Z602,
  ]);
  const [redB] = await pool.query(
    "INSERT INTO red (ddriss_id, codigo, nombre, activo) VALUES (?, 'RED_02', 'vitest-hu60 Red B', FALSE)",
    [ddrissId],
  );
  redes.b = redB.insertId;

  await (await coleccion()).insertMany(INDICADORES);
  const [corrida] = await pool.query(
    `INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, motivo, estado, finalizada_en, vigente)
     VALUES (?, ?, ?, 'MANUAL', 'COMPLETADA', NOW(), TRUE)`,
    [ddrissId, ANIO, MES],
  );
  await pool.query(
    `INSERT INTO resultado_indicador
       (corrida_id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, anio, mes, es_proyeccion,
        numerador, denominador, valor, meta, brecha_dosis, cumple_meta)
     VALUES ?`,
    [FILAS.map(([codigo, ine, ...valores]) => [
      corrida.insertId, codigo, 1, ine === null ? null : municipios[ine], VACUNA_ID, null, ANIO, MES, codigo === PROY,
      ...valores,
    ])],
  );
}

beforeAll(async () => {
  await obtenerDb();
  cuentas.nacional = await tokenDe('autoridad.nacional');
  cuentas.epidemiologia = await tokenDe('epidemiologia');
  await limpiar();
  await preparar();
}, 60000);

afterAll(limpiar, 60000);

describe('GET /indicadores/resultados con redId (SPEC 60)', () => {
  it('sin redId ninguna fila trae red', async () => {
    const res = await resultados(`anio=${ANIO}&mes=${MES}&ddrissId=${ddrissId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.resultados.every((r) => r.red === null)).toBe(true);
  });

  it('la cobertura anual de la red suma sus municipios y se pinta contra lo esperado del mes', async () => {
    const res = await deLaRed(`redId=${redes.a}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const deCob = res.body.resultados.filter((r) => r.indicadorCodigo === COB);
    expect(deCob.map((r) => r.red?.nombre ?? r.municipio?.nombre ?? 'DDRISS')).toEqual([
      'DDRISS', 'vitest-hu60 Red A', 'vitest-hu60-Z601', 'vitest-hu60-Z602', 'vitest-hu60-Z603',
    ]);
    // 90 de 200 = 45 %; a julio se espera 58.33 %, así que es 77.1 % de lo esperado: rojo.
    expect(filaDeRed(res.body.resultados, COB)).toEqual({
      ...deCob[0],
      red: { id: redes.a, nombre: 'vitest-hu60 Red A' },
      municipio: null,
      numerador: 90,
      denominador: 200,
      valor: 45,
      meta: 95,
      brechaDosis: 100,
      cumpleMeta: false,
      calculable: true,
      color: 'rojo',
      esperado: 58.33,
      mayorACien: false,
      metaDosis: 190,
      excedenteDosis: 0,
      sumaBrechasMunicipales: 100,
      proyeccion: null,
    });
    expect(deCob[0]).toMatchObject({ red: null, valor: 25, sumaBrechasMunicipales: 280 });
  });

  it('el avance de la red puede pasar de 100 y lleva su excedente', async () => {
    const res = await deLaRed(`redId=${redes.a}`);
    expect(filaDeRed(res.body.resultados, AVANCE)).toMatchObject({
      numerador: 130, denominador: 110, valor: 118.1818, meta: 100, brechaDosis: 0, cumpleMeta: true,
      color: 'verde', esperado: null, mayorACien: true, metaDosis: 110, excedenteDosis: 20, sumaBrechasMunicipales: 0,
    });
  });

  it('la brecha no es calculable si a un municipio de la red le falta el denominador', async () => {
    const res = await deLaRed(`redId=${redes.a}`);
    expect(filaDeRed(res.body.resultados, BRECHA)).toMatchObject({
      numerador: 69, denominador: null, valor: null, calculable: false, color: null, metaDosis: null,
      sumaBrechasMunicipales: null,
    });
  });

  it('la deserción de la red suma pérdidas e iniciales; la proyección no tiene fila de red', async () => {
    const res = await deLaRed(`redId=${redes.a}`);
    expect(filaDeRed(res.body.resultados, DES)).toMatchObject({
      numerador: 20, denominador: 100, valor: 20, meta: 10, cumpleMeta: false, color: 'rojo', esperado: null,
      mayorACien: false,
    });
    expect(filaDeRed(res.body.resultados, PROY)).toBeUndefined();
  });

  it('con indicador solo trae ese y su fila de red', async () => {
    const res = await deLaRed(`redId=${redes.a}&indicador=${COB}`);
    expect(res.status).toBe(200);
    expect(res.body.resultados.filter((r) => r.red !== null).map((r) => r.indicadorCodigo)).toEqual([COB]);
  });

  it('redId con municipioId responde 400', async () => {
    const res = await deLaRed(`redId=${redes.a}&municipioId=${municipios.Z601}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'redId y municipioId no se combinan.' });
  });

  it('una red inactiva, inexistente o de otra DDRISS responde 404', async () => {
    for (const res of [
      await deLaRed(`redId=${redes.b}`),
      await deLaRed('redId=65000'),
      await resultados(`anio=${ANIO}&mes=${MES}&redId=${redes.a}`, cuentas.epidemiologia),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La red no existe.' });
    }
  });
});
