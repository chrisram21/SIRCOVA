import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { generarAlertas, TITULOS } from '../src/modulos/alertas/generacion.service.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Todo por SQL: enero y febrero de 1998 abiertos solo en la DDRISS ficticia ZVT_HU50, con establecimientos ZVT50-*
// copiados de CS-1201 (así no cambian los conteos de la DDRISS 1 que usan otras pruebas). generarAlertas recorre toda
// la base, pero con hoy y ahora en 1998 solo alcanza estos meses y reportes. Los casos van en orden y cada uno parte
// de lo que dejó el anterior. Otras pruebas (y un backend encendido) pasan a EN_CIERRE los meses ABIERTO vencidos:
// los casos que necesitan enero ABIERTO lo vuelven a abrir justo antes de correr. Todo se borra al inicio y al final;
// las filas de la bitácora quedan.
const ANIO = 1998;
const DDRISS = 'ZVT_HU50';
const LIMITE_ENERO = '1998-02-10';
const LIMITE_FEBRERO = '1998-03-10';
const UNA_HORA = 60 * 60 * 1000;
const UN_DIA = 24 * UNA_HORA;
const periodoIds = {};
const est = {};
const reportes = {};
let ddrissId;
let roles;

const segundos = (fecha) => Math.floor(fecha.getTime() / 1000);

async function limpiar() {
  await pool.query(
    `DELETE a FROM alerta a JOIN ddriss d ON d.id = a.ddriss_id WHERE d.codigo = ?`,
    [DDRISS],
  );
  await pool.query(
    `DELETE r FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ?`,
    [ANIO],
  );
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query("DELETE FROM establecimiento WHERE codigo LIKE 'ZVT50-%'");
  await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS]);
}

async function crearEstablecimiento(codigo, { activo = true, reporta5c = true } = {}) {
  const [creado] = await pool.query(
    `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, distrito_salud_id, municipio_id,
                                  reporta_5c, activo)
     SELECT ?, ?, tipo_establecimiento_id, ?, NULL, municipio_id, ?, ?
       FROM establecimiento WHERE codigo = 'CS-1201'`,
    [codigo, `vitest-hu50 ${codigo}`, ddrissId, reporta5c, activo],
  );
  est[codigo] = creado.insertId;
}

