import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { CALCULADORES } from '../src/modulos/indicadores/calculadores.js';
import { RELOJ } from '../src/modulos/revision/rectificaciones.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2008 (abiertos en la DDRISS 1) y la vacuna ZVT_HU33 (D1 y D2, desagregada por sexo, con
// procedencias y el campo total_dosis_declarado) con esquema nacional desde enero de 2008. Cada reporte, de un mes
// propio de CS-1201, lo crea y lo guarda cs1201 por la API; luego el reporte y su mes pasan a CERRADO por SQL y la
// solicitud se pide por la API. Todo se borra al inicio y al final; las filas de la bitácora quedan.
const ANIO = 2008;
// Los 12 meses de 2008 los usan los casos de HU-33; los del SPEC 44 siguen en 2005 (periodoIds 13 a 24 = enero a
// diciembre de 2005), porque cada uno necesita dos meses cerrados seguidos.
const ANIO_INDICADORES = 2005;
const ANIOS = [ANIO, ANIO_INDICADORES];

// Las solicitudes se fechan en junio de ANIO (el reloj avanza con el tiempo real para conservar el orden): así no
// cuentan en el mes real de CS-1201 (SPEC 57) ni otro archivo cuenta las de este.
const relojDePrueba = () => {
  const inicio = Date.now();
  const base = Date.UTC(ANIO, 5, 15, 12);
  return vi.spyOn(RELOJ, 'ahora').mockImplementation(() => new Date(base + (Date.now() - inicio)));
};
let reloj;
const VACUNA = 'ZVT_HU33';
const periodoIds = {};
let vacunaId;
let municipioPropio;
let personal;
let administrador;
let estadigrafa;
let ultimoMes = 0;

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: new Int32(1),
  publicado_en: new Date(),
  motivo_cambio: 'vitest-hu33',
});

