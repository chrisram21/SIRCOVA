import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas crean por SQL las vacunas ZVT_HU20 (esquema con secciones, sexo en R1 y un campo adicional de cada
// tipo) y ZVT_HU20S (esquema sin secciones, como Hexavalente v1), y sus esquemas nacionales en MongoDB desde enero
// de 2023. También crean los meses de 2023 en periodo, abiertos en la DDRISS 1, y los reportes de ese año, que crea
// cs1201 (CS-1201) con su token firmado sin iniciar sesión. Todo se borra al inicio y al final; las filas de la
// bitácora quedan. Los esquemas de la semilla empiezan en 2026, así que en 2023 solo aplican los de prueba.
const VACUNA = 'ZVT_HU20';
const VACUNA_SIN_SECCIONES = 'ZVT_HU20S';
const VACUNAS = [VACUNA, VACUNA_SIN_SECCIONES];
const ANIO = 2023;
const MESES = [1, 2, 3];

const vacunaIds = {};
const dosisIds = {};
const periodoIds = {};
const esquemaIds = { [VACUNA]: new ObjectId(), [VACUNA_SIN_SECCIONES]: new ObjectId() };

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: new Int32(1),
  publicado_en: new Date(),
  motivo_cambio: 'vitest-hu20',
});
const base = (codigo) => ({
  _id: esquemaIds[codigo],
  vacuna: { id: new Int32(vacunaIds[codigo]), codigo, nombre: `vitest-hu20 ${codigo}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date('2023-01-01T00:00:00.000Z'), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: new Int32(1) }],
  presentacion: { filas: 'dosis', columnas: ['seccion'] },
  auditoria: auditoria(),
});

const CAMPOS_ADICIONALES = [
  { clave: 'frascos_abiertos', etiqueta: 'Frascos abiertos', tipo: 'entero', requerido: true, minimo: new Int32(0), maximo: new Int32(100) },
  { clave: 'temperatura', etiqueta: 'Temperatura promedio', tipo: 'decimal', requerido: false, minimo: new Int32(2), maximo: new Int32(8) },
  { clave: 'observaciones', etiqueta: 'Observaciones', tipo: 'texto', requerido: false },
  { clave: 'extramuros', etiqueta: '¿Hubo jornada extramuros?', tipo: 'booleano', requerido: false },
  { clave: 'estrategia', etiqueta: 'Estrategia', tipo: 'lista', requerido: false, opciones: ['INTRAMUROS', 'EXTRAMUROS'] },
];

const esquemaConSecciones = () => ({
  ...base(VACUNA),
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
    desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
  },
  secciones: [
    { codigo: 'MENOR_1', titulo: '< 1 año', orden: new Int32(1), grupo_edad: 'MENOR_1', dosis: ['D1', 'D2'] },
    { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: new Int32(2), grupo_edad: '1_A_5', dosis: ['D1', 'D2', 'R1'] },
  ],
  campos_adicionales: CAMPOS_ADICIONALES,
});

const esquemaSinSecciones = () => ({
  ...base(VACUNA_SIN_SECCIONES),
  dimensiones: {
    dosis: [{ codigo: 'D1', etiqueta: 'Primera dosis' }],
    procedencia: { modo: 'PROPIO_Y_OTROS', permite_no_especificado: true },
    desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }],
  },
  campos_adicionales: [],
});

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  // reporte_vacuna, detalle_produccion y detalle_dimension caen por ON DELETE CASCADE.
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: VACUNAS } });
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

  for (const [codigo, dosis] of [[VACUNA, ['D1', 'D2', 'R1']], [VACUNA_SIN_SECCIONES, ['D1']]]) {
    const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, ?, TRUE)', [
      codigo,
      `vitest-hu20 ${codigo}`,
    ]);
    vacunaIds[codigo] = vacuna.insertId;
    dosisIds[codigo] = {};
    for (const [i, dosisCodigo] of dosis.entries()) {
      const [fila] = await pool.query('INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, ?, ?, ?, TRUE)', [
        vacuna.insertId,
        dosisCodigo,
        `Dosis ${dosisCodigo}`,
        i + 1,
      ]);
      dosisIds[codigo][dosisCodigo] = fila.insertId;
    }
  }

  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertMany([esquemaConSecciones(), esquemaSinSecciones()]);
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
  const token = await tokenDePrueba(cuenta.id, {
    rol: cuenta.rol,
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  }, { expiresIn: '10m' });
  return { token, usuarioId: cuenta.id };
}

let personal;
let revisor;
let municipioPropio;

const consultar = (ruta, credencial = personal.token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);

async function crearReporte(mes) {
  const res = await request(app)
    .post('/api/v1/reportes')
    .set('Authorization', `Bearer ${personal.token}`)
    .send({ periodoId: periodoIds[mes] });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function reporteVacunaId(reporteId, codigo) {
  const [[fila]] = await pool.query('SELECT id FROM reporte_vacuna WHERE reporte_id = ? AND vacuna_id = ?', [
    reporteId,
    vacunaIds[codigo],
  ]);
  return fila.id;
}

// Una fila de detalle insertada a mano, con sus dimensiones; la clave sigue la regla canónica.
async function insertarCelda(repVacId, { dosis, procedencia, dimensiones, cantidad, codigo = VACUNA }) {
  const clave = Object.keys(dimensiones).sort().map((d) => `${d}=${dimensiones[d]}`).join('|');
  const [fila] = await pool.query(
    `INSERT INTO detalle_produccion (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [repVacId, dosisIds[codigo][dosis], procedencia, clave, cantidad, personal.usuarioId],
  );
  for (const [dimension, valor] of Object.entries(dimensiones)) {
    await pool.query('INSERT INTO detalle_dimension (detalle_id, dimension_codigo, valor_codigo) VALUES (?, ?, ?)', [
      fila.insertId,
      dimension,
      valor,
    ]);
  }
  return fila.insertId;
}

const delFormulario = (formulario, codigo) => formulario.vacunas.find((v) => v.vacunaId === vacunaIds[codigo]);

// ck_cierre_cerrado: un mes CERRADO lleva quién y cuándo lo cerró.
const cambiarMes = (mes, estado) =>
  pool.query(
    'UPDATE cierre_periodo SET estado = ?, cerrado_por = ?, cerrado_en = ? WHERE periodo_id = ? AND ddriss_id = 1',
    [estado, estado === 'CERRADO' ? 2 : null, estado === 'CERRADO' ? `${ANIO}-12-20 16:00:00` : null, periodoIds[mes]],
  );

beforeAll(async () => {
  await limpiar();
  await preparar();
  personal = await tokenDe('u.nombre_usuario', 'cs1201');
  revisor = await tokenDe('r.codigo', 'REVISOR');
  const [[municipio]] = await pool.query(
    "SELECT m.id, m.nombre FROM establecimiento e JOIN municipio m ON m.id = e.municipio_id WHERE e.codigo = 'CS-1201'",
  );
  municipioPropio = municipio;
}, 60000);

afterAll(limpiar, 60000);

describe('GET /reportes/{id}/formulario', () => {
  let reporteId;

  beforeAll(async () => {
    reporteId = await crearReporte(1);
  });

  it('un reporte recién creado trae los esquemas de sus vacunas, sin celdas, editable y con el municipio propio', async () => {
    const res = await consultar(`/reportes/${reporteId}/formulario`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      reporteId,
      versionFila: 1,
      editable: true,
      municipioPropio: { id: municipioPropio.id, nombre: municipioPropio.nombre },
    });
    const conSecciones = delFormulario(res.body, VACUNA);
    expect(conSecciones).toMatchObject({ celdas: [], datosAdicionales: null, totalDeclarado: null });
    expect(conSecciones.esquema).toMatchObject({
      id: esquemaIds[VACUNA].toString(),
      version: 1,
      estado: 'VIGENTE',
      vigencia: { desde: '2023-01-01', hasta: null },
      procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
      desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta: null }],
    });
    expect(conSecciones.esquema.dosis.map((d) => [d.codigo, d.desagregacion?.length ?? null])).toEqual([
      ['D1', null],
      ['D2', null],
      ['R1', 2],
    ]);
    expect(conSecciones.esquema.secciones.map((s) => [s.grupoEdad, s.dosis])).toEqual([
      ['MENOR_1', ['D1', 'D2']],
      ['1_A_5', ['D1', 'D2', 'R1']],
    ]);
    expect(conSecciones.esquema.camposAdicionales.map((c) => [c.clave, c.tipo])).toEqual(
      CAMPOS_ADICIONALES.map((c) => [c.clave, c.tipo]),
    );
    // Sin los datos de creación ni de publicación.
    for (const campo of ['creadoPor', 'creadoEn', 'publicadoPor', 'publicadoEn', 'motivoCambio']) {
      expect(conSecciones.esquema).not.toHaveProperty(campo);
    }
    expect(delFormulario(res.body, VACUNA_SIN_SECCIONES).esquema.secciones).toEqual([]);
  });

  it('trae todas las celdas guardadas, de cualquier procedencia, con sus dimensiones, los datos adicionales y el total', async () => {
    const repVac = await reporteVacunaId(reporteId, VACUNA);
    await insertarCelda(repVac, { dosis: 'D1', procedencia: municipioPropio.id, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 78 });
    await insertarCelda(repVac, { dosis: 'D2', procedencia: municipioPropio.id, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 0 });
    await insertarCelda(repVac, {
      dosis: 'R1',
      procedencia: municipioPropio.id,
      dimensiones: { sexo: 'F', grupo_edad: '1_A_5' },
      cantidad: 4,
    });
    await insertarCelda(repVac, { dosis: 'D1', procedencia: 2, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 5 });
    await pool.query('UPDATE reporte_vacuna SET datos_adicionales = ?, total_declarado = 87 WHERE id = ?', [
      JSON.stringify({ frascos_abiertos: 12, extramuros: true }),
      repVac,
    ]);

    const res = await consultar(`/reportes/${reporteId}/formulario`);

    expect(res.status).toBe(200);
    const vacuna = delFormulario(res.body, VACUNA);
    expect(vacuna.celdas).toEqual([
      { dosisCodigo: 'D1', municipioProcedenciaId: municipioPropio.id, dimensiones: { grupo_edad: 'MENOR_1' }, claveCombinacion: 'grupo_edad=MENOR_1', cantidad: 78 },
      { dosisCodigo: 'D1', municipioProcedenciaId: 2, dimensiones: { grupo_edad: 'MENOR_1' }, claveCombinacion: 'grupo_edad=MENOR_1', cantidad: 5 },
      { dosisCodigo: 'D2', municipioProcedenciaId: municipioPropio.id, dimensiones: { grupo_edad: 'MENOR_1' }, claveCombinacion: 'grupo_edad=MENOR_1', cantidad: 0 },
      {
        dosisCodigo: 'R1',
        municipioProcedenciaId: municipioPropio.id,
        dimensiones: { grupo_edad: '1_A_5', sexo: 'F' },
        claveCombinacion: 'grupo_edad=1_A_5|sexo=F',
        cantidad: 4,
      },
    ]);
    expect(vacuna.datosAdicionales).toEqual({ frascos_abiertos: 12, extramuros: true });
    expect(vacuna.totalDeclarado).toBe(87);
    expect(delFormulario(res.body, VACUNA_SIN_SECCIONES).celdas).toEqual([]);
  });

  it('solo es editable en BORRADOR con el mes ABIERTO o EN_CIERRE', async () => {
    const editable = async () => (await consultar(`/reportes/${reporteId}/formulario`)).body.editable;
    try {
      await cambiarMes(1, 'EN_CIERRE');
      expect(await editable()).toBe(true);
      await cambiarMes(1, 'CERRADO');
      expect(await editable()).toBe(false);
      await cambiarMes(1, 'ABIERTO');
      await pool.query("UPDATE reporte_produccion SET estado = 'ENVIADO' WHERE id = ?", [reporteId]);
      expect(await editable()).toBe(false);
    } finally {
      await cambiarMes(1, 'ABIERTO');
      await pool.query("UPDATE reporte_produccion SET estado = 'BORRADOR' WHERE id = ?", [reporteId]);
    }
    expect(await editable()).toBe(true);
  });

  it('otro establecimiento recibe 404, un rol sin REPORTE_CONSULTAR 403 y un reporte inexistente 404', async () => {
    const otro = await tokenDe('u.nombre_usuario', 'cs1202');
    expect((await consultar(`/reportes/${reporteId}/formulario`, otro.token)).status).toBe(404);
    expect((await consultar(`/reportes/${reporteId}/formulario`, revisor.token)).status).toBe(403);
    expect((await consultar('/reportes/999999999/formulario')).status).toBe(404);
    expect((await consultar('/reportes/abc/formulario')).status).toBe(404);
  });
});