async function crearReporte(clave, codigo, mes, estado, enviadoEn = null) {
  const [creado] = await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en)
     VALUES (?, ?, ?, 1, FROM_UNIXTIME(?))`,
    [est[codigo], periodoIds[mes], estado, enviadoEn == null ? null : segundos(enviadoEn)],
  );
  reportes[clave] = creado.insertId;
}

async function enviar(clave, enviadoEn) {
  await pool.query("UPDATE reporte_produccion SET estado = 'ENVIADO', enviado_en = FROM_UNIXTIME(?) WHERE id = ?", [
    segundos(enviadoEn),
    reportes[clave],
  ]);
}

async function abrirEnero() {
  await pool.query("UPDATE cierre_periodo SET estado = 'ABIERTO' WHERE periodo_id = ? AND ddriss_id = ?", [
    periodoIds[1],
    ddrissId,
  ]);
}

const correr = (hoy, ahora = new Date(`${hoy}T18:00:00.000Z`)) => generarAlertas({ hoy, ahora });

async function alertas(condicion = 'TRUE', valores = []) {
  const [filas] = await pool.query(
    `SELECT a.id, a.tipo, a.severidad, a.titulo, a.mensaje, a.ddriss_id, a.periodo_id, a.municipio_id,
            a.establecimiento_id, a.reporte_id, a.estado, a.atendida_por, a.atendida_en, r.codigo AS rol
       FROM alerta a JOIN rol r ON r.id = a.rol_destino_id
      WHERE a.ddriss_id = ? AND ${condicion}
      ORDER BY a.id`,
    [ddrissId, ...valores],
  );
  return filas;
}

const activas = (condicion = 'TRUE', valores = []) => alertas(`a.estado = 'ACTIVA' AND ${condicion}`, valores);

describe('generarAlertas', () => {
  beforeAll(async () => {
    await limpiar();
    const [ddriss] = await pool.query(
      `INSERT INTO ddriss (codigo, nombre, departamento_id, activo)
       SELECT ?, 'vitest-hu50', departamento_id, TRUE FROM ddriss WHERE id = 1`,
      [DDRISS],
    );
    ddrissId = ddriss.insertId;
    const [filasRol] = await pool.query("SELECT id, codigo FROM rol WHERE codigo IN ('REVISOR', 'ESTABLECIMIENTO')");
    roles = Object.fromEntries(filasRol.map((f) => [f.codigo, f.id]));

    for (const [mes, limite] of [[1, LIMITE_ENERO], [2, LIMITE_FEBRERO]]) {
      const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
      const [periodo] = await pool.query(
        'INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
        [ANIO, mes, `${ANIO}-0${mes}-01`, `${ANIO}-0${mes}-${fin}`],
      );
      periodoIds[mes] = periodo.insertId;
      await pool.query(
        "INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, ?, ?, 'ABIERTO')",
        [periodo.insertId, ddrissId, limite],
      );
    }

    // A sin reporte, B con un borrador nunca enviado, C devuelto (ya se envió), D aprobado; INACT y NO5C no cuentan.
    for (const codigo of ['ZVT50-A', 'ZVT50-B', 'ZVT50-C', 'ZVT50-D']) await crearEstablecimiento(codigo);
    await crearEstablecimiento('ZVT50-INACT', { activo: false });
    await crearEstablecimiento('ZVT50-NO5C', { reporta5c: false });
    const enviadoEnero = new Date('1998-02-03T16:00:00.000Z');
    await crearReporte('B1', 'ZVT50-B', 1, 'BORRADOR');
    await crearReporte('C1', 'ZVT50-C', 1, 'CORRECCION_SOLICITADA', enviadoEnero);
    await crearReporte('D1', 'ZVT50-D', 1, 'APROBADO', enviadoEnero);
    // En febrero solo cuentan los de «sin revisar»: sus envíos son posteriores a todos los «ahora» de enero.
    await crearReporte('D2', 'ZVT50-D', 2, 'ENVIADO', new Date('1998-02-26T11:00:00.000Z'));
    await crearReporte('C2', 'ZVT50-C', 2, 'ENVIADO', new Date('1998-02-28T00:00:00.000Z'));
  }, 120000);

  afterAll(limpiar, 60000);

  it('4 días antes de la fecha límite no crea ninguna alerta', async () => {
    await abrirEnero();
    await correr('1998-02-06');

    expect(await alertas()).toEqual([]);
  });

  it('3 días antes avisa al Revisor y a cada obligado sin enviar, con el borrador nunca enviado', async () => {
    await abrirEnero();
    await correr('1998-02-07');

    const filas = await activas();
    expect(filas.map((a) => [a.rol, a.establecimiento_id, a.reporte_id])).toEqual([
      ['REVISOR', null, null],
      ['ESTABLECIMIENTO', est['ZVT50-A'], null],
      ['ESTABLECIMIENTO', est['ZVT50-B'], reportes.B1],
    ]);
    expect(filas.every((a) => a.tipo === 'REPORTE_PENDIENTE' && a.severidad === 'INFO')).toBe(true);
    expect(filas.every((a) => a.titulo === TITULOS.FECHA_PROXIMA && a.periodo_id === periodoIds[1])).toBe(true);
    expect(filas[0].mensaje).toBe('Enero de 1998 vence el 10/02/1998; faltan 2 reportes por enviar.');
    expect(filas[0].municipio_id).toBeNull();
    expect(filas[1].mensaje).toBe('El reporte de enero de 1998 vence el 10/02/1998 y todavía no se ha enviado.');
    expect(filas[1].municipio_id).not.toBeNull();
  });

  it('correr otra vez no duplica nada', async () => {
    await abrirEnero();
    const antes = await alertas();
    await correr('1998-02-08');

    expect(await alertas()).toEqual(antes);
  });

  it('cada alerta creada deja su CREAR en la bitácora, sin usuario', async () => {
    const ids = (await alertas()).map((a) => String(a.id));
    const [filas] = await pool.query(
      `SELECT entidad_id, usuario_id, modulo FROM bitacora
        WHERE entidad = 'alerta' AND accion = 'CREAR' AND entidad_id IN (?)`,
      [ids],
    );

    expect(filas.map((f) => f.entidad_id).sort()).toEqual([...ids].sort());
    expect(filas.every((f) => f.usuario_id === null && f.modulo === 'REVISION')).toBe(true);
  });

  it('al vencer descarta las de fecha próxima y crea las críticas del Revisor y del establecimiento', async () => {
    const proximas = (await activas()).map((a) => a.id);
    await correr('1998-02-11');

    const descartadas = await alertas('a.id IN (?)', [proximas]);
    expect(descartadas.every((a) => a.estado === 'DESCARTADA' && a.atendida_por === null && a.atendida_en === null))
      .toBe(true);
    const criticas = await activas();
    expect(criticas.map((a) => [a.rol, a.establecimiento_id]).sort()).toEqual(
      [
        ['REVISOR', est['ZVT50-A']],
        ['ESTABLECIMIENTO', est['ZVT50-A']],
        ['REVISOR', est['ZVT50-B']],
        ['ESTABLECIMIENTO', est['ZVT50-B']],
      ].sort(),
    );
    expect(criticas.every((a) => a.titulo === TITULOS.SIN_ENVIAR && a.severidad === 'CRITICA')).toBe(true);
    expect(criticas.find((a) => a.establecimiento_id === est['ZVT50-A']).mensaje).toBe(
      'ZVT50-A vitest-hu50 ZVT50-A no envió el reporte de enero de 1998; la fecha límite fue el 10/02/1998.',
    );

    const [bitacora] = await pool.query(
      `SELECT entidad_id, usuario_id, valores_anteriores, valores_nuevos FROM bitacora
        WHERE entidad = 'alerta' AND accion = 'ACTUALIZAR' AND entidad_id IN (?)`,
      [proximas.map(String)],
    );
    expect(bitacora).toHaveLength(proximas.length);
    expect(bitacora.every((f) => f.usuario_id === null)).toBe(true);
    expect(bitacora[0].valores_anteriores).toEqual({ estado: 'ACTIVA' });
    expect(bitacora[0].valores_nuevos).toEqual({ estado: 'DESCARTADA' });
  });

  it('ni un establecimiento inactivo ni uno sin reporta_5c generan alertas', async () => {
    expect(await alertas('a.establecimiento_id IN (?)', [[est['ZVT50-INACT'], est['ZVT50-NO5C']]])).toEqual([]);
  });

  it('cuando el establecimiento envía, se descartan sus dos alertas de reporte sin enviar', async () => {
    await enviar('B1', new Date('1998-02-12T15:00:00.000Z'));
    await correr('1998-02-12');

    expect(await activas('a.establecimiento_id = ?', [est['ZVT50-B']])).toEqual([]);
    expect(await activas('a.establecimiento_id = ?', [est['ZVT50-A']])).toHaveLength(2);
  });

  it('una alerta atendida no se vuelve a crear', async () => {
    await pool.query(
      `UPDATE alerta SET estado = 'ATENDIDA', atendida_por = 1, atendida_en = NOW()
        WHERE ddriss_id = ? AND establecimiento_id = ? AND rol_destino_id = ? AND estado = 'ACTIVA'`,
      [ddrissId, est['ZVT50-A'], roles.REVISOR],
    );
    await correr('1998-02-13');

    expect((await alertas('a.titulo = ? AND a.establecimiento_id = ?', [TITULOS.SIN_ENVIAR, est['ZVT50-A']]))
      .map((a) => [a.rol, a.estado]).sort()).toEqual([['ESTABLECIMIENTO', 'ACTIVA'], ['REVISOR', 'ATENDIDA']]);
  });

  it('al cerrar el mes se descartan las que siguen activas', async () => {
    await pool.query(
      `UPDATE cierre_periodo SET estado = 'CERRADO', cerrado_por = 1, cerrado_en = NOW()
        WHERE periodo_id = ? AND ddriss_id = ?`,
      [periodoIds[1], ddrissId],
    );
    await correr('1998-02-14');

    expect(await activas('a.periodo_id = ?', [periodoIds[1]])).toEqual([]);
  });

  it('un reporte ENVIADO hace más de 3 días genera «sin revisar» y uno de 2 días no', async () => {
    // D2 lleva 3 días y 1 h; C2, 2 días y 12 h. Febrero sigue fuera de su ventana de fecha límite.
    await correr('1998-03-01', new Date('1998-03-01T12:00:00.000Z'));

    const filas = await activas('a.periodo_id = ?', [periodoIds[2]]);
    expect(filas.map((a) => [a.rol, a.reporte_id])).toEqual([['REVISOR', reportes.D2]]);
    expect(filas[0]).toMatchObject({
      tipo: 'PROCESO',
      severidad: 'ADVERTENCIA',
      titulo: TITULOS.SIN_REVISAR,
      establecimiento_id: est['ZVT50-D'],
      mensaje:
        'El reporte de febrero de 1998 de ZVT50-D vitest-hu50 ZVT50-D lleva 3 días enviado sin que nadie lo tome.',
    });
  });

  it('tomado en revisión se descarta, y reenviado y otra vez 3 días en ENVIADO genera una nueva', async () => {
    const [primera] = await activas('a.reporte_id = ?', [reportes.D2]);
    await pool.query("UPDATE reporte_produccion SET estado = 'EN_REVISION' WHERE id = ?", [reportes.D2]);
    await correr('1998-03-02', new Date('1998-03-02T12:00:00.000Z'));
    expect((await alertas('a.id = ?', [primera.id]))[0].estado).toBe('DESCARTADA');

    const reenvio = new Date('1998-03-04T08:00:00.000Z');
    await enviar('D2', reenvio);
    await correr('1998-03-07', new Date(reenvio.getTime() + 3 * UN_DIA + UNA_HORA));
    await correr('1998-03-07', new Date(reenvio.getTime() + 3 * UN_DIA + 2 * UNA_HORA));

    const filas = await alertas('a.reporte_id = ?', [reportes.D2]);
    expect(filas.map((a) => a.estado)).toEqual(['DESCARTADA', 'ACTIVA']);
  });
});

// Las cuentas de la semilla son de la DDRISS 1, donde ya hay alertas reales: las de prueba van por SQL con el título
// «vitest-hu50 …» y los totales se comparan con la base. ZVT_HU50B es otra DDRISS solo para el ámbito.
describe('GET /alertas', () => {
  const PREFIJO = 'vitest-hu50';
  const DDRISS_OTRA = 'ZVT_HU50B';
  const ids = {};
  let estadigrafa;
  let personal;
  let sinPermiso;

  async function tokenDe(nombreUsuario) {
    const [[cuenta]] = await pool.query(
      `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
         FROM usuario u
         JOIN rol r ON r.id = u.rol_id
         JOIN empleado e ON e.id = u.empleado_id
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
        rol: cuenta.rol,
        permisos: permisos.map((p) => p.codigo),
        ddrissId: cuenta.ddriss_id,
        establecimientoId: cuenta.establecimiento_id,
        municipioId: cuenta.municipio_id,
      },
      { expiresIn: '10m' },
    );
    return { token, ...cuenta };
  }

  async function limpiarEndpoint() {
    await pool.query('DELETE FROM alerta WHERE titulo LIKE ?', [`${PREFIJO}%`]);
    await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS_OTRA]);
  }

  async function insertar(clave, datos) {
    const { rol, severidad = 'ADVERTENCIA', estado = 'ACTIVA', ddriss = 1, establecimiento = null, generada } = datos;
    const [creada] = await pool.query(
      `INSERT INTO alerta (tipo, severidad, titulo, mensaje, ddriss_id, establecimiento_id, rol_destino_id, estado,
                           generada_en)
       SELECT 'PROCESO', ?, ?, 'Mensaje de prueba.', ?, ?, id, ?, FROM_UNIXTIME(?) FROM rol WHERE codigo = ?`,
      [severidad, `${PREFIJO} ${clave}`, ddriss, establecimiento, estado, segundos(generada), rol],
    );
    ids[clave] = creada.insertId;
  }

  // Lo que la API debería contar para una cuenta, leído de la base con el mismo filtro.
  async function activasEnLaBase(rol, condicion, valores) {
    const [filas] = await pool.query(
      `SELECT a.severidad, COUNT(*) AS n FROM alerta a JOIN rol r ON r.id = a.rol_destino_id
        WHERE a.estado = 'ACTIVA' AND r.codigo = ? AND ${condicion} GROUP BY a.severidad`,
      [rol, ...valores],
    );
    const porSeveridad = { CRITICA: 0, ADVERTENCIA: 0, INFO: 0 };
    for (const f of filas) porSeveridad[f.severidad] = Number(f.n);
    return porSeveridad;
  }

  const listar = (credencial, consulta = {}) =>
    request(app).get('/api/v1/alertas').query(consulta).set('Authorization', `Bearer ${credencial.token}`);

  beforeAll(async () => {
    await limpiarEndpoint();
    // El 403 se prueba con una cuenta de un rol sin ALERTA_CONSULTAR, buscada por SQL (nota del backend, SPEC 61).
    const [[cuentaSinPermiso]] = await pool.query(
      `SELECT u.nombre_usuario
         FROM usuario u
         JOIN empleado e ON e.id = u.empleado_id
        WHERE u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
          AND NOT EXISTS (SELECT 1 FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id
                           WHERE rp.rol_id = u.rol_id AND p.codigo = 'ALERTA_CONSULTAR')
        ORDER BY u.id
        LIMIT 1`,
    );
    [estadigrafa, personal, sinPermiso] = await Promise.all(
      ['estadigrafa', 'cs1201', cuentaSinPermiso.nombre_usuario].map(tokenDe),
    );
    const [[otroEstablecimiento]] = await pool.query("SELECT id FROM establecimiento WHERE codigo = 'CS-1202'");
    const [otra] = await pool.query(
      `INSERT INTO ddriss (codigo, nombre, departamento_id, activo)
       SELECT ?, 'vitest-hu50', departamento_id, TRUE FROM ddriss WHERE id = 1`,
      [DDRISS_OTRA],
    );

    const reciente = new Date('2099-06-01T12:00:00.000Z');
    const antes = new Date('2099-05-01T12:00:00.000Z');
    const propio = personal.establecimiento_id;
    await insertar('revisor-critica', { rol: 'REVISOR', severidad: 'CRITICA', generada: reciente });
    await insertar('revisor-info', { rol: 'REVISOR', severidad: 'INFO', generada: reciente });
    await insertar('revisor-advertencia-antigua', { rol: 'REVISOR', generada: antes });
    await insertar('revisor-advertencia-reciente', { rol: 'REVISOR', generada: reciente });
    await insertar('revisor-atendida', { rol: 'REVISOR', estado: 'ATENDIDA', generada: reciente });
    await insertar('revisor-descartada', { rol: 'REVISOR', estado: 'DESCARTADA', generada: reciente });
    await insertar('revisor-otra-ddriss', { rol: 'REVISOR', ddriss: otra.insertId, generada: reciente });
    await insertar('admin', { rol: 'ADMINISTRADOR', generada: reciente });
    await insertar('personal-propio', { rol: 'ESTABLECIMIENTO', establecimiento: propio, generada: reciente });
    await insertar('personal-otro', {
      rol: 'ESTABLECIMIENTO',
      establecimiento: otroEstablecimiento.id,
      generada: reciente,
    });
  }, 60000);

  afterAll(limpiarEndpoint, 60000);

  it('el Revisor ve las activas de su DDRISS y su rol, por severidad y de la más nueva a la más vieja', async () => {
    const res = await listar(estadigrafa);

    expect(res.status).toBe(200);
    // La DDRISS 1 puede tener más de 50 activas: la INFO de la prueba puede quedar fuera del corte.
    const deLaPrueba = res.body.alertas.filter((a) => a.titulo.startsWith(PREFIJO)).map((a) => a.id);
    const esperadas = [
      ids['revisor-critica'],
      ids['revisor-advertencia-reciente'],
      ids['revisor-advertencia-antigua'],
      ids['revisor-info'],
    ];
    expect(deLaPrueba.length).toBeGreaterThanOrEqual(1);
    expect(deLaPrueba).toEqual(esperadas.slice(0, deLaPrueba.length));
    const rango = { CRITICA: 0, ADVERTENCIA: 1, INFO: 2 };
    const orden = res.body.alertas.map((a) => [rango[a.severidad], -Date.parse(a.generadaEn)]);
    expect(orden).toEqual([...orden].sort((x, y) => x[0] - y[0] || x[1] - y[1]));

    const porSeveridad = await activasEnLaBase('REVISOR', 'a.ddriss_id = ?', [estadigrafa.ddriss_id]);
    const total = porSeveridad.CRITICA + porSeveridad.ADVERTENCIA + porSeveridad.INFO;
    expect(res.body.porSeveridad).toEqual(porSeveridad);
    expect(res.body.total).toBe(total);
    expect(res.body.alertas).toHaveLength(Math.min(total, 50));
  });

  it('cada alerta trae sus campos, con periodo y establecimiento en null si no los tiene', async () => {
    const res = await listar(estadigrafa);

    expect(res.body.alertas.find((a) => a.id === ids['revisor-critica'])).toEqual({
      id: ids['revisor-critica'],
      tipo: 'PROCESO',
      severidad: 'CRITICA',
      titulo: `${PREFIJO} revisor-critica`,
      mensaje: 'Mensaje de prueba.',
      generadaEn: '2099-06-01T12:00:00.000Z',
      periodo: null,
      establecimiento: null,
      reporteId: null,
    });
  });

  it('el Personal del establecimiento ve solo las de su establecimiento', async () => {
    const res = await listar(personal);

    expect(res.status).toBe(200);
    expect(res.body.alertas.filter((a) => a.titulo.startsWith(PREFIJO)).map((a) => a.id)).toEqual([
      ids['personal-propio'],
    ]);
    expect(res.body.alertas.every((a) => a.establecimiento?.id === personal.establecimiento_id)).toBe(true);
    const porSeveridad = await activasEnLaBase('ESTABLECIMIENTO', 'a.establecimiento_id = ?', [
      personal.establecimiento_id,
    ]);
    expect(res.body.porSeveridad).toEqual(porSeveridad);
  });

  it('responde 400 con un parámetro, 401 sin sesión y 403 sin ALERTA_CONSULTAR', async () => {
    const conParametro = await listar(estadigrafa, { estado: 'ACTIVA' });
    expect(conParametro.status).toBe(400);
    expect(conParametro.body.error).toEqual({
      codigo: 'ENTRADA_INVALIDA',
      mensaje: 'Parámetro no permitido: estado.',
    });

    expect((await request(app).get('/api/v1/alertas')).status).toBe(401);

    expect((await listar(sinPermiso)).status).toBe(403);
  });
});
