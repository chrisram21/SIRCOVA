import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// SPEC 31. Las pruebas crean por SQL las vacunas ZVT_HU31A, ZVT_HU31B, ZVT_HU31C (activas) y ZVT_HU31I (inactiva),
// y en MongoDB sus esquemas, todos con vigencias de 2025, el año que no usa ninguna otra prueba. También crean los
// meses de 2025 en periodo, con su estado en la DDRISS 1, y los reportes de ese año. Todo se borra al inicio y al
// final; las filas de la bitácora quedan. Los reportes los crea cs1201 (CS-1201), una cuenta de la semilla: la
// prueba firma su token sin iniciar sesión. Los esquemas de la semilla empiezan en 2026, así que en 2025 solo
// aplican los de prueba.
//
// Qué esquema cubre cada mes (incluir_por_defecto entre paréntesis):
//   enero:   A v1 (true), B v1 (false), C v2 de la DDRISS (false) sobre C v1 nacional (true), I v1 (true, inactiva)
//   febrero: A v2 (false), B v1 (false), C v2 de la DDRISS (false), I v1: ninguna activa marcada
//   marzo:   ninguna vacuna activa tiene esquema
const A = 'ZVT_HU31A';
const B = 'ZVT_HU31B';
const C = 'ZVT_HU31C';
const INACTIVA = 'ZVT_HU31I';
const VACUNAS = [A, B, C, INACTIVA];
const ANIO = 2025;
const ESTABLECIMIENTO = 'CS-1201';
const MESES = { 1: 'ABIERTO', 2: 'ABIERTO', 3: 'ABIERTO' };

const vacunaIds = {};
const periodoIds = {};
const ids = {
  aV1: new ObjectId(),
  aV2: new ObjectId(),
  bV1: new ObjectId(),
  cV1: new ObjectId(),
  cV2: new ObjectId(),
  iV1: new ObjectId(),
};

const utc = (fecha) => new Date(`${fecha}T00:00:00.000Z`);
const dosDigitos = (n) => String(n).padStart(2, '0');
const NACIONAL = { nivel: 'NACIONAL', ddriss_codigo: null };
const DE_LA_DDRISS = { nivel: 'DDRISS', ddriss_codigo: 'DDRISS_SM' };

function esquemaDePrueba({ _id, codigo, version, territorio = NACIONAL, estado, desde, hasta = null, incluir }) {
  return {
    _id,
    vacuna: { id: new Int32(vacunaIds[codigo]), codigo, nombre: `vitest-hu31 ${codigo}` },
    version: new Int32(version),
    territorio,
    estado,
    vigencia: { desde: utc(desde), hasta: hasta && utc(hasta) },
    version_anterior_id: null,
    basado_en: null,
    dimensiones: {
      dosis: [{ codigo: 'D1', etiqueta: 'Primera dosis' }],
      procedencia: { modo: 'PROPIO_Y_OTROS', permite_no_especificado: true },
      desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }],
    },
    secciones: [{ codigo: 'MENOR_1', titulo: '< 1 año', orden: new Int32(1), grupo_edad: 'MENOR_1', dosis: ['D1'] }],
    incluir_por_defecto: incluir,
    campos_adicionales: [],
    reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: new Int32(1) }],
    presentacion: { filas: 'dosis', columnas: ['seccion'] },
    auditoria: { creado_por: new Int32(1), creado_en: new Date(), publicado_por: null, publicado_en: null, motivo_cambio: null },
  };
}

async function limpiarReportes() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM observacion_revision WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
}

async function limpiar() {
  await limpiarReportes();
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: VACUNAS } });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [VACUNAS]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS]);
}

