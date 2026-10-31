import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { reglasQueAplican } from '../src/modulos/configuracion/reglas.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas del endpoint crean por SQL los meses de 2019 (abiertos en la DDRISS 1) y las vacunas ZVT_HU25 (D1 a
// D3 en dos secciones de edad y el campo total_dosis_declarado) y ZVT_HU25B (dosis única), con sus esquemas
// nacionales desde enero de 2019. Insertan en MongoDB reglas ZVT_HU25_* de DDRISS_SM que solo aplican a esas vacunas.
// Los reportes los crea cs1201 (CS-1201) con su token firmado sin iniciar sesión. Todo se borra al inicio y al
// final; las filas de la bitácora quedan. Los esquemas de la semilla empiezan en 2026: en 2019 solo hay los de prueba.
const VACUNA = 'ZVT_HU25';
const VACUNA_UNICA = 'ZVT_HU25B';
const VACUNAS = [VACUNA, VACUNA_UNICA];
const ANIO = 2019;
const MESES = [1, 2, 3, 4, 5, 6, 7, 8];
const DDRISS = { nivel: 'DDRISS', ddriss_codigo: 'DDRISS_SM' };
const NACIONAL = { nivel: 'NACIONAL', ddriss_codigo: null };

const vacunaIds = {};
const periodoIds = {};
const esquemaIds = { [VACUNA]: new ObjectId(), [VACUNA_UNICA]: new ObjectId() };

// Se comparan contra la semilla (02 y 04) sin tocarla. Las reglas ZVT_ de otras pruebas que corran a la vez se
// ignoran.
const deLaSemilla = (reglas) => reglas.filter((r) => !r.codigo.startsWith('ZVT_'));