const esquema = () => ({
  _id: new ObjectId(),
  vacuna: { id: new Int32(vacunaId), codigo: VACUNA, nombre: `vitest-hu33 ${VACUNA}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date(`${ANIO_INDICADORES}-01-01T00:00:00.000Z`), hasta: null },
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
  campos_adicionales: [
    { clave: 'total_dosis_declarado', etiqueta: 'Total declarado', tipo: 'entero', requerido: false, minimo: new Int32(0), maximo: null },
  ],
});

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  // Aplicar una rectificación calcula los indicadores (SPEC 44): sus corridas no caen con el periodo, y una corrida de
  // otro archivo también calcula ZVT_HU33_COB.
  const corridas = 'SELECT id FROM corrida_calculo WHERE anio IN (?)';
  await pool.query(`DELETE FROM resultado_indicador WHERE corrida_id IN (SELECT id FROM (${corridas}) t)`, [ANIOS]);
  await pool.query('DELETE FROM corrida_calculo WHERE anio IN (?)', [ANIOS]);
  await pool.query('DELETE ri FROM resultado_indicador ri JOIN vacuna v ON v.id = ri.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await (await obtenerDb()).collection('configuracion_indicadores').deleteMany({ codigo: /^ZVT_HU33/ });
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio IN (${ANIOS.join(', ')})`;
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
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio IN (?)', [ANIOS]);
  await pool.query('DELETE FROM periodo WHERE anio IN (?)', [ANIOS]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': VACUNA });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
}

async function preparar() {
  for (const [desfase, anio] of ANIOS.entries()) {
    for (let mes = 1; mes <= 12; mes += 1) {
      const fin = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
      const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
        anio,
        mes,
        `${anio}-${dosDigitos(mes)}-01`,
        `${anio}-${dosDigitos(mes)}-${fin}`,
      ]);
      periodoIds[desfase * 12 + mes] = periodo.insertId;
      await pool.query(
        "INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, ?, 'ABIERTO')",
        [periodo.insertId, '2099-12-31'],
      );
    }
  }
  const [vacuna] = await pool.query("INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, ?, 1, TRUE)", [
    VACUNA,
    `vitest-hu33 ${VACUNA}`,
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
// municipio con la base (la DDRISS no, así que otra DDRISS se simula con ddrissId).
async function tokenDe(condicion, parametros, ddrissId) {
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
      ddrissId: ddrissId ?? cuenta.ddriss_id,
      establecimientoId: cuenta.establecimiento_id,
      municipioId: cuenta.municipio_id,
    },
    { expiresIn: '10m' },
  );
  return { token, id: cuenta.id };
}
const deUsuario = (nombre, ddrissId) => tokenDe('u.nombre_usuario = ?', [nombre], ddrissId);

const api = (metodo, ruta, credencial = estadigrafa) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial.token}`);
const error = (res) => [res.status, res.body.error?.codigo];

const celda = (dosisCodigo, sexo, cantidad) => ({
  dosisCodigo,
  municipioProcedenciaId: municipioPropio,
  dimensiones: { sexo },
  cantidad,
});
const cambio = (dosisCodigo, sexo, cantidadNueva) => ({
  vacunaId,
  dosisCodigo,
  municipioProcedenciaId: municipioPropio,
  dimensiones: { sexo },
  cantidadNueva,
});

const reporteEnBase = async (reporteId) => {
  const [[fila]] = await pool.query(
    'SELECT estado, version_fila, numero_rectificacion, cerrado_en FROM reporte_produccion WHERE id = ?',
    [reporteId],
  );
  return fila;
};

// Las celdas del reporte como { 'D1|F': 10 } y el total_declarado de la vacuna.
const celdasEnBase = async (reporteId) => {
  const [filas] = await pool.query(
    `SELECT d.codigo, dd.valor_codigo, dp.cantidad
       FROM detalle_produccion dp
       JOIN reporte_vacuna rv ON rv.id = dp.reporte_vacuna_id
       JOIN dosis d ON d.id = dp.dosis_id
       LEFT JOIN detalle_dimension dd ON dd.detalle_id = dp.id
      WHERE rv.reporte_id = ?`,
    [reporteId],
  );
  const [[vacuna]] = await pool.query('SELECT total_declarado FROM reporte_vacuna WHERE reporte_id = ?', [reporteId]);
  return {
    celdas: Object.fromEntries(filas.map((f) => [`${f.codigo}|${f.valor_codigo}`, f.cantidad])),
    totalDeclarado: vacuna.total_declarado,
  };
};

const solicitudEnBase = async (id) => {
  const [[fila]] = await pool.query(
    'SELECT estado, resuelto_por, comentario_resolucion, resuelto_en, aplicado_en FROM solicitud_rectificacion WHERE id = ?',
    [id],
  );
  return fila;
};

const bitacoraDe = async (entidad, entidadId, accion) => {
  const [filas] = await pool.query(
    'SELECT usuario_id, modulo, valores_anteriores, valores_nuevos FROM bitacora WHERE entidad = ? AND entidad_id = ? AND accion = ? ORDER BY id',
    [entidad, String(entidadId), accion],
  );
  return filas;
};

// Un reporte de CS-1201 en el mes siguiente, guardado por la API (D1 F = 10, D1 M = 5, total declarado 15), cerrado
// por SQL con su mes y con una solicitud PENDIENTE pedida por el Personal.
async function solicitudPendiente(cambios = [cambio('D1', 'F', 12), cambio('D2', 'M', 3)]) {
  ultimoMes += 1;
  const creado = await api('post', '/reportes', personal).send({ periodoId: periodoIds[ultimoMes] });
  expect(creado.status, JSON.stringify(creado.body)).toBe(201);
  const guardado = await api('put', `/reportes/${creado.body.id}/vacunas/${vacunaId}`, personal).send({
    versionFila: creado.body.versionFila,
    celdas: [celda('D1', 'F', 10), celda('D1', 'M', 5)],
    datosAdicionales: { total_dosis_declarado: 15 },
  });
  expect(guardado.status, JSON.stringify(guardado.body)).toBe(200);
  await pool.query("UPDATE reporte_produccion SET estado = 'CERRADO', cerrado_en = NOW() WHERE id = ?", [creado.body.id]);
  await pool.query(
    "UPDATE cierre_periodo SET estado = 'CERRADO', cerrado_por = ?, cerrado_en = NOW() WHERE periodo_id = ? AND ddriss_id = 1",
    [estadigrafa.id, periodoIds[ultimoMes]],
  );
  return pedirOtra(creado.body.id, cambios);
}

async function pedirOtra(reporteId, cambios) {
  const { version_fila: versionFila } = await reporteEnBase(reporteId);
  const solicitud = await api('post', `/reportes/${reporteId}/rectificaciones`, personal).send({
    motivo: 'vitest-hu33 faltó sumar una jornada.',
    versionFila,
    cambios,
  });
  expect(solicitud.status, JSON.stringify(solicitud.body)).toBe(201);
  return { id: solicitud.body.id, reporteId };
}

const aprobar = (solicitud, cuerpo = {}, credencial = estadigrafa) =>
  api('post', `/rectificaciones/${solicitud.id}/aprobar`, credencial).send(cuerpo);
const rechazar = (solicitud, cuerpo = { comentario: 'vitest-hu33 no hay respaldo.' }, credencial = estadigrafa) =>
  api('post', `/rectificaciones/${solicitud.id}/rechazar`, credencial).send(cuerpo);

beforeAll(async () => {
  reloj = relojDePrueba();
  await limpiar();
  await preparar();
  personal = await deUsuario('cs1201');
  estadigrafa = await deUsuario('estadigrafa');
  administrador = await tokenDe("r.codigo = 'ADMINISTRADOR' AND e.ddriss_id = ?", [1]);
  const [[establecimiento]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
  municipioPropio = establecimiento.municipio_id;
}, 60000);

afterAll(async () => {
  reloj.mockRestore();
  await limpiar();
});

describe('POST /rectificaciones/{id}/aprobar', () => {
  it('aplica una celda existente y una nueva, y deja el reporte CERRADO con la rectificación contada', async () => {
    const solicitud = await solicitudPendiente();
    const antes = await reporteEnBase(solicitud.reporteId);

    const res = await aprobar(solicitud, { comentario: '  vitest-hu33 verificado con el libro.  ' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      id: solicitud.id,
      estado: 'APLICADA',
      resueltoPor: { id: estadigrafa.id },
      comentarioResolucion: 'vitest-hu33 verificado con el libro.',
      reporte: { id: solicitud.reporteId, estado: 'CERRADO' },
    });
    expect(res.body.resueltoEn).not.toBeNull();
    expect(res.body.aplicadoEn).not.toBeNull();
    expect(res.body.totales).toBeUndefined();

    expect(await celdasEnBase(solicitud.reporteId)).toEqual({
      celdas: { 'D1|F': 12, 'D1|M': 5, 'D2|M': 3 },
      totalDeclarado: 20,
    });
    const despues = await reporteEnBase(solicitud.reporteId);
    expect(despues).toMatchObject({ estado: 'CERRADO', numero_rectificacion: 1, version_fila: antes.version_fila + 1 });
    expect(despues.cerrado_en).toEqual(antes.cerrado_en);

    const [historial] = await pool.query(
      'SELECT estado_anterior, estado_nuevo, usuario_id, comentario FROM historial_estado_reporte WHERE reporte_id = ? AND estado_nuevo IN (?) ORDER BY id',
      [solicitud.reporteId, ['RECTIFICACION', 'CERRADO']],
    );
    expect(historial.slice(-2)).toEqual([
      {
        estado_anterior: 'CERRADO',
        estado_nuevo: 'RECTIFICACION',
        usuario_id: estadigrafa.id,
        comentario: `Rectificación 1 autorizada (solicitud ${solicitud.id}). vitest-hu33 verificado con el libro.`,
      },
      {
        estado_anterior: 'RECTIFICACION',
        estado_nuevo: 'CERRADO',
        usuario_id: estadigrafa.id,
        comentario: 'Rectificación 1 aplicada: 2 celdas.',
      },
    ]);

    const [aplicar] = await bitacoraDe('solicitud_rectificacion', solicitud.id, 'APLICAR_RECTIFICACION');
    expect(aplicar).toMatchObject({
      usuario_id: estadigrafa.id,
      modulo: 'RECTIFICACION',
      valores_anteriores: { estado: 'PENDIENTE' },
      valores_nuevos: { estado: 'APLICADA', reporteId: solicitud.reporteId, numeroRectificacion: 1 },
    });
    expect(aplicar.valores_nuevos.cambios).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dosisCodigo: 'D1', claveCombinacion: 'sexo=F', cantidadAnterior: 10, cantidadNueva: 12 }),
        expect.objectContaining({ dosisCodigo: 'D2', claveCombinacion: 'sexo=M', cantidadAnterior: 0, cantidadNueva: 3 }),
      ]),
    );
    expect(aplicar.valores_nuevos.totales).toEqual([{ vacunaId, totalDeclaradoAnterior: 15, totalDeclarado: 20 }]);
    const estados = await bitacoraDe('reporte_produccion', solicitud.reporteId, 'CAMBIO_ESTADO');
    expect(estados.slice(-2).map((f) => [f.valores_anteriores.estado, f.valores_nuevos.estado])).toEqual([
      ['CERRADO', 'RECTIFICACION'],
      ['RECTIFICACION', 'CERRADO'],
    ]);
  }, 60000);

  it('sin comentario deja comentario_resolucion en NULL, y una segunda rectificación del mismo reporte cuenta 2', async () => {
    const primera = await solicitudPendiente([cambio('D1', 'M', 6)]);
    const res = await aprobar(primera, { comentario: '   ' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await solicitudEnBase(primera.id)).comentario_resolucion).toBeNull();

    const segunda = await pedirOtra(primera.reporteId, [cambio('D1', 'M', 7)]);
    expect((await aprobar(segunda)).status).toBe(200);
    expect(await reporteEnBase(primera.reporteId)).toMatchObject({ estado: 'CERRADO', numero_rectificacion: 2 });
    expect((await celdasEnBase(primera.reporteId)).celdas['D1|M']).toBe(7);
  }, 60000);
});

describe('POST /rectificaciones/{id}/rechazar', () => {
  it('con el motivo deja la solicitud RECHAZADA sin tocar las celdas ni el reporte', async () => {
    const solicitud = await solicitudPendiente();
    const reporteAntes = await reporteEnBase(solicitud.reporteId);
    const celdasAntes = await celdasEnBase(solicitud.reporteId);

    const res = await rechazar(solicitud, { comentario: '  vitest-hu33 el libro no muestra esas dosis.  ' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toMatchObject({
      estado: 'RECHAZADA',
      resueltoPor: { id: estadigrafa.id },
      comentarioResolucion: 'vitest-hu33 el libro no muestra esas dosis.',
      aplicadoEn: null,
    });
    expect(await reporteEnBase(solicitud.reporteId)).toEqual(reporteAntes);
    expect(await celdasEnBase(solicitud.reporteId)).toEqual(celdasAntes);
    const [fila] = await bitacoraDe('solicitud_rectificacion', solicitud.id, 'RECHAZAR_RECTIFICACION');
    expect(fila).toMatchObject({
      usuario_id: estadigrafa.id,
      modulo: 'RECTIFICACION',
      valores_anteriores: { estado: 'PENDIENTE' },
      valores_nuevos: { estado: 'RECHAZADA', comentario: 'vitest-hu33 el libro no muestra esas dosis.' },
    });
  });

  it('sin motivo, con un motivo largo o con un campo desconocido responde 400 y la solicitud sigue PENDIENTE', async () => {
    const solicitud = await solicitudPendiente();
    expect(error(await rechazar(solicitud, {}))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await rechazar(solicitud, { comentario: '   ' }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await rechazar(solicitud, { comentario: 'x'.repeat(501) }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await rechazar(solicitud, { comentario: 'ok', motivo: 'x' }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect(error(await aprobar(solicitud, { comentario: 'x'.repeat(501) }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect((await solicitudEnBase(solicitud.id)).estado).toBe('PENDIENTE');
  });
});

describe('Casos que no se resuelven', () => {
  it('una solicitud ya resuelta responde 409 RECTIFICACION_RESUELTA al aprobar y al rechazar', async () => {
    const solicitud = await solicitudPendiente();
    expect((await rechazar(solicitud)).status).toBe(200);
    expect(error(await aprobar(solicitud))).toEqual([409, 'RECTIFICACION_RESUELTA']);
    expect(error(await rechazar(solicitud))).toEqual([409, 'RECTIFICACION_RESUELTA']);
  });

  it('si una celda ya no tiene la cantidad anterior responde 409 y no cambia nada', async () => {
    const solicitud = await solicitudPendiente();
    await pool.query(
      `UPDATE detalle_produccion dp JOIN reporte_vacuna rv ON rv.id = dp.reporte_vacuna_id
          SET dp.cantidad = 11
        WHERE rv.reporte_id = ? AND dp.clave_combinacion = 'sexo=F'`,
      [solicitud.reporteId],
    );
    const reporteAntes = await reporteEnBase(solicitud.reporteId);
    const celdasAntes = await celdasEnBase(solicitud.reporteId);

    expect(error(await aprobar(solicitud))).toEqual([409, 'RECTIFICACION_DESACTUALIZADA']);
    expect(await reporteEnBase(solicitud.reporteId)).toEqual(reporteAntes);
    expect(await celdasEnBase(solicitud.reporteId)).toEqual(celdasAntes);
    expect((await solicitudEnBase(solicitud.id)).estado).toBe('PENDIENTE');
    expect(await bitacoraDe('solicitud_rectificacion', solicitud.id, 'APLICAR_RECTIFICACION')).toEqual([]);
    const [historial] = await pool.query(
      "SELECT id FROM historial_estado_reporte WHERE reporte_id = ? AND estado_nuevo = 'RECTIFICACION'",
      [solicitud.reporteId],
    );
    expect(historial).toEqual([]);
  });

  it('aprobar con el reporte fuera de CERRADO responde 409 REPORTE_NO_CERRADO', async () => {
    const solicitud = await solicitudPendiente();
    await pool.query("UPDATE reporte_produccion SET estado = 'APROBADO' WHERE id = ?", [solicitud.reporteId]);
    expect(error(await aprobar(solicitud))).toEqual([409, 'REPORTE_NO_CERRADO']);
    expect((await solicitudEnBase(solicitud.id)).estado).toBe('PENDIENTE');
  });

  it('una solicitud sin detalle no se aprueba (422) pero sí se rechaza', async () => {
    const solicitud = await solicitudPendiente();
    await pool.query('DELETE FROM rectificacion_detalle WHERE solicitud_id = ?', [solicitud.id]);
    expect(error(await aprobar(solicitud))).toEqual([422, 'RECTIFICACION_SIN_CAMBIOS']);
    expect((await rechazar(solicitud)).status).toBe(200);
  });

  it('sin RECTIFICACION_RESOLVER responde 403, y fuera del ámbito o inexistente, 404', async () => {
    const solicitud = await solicitudPendiente();
    expect(error(await aprobar(solicitud, {}, personal))).toEqual([403, 'SIN_PERMISO']);
    expect(error(await rechazar(solicitud, undefined, administrador))).toEqual([403, 'SIN_PERMISO']);
    const deOtraDdriss = await deUsuario('estadigrafa', 999);
    expect(error(await aprobar(solicitud, {}, deOtraDdriss))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await rechazar(solicitud, undefined, deOtraDdriss))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await aprobar({ id: 999999999 }))).toEqual([404, 'NO_ENCONTRADO']);
    expect(error(await aprobar({ id: 'abc' }))).toEqual([400, 'ENTRADA_INVALIDA']);
    expect((await solicitudEnBase(solicitud.id)).estado).toBe('PENDIENTE');
  }, 60000);
});

describe('GET /rectificaciones para el revisor', () => {
  it('el detalle de una PENDIENTE trae totales si el total declarado deja de cuadrar, y una resuelta no', async () => {
    const descuadra = await solicitudPendiente([cambio('D1', 'F', 12)]);
    const res = await api('get', `/rectificaciones/${descuadra.id}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.totales).toEqual([
      { vacunaId, vacuna: `vitest-hu33 ${VACUNA}`, totalDeclarado: 15, sumaActual: 15, sumaConCambios: 17 },
    ]);

    // Mover dos dosis de una celda a otra no cambia la suma.
    const cuadra = await solicitudPendiente([cambio('D1', 'F', 8), cambio('D1', 'M', 7)]);
    expect((await api('get', `/rectificaciones/${cuadra.id}`)).body.totales).toEqual([]);

    expect((await rechazar(descuadra)).status).toBe(200);
    expect((await api('get', `/rectificaciones/${descuadra.id}`)).body.totales).toBeUndefined();
  }, 60000);

  it('la lista del revisor trae las solicitudes de su DDRISS', async () => {
    const solicitud = await solicitudPendiente();
    const res = await api('get', '/rectificaciones?estado=PENDIENTE&porPagina=100');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.elementos.map((e) => e.id)).toContain(solicitud.id);
  });
});

