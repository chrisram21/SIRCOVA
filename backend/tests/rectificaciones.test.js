import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { RELOJ } from '../src/modulos/revision/rectificaciones.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2009 (abiertos en la DDRISS 1) y la vacuna ZVT_HU32 (D1 y D2, desagregada por sexo,
// con procedencias) con esquema nacional desde enero de 2009. Cada reporte, de un mes propio de CS-1201, lo crea y lo
// guarda cs1201 por la API, y luego el reporte y su mes pasan a CERRADO por SQL. Todo se borra al inicio y al final;
// las filas de la bitácora quedan.
const ANIO = 2009;

// Las solicitudes se fechan en junio de ANIO (el reloj avanza con el tiempo real para conservar el orden): así no
// cuentan en el mes real de CS-1201 (SPEC 57) ni otro archivo cuenta las de este.
const relojDePrueba = () => {
  const inicio = Date.now();
  const base = Date.UTC(ANIO, 5, 15, 12);
  return vi.spyOn(RELOJ, 'ahora').mockImplementation(() => new Date(base + (Date.now() - inicio)));
};
let reloj;
const VACUNA = 'ZVT_HU32';
const periodoIds = {};
let vacunaId;
let municipioPropio;
let personal;
let otroPersonal;
let administrador;
let estadigrafa;
let epidemiologia;
let ultimoMes = 0;
// Las que crean las pruebas del POST; las de GET las consultan.
let solicitudPersonal;
let solicitudAdmin;

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: new Int32(1),
  publicado_en: new Date(),
  motivo_cambio: 'vitest-hu32',
});

const esquema = () => ({
  _id: new ObjectId(),
  vacuna: { id: new Int32(vacunaId), codigo: VACUNA, nombre: `vitest-hu32 ${VACUNA}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO}-01-01T00:00:00.000Z`), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  reglas: [],
  presentacion: { filas: 'dosis', columnas: ['sexo'] },
  auditoria: auditoria(),
  incluir_por_defecto: true,
  dimensiones: {
    dosis: [
      { codigo: 'D1', etiqueta: '1.ª dosis' },
      { codigo: 'D2', etiqueta: '2.ª dosis' },
    ],
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
    desagregacion: [{ dimension: 'sexo', valores: ['M', 'F'] }],
  },
  secciones: [{ codigo: 'TODAS', titulo: 'Todas', orden: new Int32(1), grupo_edad: null, dosis: ['D1', 'D2'] }],
  campos_adicionales: [],
});

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  // Ni las solicitudes, ni su detalle, ni el historial caen en cascada con el reporte.
  await pool.query(
    `DELETE rd FROM rectificacion_detalle rd JOIN solicitud_rectificacion s ON s.id = rd.solicitud_id
      WHERE s.reporte_id IN (SELECT id FROM (${reportes}) t)`,
  );
  await pool.query(`DELETE FROM solicitud_rectificacion WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  // Desde el SPEC 57, la 5.ª solicitud del mes crea una alerta que apunta a su reporte.
  await pool.query(`DELETE FROM alerta WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM resultado_validacion WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': VACUNA });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
}

async function preparar() {
  for (let mes = 1; mes <= 12; mes += 1) {
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
      [periodo.insertId, '2099-12-31'],
    );
  }
  const [vacuna] = await pool.query("INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, ?, 1, TRUE)", [
    VACUNA,
    `vitest-hu32 ${VACUNA}`,
  ]);
  vacunaId = vacuna.insertId;
  await pool.query(
    "INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, 'D1', '1.ª dosis', 1, TRUE), (?, 'D2', '2.ª dosis', 2, TRUE)",
    [vacunaId, vacunaId],
  );
  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertOne(esquema());
}

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function tokenDe(condicion, parametros) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE ${condicion} AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
    parametros,
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa (${parametros.join(', ')}) en la base de prueba`);
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
  return { token, id: cuenta.id };
}
const deUsuario = (nombre) => tokenDe('u.nombre_usuario = ?', [nombre]);

const api = (metodo, ruta, credencial = personal) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial.token}`);
const error = (res) => [res.status, res.body.error?.codigo];

const celda = (dosisCodigo, sexo, cantidad, procedencia = municipioPropio) => ({
  dosisCodigo,
  municipioProcedenciaId: procedencia,
  dimensiones: { sexo },
  cantidad,
});
const cambio = (dosisCodigo, sexo, cantidadNueva, procedencia = municipioPropio) => ({
  vacunaId,
  dosisCodigo,
  municipioProcedenciaId: procedencia,
  dimensiones: { sexo },
  cantidadNueva,
});

