import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// SPEC 61: la pestaña «Producción» de Indicadores. Todo por SQL: la DDRISS ficticia ZVT_PROD61 con su departamento
// (Z7), los municipios Z701 y Z702 (activos) y Z703 (inactivo), un municipio real de otro departamento para el
// establecimiento externo, establecimientos vitest-spec61-, las vacunas ZVT_SPEC61* y reportes de enero a marzo de
// 2087 (un año que ninguna otra prueba usa). Lo consulta la Autoridad nacional con ddrissId. Se borra al inicio y al
// final.
const ANIO = 2087;
const DDRISS_PRUEBA = 'ZVT_PROD61';
const DEPARTAMENTO_PRUEBA = 'Z7';
const PREFIJO_EST = 'ZVT61-';
const VACUNAS_PRUEBA = ['ZVT_SPEC61', 'ZVT_SPEC61I', 'ZVT_SPEC61N'];

const cuentas = {};
const ids = { municipios: {}, establecimientos: {}, distritos: {}, vacunas: {}, dosis: {}, periodos: {} };
let ddrissId;
let usuarioId;

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
  return {
    id: cuenta.id,
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

const consultar = (ruta, consulta = '', token = cuentas.nacional) =>
  request(app)
    .get(`/api/v1/indicadores/${ruta}${consulta ? `?${consulta}` : ''}`)
    .set('Authorization', `Bearer ${token}`);
const opciones = (consulta = `ddrissId=${ddrissId}`, token) => consultar('produccion/opciones', consulta, token);

async function limpiar() {
  const delEstablecimiento = 'SELECT id FROM establecimiento WHERE codigo LIKE ?';
  const reportes = `SELECT id FROM reporte_produccion WHERE establecimiento_id IN (${delEstablecimiento})`;
  const prefijo = `${PREFIJO_EST}%`;
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
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS_PRUEBA]);
  await pool.query(
    'DELETE m FROM municipio m JOIN departamento d ON d.id = m.departamento_id WHERE d.codigo_ine = ?',
    [DEPARTAMENTO_PRUEBA],
  );
  await pool.query('DELETE FROM departamento WHERE codigo_ine = ?', [DEPARTAMENTO_PRUEBA]);
  await pool.query(
    'DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)',
    [VACUNAS_PRUEBA],
  );
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS_PRUEBA]);
}

async function insertar(sql, valores) {
  const [r] = await pool.query(sql, valores);
  return r.insertId;
}