const guardar = (reporteId, codigo, cuerpo, credencial = personal.token) =>
  request(app)
    .put(`/api/v1/reportes/${reporteId}/vacunas/${vacunaIds[codigo]}`)
    .set('Authorization', `Bearer ${credencial}`)
    .send(cuerpo);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);

async function filasDeDetalle(repVac) {
  const [filas] = await pool.query(
    `SELECT dp.id, d.codigo AS dosis, dp.municipio_procedencia_id AS procedencia, dp.clave_combinacion AS clave, dp.cantidad,
            (SELECT GROUP_CONCAT(CONCAT(dd.dimension_codigo, '=', dd.valor_codigo) ORDER BY dd.dimension_codigo SEPARATOR '|')
               FROM detalle_dimension dd WHERE dd.detalle_id = dp.id) AS dimensiones
       FROM detalle_produccion dp JOIN dosis d ON d.id = dp.dosis_id
      WHERE dp.reporte_vacuna_id = ? ORDER BY d.orden, dp.clave_combinacion, dp.municipio_procedencia_id`,
    [repVac],
  );
  return filas;
}

async function filasBitacora(repVac) {
  const [filas] = await pool.query(
    `SELECT accion, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'PRODUCCION' AND entidad = 'reporte_vacuna' AND entidad_id = ? ORDER BY id`,
    [String(repVac)],
  );
  return filas.map((f) => ({ accion: f.accion, anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
}

const celda = (dosisCodigo, dimensiones, cantidad) => ({
  dosisCodigo,
  municipioProcedenciaId: municipioPropio.id,
  dimensiones,
  cantidad,
});

describe('PUT /reportes/{id}/vacunas/{vacunaId}: guardar', () => {
  let reporteId;
  let repVac;
  let versionFila = 1;

  beforeAll(async () => {
    reporteId = await crearReporte(2);
    repVac = await reporteVacunaId(reporteId, VACUNA);
  });

  it('guarda las celdas con 78 y con 0 con su detalle_dimension, y una celda omitida no tiene fila', async () => {
    const res = await guardar(reporteId, VACUNA, {
      versionFila,
      celdas: [
        celda('D1', { grupo_edad: 'MENOR_1' }, 78),
        celda('D2', { grupo_edad: 'MENOR_1' }, 0),
        celda('R1', { sexo: 'F', grupo_edad: '1_A_5' }, 4),
      ],
    });

    expect(res.status).toBe(200);
    expect(res.body.versionFila).toBe(2);
    versionFila = res.body.versionFila;
    expect(res.body.vacuna).toMatchObject({ vacunaId: vacunaIds[VACUNA], totalDeclarado: 82, datosAdicionales: null });
    expect(res.body.vacuna.celdas.map((c) => [c.dosisCodigo, c.claveCombinacion, c.cantidad])).toEqual([
      ['D1', 'grupo_edad=MENOR_1', 78],
      ['D2', 'grupo_edad=MENOR_1', 0],
      ['R1', 'grupo_edad=1_A_5|sexo=F', 4],
    ]);
    const filas = await filasDeDetalle(repVac);
    expect(filas.map(({ dosis, procedencia, clave, cantidad, dimensiones }) => ({ dosis, procedencia, clave, cantidad, dimensiones }))).toEqual([
      { dosis: 'D1', procedencia: municipioPropio.id, clave: 'grupo_edad=MENOR_1', cantidad: 78, dimensiones: 'grupo_edad=MENOR_1' },
      { dosis: 'D2', procedencia: municipioPropio.id, clave: 'grupo_edad=MENOR_1', cantidad: 0, dimensiones: 'grupo_edad=MENOR_1' },
      { dosis: 'R1', procedencia: municipioPropio.id, clave: 'grupo_edad=1_A_5|sexo=F', cantidad: 4, dimensiones: 'grupo_edad=1_A_5|sexo=F' },
    ]);
    // D1 de 1 a < 6 años se dejó vacía: no tiene fila.
    expect(filas.some((f) => f.dosis === 'D1' && f.clave === 'grupo_edad=1_A_5')).toBe(false);
    const [[reporte]] = await pool.query('SELECT version_fila FROM reporte_produccion WHERE id = ?', [reporteId]);
    expect(reporte.version_fila).toBe(2);
  });

  it('deja una fila ACTUALIZAR con solo las celdas que cambiaron', async () => {
    const [primera] = await filasBitacora(repVac);
    expect(primera.accion).toBe('ACTUALIZAR');
    expect(primera.anteriores).toEqual({
      [`celda:D1|${municipioPropio.id}|grupo_edad=MENOR_1`]: null,
      [`celda:D2|${municipioPropio.id}|grupo_edad=MENOR_1`]: null,
      [`celda:R1|${municipioPropio.id}|grupo_edad=1_A_5|sexo=F`]: null,
      totalDeclarado: null,
    });
    expect(primera.nuevos).toEqual({
      [`celda:D1|${municipioPropio.id}|grupo_edad=MENOR_1`]: 78,
      [`celda:D2|${municipioPropio.id}|grupo_edad=MENOR_1`]: 0,
      [`celda:R1|${municipioPropio.id}|grupo_edad=1_A_5|sexo=F`]: 4,
      totalDeclarado: 82,
    });
  });

  it('sin la celda de 0 la borra y una cantidad distinta actualiza la misma fila; la de otra procedencia, si viene, se conserva y suma al total, y si no viene se borra', async () => {
    const otra = await insertarCelda(repVac, { dosis: 'D1', procedencia: 2, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 5 });
    const [antes] = await filasDeDetalle(repVac);
    const propias = [celda('D1', { grupo_edad: 'MENOR_1' }, 80), celda('R1', { grupo_edad: '1_A_5', sexo: 'F' }, 4)];

    const res = await guardar(reporteId, VACUNA, {
      versionFila,
      celdas: [...propias, { ...celda('D1', { grupo_edad: 'MENOR_1' }, 5), municipioProcedenciaId: 2 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.versionFila).toBe(versionFila + 1);
    versionFila = res.body.versionFila;
    const filas = await filasDeDetalle(repVac);
    expect(filas.map((f) => [f.dosis, f.procedencia, f.cantidad])).toEqual([
      ['D1', municipioPropio.id, 80],
      ['D1', 2, 5],
      ['R1', municipioPropio.id, 4],
    ]);
    expect(filas.find((f) => f.dosis === 'D1' && f.procedencia === municipioPropio.id).id).toBe(antes.id);
    expect(filas.find((f) => f.procedencia === 2).id).toBe(otra);
    expect(res.body.vacuna.totalDeclarado).toBe(89);
    const [[vacuna]] = await pool.query('SELECT total_declarado FROM reporte_vacuna WHERE id = ?', [repVac]);
    expect(vacuna.total_declarado).toBe(89);
    expect((await filasBitacora(repVac)).at(-1).nuevos).toEqual({
      [`celda:D1|${municipioPropio.id}|grupo_edad=MENOR_1`]: 80,
      [`celda:D2|${municipioPropio.id}|grupo_edad=MENOR_1`]: null,
      totalDeclarado: 89,
    });

    const sinOtra = await guardar(reporteId, VACUNA, { versionFila, celdas: propias });

    expect(sinOtra.status).toBe(200);
    versionFila = sinOtra.body.versionFila;
    expect((await filasDeDetalle(repVac)).map((f) => [f.dosis, f.procedencia, f.cantidad])).toEqual([
      ['D1', municipioPropio.id, 80],
      ['R1', municipioPropio.id, 4],
    ]);
    expect(sinOtra.body.vacuna.totalDeclarado).toBe(84);
  });

  it('guarda en datos_adicionales solo los campos con valor, con las claves ordenadas', async () => {
    const res = await guardar(reporteId, VACUNA, {
      versionFila,
      celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 80), celda('R1', { grupo_edad: '1_A_5', sexo: 'F' }, 4)],
      datosAdicionales: {
        frascos_abiertos: 12,
        temperatura: 4.5,
        observaciones: '  Sin novedad  ',
        extramuros: false,
        estrategia: null,
      },
    });

    expect(res.status).toBe(200);
    versionFila = res.body.versionFila;
    const esperado = { extramuros: false, frascos_abiertos: 12, observaciones: 'Sin novedad', temperatura: 4.5 };
    expect(res.body.vacuna.datosAdicionales).toEqual(esperado);
    const [[vacuna]] = await pool.query('SELECT datos_adicionales FROM reporte_vacuna WHERE id = ?', [repVac]);
    expect(leerJson(vacuna.datos_adicionales)).toEqual(esperado);
    expect((await filasBitacora(repVac)).at(-1).nuevos).toEqual({ datosAdicionales: esperado });
  });

  it('repetir el mismo guardado no escribe nada, no deja fila en la bitácora y no sube versionFila', async () => {
    const filasAntes = (await filasBitacora(repVac)).length;
    const res = await guardar(reporteId, VACUNA, {
      versionFila,
      celdas: [celda('R1', { grupo_edad: '1_A_5', sexo: 'F' }, 4), celda('D1', { grupo_edad: 'MENOR_1' }, 80)],
      datosAdicionales: { temperatura: 4.5, observaciones: 'Sin novedad', frascos_abiertos: 12, extramuros: false },
    });

    expect(res.status).toBe(200);
    expect(res.body.versionFila).toBe(versionFila);
    expect((await filasBitacora(repVac)).length).toBe(filasAntes);
    const [[reporte]] = await pool.query('SELECT version_fila FROM reporte_produccion WHERE id = ?', [reporteId]);
    expect(reporte.version_fila).toBe(versionFila);
  });

  it('un esquema sin secciones acepta las celdas de sus secciones deducidas', async () => {
    const res = await guardar(reporteId, VACUNA_SIN_SECCIONES, {
      versionFila,
      celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 7)],
    });

    expect(res.status).toBe(200);
    versionFila = res.body.versionFila;
    expect(res.body.vacuna.celdas.map((c) => [c.dosisCodigo, c.claveCombinacion, c.cantidad])).toEqual([
      ['D1', 'grupo_edad=MENOR_1', 7],
    ]);
    expect(res.body.vacuna.totalDeclarado).toBe(7);
  });

  it('vaciar todas las celdas deja el total en null', async () => {
    const res = await guardar(reporteId, VACUNA_SIN_SECCIONES, { versionFila, celdas: [] });

    expect(res.status).toBe(200);
    versionFila = res.body.versionFila;
    expect(res.body.vacuna).toMatchObject({ celdas: [], totalDeclarado: null });
  });
});

describe('PUT /reportes/{id}/vacunas/{vacunaId}: errores y dosis inactivas', () => {
  let reporteId;
  let repVac;
  const version = async () => (await pool.query('SELECT version_fila FROM reporte_produccion WHERE id = ?', [reporteId]))[0][0].version_fila;
  const D1 = () => celda('D1', { grupo_edad: 'MENOR_1' }, 3);
  const error = (res) => [res.status, res.body.error?.codigo];

  beforeAll(async () => {
    reporteId = await crearReporte(3);
    repVac = await reporteVacunaId(reporteId, VACUNA);
  });

  it('400 con totalDeclarado, un campo desconocido o una cantidad que no es entero de 0 en adelante', async () => {
    const versionFila = await version();
    const casos = [
      { versionFila, celdas: [], totalDeclarado: 3 },
      { versionFila, celdas: [], extra: true },
      { versionFila, celdas: [{ ...D1(), claveCombinacion: 'grupo_edad=MENOR_1' }] },
      { versionFila, celdas: [{ ...D1(), cantidad: -1 }] },
      { versionFila, celdas: [{ ...D1(), cantidad: 2.5 }] },
      { versionFila, celdas: [{ ...D1(), cantidad: '7' }] },
      { versionFila, celdas: [{ ...D1(), dimensiones: { grupo_edad: 1 } }] },
      { versionFila: '1', celdas: [] },
      { versionFila, celdas: {} },
      { versionFila, celdas: [], datosAdicionales: [] },
    ];
    for (const cuerpo of casos) expect(error(await guardar(reporteId, VACUNA, cuerpo))).toEqual([400, 'ENTRADA_INVALIDA']);
    const campo = await guardar(reporteId, VACUNA, casos[0]);
    expect(campo.body.error.mensaje).toBe('Campo no permitido: totalDeclarado.');
    expect(await filasDeDetalle(repVac)).toEqual([]);
  });

  it('404 con una vacuna que no está en el reporte o un reporte ajeno, y 403 sin REPORTE_EDITAR', async () => {
    const versionFila = await version();
    const otraVacuna = await request(app)
      .put(`/api/v1/reportes/${reporteId}/vacunas/999999`)
      .set('Authorization', `Bearer ${personal.token}`)
      .send({ versionFila, celdas: [] });
    expect(error(otraVacuna)).toEqual([404, 'NO_ENCONTRADO']);
    const otro = await tokenDe('u.nombre_usuario', 'cs1202');
    expect(error(await guardar(reporteId, VACUNA, { versionFila, celdas: [] }, otro.token))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await guardar(reporteId, VACUNA, { versionFila, celdas: [] }, revisor.token))).toEqual([403, 'SIN_PERMISO']);
  });

  it('409 REPORTE_NO_EDITABLE fuera de BORRADOR y PERIODO_CERRADO con el mes cerrado; en EN_CIERRE sí guarda', async () => {
    try {
      await pool.query("UPDATE reporte_produccion SET estado = 'ENVIADO' WHERE id = ?", [reporteId]);
      const noEditable = await guardar(reporteId, VACUNA, { versionFila: await version(), celdas: [D1()] });
      expect(error(noEditable)).toEqual([409, 'REPORTE_NO_EDITABLE']);
      expect(noEditable.body.error.mensaje).toBe('El reporte ya no está en borrador y no se puede editar.');
      await pool.query("UPDATE reporte_produccion SET estado = 'BORRADOR' WHERE id = ?", [reporteId]);

      await cambiarMes(3, 'CERRADO');
      expect(error(await guardar(reporteId, VACUNA, { versionFila: await version(), celdas: [D1()] }))).toEqual([
        409,
        'PERIODO_CERRADO',
      ]);
      await cambiarMes(3, 'EN_CIERRE');
      const enCierre = await guardar(reporteId, VACUNA, { versionFila: await version(), celdas: [D1()] });
      expect(enCierre.status).toBe(200);
    } finally {
      await pool.query("UPDATE reporte_produccion SET estado = 'BORRADOR' WHERE id = ?", [reporteId]);
      await cambiarMes(3, 'ABIERTO');
    }
    expect((await filasDeDetalle(repVac)).map((f) => [f.dosis, f.cantidad])).toEqual([['D1', 3]]);
  });

  it('409 REPORTE_DESACTUALIZADO con una versionFila vieja; dos guardados en paralelo con la misma dan un 200 y un 409', async () => {
    const vieja = (await version()) - 1;
    const desactualizado = await guardar(reporteId, VACUNA, { versionFila: vieja, celdas: [D1()] });
    expect(error(desactualizado)).toEqual([409, 'REPORTE_DESACTUALIZADO']);
    expect(desactualizado.body.error.mensaje).toBe('El reporte cambió desde que lo abrió; recárguelo.');

    const versionFila = await version();
    const respuestas = await Promise.all([
      guardar(reporteId, VACUNA, { versionFila, celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 10)] }),
      guardar(reporteId, VACUNA, { versionFila, celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 20)] }),
    ]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(respuestas.find((r) => r.status === 409).body.error.codigo).toBe('REPORTE_DESACTUALIZADO');
    expect(await version()).toBe(versionFila + 1);
  });

  it('422 CELDA_INVALIDA con una dosis, una combinación o una dimensión que no son del esquema, o de un municipio no permitido', async () => {
    const versionFila = await version();
    const [[coatepeque]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '0920'");
    const casos = [
      [celda('D9', { grupo_edad: 'MENOR_1' }, 1), 'La celda D9 · < 1 año no es parte del formulario.'],
      [celda('R1', { grupo_edad: 'MENOR_1', sexo: 'F' }, 1), 'La celda Dosis R1 · < 1 año · Femenino no es parte del formulario.'],
      [celda('D1', { grupo_edad: 'MENOR_1', sexo: 'F' }, 1), 'La celda Dosis D1 · < 1 año · Femenino no es parte del formulario.'],
      [celda('R1', { grupo_edad: '1_A_5' }, 1), 'La celda Dosis R1 · De 1 a < 6 años no es parte del formulario.'],
      [
        { ...D1(), municipioProcedenciaId: coatepeque.id },
        'La celda Dosis D1 · < 1 año tiene una procedencia que no se puede usar en esta vacuna.',
      ],
    ];
    for (const [celdaPedida, mensaje] of casos) {
      const res = await guardar(reporteId, VACUNA, { versionFila, celdas: [D1(), celdaPedida] });
      expect(error(res)).toEqual([422, 'CELDA_INVALIDA']);
      expect(res.body.error.mensaje).toBe(mensaje);
    }
    expect(await version()).toBe(versionFila);
  });

  it('422 CELDA_REPETIDA con dos celdas de la misma dosis y dimensiones', async () => {
    const res = await guardar(reporteId, VACUNA, {
      versionFila: await version(),
      celdas: [celda('R1', { grupo_edad: '1_A_5', sexo: 'M' }, 1), celda('R1', { sexo: 'M', grupo_edad: '1_A_5' }, 2)],
    });
    expect(error(res)).toEqual([422, 'CELDA_REPETIDA']);
    expect(res.body.error.mensaje).toBe('La celda Dosis R1 · De 1 a < 6 años · Masculino está repetida.');
  });

  it('422 DATO_ADICIONAL_INVALIDO con una clave desconocida, un valor fuera de rango, de otro tipo o fuera de la lista', async () => {
    const versionFila = await version();
    const casos = [
      [{ desconocido: 1 }, 'El dato «desconocido» no es válido.'],
      [{ frascos_abiertos: 101 }, 'El dato «Frascos abiertos» no es válido.'],
      [{ frascos_abiertos: 1.5 }, 'El dato «Frascos abiertos» no es válido.'],
      [{ temperatura: 9 }, 'El dato «Temperatura promedio» no es válido.'],
      [{ observaciones: 'x'.repeat(201) }, 'El dato «Observaciones» no es válido.'],
      [{ extramuros: 'sí' }, 'El dato «¿Hubo jornada extramuros?» no es válido.'],
      [{ estrategia: 'CASA_A_CASA' }, 'El dato «Estrategia» no es válido.'],
    ];
    for (const [datosAdicionales, mensaje] of casos) {
      const res = await guardar(reporteId, VACUNA, { versionFila, celdas: [D1()], datosAdicionales });
      expect(error(res)).toEqual([422, 'DATO_ADICIONAL_INVALIDO']);
      expect(res.body.error.mensaje).toBe(mensaje);
    }
  });

  it('una dosis inactiva sin filas da 422; con filas previas se acepta, y al vaciarla ya no se acepta', async () => {
    const desactivar = (codigo, activa) => pool.query('UPDATE dosis SET activa = ? WHERE id = ?', [activa, dosisIds[VACUNA][codigo]]);
    const D2 = celda('D2', { grupo_edad: 'MENOR_1' }, 6);
    try {
      await desactivar('D2', false);
      const sinFilas = await guardar(reporteId, VACUNA, { versionFila: await version(), celdas: [D1(), D2] });
      expect(error(sinFilas)).toEqual([422, 'CELDA_INVALIDA']);
      expect(sinFilas.body.error.mensaje).toBe('La dosis Dosis D2 está desactivada.');

      await desactivar('D2', true);
      expect((await guardar(reporteId, VACUNA, { versionFila: await version(), celdas: [D1(), D2] })).status).toBe(200);
      await desactivar('D2', false);
      const conFilas = await guardar(reporteId, VACUNA, {
        versionFila: await version(),
        celdas: [D1(), { ...D2, cantidad: 7 }],
      });
      expect(conFilas.status).toBe(200);
      expect(conFilas.body.vacuna.celdas.find((c) => c.dosisCodigo === 'D2').cantidad).toBe(7);

      expect((await guardar(reporteId, VACUNA, { versionFila: await version(), celdas: [D1()] })).status).toBe(200);
      expect((await filasDeDetalle(repVac)).some((f) => f.dosis === 'D2')).toBe(false);
      expect(error(await guardar(reporteId, VACUNA, { versionFila: await version(), celdas: [D1(), D2] }))).toEqual([
        422,
        'CELDA_INVALIDA',
      ]);
    } finally {
      await desactivar('D2', true);
    }
  });
});