const versionEnBase = async (reporteId) => {
  const [[fila]] = await pool.query('SELECT estado, version_fila FROM reporte_produccion WHERE id = ?', [reporteId]);
  return fila;
};

// Un reporte de CS-1201 en el mes siguiente, guardado por la API (D1 F = 10, D1 M = 5) y luego cerrado por SQL con su
// mes, salvo que se pida otro estado.
async function reporteCerrado(estado = 'CERRADO') {
  ultimoMes += 1;
  const creado = await api('post', '/reportes').send({ periodoId: periodoIds[ultimoMes] });
  expect(creado.status, JSON.stringify(creado.body)).toBe(201);
  const guardado = await api('put', `/reportes/${creado.body.id}/vacunas/${vacunaId}`).send({
    versionFila: creado.body.versionFila,
    celdas: [celda('D1', 'F', 10), celda('D1', 'M', 5)],
  });
  expect(guardado.status, JSON.stringify(guardado.body)).toBe(200);
  if (estado !== 'BORRADOR') {
    await pool.query("UPDATE reporte_produccion SET estado = ?, cerrado_en = IF(? = 'CERRADO', NOW(), NULL) WHERE id = ?", [
      estado,
      estado,
      creado.body.id,
    ]);
    if (estado === 'CERRADO') {
      await pool.query(
        "UPDATE cierre_periodo SET estado = 'CERRADO', cerrado_por = ?, cerrado_en = NOW() WHERE periodo_id = ? AND ddriss_id = 1",
        [estadigrafa.id, periodoIds[ultimoMes]],
      );
    }
  }
  return { id: creado.body.id, versionFila: (await versionEnBase(creado.body.id)).version_fila };
}

const solicitar = (reporte, cuerpo = {}, credencial = personal) =>
  api('post', `/reportes/${reporte.id}/rectificaciones`, credencial).send({
    motivo: 'vitest-hu32 faltó sumar una jornada.',
    versionFila: reporte.versionFila,
    cambios: [cambio('D1', 'F', 12)],
    ...cuerpo,
  });

const solicitudesDe = async (reporteId) => {
  const [filas] = await pool.query('SELECT id FROM solicitud_rectificacion WHERE reporte_id = ?', [reporteId]);
  return filas.length;
};