async function preparar() {
  for (const [mes, estado] of Object.entries(MESES).map(([m, e]) => [Number(m), e])) {
    const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
    const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
      ANIO,
      mes,
      `${ANIO}-${dosDigitos(mes)}-01`,
      `${ANIO}-${dosDigitos(mes)}-${fin}`,
    ]);
    periodoIds[mes] = periodo.insertId;
    await pool.query(
      'INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, ?, ?)',
      [periodo.insertId, `${ANIO}-${dosDigitos(mes + 1)}-10`, estado],
    );
  }

  // Sin orden_informe: el reporte las ordena por nombre (A, B, C).
  for (const codigo of VACUNAS) {
    const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, ?, ?)', [
      codigo,
      `vitest-hu31 ${codigo}`,
      codigo !== INACTIVA,
    ]);
    vacunaIds[codigo] = vacuna.insertId;
    await pool.query("INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, 'D1', 'Primera dosis', 1, TRUE)", [
      vacuna.insertId,
    ]);
  }

  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertMany([
    esquemaDePrueba({ _id: ids.aV1, codigo: A, version: 1, estado: 'HISTORICO', desde: '2025-01-01', hasta: '2025-01-31', incluir: true }),
    esquemaDePrueba({ _id: ids.aV2, codigo: A, version: 2, estado: 'HISTORICO', desde: '2025-02-01', hasta: '2025-02-28', incluir: false }),
    esquemaDePrueba({ _id: ids.bV1, codigo: B, version: 1, estado: 'HISTORICO', desde: '2025-01-01', hasta: '2025-02-28', incluir: false }),
    esquemaDePrueba({ _id: ids.cV1, codigo: C, version: 1, estado: 'HISTORICO', desde: '2025-01-01', hasta: '2025-02-28', incluir: true }),
    esquemaDePrueba({
      _id: ids.cV2, codigo: C, version: 2, territorio: DE_LA_DDRISS, estado: 'HISTORICO',
      desde: '2025-01-01', hasta: '2025-02-28', incluir: false,
    }),
    esquemaDePrueba({ _id: ids.iV1, codigo: INACTIVA, version: 1, estado: 'HISTORICO', desde: '2025-01-01', hasta: '2025-02-28', incluir: true }),
  ]);
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

const crear = (mes) =>
  request(app).post('/api/v1/reportes').set('Authorization', `Bearer ${personal.token}`).send({ periodoId: periodoIds[mes] });
