import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { candidatosDeAlerta } from '../src/modulos/alertas/cobertura.service.js';
import { calcularCorrida } from '../src/modulos/indicadores/corridas.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// alertarCorrida falla solo cuando una prueba lo pide; si no, es la real.
const fallo = vi.hoisted(() => ({ activo: false }));
vi.mock('../src/modulos/alertas/cobertura.service.js', async (importOriginal) => {
  const original = await importOriginal();
  return {
    ...original,
    alertarCorrida: async (...argumentos) => {
      if (fallo.activo) throw new Error('vitest-hu51 fallo de las alertas');
      return original.alertarCorrida(...argumentos);
    },
  };
});

const SEMAFORO = [
  { color: 'verde', desde: 90, hasta: null },
  { color: 'amarillo', desde: 80, hasta: 90 },
  { color: 'rojo', desde: 0, hasta: 80 },
];

const indicador = (codigo, cambios = {}) => ({
  codigo,
  version: 1,
  nombre: `Indicador ${codigo}`,
  tipo_calculo: 'AVANCE_META_MES',
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
  umbrales: SEMAFORO,
  alerta: { generar: true, tipo: 'COBERTURA_BAJO_META', rol_destino: ['EPIDEMIOLOGIA', 'REVISOR'] },
  ...cambios,
});

const fila = (codigo, valor, cambios = {}) => ({
  codigo,
  version: 1,
  municipioId: 4,
  vacunaId: 2,
  dosisId: 7,
  filtro: 'grupo_edad=MENOR_1',
  valor,
  meta: 90,
  ...cambios,
});

const candidatos = (versiones, filas, mes = 6) => candidatosDeAlerta({ versiones, filas, mes });
const clases = (resultado) => resultado.map((c) => c.clase);

describe('candidatosDeAlerta (SPEC 68)', () => {
  it('la franja roja de un indicador con alerta.generar da «bajo la meta» con sus roles de destino', () => {
    expect(candidatos([indicador('AV')], [fila('AV', 62.5)])).toEqual([
      {
        clase: 'BAJO_META',
        codigo: 'AV',
        version: 1,
        nombre: 'Indicador AV',
        municipioId: 4,
        vacunaId: 2,
        dosisId: 7,
        filtro: 'grupo_edad=MENOR_1',
        valor: 62.5,
        meta: 90,
        rolesDestino: ['EPIDEMIOLOGIA', 'REVISOR'],
      },
    ]);
  });

  it('la franja amarilla o verde no da alerta', () => {
    expect(candidatos([indicador('AV')], [fila('AV', 80), fila('AV', 85), fila('AV', 95)])).toEqual([]);
  });

  it('sin alerta.generar no da alerta, aunque esté en rojo o pase de 100', () => {
    const versiones = [
      indicador('NO', { alerta: { generar: false } }),
      indicador('SIN', { alerta: undefined }),
    ];
    expect(candidatos(versiones, [fila('NO', 40), fila('NO', 120), fila('SIN', 40), fila('SIN', 120)])).toEqual([]);
  });

  it('más de 100 en COBERTURA o AVANCE_META_MES da «mayor al 100 %»; 100 justo no', () => {
    const versiones = [indicador('AV'), indicador('COB', { tipo_calculo: 'COBERTURA' })];
    const filas = [fila('AV', 100.9), fila('COB', 106.1), fila('AV', 100, { municipioId: 5 })];
    const resultado = candidatos(versiones, filas);
    expect(resultado.map((c) => [c.clase, c.codigo, c.valor])).toEqual([
      ['MAYOR_A_CIEN', 'AV', 100.9],
      ['MAYOR_A_CIEN', 'COB', 106.1],
    ]);
  });

  it('la fila departamental, las proyecciones y las filas sin valor no dan alerta', () => {
    const versiones = [indicador('AV'), indicador('PROY', { tipo_calculo: 'PROYECCION' })];
    const filas = [
      fila('AV', 40, { municipioId: null }),
      fila('AV', 120, { municipioId: null }),
      fila('PROY', 40, { esProyeccion: true }),
      fila('PROY', 120, { esProyeccion: true }),
      fila('AV', null),
    ];
    expect(candidatos(versiones, filas)).toEqual([]);
  });

  it('la cobertura anual se pinta contra lo esperado del mes, como en pantalla', () => {
    const anual = indicador('ANUAL', {
      tipo_calculo: 'COBERTURA',
      denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'NINGUNO' },
    });
    const mensual = indicador('MENSUAL', { tipo_calculo: 'COBERTURA' });
    // En junio se espera el 50 %: 45 es el 90 % de lo esperado (verde) en la anual y rojo en la mensual.
    expect(candidatos([anual, mensual], [fila('ANUAL', 45), fila('MENSUAL', 45)]).map((c) => c.codigo)).toEqual([
      'MENSUAL',
    ]);
    // 35 es el 70 % de lo esperado: rojo también en la anual.
    expect(clases(candidatos([anual], [fila('ANUAL', 35)]))).toEqual(['BAJO_META']);
  });

  it('la deserción en rojo (semáforo descendente) da «bajo la meta» y nunca «mayor al 100 %»', () => {
    const desercion = indicador('DES', {
      tipo_calculo: 'DESERCION',
      umbrales: [
        { color: 'verde', desde: null, hasta: 10 },
        { color: 'rojo', desde: 10, hasta: null },
      ],
    });
    expect(clases(candidatos([desercion], [fila('DES', 15)]))).toEqual(['BAJO_META']);
    expect(candidatos([desercion], [fila('DES', 5)])).toEqual([]);
    expect(clases(candidatos([desercion], [fila('DES', 120)]))).toEqual(['BAJO_META']);
  });

  it('toma la versión de la fila y deja rolesDestino vacío si la configuración no trae roles', () => {
    const versiones = [
      indicador('AV', { version: 1, alerta: { generar: false } }),
      indicador('AV', { version: 2, alerta: { generar: true } }),
    ];
    const resultado = candidatos(versiones, [fila('AV', 50, { version: 2 })]);
    expect(resultado.map((c) => [c.version, c.rolesDestino])).toEqual([[2, []]]);
  });
});