beforeAll(async () => {
  reloj = relojDePrueba();
  await limpiar();
  await preparar();
  personal = await deUsuario('cs1201');
  otroPersonal = await deUsuario('cs1202');
  estadigrafa = await deUsuario('estadigrafa');
  epidemiologia = await tokenDe("r.codigo = 'EPIDEMIOLOGIA' AND e.ddriss_id = ?", [1]);
  administrador = await tokenDe("r.codigo = 'ADMINISTRADOR' AND e.ddriss_id = ?", [1]);
  const [[establecimiento]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
  municipioPropio = establecimiento.municipio_id;
}, 60000);

afterAll(async () => {
  reloj.mockRestore();
  await limpiar();
});

describe('POST /reportes/{id}/rectificaciones', () => {
  it('el Personal pide con una celda existente y una nueva: la solicitud queda PENDIENTE y el reporte no cambia', async () => {
    const reporte = await reporteCerrado();
    const res = await solicitar(reporte, {
      motivo: '  vitest-hu32 faltó sumar la jornada del 28.  ',
      cambios: [cambio('D2', 'M', 3), cambio('D1', 'F', 12)],
    });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    solicitudPersonal = res.body;
    expect(res.body).toMatchObject({
      reporte: { id: reporte.id, estado: 'CERRADO', periodo: { anio: ANIO, mes: ultimoMes } },
      estado: 'PENDIENTE',
      motivo: 'vitest-hu32 faltó sumar la jornada del 28.',
      solicitadoPor: { id: personal.id },
      resueltoPor: null,
      comentarioResolucion: null,
      resueltoEn: null,
      aplicadoEn: null,
    });
    expect(res.body.cambios.map((c) => [c.dosis.codigo, c.claveCombinacion, c.celdaNueva, c.cantidadAnterior, c.cantidadNueva])).toEqual([
      ['D1', 'sexo=F', false, 10, 12],
      ['D2', 'sexo=M', true, 0, 3],
    ]);
    expect(res.body.cambios[0].vacuna).toEqual({ id: vacunaId, codigo: VACUNA, nombre: `vitest-hu32 ${VACUNA}` });
    expect(res.body.cambios[0].municipioProcedencia.id).toBe(municipioPropio);
    expect(res.body.cambios[0].dimensiones).toEqual([
      { codigo: 'sexo', nombre: expect.any(String), valor: 'F', etiqueta: expect.any(String) },
    ]);

    const [[solicitud]] = await pool.query(
      'SELECT reporte_id, solicitado_por, estado, evidencia_ruta, resuelto_por FROM solicitud_rectificacion WHERE id = ?',
      [res.body.id],
    );
    expect(solicitud).toEqual({
      reporte_id: reporte.id,
      solicitado_por: personal.id,
      estado: 'PENDIENTE',
      evidencia_ruta: null,
      resuelto_por: null,
    });
    const [detalle] = await pool.query(
      `SELECT rd.detalle_id, rd.clave_combinacion, rd.cantidad_anterior, rd.cantidad_nueva, dp.cantidad AS actual
         FROM rectificacion_detalle rd LEFT JOIN detalle_produccion dp ON dp.id = rd.detalle_id
        WHERE rd.solicitud_id = ? ORDER BY rd.cantidad_nueva`,
      [res.body.id],
    );
    expect(detalle).toEqual([
      { detalle_id: null, clave_combinacion: 'sexo=M', cantidad_anterior: 0, cantidad_nueva: 3, actual: null },
      { detalle_id: expect.any(Number), clave_combinacion: 'sexo=F', cantidad_anterior: 10, cantidad_nueva: 12, actual: 10 },
    ]);
    const [[bitacora]] = await pool.query(
      `SELECT usuario_id, valores_anteriores, valores_nuevos FROM bitacora
        WHERE modulo = 'RECTIFICACION' AND accion = 'CREAR' AND entidad = 'solicitud_rectificacion' AND entidad_id = ?`,
      [String(res.body.id)],
    );
    expect(bitacora.usuario_id).toBe(personal.id);
    expect(bitacora.valores_anteriores).toBeNull();
    expect(bitacora.valores_nuevos).toMatchObject({ reporteId: reporte.id, estado: 'PENDIENTE' });
    expect(bitacora.valores_nuevos.cambios).toHaveLength(2);
    expect(bitacora.valores_nuevos.cambios).toContainEqual({
      vacunaId,
      dosisCodigo: 'D1',
      municipioProcedenciaId: municipioPropio,
      claveCombinacion: 'sexo=F',
      cantidadAnterior: 10,
      cantidadNueva: 12,
    });
    expect(await versionEnBase(reporte.id)).toEqual({ estado: 'CERRADO', version_fila: reporte.versionFila });

    const otra = await solicitar(reporte);
    expect(error(otra)).toEqual([409, 'RECTIFICACION_PENDIENTE']);
    expect(otra.body.solicitudId).toBe(res.body.id);
    expect(await solicitudesDe(reporte.id)).toBe(1);
  }, 120000);

  it('el administrador pide la de un reporte de su DDRISS', async () => {
    const reporte = await reporteCerrado();
    const res = await solicitar(reporte, { cambios: [cambio('D1', 'M', 0)] }, administrador);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.solicitadoPor.id).toBe(administrador.id);
    solicitudAdmin = res.body;
    expect(res.body.cambios.map((c) => [c.cantidadAnterior, c.cantidadNueva])).toEqual([[5, 0]]);
  }, 120000);

  it('solo un reporte CERRADO, con la versión vigente, del ámbito y con el permiso', async () => {
    const borrador = await reporteCerrado('BORRADOR');
    expect(error(await solicitar(borrador))).toEqual([409, 'REPORTE_NO_CERRADO']);
    const aprobado = await reporteCerrado('APROBADO');
    expect(error(await solicitar(aprobado))).toEqual([409, 'REPORTE_NO_CERRADO']);

    const reporte = await reporteCerrado();
    expect(error(await solicitar(reporte, { versionFila: reporte.versionFila + 1 }))).toEqual([409, 'REPORTE_DESACTUALIZADO']);
    expect(error(await solicitar(reporte, {}, otroPersonal))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await solicitar(reporte, {}, estadigrafa))).toEqual([403, 'SIN_PERMISO']);
    expect(error(await solicitar({ ...reporte, id: 999999999 }))).toEqual([404, 'NO_ENCONTRADO']);
    for (const id of [borrador.id, aprobado.id, reporte.id]) expect(await solicitudesDe(id)).toBe(0);
  }, 120000);

  it('responde 400 con un cuerpo inválido y 422 con una celda inválida o sin diferencia, sin dejar nada', async () => {
    const reporte = await reporteCerrado();
    // Solo este archivo crea solicitudes, y las pruebas de un archivo corren una tras otra.
    const [[{ bitacoraAntes }]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS bitacoraAntes FROM bitacora');
    const casos400 = [
      { motivo: '   ' },
      { motivo: undefined },
      { motivo: 'x'.repeat(1001) },
      { cambios: [] },
      { cambios: [cambio('D1', 'F', 12), cambio('D1', 'F', 13)] },
      { cambios: [{ ...cambio('D1', 'F', 12), cantidad: 12 }] },
      { cambios: [cambio('D1', 'F', -1)] },
      { evidencia: 'oficio.pdf' },
      { versionFila: 0 },
    ];
    for (const cuerpo of casos400) {
      expect(error(await solicitar(reporte, cuerpo)), JSON.stringify(cuerpo)).toEqual([400, 'ENTRADA_INVALIDA']);
    }
    expect(error(await solicitar({ ...reporte, id: 'abc' }))).toEqual([400, 'ENTRADA_INVALIDA']);

    const casos422 = [
      [[cambio('R9', 'F', 1)], 'CELDA_INVALIDA'],
      [[cambio('D1', 'X', 1)], 'CELDA_INVALIDA'],
      [[{ ...cambio('D1', 'F', 1), vacunaId: vacunaId + 100000 }], 'CELDA_INVALIDA'],
      [[cambio('D1', 'F', 1, 999999)], 'CELDA_INVALIDA'],
      [[cambio('D1', 'F', 10)], 'CAMBIO_SIN_DIFERENCIA'],
      [[cambio('D2', 'F', 0)], 'CAMBIO_SIN_DIFERENCIA'],
      [[cambio('D1', 'M', 6), cambio('D1', 'F', 10)], 'CAMBIO_SIN_DIFERENCIA'],
    ];
    for (const [cambios, codigo] of casos422) {
      expect(error(await solicitar(reporte, { cambios })), JSON.stringify(cambios)).toEqual([422, codigo]);
    }

    expect(await solicitudesDe(reporte.id)).toBe(0);
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM bitacora WHERE entidad = 'solicitud_rectificacion' AND id > ?",
      [bitacoraAntes],
    );
    expect(total).toBe(0);
    expect(await versionEnBase(reporte.id)).toEqual({ estado: 'CERRADO', version_fila: reporte.versionFila });
  }, 120000);
});