const consultar = (ruta) => request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${personal.token}`);

beforeAll(async () => {
  await limpiar();
  await preparar();
  personal = await tokenDe('u.nombre_usuario', 'cs1201');
  revisor = await tokenDe('r.codigo', 'REVISOR');
}, 60000);

afterAll(limpiar, 60000);

describe('POST /reportes con vacunas base (SPEC 31)', () => {
  it('fija solo las vacunas activas cuyo esquema del mes está marcado; el de la DDRISS gana sobre el nacional', async () => {
    const res = await crear(1);
    expect(res.status).toBe(201);
    // B no está marcada; C sí en el nacional, pero su esquema de la DDRISS no; I está inactiva.
    expect(res.body.vacunas.map((v) => [v.vacuna.codigo, v.esquema.version, v.base])).toEqual([[A, 1, true]]);

    const detalle = await consultar(`/reportes/${res.body.id}`);
    expect(detalle.body.vacunas.map((v) => [v.vacuna.codigo, v.base])).toEqual([[A, true]]);
    const formulario = await consultar(`/reportes/${res.body.id}/formulario`);
    expect(formulario.body.vacunas.map((v) => [v.vacunaId, v.base, v.esquema.incluirPorDefecto])).toEqual([
      [vacunaIds[A], true, true],
    ]);
  });

  it('con vacunas con esquema pero ninguna marcada, crea el reporte sin vacunas', async () => {
    const res = await crear(2);
    expect(res.status).toBe(201);
    expect(res.body.estado).toBe('BORRADOR');
    expect(res.body.vacunas).toEqual([]);
    const [filas] = await pool.query('SELECT COUNT(*) AS n FROM reporte_vacuna WHERE reporte_id = ?', [res.body.id]);
    expect(filas[0].n).toBe(0);

    const formulario = await consultar(`/reportes/${res.body.id}/formulario`);
    expect(formulario.status).toBe(200);
    expect(formulario.body.vacunas).toEqual([]);
  });

  it('sin ninguna vacuna activa con esquema para el mes responde 422 SIN_ESQUEMAS', async () => {
    const res = await crear(3);
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('SIN_ESQUEMAS');
  });
});

describe('agregar y quitar vacunas del reporte (SPEC 31)', () => {
  let reporteId;
  let municipioPropioId;

  const enviar = (metodo, ruta, cuerpo, credencial = personal.token) => {
    const pedido = request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
    return cuerpo === undefined ? pedido : pedido.send(cuerpo);
  };
  const versionActual = async () => {
    const [[fila]] = await pool.query('SELECT version_fila FROM reporte_produccion WHERE id = ?', [reporteId]);
    return fila.version_fila;
  };
  const agregar = async (codigo, versionFila) =>
    enviar('post', `/reportes/${reporteId}/vacunas`, {
      vacunaId: vacunaIds[codigo],
      versionFila: versionFila ?? (await versionActual()),
    });
  const quitar = async (codigo, versionFila) =>
    enviar('delete', `/reportes/${reporteId}/vacunas/${vacunaIds[codigo]}?versionFila=${versionFila ?? (await versionActual())}`);
  const repVacDe = async (codigo) => {
    const [[fila]] = await pool.query('SELECT id FROM reporte_vacuna WHERE reporte_id = ? AND vacuna_id = ?', [
      reporteId,
      vacunaIds[codigo],
    ]);
    return fila?.id ?? null;
  };
  const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
  async function bitacoraDe(entidadId) {
    const [filas] = await pool.query(
      `SELECT accion, valores_anteriores, valores_nuevos FROM bitacora
        WHERE modulo = 'PRODUCCION' AND entidad = 'reporte_vacuna' AND entidad_id = ? ORDER BY id`,
      [String(entidadId)],
    );
    return filas.map((f) => ({ accion: f.accion, anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
  }
  const cambiarEstado = (estado) => pool.query('UPDATE reporte_produccion SET estado = ? WHERE id = ?', [estado, reporteId]);
  const cambiarMes = (estado) =>
    pool.query('UPDATE cierre_periodo SET estado = ?, cerrado_por = ?, cerrado_en = ? WHERE periodo_id = ? AND ddriss_id = 1', [
      estado,
      estado === 'CERRADO' ? 2 : null,
      estado === 'CERRADO' ? new Date() : null,
      periodoIds[1],
    ]);

  beforeAll(async () => {
    // El reporte de enero que creó el describe anterior, con solo ZVT_HU31A.
    const [[fila]] = await pool.query(
      `SELECT r.id FROM reporte_produccion r JOIN establecimiento e ON e.id = r.establecimiento_id
        WHERE r.periodo_id = ? AND e.codigo = ?`,
      [periodoIds[1], ESTABLECIMIENTO],
    );
    reporteId = fila.id;
    const formulario = await consultar(`/reportes/${reporteId}/formulario`);
    municipioPropioId = formulario.body.municipioPropio.id;
  });

  it('vacunas-disponibles trae las activas con esquema para el mes que el reporte no tiene', async () => {
    const res = await consultar(`/reportes/${reporteId}/vacunas-disponibles`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([
      { vacunaId: vacunaIds[B], codigo: B, nombre: `vitest-hu31 ${B}`, esquema: { id: ids.bV1.toString(), version: 1 } },
      { vacunaId: vacunaIds[C], codigo: C, nombre: `vitest-hu31 ${C}`, esquema: { id: ids.cV2.toString(), version: 2 } },
    ]);
  });

  it('agregar responde la vacuna y su formulario, sube versionFila y deja CREAR en la bitácora', async () => {
    const antes = await versionActual();
    const res = await agregar(B, antes);
    expect(res.status).toBe(201);
    expect(res.body.versionFila).toBe(antes + 1);
    expect(await versionActual()).toBe(antes + 1);
    expect(res.body.orden).toEqual([vacunaIds[A], vacunaIds[B]]);
    expect(res.body.vacuna).toMatchObject({
      vacuna: { id: vacunaIds[B], codigo: B },
      esquema: { id: ids.bV1.toString(), version: 1 },
      base: false,
    });
    expect(res.body.vacuna.dosis.map((d) => d.codigo)).toEqual(['D1']);
    expect(res.body.formulario).toMatchObject({ vacunaId: vacunaIds[B], base: false, celdas: [], totalDeclarado: null });

    const filas = await bitacoraDe(await repVacDe(B));
    expect(filas).toEqual([
      {
        accion: 'CREAR',
        anteriores: null,
        nuevos: { reporteId, vacunaId: vacunaIds[B], vacunaCodigo: B, esquemaId: ids.bV1.toString(), esquemaVersion: 1 },
      },
    ]);
    const disponibles = await consultar(`/reportes/${reporteId}/vacunas-disponibles`);
    expect(disponibles.body.map((v) => v.codigo)).toEqual([C]);
  });

  it('agregar una que ya está responde 409 VACUNA_YA_EN_REPORTE', async () => {
    const res = await agregar(B);
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('VACUNA_YA_EN_REPORTE');
  });

  it.each([
    ['inactiva', () => vacunaIds[INACTIVA]],
    ['que no existe', () => 999999],
  ])('agregar una vacuna %s responde 422 VACUNA_NO_DISPONIBLE', async (_, vacunaId) => {
    const res = await enviar('post', `/reportes/${reporteId}/vacunas`, { vacunaId: vacunaId(), versionFila: await versionActual() });
    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('VACUNA_NO_DISPONIBLE');
  });

  it.each([
    [{ vacunaId: 1, versionFila: 1, esquemaId: 'x' }, 'Campo no permitido: esquemaId.'],
    [{ vacunaId: '30', versionFila: 1 }, 'vacunaId debe ser un número entero mayor que 0.'],
    [{ vacunaId: 30 }, 'versionFila debe ser un número entero mayor que 0.'],
  ])('un cuerpo inválido %o responde 400', async (cuerpo, mensaje) => {
    const res = await enviar('post', `/reportes/${reporteId}/vacunas`, cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('dos altas a la vez con la misma versionFila: una entra y la otra responde 409', async () => {
    const version = await versionActual();
    const respuestas = await Promise.all([agregar(C, version), agregar(C, version)]);
    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    const [filas] = await pool.query('SELECT COUNT(*) AS n FROM reporte_vacuna WHERE reporte_id = ? AND vacuna_id = ?', [
      reporteId,
      vacunaIds[C],
    ]);
    expect(filas[0].n).toBe(1);
  });

  it('quitar borra la fila y sus cantidades, sube versionFila y deja ELIMINAR con todas las celdas', async () => {
    const guardado = await enviar('put', `/reportes/${reporteId}/vacunas/${vacunaIds[B]}`, {
      versionFila: await versionActual(),
      celdas: [{ dosisCodigo: 'D1', municipioProcedenciaId: municipioPropioId, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 5 }],
    });
    expect(guardado.status).toBe(200);
    const repVac = await repVacDe(B);
    const [[detalles]] = await pool.query('SELECT COUNT(*) AS n, MIN(id) AS id FROM detalle_produccion WHERE reporte_vacuna_id = ?', [
      repVac,
    ]);
    expect(detalles.n).toBe(1);

    const antes = await versionActual();
    const res = await quitar(B, antes);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ versionFila: antes + 1 });
    expect(await repVacDe(B)).toBeNull();
    const [[restantes]] = await pool.query('SELECT COUNT(*) AS n FROM detalle_produccion WHERE reporte_vacuna_id = ?', [repVac]);
    expect(restantes.n).toBe(0);
    const [[dimensiones]] = await pool.query('SELECT COUNT(*) AS n FROM detalle_dimension WHERE detalle_id = ?', [detalles.id]);
    expect(dimensiones.n).toBe(0);

    const filas = await bitacoraDe(repVac);
    expect(filas.map((f) => f.accion)).toEqual(['CREAR', 'ACTUALIZAR', 'ELIMINAR']);
    expect(filas[2].nuevos).toBeNull();
    expect(filas[2].anteriores).toEqual({
      reporteId,
      vacunaId: vacunaIds[B],
      vacunaCodigo: B,
      esquemaId: ids.bV1.toString(),
      esquemaVersion: 1,
      totalDeclarado: 5,
      datosAdicionales: null,
      celdas: [
        {
          dosisCodigo: 'D1',
          municipioProcedenciaId: municipioPropioId,
          dimensiones: { grupo_edad: 'MENOR_1' },
          claveCombinacion: 'grupo_edad=MENOR_1',
          cantidad: 5,
        },
      ],
    });
  });

  it('quitar una vacuna base responde 409 VACUNA_BASE', async () => {
    const res = await quitar(A);
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('VACUNA_BASE');
    expect(await repVacDe(A)).not.toBeNull();
  });

  it('quitar una vacuna con observaciones del revisor responde 409 VACUNA_CON_OBSERVACIONES', async () => {
    const repVac = await repVacDe(C);
    await pool.query('INSERT INTO observacion_revision (reporte_id, reporte_vacuna_id, usuario_id, texto) VALUES (?, ?, ?, ?)', [
      reporteId,
      repVac,
      revisor.usuarioId,
      'vitest-hu31 observación',
    ]);
    try {
      const res = await quitar(C);
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('VACUNA_CON_OBSERVACIONES');
    } finally {
      await pool.query('DELETE FROM observacion_revision WHERE reporte_vacuna_id = ?', [repVac]);
    }
  });

  it('quitar una vacuna que no está en el reporte responde 404', async () => {
    const res = await quitar(B);
    expect(res.status).toBe(404);
  });

  it.each([
    ['', 'versionFila debe ser un número entero mayor que 0.'],
    ['?versionFila=abc', 'versionFila debe ser un número entero mayor que 0.'],
    ['?versionFila=1&otro=2', 'Parámetro no permitido: otro.'],
    ['?versionFila=1&versionFila=2', 'versionFila no se puede repetir.'],
  ])('quitar con la consulta "%s" responde 400', async (consulta, mensaje) => {
    const res = await enviar('delete', `/reportes/${reporteId}/vacunas/${vacunaIds[C]}${consulta}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('agregar y quitar con una versionFila vieja responden 409 REPORTE_DESACTUALIZADO', async () => {
    const vieja = (await versionActual()) - 1;
    for (const res of [await agregar(B, vieja), await quitar(C, vieja)]) {
      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('REPORTE_DESACTUALIZADO');
    }
  });

  it('con el reporte fuera de BORRADOR responden 409 REPORTE_NO_EDITABLE', async () => {
    await cambiarEstado('ENVIADO');
    try {
      for (const res of [await agregar(B), await quitar(C)]) {
        expect(res.status).toBe(409);
        expect(res.body.error.codigo).toBe('REPORTE_NO_EDITABLE');
      }
    } finally {
      await cambiarEstado('BORRADOR');
    }
  });

  it('con el mes EN_CIERRE se puede agregar; con el mes CERRADO responden 409 PERIODO_CERRADO', async () => {
    await cambiarMes('EN_CIERRE');
    try {
      expect((await agregar(B)).status).toBe(201);
      await cambiarMes('CERRADO');
      for (const res of [await quitar(B), await agregar(B)]) {
        expect(res.status).toBe(409);
        expect(res.body.error.codigo).toBe('PERIODO_CERRADO');
      }
    } finally {
      await cambiarMes('ABIERTO');
    }
  });

  it('el reporte de otro establecimiento responde 404, y sin REPORTE_EDITAR responde 403', async () => {
    const [[otro]] = await pool.query('SELECT id FROM establecimiento WHERE codigo <> ? AND activo = TRUE ORDER BY id LIMIT 1', [
      ESTABLECIMIENTO,
    ]);
    const [ajeno] = await pool.query('INSERT INTO reporte_produccion (establecimiento_id, periodo_id, creado_por) VALUES (?, ?, ?)', [
      otro.id,
      periodoIds[2],
      personal.usuarioId,
    ]);
    expect((await consultar(`/reportes/${ajeno.insertId}/vacunas-disponibles`)).status).toBe(404);
    const res = await enviar('post', `/reportes/${ajeno.insertId}/vacunas`, { vacunaId: vacunaIds[B], versionFila: 1 });
    expect(res.status).toBe(404);

    const sinPermiso = await enviar(
      'post',
      `/reportes/${reporteId}/vacunas`,
      { vacunaId: vacunaIds[B], versionFila: await versionActual() },
      revisor.token,
    );
    expect(sinPermiso.status).toBe(403);
  });
});