describe('indicadores al aplicar (SPEC 44)', () => {
  const COB = 'ZVT_HU33_COB';

  beforeAll(async () => {
    ultimoMes = 12;
    const fecha = new Date();
    await (await obtenerDb()).collection('configuracion_indicadores').insertOne({
      codigo: COB,
      version: new Int32(1),
      nombre: `vitest-hu33 ${COB}`,
      tipo_calculo: 'COBERTURA',
      aplica_a: [{ vacuna: VACUNA, dosis: 'D1', clasificacion_poblacion: 'MENOR_1' }],
      numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
      denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'NINGUNO' },
      meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>', homogeneidad_municipal: true },
      umbrales: [],
      niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
      periodicidad: 'MENSUAL',
      alerta: { generar: false },
      es_estimacion: false,
      territorio: { nivel: 'DDRISS', ddriss_codigo: 'DDRISS_SM' },
      estado: 'VIGENTE',
      vigencia: { desde: fecha, hasta: null },
      auditoria: { ...auditoria(), creado_en: fecha, publicado_en: fecha },
    });
  });

  // Las dosis acumuladas de D1 del municipio propio en la corrida.
  const numeradorEn = async (corridaId) => {
    const res = await api('get', `/indicadores/corridas/${corridaId}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.resultados.find((r) => r.indicadorCodigo === COB && r.municipio?.id === municipioPropio).numerador;
  };

  // Una solicitud de un mes nuevo y el mes siguiente también cerrado (sin reportes), para que haya dos meses que recalcular.
  async function conMesSiguienteCerrado(cambios) {
    const solicitud = await solicitudPendiente(cambios);
    ultimoMes += 1;
    await pool.query(
      "UPDATE cierre_periodo SET estado = 'CERRADO', cerrado_por = ?, cerrado_en = NOW() WHERE periodo_id = ? AND ddriss_id = 1",
      [estadigrafa.id, periodoIds[ultimoMes]],
    );
    return { solicitud, mes: ultimoMes - 1 - 12 };
  }

  it('recalcula el mes del reporte y cada mes cerrado siguiente, y el acumulado del siguiente cambia', async () => {
    const { solicitud, mes } = await conMesSiguienteCerrado([cambio('D1', 'F', 12)]);
    const antes = await api('post', '/indicadores/corridas').send({ anio: ANIO_INDICADORES, mesHasta: mes + 1 });
    expect(antes.status, JSON.stringify(antes.body)).toBe(201);

    const res = await aprobar(solicitud);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.corridas.map((c) => [c.mesHasta, c.estado])).toEqual([
      [mes, 'COMPLETADA'],
      [mes + 1, 'COMPLETADA'],
    ]);
    const [corridas] = await pool.query('SELECT motivo, disparada_por, vigente FROM corrida_calculo WHERE id IN (?)', [
      res.body.corridas.map((c) => c.id),
    ]);
    expect(corridas.every((c) => c.motivo === 'RECTIFICACION' && c.disparada_por === estadigrafa.id && c.vigente === 1)).toBe(
      true,
    );
    const anterior = await numeradorEn(antes.body.id);
    expect(await numeradorEn(res.body.corridas[1].id)).toBe(anterior + 2);
  }, 120000);

  it('si el cálculo falla, la rectificación sigue aplicada y las corridas quedan FALLIDA', async () => {
    const { solicitud, mes } = await conMesSiguienteCerrado([cambio('D1', 'M', 9)]);
    const espia = vi.spyOn(CALCULADORES, 'COBERTURA').mockImplementation(() => {
      throw new Error('vitest-hu36 fallo');
    });
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    let res;
    try {
      res = await aprobar(solicitud);
    } finally {
      espia.mockRestore();
      silencio.mockRestore();
    }
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.estado).toBe('APLICADA');
    expect(res.body.corridas.map((c) => [c.mesHasta, c.estado])).toEqual([
      [mes, 'FALLIDA'],
      [mes + 1, 'FALLIDA'],
    ]);
    expect((await celdasEnBase(solicitud.reporteId)).celdas['D1|M']).toBe(9);
  }, 120000);
});