async function preparar() {
  const departamentoId = await insertar("INSERT INTO departamento (codigo_ine, nombre) VALUES (?, 'vitest-spec61')", [
    DEPARTAMENTO_PRUEBA,
  ]);
  ddrissId = await insertar(
    "INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-spec61', ?, TRUE)",
    [DDRISS_PRUEBA, departamentoId],
  );
  for (const [ine, activo] of [['Z701', true], ['Z702', true], ['Z703', false]]) {
    ids.municipios[ine] = await insertar(
      'INSERT INTO municipio (departamento_id, codigo_ine, nombre, activo) VALUES (?, ?, ?, ?)',
      [departamentoId, ine, `vitest-spec61-${ine}`, activo],
    );
  }
  const [[externo]] = await pool.query(
    `SELECT id, nombre FROM municipio
      WHERE codigo_ine <> '9999' AND activo = TRUE AND codigo_ine NOT LIKE 'Z%' ORDER BY id LIMIT 1`,
  );
  ids.municipios.externo = externo.id;
  ids.nombreExterno = externo.nombre;
  const [[migrantes]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '9999'");
  ids.municipios.migrantes = migrantes.id;

  const distrito =
    'INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre, activo) VALUES (?, ?, ?, ?, ?)';
  ids.distritos.activo = await insertar(distrito, [
    ddrissId, ids.municipios.Z701, 'ZVT61-DS1', 'vitest-spec61 Distrito 1', true,
  ]);
  ids.distritos.inactivo = await insertar(distrito, [
    ddrissId, ids.municipios.Z702, 'ZVT61-DS2', 'vitest-spec61 Distrito 2', false,
  ]);
  ids.red = await insertar("INSERT INTO red (ddriss_id, codigo, nombre) VALUES (?, 'RED_01', 'vitest-spec61 Red')", [
    ddrissId,
  ]);
  await pool.query('INSERT INTO red_municipio (red_id, municipio_id) VALUES (?, ?)', [ids.red, ids.municipios.Z702]);
  const [[redAjena]] = await pool.query('SELECT id FROM red WHERE ddriss_id <> ? ORDER BY id LIMIT 1', [ddrissId]);
  ids.redAjena = redAjena?.id;

  // [clave, municipio, distrito, reporta_5c, solo_cobertura, es_externo, activo]
  const ESTABLECIMIENTOS = [
    ['CS1', 'Z701', 'activo', true, false, false, true],
    ['HOSP', 'Z701', 'activo', true, true, false, true],
    ['PS', 'Z702', 'inactivo', false, false, false, true],
    ['CS2', 'Z702', 'inactivo', true, false, false, true],
    ['INACT', 'Z702', 'inactivo', true, false, false, false],
    ['EXT', 'externo', null, false, false, true, true],
  ];
  for (const [clave, municipio, distrito, reporta5c, soloCobertura, externoEs, activo] of ESTABLECIMIENTOS) {
    ids.establecimientos[clave] = await insertar(
      `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, distrito_salud_id, municipio_id,
         reporta_produccion, reporta_5c, solo_cobertura, es_externo, activo)
       VALUES (?, ?, 1, ?, ?, ?, TRUE, ?, ?, ?, ?)`,
      [
        `${PREFIJO_EST}${clave}`, `vitest-spec61 ${clave}`, ddrissId, distrito ? ids.distritos[distrito] : null,
        ids.municipios[municipio], reporta5c, soloCobertura, externoEs, activo,
      ],
    );
  }

  const VACUNAS = [['ZVT_SPEC61', true, 900], ['ZVT_SPEC61I', false, 1], ['ZVT_SPEC61N', false, 1]];
  for (const [codigo, activa, orden] of VACUNAS) {
    ids.vacunas[codigo] = await insertar(
      'INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, ?, ?, ?)',
      [codigo, `vitest-spec61 ${codigo}`, orden, activa],
    );
  }
  // [vacuna, código, orden, activa]
  const DOSIS = [
    ['ZVT_SPEC61', 'D1', 1, true], ['ZVT_SPEC61', 'D2', 2, true], ['ZVT_SPEC61', 'R1', 3, false],
    ['ZVT_SPEC61', 'R2', 4, false], ['ZVT_SPEC61I', 'D1', 1, true], ['ZVT_SPEC61N', 'D1', 1, true],
  ];
  for (const [vacuna, codigo, orden, activa] of DOSIS) {
    ids.dosis[`${vacuna}.${codigo}`] = await insertar(
      'INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, ?, ?, ?, ?)',
      [ids.vacunas[vacuna], codigo, codigo, orden, activa],
    );
  }

  // Enero y febrero cerrados, marzo en cierre y abril sin cierre_periodo de la DDRISS.
  for (const [mes, estado] of [[1, 'CERRADO'], [2, 'CERRADO'], [3, 'EN_CIERRE'], [4, null]]) {
    const inicio = `${ANIO}-0${mes}-01`;
    ids.periodos[mes] = await insertar(
      'INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, LAST_DAY(?))',
      [ANIO, mes, inicio, inicio],
    );
    if (estado) {
      await pool.query(
        `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
         VALUES (?, ?, '2099-12-31', ?, ?, ?)`,
        estado === 'CERRADO'
          ? [ids.periodos[mes], ddrissId, estado, usuarioId, new Date()]
          : [ids.periodos[mes], ddrissId, estado, null, null],
      );
    }
  }

  // [establecimiento, mes, estado, [[vacuna.dosis, procedencia, cantidad]]]
  const REPORTES = [
    ['CS1', 1, 'CERRADO', [
      ['ZVT_SPEC61.D1', 'Z701', 10], ['ZVT_SPEC61.D1', 'Z702', 4], ['ZVT_SPEC61.D2', 'Z701', 6],
      ['ZVT_SPEC61.R1', 'migrantes', 2], ['ZVT_SPEC61I.D1', 'Z701', 1],
    ]],
    ['CS1', 2, 'APROBADO', [['ZVT_SPEC61.D1', 'Z701', 5]]],
    ['CS1', 3, 'BORRADOR', [['ZVT_SPEC61.D1', 'Z701', 100]]],
    ['HOSP', 1, 'CERRADO', [['ZVT_SPEC61.D1', 'Z701', 20], ['ZVT_SPEC61.D1', 'Z702', 3]]],
    ['INACT', 2, 'CERRADO', [['ZVT_SPEC61.D1', 'Z702', 7]]],
    ['EXT', 3, 'RECTIFICACION', [['ZVT_SPEC61.D2', 'externo', 8]]],
    ['CS2', 3, 'ENVIADO', [['ZVT_SPEC61.D1', 'Z702', 50]]],
  ];
  for (const [establecimiento, mes, estado, celdas] of REPORTES) {
    const reporteId = await insertar(
      'INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por) VALUES (?, ?, ?, ?)',
      [ids.establecimientos[establecimiento], ids.periodos[mes], estado, usuarioId],
    );
    const porVacuna = new Map();
    for (const [llave, procedencia, cantidad] of celdas) {
      const vacuna = llave.split('.')[0];
      if (!porVacuna.has(vacuna)) {
        porVacuna.set(vacuna, await insertar(
          `INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version)
           VALUES (?, ?, '000000000000000000000000', 1)`,
          [reporteId, ids.vacunas[vacuna]],
        ));
      }
      await pool.query(
        `INSERT INTO detalle_produccion
           (reporte_vacuna_id, dosis_id, municipio_procedencia_id, cantidad, actualizado_por)
         VALUES (?, ?, ?, ?, ?)`,
        [porVacuna.get(vacuna), ids.dosis[llave], ids.municipios[procedencia], cantidad, usuarioId],
      );
    }
  }
}

beforeAll(async () => {
  cuentas.nacional = (await tokenDe('autoridad.nacional')).token;
  const epidemiologia = await tokenDe('epidemiologia');
  cuentas.epidemiologia = epidemiologia.token;
  usuarioId = epidemiologia.id;
  cuentas.establecimiento = (await tokenDe('cs1201')).token;
  await limpiar();
  await preparar();
}, 60000);

afterAll(limpiar, 60000);

describe('GET /indicadores/produccion/opciones (SPEC 61)', () => {
  it('trae los meses de la DDRISS, del más reciente al más antiguo, sin los no habilitados', async () => {
    const res = await opciones();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meses).toEqual([
      { anio: ANIO, mes: 3, estado: 'EN_CIERRE' },
      { anio: ANIO, mes: 2, estado: 'CERRADO' },
      { anio: ANIO, mes: 1, estado: 'CERRADO' },
    ]);
  });

  it('los municipios son los activos del departamento más los de aplicación con producción', async () => {
    const res = await opciones();
    expect(res.body.municipios).toEqual(
      [
        { id: ids.municipios.externo, nombre: ids.nombreExterno },
        { id: ids.municipios.Z701, nombre: 'vitest-spec61-Z701' },
        { id: ids.municipios.Z702, nombre: 'vitest-spec61-Z702' },
      ].map((m) => expect.objectContaining(m)),
    );
    expect(res.body.municipios.find((m) => m.id === ids.municipios.Z701).codigoIne).toBe('Z701');
  });

  it('los establecimientos son los activos con 5C o solo cobertura más los que produjeron', async () => {
    const res = await opciones();
    const porCodigo = Object.fromEntries(res.body.establecimientos.map((e) => [e.codigo, e]));
    expect(Object.keys(porCodigo).sort()).toEqual(
      ['CS1', 'CS2', 'EXT', 'HOSP', 'INACT'].map((c) => `${PREFIJO_EST}${c}`),
    );
    expect(porCodigo[`${PREFIJO_EST}HOSP`]).toEqual({
      id: ids.establecimientos.HOSP,
      codigo: `${PREFIJO_EST}HOSP`,
      nombre: 'vitest-spec61 HOSP',
      municipioId: ids.municipios.Z701,
      fueraDelConsolidado: true,
      activo: true,
    });
    expect(porCodigo[`${PREFIJO_EST}INACT`].activo).toBe(false);
    expect(porCodigo[`${PREFIJO_EST}CS1`].fueraDelConsolidado).toBe(false);
  });

  it('los distritos son solo los activos de la DDRISS', async () => {
    const res = await opciones();
    expect(res.body.distritos).toEqual([
      { id: ids.distritos.activo, nombre: 'vitest-spec61 Distrito 1', municipioId: ids.municipios.Z701 },
    ]);
  });

  it('las vacunas y sus dosis son las activas más las inactivas con producción', async () => {
    const res = await opciones();
    const codigos = res.body.vacunas.map((v) => v.codigo);
    expect(codigos).toContain('ZVT_SPEC61');
    expect(codigos).not.toContain('ZVT_SPEC61N');
    expect(codigos.at(-1)).toBe('ZVT_SPEC61I');
    expect(res.body.vacunas.filter((v) => !v.activa).map((v) => v.codigo)).toEqual(['ZVT_SPEC61I']);
    expect(res.body.vacunas.find((v) => v.codigo === 'ZVT_SPEC61')).toEqual({
      codigo: 'ZVT_SPEC61',
      nombre: 'vitest-spec61 ZVT_SPEC61',
      activa: true,
      dosis: [
        { id: ids.dosis['ZVT_SPEC61.D1'], codigo: 'D1', activa: true },
        { id: ids.dosis['ZVT_SPEC61.D2'], codigo: 'D2', activa: true },
        { id: ids.dosis['ZVT_SPEC61.R1'], codigo: 'R1', activa: false },
      ],
    });
  });

  it('la Autoridad nacional debe mandar ddrissId', async () => {
    const res = await opciones('');
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('un rol con DDRISS consulta la suya y no puede mandar ddrissId', async () => {
    const propia = await opciones('', cuentas.epidemiologia);
    expect(propia.status, JSON.stringify(propia.body)).toBe(200);
    expect(propia.body.establecimientos.some((e) => e.codigo.startsWith(PREFIJO_EST))).toBe(false);
    const ajena = await opciones(`ddrissId=${ddrissId}`, cuentas.epidemiologia);
    expect(ajena.status).toBe(400);
  });

  it('un parámetro desconocido responde 400', async () => {
    const res = await opciones(`ddrissId=${ddrissId}&anio=${ANIO}`);
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('Parámetro no permitido: anio.');
  });

  it('sin INDICADOR_CONSULTAR responde 403', async () => {
    const res = await opciones('', cuentas.establecimiento);
    expect(res.status).toBe(403);
  });
});

describe('GET /indicadores/produccion (SPEC 61)', () => {
  const produccion = (consulta, token) =>
    consultar('produccion', `ddrissId=${ddrissId}&anio=${ANIO}&${consulta}`, token);
  const nombres = (cuerpo) => cuerpo.filas.map((f) => (f.establecimiento ?? f.municipio).nombre);
  const cantidades = (f) => [f.dosisPoblacionPropia, f.dosisOtrosMunicipios, f.dosisTotal];
  const porDosis = (f) => f.porDosis.map((d) => d.dosisTotal);

  it('por establecimiento, acumulado a marzo, con columnas por dosis y el hospital fuera del consolidado', async () => {
    const res = await produccion('mes=3&agrupar=establecimiento&vacuna=ZVT_SPEC61');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.vacuna).toEqual({
      codigo: 'ZVT_SPEC61',
      nombre: 'vitest-spec61 ZVT_SPEC61',
      dosis: [
        { id: ids.dosis['ZVT_SPEC61.D1'], codigo: 'D1', activa: true },
        { id: ids.dosis['ZVT_SPEC61.D2'], codigo: 'D2', activa: true },
        { id: ids.dosis['ZVT_SPEC61.R1'], codigo: 'R1', activa: false },
      ],
    });
    // Por municipio (el externo primero) y luego por nombre; CS2 va en ceros y el BORRADOR y el ENVIADO no cuentan.
    expect(nombres(res.body)).toEqual(['EXT', 'CS1', 'HOSP', 'CS2', 'INACT'].map((c) => `vitest-spec61 ${c}`));
    const [ext, cs1, hosp, cs2, inact] = res.body.filas;
    expect([cantidades(ext), porDosis(ext)]).toEqual([[8, 0, 8], [0, 8, 0]]);
    expect([cantidades(cs1), porDosis(cs1)]).toEqual([[21, 6, 27], [19, 6, 2]]);
    expect([cantidades(hosp), porDosis(hosp), hosp.fueraDelConsolidado]).toEqual([[20, 3, 23], [23, 0, 0], true]);
    expect([cantidades(cs2), porDosis(cs2)]).toEqual([[0, 0, 0], [0, 0, 0]]);
    expect(cantidades(inact)).toEqual([7, 0, 7]);
    expect(cs1.municipio).toEqual({ id: ids.municipios.Z701, codigoIne: 'Z701', nombre: 'vitest-spec61-Z701' });
    expect(cs1.establecimiento).toEqual({
      id: ids.establecimientos.CS1, codigo: `${PREFIJO_EST}CS1`, nombre: 'vitest-spec61 CS1',
    });
    expect([cantidades(res.body.total), porDosis(res.body.total)]).toEqual([[36, 6, 42], [26, 14, 2]]);
    expect(res.body.dosisFueraDelConsolidado).toBe(23);
    expect(res.body.preliminar).toBe(true);
    expect(res.body.mesesSinCerrar).toEqual([{ anio: ANIO, mes: 3, estado: 'EN_CIERRE' }]);
  });

  it('el total coincide con v_consolidado_establecimiento', async () => {
    const res = await produccion('mes=3&vacuna=ZVT_SPEC61');
    const [[vista]] = await pool.query(
      `SELECT SUM(dosis_poblacion_propia) AS propia, SUM(dosis_otros_municipios) AS otros, SUM(dosis_total) AS total
         FROM v_consolidado_establecimiento WHERE ddriss_id = ? AND anio = ? AND mes <= 3 AND vacuna_id = ?`,
      [ddrissId, ANIO, ids.vacunas.ZVT_SPEC61],
    );
    expect(cantidades(res.body.total)).toEqual([vista.propia, vista.otros, vista.total].map(Number));
  });

  it('por municipio de aplicación, el hospital no se suma a su municipio', async () => {
    const res = await produccion('mes=3&vacuna=ZVT_SPEC61');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.agrupar).toBe('municipio');
    expect(res.body.filas.map((f) => [f.municipio.nombre, f.establecimiento, f.fueraDelConsolidado])).toEqual([
      [ids.nombreExterno, null, false], ['vitest-spec61-Z701', null, false], ['vitest-spec61-Z702', null, false],
    ]);
    expect(res.body.filas.map(cantidades)).toEqual([[8, 0, 8], [21, 6, 27], [7, 0, 7]]);
    expect(cantidades(res.body.total)).toEqual([36, 6, 42]);
    expect(res.body.dosisFueraDelConsolidado).toBe(23);
  });

  it('solo el mes cuenta el mes de corte, y un rango cerrado no es preliminar', async () => {
    const marzo = await produccion('mes=3&acumulado=false&vacuna=ZVT_SPEC61');
    expect([marzo.body.acumulado, marzo.body.total.dosisTotal, marzo.body.dosisFueraDelConsolidado]).toEqual([
      false, 8, 0,
    ]);
    const febrero = await produccion('mes=2&vacuna=ZVT_SPEC61');
    expect([febrero.body.total.dosisTotal, febrero.body.preliminar, febrero.body.mesesSinCerrar]).toEqual([
      34, false, [],
    ]);
    const soloFebrero = await produccion('mes=2&acumulado=false&vacuna=ZVT_SPEC61');
    expect(soloFebrero.body.total.dosisTotal).toBe(12);
  });

  it('con todas las vacunas no hay columnas de dosis y suma todas', async () => {
    const res = await produccion('mes=1&acumulado=false');
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.vacuna).toBeNull();
    const z701 = res.body.filas.find((f) => f.municipio.id === ids.municipios.Z701);
    expect([cantidades(z701), z701.porDosis]).toEqual([[17, 6, 23], []]);
    expect(res.body.total.porDosis).toEqual([]);
  });

  it('el distrito y la red recortan a sus municipios', async () => {
    const distrito = await produccion(`mes=3&agrupar=establecimiento&distritoId=${ids.distritos.activo}`);
    expect(nombres(distrito.body)).toEqual(['vitest-spec61 CS1', 'vitest-spec61 HOSP']);
    expect([distrito.body.total.dosisTotal, distrito.body.dosisFueraDelConsolidado]).toEqual([28, 23]);
    const red = await produccion(`mes=3&agrupar=establecimiento&redId=${ids.red}`);
    expect(nombres(red.body)).toEqual(['vitest-spec61 CS2', 'vitest-spec61 INACT']);
    expect([red.body.total.dosisTotal, red.body.dosisFueraDelConsolidado]).toEqual([7, 0]);
  });

  it('los municipios y establecimientos elegidos recortan las filas', async () => {
    const municipios = `${ids.municipios.Z701},${ids.municipios.Z702}`;
    const res = await produccion(
      `mes=3&vacuna=ZVT_SPEC61&municipioIds=${municipios}&establecimientoIds=${ids.establecimientos.CS1}`,
    );
    expect(res.body.filas.map((f) => [f.municipio.nombre, f.dosisTotal])).toEqual([['vitest-spec61-Z701', 27]]);
    expect([res.body.total.dosisTotal, res.body.dosisFueraDelConsolidado]).toEqual([27, 0]);
  });

  it.each([
    ['vienen el distrito y la red', () => `mes=3&distritoId=${ids.distritos.activo}&redId=${ids.red}`],
    ['una lista repite un id', () => `mes=3&municipioIds=${ids.municipios.Z701},${ids.municipios.Z701}`],
    ['agrupar no es válido', () => 'mes=3&agrupar=distrito'],
    ['acumulado no es booleano', () => 'mes=3&acumulado=si'],
    ['falta el mes', () => ''],
  ])('responde 400 si %s', async (_caso, consulta) => {
    const res = await produccion(consulta());
    expect(res.status, JSON.stringify(res.body)).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it.each([
    ['el mes de corte no está habilitado', () => 'mes=4'],
    ['la vacuna no existe', () => 'mes=3&vacuna=ZVT_NO_EXISTE'],
    ['el distrito está inactivo', () => `mes=3&distritoId=${ids.distritos.inactivo}`],
    ['la red es de otra DDRISS', () => `mes=3&redId=${ids.redAjena}`],
  ])('responde 404 si %s', async (_caso, consulta) => {
    const res = await produccion(consulta());
    expect(res.status, JSON.stringify(res.body)).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('sin INDICADOR_CONSULTAR responde 403', async () => {
    const res = await consultar('produccion', `anio=${ANIO}&mes=3`, cuentas.establecimiento);
    expect(res.status).toBe(403);
  });
});