describe('GET /rectificaciones y GET /rectificaciones/{id}', () => {
  const consultar = (ruta, credencial = personal) => api('get', ruta, credencial);
  const ids = (res) => res.body.elementos.map((e) => e.id);

  it('la lista es del ámbito: el Personal ve las de su establecimiento y el administrador las de su DDRISS', async () => {
    const [[{ establecimiento }]] = await pool.query("SELECT id AS establecimiento FROM establecimiento WHERE codigo = 'CS-1201'");
    const propia = await consultar('/rectificaciones?porPagina=100');
    expect(propia.status, JSON.stringify(propia.body)).toBe(200);
    expect(ids(propia)).toEqual(expect.arrayContaining([solicitudPersonal.id, solicitudAdmin.id]));
    expect(propia.body.elementos.every((e) => e.reporte.establecimiento.id === establecimiento)).toBe(true);
    expect(propia.body.elementos.find((e) => e.id === solicitudPersonal.id)).toEqual({
      id: solicitudPersonal.id,
      reporte: solicitudPersonal.reporte,
      estado: 'PENDIENTE',
      motivo: solicitudPersonal.motivo,
      solicitadoPor: solicitudPersonal.solicitadoPor,
      solicitadoEn: solicitudPersonal.solicitadoEn,
      cambios: 2,
    });

    const otra = await consultar('/rectificaciones?porPagina=100', otroPersonal);
    expect(otra.status).toBe(200);
    expect(ids(otra)).not.toContain(solicitudPersonal.id);

    const ddriss = await consultar('/rectificaciones?porPagina=100', administrador);
    expect(ddriss.status).toBe(200);
    expect(ids(ddriss)).toEqual(expect.arrayContaining([solicitudPersonal.id, solicitudAdmin.id]));
    // Ordenadas de la más reciente a la más antigua.
    expect(ids(ddriss).indexOf(solicitudAdmin.id)).toBeLessThan(ids(ddriss).indexOf(solicitudPersonal.id));
  }, 60000);

  it('filtra por estado, pagina y rechaza un parámetro inválido o desconocido', async () => {
    const pendientes = await consultar('/rectificaciones?estado=PENDIENTE&porPagina=100');
    expect(pendientes.body.elementos.every((e) => e.estado === 'PENDIENTE')).toBe(true);
    expect(ids(pendientes)).toContain(solicitudPersonal.id);
    expect(ids(await consultar('/rectificaciones?estado=APLICADA&porPagina=100'))).not.toContain(solicitudPersonal.id);

    const primera = await consultar('/rectificaciones?porPagina=1');
    expect(primera.body).toMatchObject({ pagina: 1, porPagina: 1 });
    expect(primera.body.elementos).toHaveLength(1);
    expect(primera.body.total).toBeGreaterThanOrEqual(2);
    const fuera = await consultar('/rectificaciones?pagina=9999');
    expect(fuera.status).toBe(200);
    expect(fuera.body.elementos).toEqual([]);
    expect(fuera.body.total).toBe(primera.body.total);

    for (const consulta of ['estado=ABIERTA', 'reporteId=1', 'porPagina=101', 'pagina=0', 'estado=PENDIENTE&estado=APLICADA']) {
      expect(error(await consultar(`/rectificaciones?${consulta}`)), consulta).toEqual([400, 'ENTRADA_INVALIDA']);
    }
    // Desde el SPEC 41 el Revisor también consulta (RECTIFICACION_CONSULTAR); Epidemiología no.
    expect(error(await consultar('/rectificaciones', epidemiologia))).toEqual([403, 'SIN_PERMISO']);
  }, 60000);

  it('el detalle trae los cambios del ámbito del usuario', async () => {
    const propia = await consultar(`/rectificaciones/${solicitudPersonal.id}`);
    expect(propia.status, JSON.stringify(propia.body)).toBe(200);
    // Todas las solicitudes de CS-1201 de este archivo caen en junio de ANIO: el conteo incluye las posteriores.
    const [[{ cantidad }]] = await pool.query(
      `SELECT COUNT(*) AS cantidad FROM solicitud_rectificacion s
         JOIN reporte_produccion r ON r.id = s.reporte_id
         JOIN periodo p ON p.id = r.periodo_id
         JOIN establecimiento e ON e.id = r.establecimiento_id
        WHERE p.anio = ? AND e.codigo = 'CS-1201'`,
      [ANIO],
    );
    const esperada = {
      ...solicitudPersonal,
      solicitudesDelMes: { anio: ANIO, mes: 6, cantidad: Number(cantidad), umbral: 5 },
    };
    expect(propia.body).toEqual(esperada);
    expect((await consultar(`/rectificaciones/${solicitudPersonal.id}`, administrador)).body).toEqual(esperada);

    expect(error(await consultar(`/rectificaciones/${solicitudPersonal.id}`, otroPersonal))).toEqual([404, 'NO_ENCONTRADO']);
    expect((await consultar(`/rectificaciones/${solicitudPersonal.id}`, estadigrafa)).status).toBe(200);
    expect(error(await consultar(`/rectificaciones/${solicitudPersonal.id}`, epidemiologia))).toEqual([403, 'SIN_PERMISO']);
    expect(error(await consultar('/rectificaciones/999999999'))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await consultar('/rectificaciones/abc'))).toEqual([400, 'ENTRADA_INVALIDA']);
  }, 60000);

  it('el administrador lee los reportes cerrados de su DDRISS y su formulario', async () => {
    const reporteId = solicitudPersonal.reporte.id;
    const lista = await consultar(`/reportes?estado=CERRADO&anio=${ANIO}&porPagina=100`, administrador);
    expect(lista.status, JSON.stringify(lista.body)).toBe(200);
    expect(lista.body.elementos.map((e) => e.id)).toContain(reporteId);
    const formulario = await consultar(`/reportes/${reporteId}/formulario`, administrador);
    expect(formulario.status, JSON.stringify(formulario.body)).toBe(200);
    expect(formulario.body.editable).toBe(false);
    expect(formulario.body.vacunas[0].celdas.map((c) => [c.dosisCodigo, c.claveCombinacion, c.cantidad])).toEqual(
      expect.arrayContaining([
        ['D1', 'sexo=F', 10],
        ['D1', 'sexo=M', 5],
      ]),
    );
  }, 60000);
});