// Todo por SQL y MongoDB: enero de 1997 CERRADO en la DDRISS ficticia ZVT_HU51 (copiada del departamento de la
// DDRISS 1), los establecimientos ZVT51-A y ZVT51-B copiados de CS-1201, la vacuna ZVT_HU51 (D1), la población
// 1_A_MENOR_2 de 1997 de tres municipios (1200 cada uno, meta de enero 100) y dos indicadores de la DDRISS:
// ZVT_HU51_AV (avance, con alerta para EPIDEMIOLOGIA y REVISOR) y ZVT_HU51_COB (sin alerta). Los indicadores
// nacionales de la semilla también se calculan, pero no tienen producción ni población MENOR_1 en 1997: no alertan.
// Los casos van en orden y cada uno parte de lo que dejó el anterior. Todo se borra al inicio y al final (las alertas
// antes que los resultados); las filas de la bitácora quedan.
describe('alertarCorrida en cada corrida (SPEC 68)', () => {
  const ANIO = 1997;
  const DDRISS = 'ZVT_HU51';
  const VACUNA = 'ZVT_HU51';
  const AVANCE = 'ZVT_HU51_AV';
  const COB = 'ZVT_HU51_COB';
  const FUTURA = '2099-12-31';
  let ddrissId;
  let periodoId;
  const establecimientos = {};
  let vacunaId;
  let dosisId;
  let municipios;
  let epidemiologia;

  const coleccion = async () => (await obtenerDb()).collection('configuracion_indicadores');

  function documento(codigo, tipo, alerta) {
    const fecha = new Date();
    return {
      _id: new ObjectId(),
      codigo,
      version: new Int32(1),
      nombre: `vitest-hu51 ${codigo}`,
      tipo_calculo: tipo,
      aplica_a: [{ vacuna: VACUNA, dosis: 'D1', clasificacion_poblacion: '1_A_MENOR_2' }],
      numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
      denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
      // El avance tiene la meta fija en 100 (tiposIndicador.js); la cobertura usa la de su documento.
      meta: { valor: 100, unidad: 'PORCENTAJE', comparador: '>=' },
      umbrales: SEMAFORO,
      umbrales_provisionales: false,
      es_indicador_mapa: false,
      niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
      periodicidad: 'MENSUAL',
      alerta,
      es_estimacion: false,
      territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS },
      estado: 'VIGENTE',
      vigencia: { desde: fecha, hasta: null },
      auditoria: {
        creado_por: new Int32(4), creado_en: fecha, publicado_por: new Int32(4), publicado_en: fecha,
        motivo_cambio: 'vitest-hu51',
      },
    };
  }

  async function limpiar() {
    const corridas = 'SELECT c.id FROM corrida_calculo c JOIN ddriss d ON d.id = c.ddriss_id WHERE d.codigo = ?';
    await pool.query('DELETE a FROM alerta a JOIN ddriss d ON d.id = a.ddriss_id WHERE d.codigo = ?', [DDRISS]);
    await pool.query(`DELETE FROM resultado_indicador WHERE corrida_id IN (SELECT id FROM (${corridas}) t)`, [DDRISS]);
    await pool.query(`DELETE FROM corrida_calculo WHERE id IN (SELECT id FROM (${corridas}) t)`, [DDRISS]);
    await pool.query(
      `DELETE a FROM alerta a JOIN resultado_indicador ri ON ri.id = a.resultado_indicador_id
         JOIN vacuna v ON v.id = ri.vacuna_id WHERE v.codigo = ?`,
      [VACUNA],
    );
    await pool.query('DELETE ri FROM resultado_indicador ri JOIN vacuna v ON v.id = ri.vacuna_id WHERE v.codigo = ?', [
      VACUNA,
    ]);
    await pool.query(
      `DELETE r FROM reporte_produccion r JOIN establecimiento e ON e.id = r.establecimiento_id
        WHERE e.codigo LIKE 'ZVT51-%'`,
    );
    await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [
      ANIO,
    ]);
    await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
    await pool.query('DELETE FROM poblacion_objetivo WHERE anio = ?', [ANIO]);
    await (await coleccion()).deleteMany({ codigo: /^ZVT_HU51/ });
    await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA]);
    await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA]);
    await pool.query("DELETE FROM establecimiento WHERE codigo LIKE 'ZVT51-%'");
    await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS]);
  }

  // Un reporte CERRADO de enero con sus celdas de D1: [municipio de procedencia, cantidad].
  async function reporte(codigo, celdas) {
    const [alta] = await pool.query(
      `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en)
       VALUES (?, ?, 'CERRADO', 1, NOW())`,
      [establecimientos[codigo], periodoId],
    );
    const [rv] = await pool.query(
      'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES (?, ?, ?, 1)',
      [alta.insertId, vacunaId, new ObjectId().toString()],
    );
    for (const [municipioId, cantidad] of celdas) {
      const [detalle] = await pool.query(
        `INSERT INTO detalle_produccion
           (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
         VALUES (?, ?, ?, 'grupo_edad=1_A_5', ?, 1)`,
        [rv.insertId, dosisId, municipioId, cantidad],
      );
      await pool.query(
        "INSERT INTO detalle_dimension (detalle_id, dimension_codigo, valor_codigo) VALUES (?, 'grupo_edad', '1_A_5')",
        [detalle.insertId],
      );
    }
  }

  async function preparar() {
    const [ddriss] = await pool.query(
      `INSERT INTO ddriss (codigo, nombre, departamento_id, activo)
       SELECT ?, 'vitest-hu51', departamento_id, TRUE FROM ddriss WHERE id = 1`,
      [DDRISS],
    );
    ddrissId = ddriss.insertId;
    // Un reporte por establecimiento y mes: el segundo suma producción en un caso posterior.
    for (const codigo of ['ZVT51-A', 'ZVT51-B']) {
      const [establecimiento] = await pool.query(
        `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, distrito_salud_id,
                                      municipio_id, reporta_5c, activo)
         SELECT ?, ?, tipo_establecimiento_id, ?, NULL, municipio_id, TRUE, TRUE
           FROM establecimiento WHERE codigo = 'CS-1201'`,
        [codigo, `vitest-hu51 ${codigo}`, ddrissId],
      );
      establecimientos[codigo] = establecimiento.insertId;
    }
    const [periodo] = await pool.query(
      "INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, 1, '1997-01-01', '1997-01-31')",
      [ANIO],
    );
    periodoId = periodo.insertId;
    // Cerrado un día antes, para que cerrado_en quede antes de cualquier corrida.
    await pool.query(
      `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
       VALUES (?, ?, ?, 'CERRADO', 1, DATE_SUB(NOW(), INTERVAL 1 DAY))`,
      [periodoId, ddrissId, FUTURA],
    );
    const [vacuna] = await pool.query(
      "INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, 'vitest-hu51 Vacuna', 999, TRUE)",
      [VACUNA],
    );
    vacunaId = vacuna.insertId;
    const [dosis] = await pool.query(
      `INSERT INTO dosis (vacuna_id, codigo, nombre, orden, completa_esquema, activa)
       VALUES (?, 'D1', 'Primera dosis', 1, TRUE, TRUE)`,
      [vacunaId],
    );
    dosisId = dosis.insertId;

    const [filas] = await pool.query(
      `SELECT m.id, m.nombre FROM municipio m JOIN ddriss d ON d.id = ?
        WHERE m.activo = TRUE AND m.departamento_id = d.departamento_id AND m.codigo_ine <> '9999'
        ORDER BY m.id LIMIT 3`,
      [ddrissId],
    );
    const [a, b, c] = filas;
    municipios = { a, b, c };
    const [[{ id: clasificacionId }]] = await pool.query(
      "SELECT id FROM clasificacion_poblacion WHERE codigo = '1_A_MENOR_2'",
    );
    await pool.query(
      `INSERT INTO poblacion_objetivo (municipio_id, anio, clasificacion_poblacion_id, cantidad, fuente, registrado_por)
       VALUES ?`,
      [filas.map((m) => [m.id, ANIO, clasificacionId, 1200, 'vitest-hu51', 1])],
    );
    // Avance de enero: A 50 % (rojo), B 102 % (más de 100) y C 85 % (amarillo).
    await reporte('ZVT51-A', [[a.id, 50], [b.id, 102], [c.id, 85]]);

    const conAlerta = { generar: true, tipo: 'COBERTURA_BAJO_META', rol_destino: ['EPIDEMIOLOGIA', 'REVISOR'] };
    await (await coleccion()).insertMany([
      documento(AVANCE, 'AVANCE_META_MES', conAlerta),
      documento(COB, 'COBERTURA', { generar: false }),
    ]);
  }

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
    const token = await tokenDePrueba(
      cuenta.id,
      {
        rol: cuenta.rol, permisos: permisos.map((p) => p.codigo), ddrissId: cuenta.ddriss_id,
        establecimientoId: cuenta.establecimiento_id, municipioId: cuenta.municipio_id,
      },
      { expiresIn: '10m' },
    );
    return { token, ...cuenta };
  }

  const calcular = () => calcularCorrida(
    { ddrissId, anio: ANIO, mesHasta: 1, motivo: 'MANUAL', usuarioId: epidemiologia.id },
    { usuarioId: epidemiologia.id },
  );

  async function alertas() {
    const [filas] = await pool.query(
      `SELECT a.id, a.tipo, a.severidad, a.titulo, a.mensaje, a.periodo_id, a.municipio_id, a.establecimiento_id,
              a.reporte_id, a.resultado_indicador_id, a.estado, r.codigo AS rol, ri.corrida_id, ri.indicador_codigo
         FROM alerta a
         JOIN rol r ON r.id = a.rol_destino_id
         JOIN resultado_indicador ri ON ri.id = a.resultado_indicador_id
        WHERE a.ddriss_id = ?
        ORDER BY a.id`,
      [ddrissId],
    );
    return filas;
  }

  const de = (lista, municipio, rol) => lista.find((a) => a.municipio_id === municipio.id && a.rol === rol);

  async function bitacoraDeLaCorrida(corridaId) {
    const [[fila]] = await pool.query(
      `SELECT valores_nuevos FROM bitacora
        WHERE entidad = 'corrida_calculo' AND entidad_id = ? AND accion = 'CALCULAR_INDICADORES'`,
      [String(corridaId)],
    );
    return fila.valores_nuevos;
  }

  async function bitacoraDeAlertas(ids, accion) {
    const [filas] = await pool.query(
      `SELECT entidad_id, usuario_id, modulo, valores_anteriores, valores_nuevos FROM bitacora
        WHERE entidad = 'alerta' AND accion = ? AND entidad_id IN (?)
        ORDER BY id`,
      [accion, ids.map(String)],
    );
    return filas;
  }

  const mensajeBajoMeta = (municipio, valor) =>
    `${municipio.nombre}: vitest-hu51 ${AVANCE} (vitest-hu51 Vacuna) en enero de 1997 quedó en ${valor} %, ` +
    'en la franja más baja del semáforo (meta 100 %).';
  const mensajeMayorACien = (municipio, valor) =>
    `${municipio.nombre}: vitest-hu51 ${AVANCE} (vitest-hu51 Vacuna) en enero de 1997 da ${valor} %; ` +
    'revise la población o los registros.';

  let primera;
  let segunda;
  let antesDelFallo;

  beforeAll(async () => {
    epidemiologia = await tokenDe('epidemiologia');
    await limpiar();
    await preparar();
  }, 120000);

  afterAll(async () => {
    fallo.activo = false;
    await limpiar();
  }, 120000);

  it('una corrida no parcial crea «bajo la meta» y «mayor al 100 %» para cada rol de rol_destino', async () => {
    primera = await calcular();
    expect(primera.parcial).toBe(false);
    const lista = await alertas();
    expect(lista).toHaveLength(4);
    for (const rol of ['EPIDEMIOLOGIA', 'REVISOR']) {
      expect(de(lista, municipios.a, rol)).toMatchObject({
        tipo: 'COBERTURA_BAJO_META',
        severidad: 'CRITICA',
        titulo: 'Municipio bajo la meta',
        mensaje: mensajeBajoMeta(municipios.a, '50.0'),
        periodo_id: periodoId,
        establecimiento_id: null,
        reporte_id: null,
        estado: 'ACTIVA',
        corrida_id: primera.id,
        indicador_codigo: AVANCE,
      });
      expect(de(lista, municipios.b, rol)).toMatchObject({
        tipo: 'CALIDAD',
        severidad: 'ADVERTENCIA',
        titulo: 'Cobertura mayor al 100 %',
        mensaje: mensajeMayorACien(municipios.b, '102.0'),
        periodo_id: periodoId,
        estado: 'ACTIVA',
        corrida_id: primera.id,
        indicador_codigo: AVANCE,
      });
    }
    // C está en amarillo y ZVT_HU51_COB no tiene alerta.generar.
    expect(lista.some((a) => a.municipio_id === municipios.c.id || a.indicador_codigo === COB)).toBe(false);
    expect((await bitacoraDeLaCorrida(primera.id)).alertas).toEqual({ creadas: 4, actualizadas: 0, descartadas: 0 });
  }, 60000);

  it('cada alerta creada deja su bitácora CREAR con el usuario de la corrida', async () => {
    const lista = await alertas();
    const filas = await bitacoraDeAlertas(lista.map((a) => a.id), 'CREAR');
    expect(filas.map((f) => Number(f.entidad_id)).sort()).toEqual(lista.map((a) => a.id).sort());
    for (const fila of filas) {
      expect(fila).toMatchObject({ usuario_id: epidemiologia.id, modulo: 'INDICADORES' });
      expect(fila.valores_nuevos).toMatchObject({ estado: 'ACTIVA', ddrissId, periodoId });
    }
  });

  it('recalcular el mes sin cambios no duplica: las activas apuntan al resultado nuevo', async () => {
    const antes = await alertas();
    segunda = await calcular();
    const despues = await alertas();
    expect(despues.map((a) => [a.id, a.mensaje, a.estado])).toEqual(antes.map((a) => [a.id, a.mensaje, a.estado]));
    expect(despues.every((a) => a.corrida_id === segunda.id)).toBe(true);
    expect((await bitacoraDeLaCorrida(segunda.id)).alertas).toEqual({ creadas: 0, actualizadas: 4, descartadas: 0 });
    const filas = await bitacoraDeAlertas(despues.map((a) => a.id), 'ACTUALIZAR');
    expect(filas).toHaveLength(4);
    expect(filas[0].valores_nuevos).toEqual({ resultadoIndicadorId: expect.any(Number) });
  }, 60000);

  it('una alerta ATENDIDA no se recrea ni se actualiza', async () => {
    const atendida = de(await alertas(), municipios.a, 'EPIDEMIOLOGIA');
    await pool.query("UPDATE alerta SET estado = 'ATENDIDA', atendida_por = ?, atendida_en = NOW() WHERE id = ?", [
      epidemiologia.id,
      atendida.id,
    ]);
    const tercera = await calcular();
    const lista = await alertas();
    expect(lista).toHaveLength(4);
    expect(de(lista, municipios.a, 'EPIDEMIOLOGIA')).toMatchObject({
      id: atendida.id, estado: 'ATENDIDA', corrida_id: segunda.id,
    });
    expect((await bitacoraDeLaCorrida(tercera.id)).alertas).toEqual({ creadas: 0, actualizadas: 3, descartadas: 0 });
  }, 60000);

  it('una corrida parcial no crea, no actualiza ni descarta', async () => {
    await pool.query("UPDATE cierre_periodo SET estado = 'EN_CIERRE' WHERE periodo_id = ? AND ddriss_id = ?", [
      periodoId,
      ddrissId,
    ]);
    // A pasa a 90 % (verde) y B a 110 %: con la corrida completa, A se descartaría y B cambiaría su mensaje.
    await reporte('ZVT51-B', [[municipios.a.id, 40], [municipios.b.id, 8]]);
    const antes = await alertas();
    const parcial = await calcular();
    expect(parcial.parcial).toBe(true);
    expect(await alertas()).toEqual(antes);
    expect((await bitacoraDeLaCorrida(parcial.id)).alertas).toBeNull();
  }, 60000);

  it('con el mes cerrado otra vez, descarta la que ya no aplica y actualiza el mensaje de la que cambió', async () => {
    await pool.query("UPDATE cierre_periodo SET estado = 'CERRADO' WHERE periodo_id = ? AND ddriss_id = ?", [
      periodoId,
      ddrissId,
    ]);
    const cuarta = await calcular();
    const lista = await alertas();
    expect(lista).toHaveLength(4);
    expect(de(lista, municipios.a, 'EPIDEMIOLOGIA').estado).toBe('ATENDIDA');
    const descartada = de(lista, municipios.a, 'REVISOR');
    expect(descartada.estado).toBe('DESCARTADA');
    for (const rol of ['EPIDEMIOLOGIA', 'REVISOR']) {
      expect(de(lista, municipios.b, rol)).toMatchObject({
        estado: 'ACTIVA', mensaje: mensajeMayorACien(municipios.b, '110.0'), corrida_id: cuarta.id,
      });
    }
    expect((await bitacoraDeLaCorrida(cuarta.id)).alertas).toEqual({ creadas: 0, actualizadas: 2, descartadas: 1 });
    const [descarte] = (await bitacoraDeAlertas([descartada.id], 'ACTUALIZAR')).slice(-1);
    expect(descarte).toMatchObject({
      usuario_id: epidemiologia.id,
      modulo: 'INDICADORES',
      valores_anteriores: { estado: 'ACTIVA' },
      valores_nuevos: { estado: 'DESCARTADA' },
    });
    antesDelFallo = { alertas: lista, vigente: cuarta.id };
  }, 60000);

  it('si la generación falla, la corrida queda FALLIDA y no cambia ninguna alerta', async () => {
    fallo.activo = true;
    let error;
    try {
      await calcular();
    } catch (err) {
      error = err;
    } finally {
      fallo.activo = false;
    }
    expect(error?.message).toBe('vitest-hu51 fallo de las alertas');
    const [[fallida]] = await pool.query('SELECT estado, vigente FROM corrida_calculo WHERE id = ?', [
      error.corridaFallidaId,
    ]);
    expect(fallida).toEqual({ estado: 'FALLIDA', vigente: 0 });
    const [[vigente]] = await pool.query(
      'SELECT id FROM corrida_calculo WHERE ddriss_id = ? AND anio = ? AND mes_hasta = 1 AND vigente = TRUE',
      [ddrissId, ANIO],
    );
    expect(vigente.id).toBe(antesDelFallo.vigente);
    expect(await alertas()).toEqual(antesDelFallo.alertas);
  }, 60000);

  it('GET /alertas como Epidemiología devuelve solo las activas de su rol y su DDRISS', async () => {
    const res = await request(app).get('/api/v1/alertas').set('Authorization', `Bearer ${epidemiologia.token}`);
    expect(res.status).toBe(200);
    const [conteos] = await pool.query(
      `SELECT a.severidad, COUNT(*) AS n FROM alerta a JOIN rol r ON r.id = a.rol_destino_id
        WHERE a.estado = 'ACTIVA' AND r.codigo = 'EPIDEMIOLOGIA' AND a.ddriss_id = ?
        GROUP BY a.severidad`,
      [epidemiologia.ddriss_id],
    );
    const porSeveridad = { CRITICA: 0, ADVERTENCIA: 0, INFO: 0 };
    for (const { severidad, n } of conteos) porSeveridad[severidad] = Number(n);
    expect(res.body.porSeveridad).toEqual(porSeveridad);
    expect(res.body.total).toBe(porSeveridad.CRITICA + porSeveridad.ADVERTENCIA + porSeveridad.INFO);
    // Las de ZVT_HU51 son de otra DDRISS: la B de Epidemiología sigue activa y no se ve.
    const ajena = de(await alertas(), municipios.b, 'EPIDEMIOLOGIA');
    expect(res.body.alertas.some((a) => a.id === ajena.id)).toBe(false);
  });
});