describe('reglasQueAplican', () => {
  it('para DDRISS_SM, su VIGENTE de un código reemplaza a la nacional', async () => {
    const reglas = deLaSemilla(await reglasQueAplican('DDRISS_SM'));
    const variacion = reglas.filter((r) => r.codigo === 'VARIACION_HISTORICA');
    expect(variacion).toHaveLength(1);
    expect(variacion[0]).toMatchObject({ version: 2, territorio: { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' } });
    expect(reglas.find((r) => r.codigo === 'CAMPOS_COMPLETOS')).toMatchObject({
      version: 1,
      territorio: { nivel: 'NACIONAL' },
      parametros: { cero_explicito: true },
    });
  });

  it('no trae borradores ni versiones HISTORICO', async () => {
    const reglas = await reglasQueAplican('DDRISS_SM');
    expect(reglas.some((r) => r.codigo === 'RANGO_DOSIS_MES')).toBe(false);
    expect(reglas.every((r) => r.estado === 'VIGENTE')).toBe(true);
    expect(new Set(reglas.map((r) => r.codigo)).size).toBe(reglas.length);
  });

  it('sin DDRISS, o con una sin versiones propias, solo trae las nacionales', async () => {
    for (const ddriss of [null, 'ZVT_SIN_REGLAS']) {
      const reglas = deLaSemilla(await reglasQueAplican(ddriss));
      expect(reglas.every((r) => r.territorio.nivel === 'NACIONAL')).toBe(true);
      expect(reglas.find((r) => r.codigo === 'VARIACION_HISTORICA')).toMatchObject({ version: 1 });
    }
  });

  it('vienen en orden de código', async () => {
    const codigos = (await reglasQueAplican('DDRISS_SM')).map((r) => r.codigo);
    expect(codigos).toEqual([...codigos].sort((a, b) => a.localeCompare(b)));
  });
});

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: new Int32(1),
  publicado_en: new Date(),
  motivo_cambio: 'vitest-hu25',
});

const esquema = (codigo, contenido) => ({
  _id: esquemaIds[codigo],
  vacuna: { id: new Int32(vacunaIds[codigo]), codigo, nombre: `vitest-hu25 ${codigo}` },
  version: new Int32(1),
  territorio: NACIONAL,
  estado: 'VIGENTE',
  vigencia: { desde: new Date('2019-01-01T00:00:00.000Z'), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  reglas: [],
  presentacion: { filas: 'dosis', columnas: ['seccion'] },
  auditoria: auditoria(),
  ...contenido,
});

const esquemas = () => [
  esquema(VACUNA, {
    dimensiones: {
      dosis: [
        { codigo: 'D1', etiqueta: 'Primera dosis' },
        { codigo: 'D2', etiqueta: 'Segunda dosis' },
        { codigo: 'D3', etiqueta: 'Tercera dosis' },
      ],
      procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
      desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
    },
    secciones: [
      { codigo: 'MENOR_1', titulo: '< 1 año', orden: new Int32(1), grupo_edad: 'MENOR_1', dosis: ['D1', 'D2', 'D3'] },
      { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: new Int32(2), grupo_edad: '1_A_5', dosis: ['D1', 'D2', 'D3'] },
    ],
    campos_adicionales: [
      { clave: 'total_dosis_declarado', etiqueta: 'Total de dosis', tipo: 'entero', requerido: true, minimo: new Int32(0), maximo: null },
    ],
  }),
  esquema(VACUNA_UNICA, {
    dimensiones: {
      dosis: [{ codigo: 'UNICA', etiqueta: 'Dosis única' }],
      procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
      desagregacion: [],
    },
    secciones: [{ codigo: 'UNICA', titulo: 'Única', orden: new Int32(1), grupo_edad: null, dosis: ['UNICA'] }],
    campos_adicionales: [],
  }),
];

function regla({ codigo, version = 1, territorio = DDRISS, estado = 'VIGENTE', tipo = 'RANGO', vacunas, parametros, mensaje, severidad = 'ADVERTENCIA' }) {
  const ambito = { RANGO: 'DETALLE', SIN_DUPLICADOS: 'REPORTE' }[tipo];
  return {
    _id: new ObjectId(),
    codigo,
    version: new Int32(version),
    nombre: `vitest-hu25 ${codigo}`,
    tipo,
    ambito,
    severidad,
    aplica_a: { vacunas },
    parametros,
    mensaje,
    territorio,
    estado,
    vigencia: { desde: new Date('2019-01-01T00:00:00.000Z'), hasta: estado === 'HISTORICO' ? new Date() : null },
    auditoria: auditoria(),
  };
}

const MENSAJE_RANGO = '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).';
const reglasDePrueba = () => [
  regla({ codigo: 'ZVT_HU25_RANGO', vacunas: [VACUNA], parametros: { minimo: 0, maximo: 100 }, mensaje: MENSAJE_RANGO }),
  regla({
    codigo: 'ZVT_HU25_DUP',
    tipo: 'SIN_DUPLICADOS',
    severidad: 'ERROR',
    vacunas: [VACUNA],
    parametros: {},
    mensaje: 'Ya hay un reporte de {establecimiento} para {periodo}.',
  }),
  // La nacional y la versión de DDRISS_SM que la reemplaza: solo se ejecuta la de la DDRISS.
  regla({
    codigo: 'ZVT_HU25_NAC',
    territorio: NACIONAL,
    vacunas: [VACUNA_UNICA],
    parametros: { minimo: 0, maximo: 1 },
    mensaje: 'Nacional: {vacuna} {valor}.',
  }),
  regla({ codigo: 'ZVT_HU25_NAC', version: 2, vacunas: [VACUNA_UNICA], parametros: { minimo: 0, maximo: 1 }, mensaje: 'DDRISS: {vacuna} {valor}.' }),
  // Desactivada en la DDRISS y sin nacional: no se ejecuta.
  regla({ codigo: 'ZVT_HU25_OFF', estado: 'HISTORICO', vacunas: [VACUNA_UNICA], parametros: { minimo: 0, maximo: 0 }, mensaje: MENSAJE_RANGO }),
];

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  // resultado_validacion no cae en cascada con el reporte (fk_val_reporte).
  await pool.query(`DELETE FROM resultado_validacion WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: VACUNAS } });
  await db.collection('reglas_validacion').deleteMany({ codigo: /^ZVT_HU25/ });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [VACUNAS]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS]);
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
  for (const [codigo, dosis] of [[VACUNA, ['D1', 'D2', 'D3']], [VACUNA_UNICA, ['UNICA']]]) {
    const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, ?, TRUE)', [
      codigo,
      `vitest-hu25 ${codigo}`,
    ]);
    vacunaIds[codigo] = vacuna.insertId;
    for (const [i, dosisCodigo] of dosis.entries()) {
      await pool.query('INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, ?, ?, ?, TRUE)', [
        vacuna.insertId,
        dosisCodigo,
        `Dosis ${dosisCodigo}`,
        i + 1,
      ]);
    }
  }
  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertMany(esquemas());
  await db.collection('reglas_validacion').insertMany(reglasDePrueba());
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

let personal;
let revisor;
let municipioPropio;

const validar = (reporteId, credencial = personal.token) =>
  request(app).post(`/api/v1/reportes/${reporteId}/validar`).set('Authorization', `Bearer ${credencial}`);

async function crearReporte(mes) {
  const res = await request(app)
    .post('/api/v1/reportes')
    .set('Authorization', `Bearer ${personal.token}`)
    .send({ periodoId: periodoIds[mes] });
  expect(res.status).toBe(201);
  return { id: res.body.id, versionFila: res.body.versionFila };
}

// Guarda las celdas del municipio propio de una vacuna con el PUT de la captura; devuelve la versionFila nueva.
async function guardar(reporte, codigo, cantidades, datosAdicionales = null) {
  const celdas = Object.entries(cantidades).map(([celda, cantidad]) => {
    const [dosisCodigo, edad] = celda.split('|');
    return { dosisCodigo, municipioProcedenciaId: municipioPropio, dimensiones: edad ? { grupo_edad: edad } : {}, cantidad };
  });
  const res = await request(app)
    .put(`/api/v1/reportes/${reporte.id}/vacunas/${vacunaIds[codigo]}`)
    .set('Authorization', `Bearer ${personal.token}`)
    .send({ versionFila: reporte.versionFila, celdas, datosAdicionales });
  expect(res.status).toBe(200);
  reporte.versionFila = res.body.versionFila;
}

const filasValidar = async (reporteId) => {
  const [[{ total }]] = await pool.query(
    "SELECT COUNT(*) AS total FROM bitacora WHERE accion = 'VALIDAR' AND entidad = 'reporte_produccion' AND entidad_id = ?",
    [String(reporteId)],
  );
  return Number(total);
};
const resultadosEnBase = async (reporteId) => {
  const [filas] = await pool.query(
    'SELECT id, regla_codigo, regla_version, severidad, estado, mensaje FROM resultado_validacion WHERE reporte_id = ? ORDER BY id',
    [reporteId],
  );
  return filas;
};
const cambiarMes = (mes, estado) =>
  pool.query(
    'UPDATE cierre_periodo SET estado = ?, cerrado_por = ?, cerrado_en = ? WHERE periodo_id = ? AND ddriss_id = 1',
    [estado, estado === 'CERRADO' ? 2 : null, estado === 'CERRADO' ? `${ANIO}-12-20 16:00:00` : null, periodoIds[mes]],
  );

// < 1 año sin la tercera dosis, la primera en 150 (supera el RANGO de prueba), las demás en 10: suma 190.
const CANTIDADES = { 'D1|MENOR_1': 150, 'D2|MENOR_1': 10, 'D1|1_A_5': 10, 'D2|1_A_5': 10, 'D3|1_A_5': 10 };

describe('POST /reportes/{id}/validar', () => {
  let reporte;

  beforeAll(async () => {
    await limpiar();
    await preparar();
    personal = await tokenDe('u.nombre_usuario', 'cs1201');
    revisor = await tokenDe('r.codigo', 'REVISOR');
    const [[municipio]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
    municipioPropio = municipio.municipio_id;

    // Historial de ZVT_HU25B: enero a marzo enviados con 20 dosis; abril (el que se valida) tendrá 50.
    for (const mes of [1, 2, 3]) {
      const previo = await crearReporte(mes);
      await guardar(previo, VACUNA_UNICA, { UNICA: 20 });
      await pool.query("UPDATE reporte_produccion SET estado = 'ENVIADO' WHERE id = ?", [previo.id]);
    }
    reporte = await crearReporte(4);
    await guardar(reporte, VACUNA, CANTIDADES, { total_dosis_declarado: 200 });
    await guardar(reporte, VACUNA_UNICA, { UNICA: 50 });
  }, 120000);

  afterAll(limpiar, 60000);

  it('la primera corrida inserta los resultados ABIERTO con su versión y deja una fila VALIDAR', async () => {
    const res = await validar(reporte.id);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ errores: 2, advertencias: 3, corregidos: 0 });
    expect(Date.parse(res.body.validadoEn)).not.toBeNaN();
    expect(res.body.resultados.map((r) => `${r.severidad} ${r.vacuna?.codigo} ${r.regla.codigo} v${r.regla.version}`)).toEqual([
      `ERROR ${VACUNA} CAMPOS_COMPLETOS v1`,
      `ERROR ${VACUNA} TOTAL_CUADRA v1`,
      `ADVERTENCIA ${VACUNA} ZVT_HU25_RANGO v1`,
      `ADVERTENCIA ${VACUNA_UNICA} VARIACION_HISTORICA v2`,
      `ADVERTENCIA ${VACUNA_UNICA} ZVT_HU25_NAC v2`,
    ]);
    expect(res.body.resultados.every((r) => r.estado === 'ABIERTO')).toBe(true);

    const enBase = await resultadosEnBase(reporte.id);
    expect(enBase).toHaveLength(5);
    expect(enBase.every((r) => r.estado === 'ABIERTO')).toBe(true);
    expect(enBase.find((r) => r.regla_codigo === 'VARIACION_HISTORICA')).toMatchObject({
      regla_version: 2,
      mensaje: `La producción de vitest-hu25 ${VACUNA_UNICA} varía 150 % respecto al promedio de los últimos 3 meses.`,
    });
    expect(await filasValidar(reporte.id)).toBe(1);
  });

  it('cada resultado trae la vacuna, la dosis, la regla y sus casillas', async () => {
    const { body } = await validar(reporte.id);
    const [campos, total, rango] = body.resultados;

    expect(campos).toMatchObject({
      regla: { codigo: 'CAMPOS_COMPLETOS', version: 1, nombre: 'Campos completos', tipo: 'CAMPOS_COMPLETOS' },
      vacuna: { id: vacunaIds[VACUNA], codigo: VACUNA, nombre: `vitest-hu25 ${VACUNA}` },
      dosis: null,
      celdas: [{ municipioId: municipioPropio, dosis: 'D3', claveCombinacion: 'grupo_edad=MENOR_1' }],
      campos: [],
    });
    expect(total).toMatchObject({ campos: ['total_dosis_declarado'], celdas: [] });
    expect(total.mensaje).toBe(`El total declarado de vitest-hu25 ${VACUNA} (200) no coincide con la suma del detalle (190).`);
    expect(rango).toMatchObject({
      dosis: { codigo: 'D1', etiqueta: 'Primera dosis' },
      celdas: [{ municipioId: municipioPropio, dosis: 'D1', claveCombinacion: 'grupo_edad=MENOR_1' }],
      mensaje: `vitest-hu25 ${VACUNA} Primera dosis: 150 dosis está fuera del rango esperado (0 a 100).`,
    });
  });

  it('una corrida sin cambios no escribe nada ni deja otra fila VALIDAR', async () => {
    const antes = await resultadosEnBase(reporte.id);
    const res = await validar(reporte.id);

    expect(res.status).toBe(200);
    expect(await resultadosEnBase(reporte.id)).toEqual(antes);
    expect(await filasValidar(reporte.id)).toBe(1);
    expect(res.body.resultados.map((r) => r.id)).toEqual(antes.map((r) => r.id));
  });

  it('una versión nueva de la regla con el mismo mensaje conserva el resultado y actualiza su versión', async () => {
    const db = await obtenerDb();
    await db.collection('reglas_validacion').updateOne({ codigo: 'ZVT_HU25_RANGO', version: 1 }, { $set: { estado: 'HISTORICO' } });
    await db.collection('reglas_validacion').insertOne(
      regla({ codigo: 'ZVT_HU25_RANGO', version: 2, vacunas: [VACUNA], parametros: { minimo: 0, maximo: 100 }, mensaje: MENSAJE_RANGO }),
    );
    const antes = (await resultadosEnBase(reporte.id)).find((r) => r.regla_codigo === 'ZVT_HU25_RANGO');

    const res = await validar(reporte.id);

    const rango = res.body.resultados.find((r) => r.regla.codigo === 'ZVT_HU25_RANGO');
    expect(rango).toMatchObject({ id: antes.id, regla: { version: 2 } });
    expect((await resultadosEnBase(reporte.id)).find((r) => r.id === antes.id).regla_version).toBe(2);
    expect(await filasValidar(reporte.id)).toBe(2);
  });

  it('al llenar la casilla vacía, lo que se corrigió pasa a CORREGIDO y lo demás se conserva', async () => {
    const antes = await resultadosEnBase(reporte.id);
    // Con la tercera dosis la suma es 200: también cuadra el total.
    await guardar(reporte, VACUNA, { ...CANTIDADES, 'D3|MENOR_1': 10 }, { total_dosis_declarado: 200 });

    const res = await validar(reporte.id);

    expect(res.body).toMatchObject({ errores: 0, advertencias: 3, corregidos: 2 });
    const despues = await resultadosEnBase(reporte.id);
    expect(despues).toHaveLength(antes.length);
    expect(despues.filter((r) => r.estado === 'CORREGIDO').map((r) => r.regla_codigo).sort()).toEqual([
      'CAMPOS_COMPLETOS',
      'TOTAL_CUADRA',
    ]);
    expect(await filasValidar(reporte.id)).toBe(3);
  });

  it('un reporte que ya no está en borrador responde 409 REPORTE_NO_EDITABLE', async () => {
    const enviado = await crearReporte(5);
    await pool.query("UPDATE reporte_produccion SET estado = 'ENVIADO' WHERE id = ?", [enviado.id]);

    const res = await validar(enviado.id);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('REPORTE_NO_EDITABLE');
    expect(await resultadosEnBase(enviado.id)).toEqual([]);
  });

  it('con el mes CERRADO responde 409 PERIODO_CERRADO; EN_CIERRE se valida', async () => {
    const cerrado = await crearReporte(6);
    await cambiarMes(6, 'CERRADO');
    const enCierre = await crearReporte(7);
    await cambiarMes(7, 'EN_CIERRE');

    const res = await validar(cerrado.id);
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('PERIODO_CERRADO');
    expect((await validar(enCierre.id)).status).toBe(200);
  });

  it('un reporte de otro establecimiento responde 404 sin escribir nada', async () => {
    const [[ajeno]] = await pool.query(
      `SELECT r.id FROM reporte_produccion r JOIN establecimiento e ON e.id = r.establecimiento_id
        WHERE e.codigo <> 'CS-1201' ORDER BY r.id LIMIT 1`,
    );
    const antes = await resultadosEnBase(ajeno.id);

    const res = await validar(ajeno.id);

    expect(res.status).toBe(404);
    expect(await resultadosEnBase(ajeno.id)).toEqual(antes);
  });

  it('un cuerpo, un parámetro de consulta o un id inválido responden 400', async () => {
    const conCuerpo = await validar(reporte.id).send({ versionFila: 1 });
    expect(conCuerpo.status).toBe(400);
    expect(conCuerpo.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'Campo no permitido: versionFila.' });

    const conParametro = await request(app)
      .post(`/api/v1/reportes/${reporte.id}/validar?vacunaId=1`)
      .set('Authorization', `Bearer ${personal.token}`);
    expect(conParametro.status).toBe(400);
    expect(conParametro.body.error.mensaje).toBe('Parámetro no permitido: vacunaId.');

    expect((await validar('abc')).status).toBe(400);
  });

  it('el Revisor recibe 403', async () => {
    const res = await validar(reporte.id, revisor.token);
    expect(res.status).toBe(403);
  });

  it('dos corridas en paralelo dejan una sola fila por resultado y una fila VALIDAR', async () => {
    const paralelo = await crearReporte(8);
    await guardar(paralelo, VACUNA, CANTIDADES, { total_dosis_declarado: 200 });

    const [a, b] = await Promise.all([validar(paralelo.id), validar(paralelo.id)]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const filas = await resultadosEnBase(paralelo.id);
    const llaves = filas.map((r) => `${r.regla_codigo}|${r.mensaje}`);
    expect(new Set(llaves).size).toBe(llaves.length);
    expect(filas.length).toBe(a.body.resultados.length);
    expect(await filasValidar(paralelo.id)).toBe(1);
  });
});
