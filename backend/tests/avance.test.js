import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Crean por SQL los meses de 2002: enero ABIERTO en la DDRISS 1, con reportes de establecimientos de la semilla en
// cada estado, y febrero a junio solo en la DDRISS ficticia ZVT_OTRA48, que tiene dos establecimientos ZVT48-*. La
// elección del mes se prueba con la Autoridad nacional sobre ZVT_OTRA48, porque la DDRISS 1 tiene los meses reales y
// los de otras pruebas. ZVT_VACIA48 no tiene meses. Todo se borra al inicio y al final. El desglose por municipio y
// la elección por anio + mes son del SPEC 50.
const ANIO = 2002;
const DDRISS_OTRA = 'ZVT_OTRA48';
const DDRISS_VACIA = 'ZVT_VACIA48';
const periodoIds = {};
const establecimientos = {};
const ddriss = {};
let estadigrafa;
let epidemiologia;
let autoridad;
let personal;

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  await pool.query("DELETE FROM establecimiento WHERE codigo LIKE 'ZVT48-%'");
  await pool.query('DELETE FROM ddriss WHERE codigo IN (?, ?)', [DDRISS_OTRA, DDRISS_VACIA]);
}

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
  return tokenDePrueba(
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
}

async function crearPeriodo(mes) {
  const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
  const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
    ANIO,
    mes,
    `${ANIO}-${dosDigitos(mes)}-01`,
    `${ANIO}-${dosDigitos(mes)}-${fin}`,
  ]);
  periodoIds[mes] = periodo.insertId;
}

async function abrirEn(ddrissId, mes, estado) {
  await pool.query(
    `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
     VALUES (?, ?, '2099-12-31', ?, ?, ?)`,
    [periodoIds[mes], ddrissId, estado, estado === 'CERRADO' ? 2 : null, estado === 'CERRADO' ? `${ANIO}-12-20 16:00:00` : null],
  );
}

// Cambia el estado de los meses de ZVT_OTRA48: { mes: estado }.
async function estadosDeLaOtra(estados) {
  for (const [mes, estado] of Object.entries(estados)) {
    await pool.query(
      `UPDATE cierre_periodo SET estado = ?, cerrado_por = ?, cerrado_en = ? WHERE periodo_id = ? AND ddriss_id = ?`,
      [estado, estado === 'CERRADO' ? 2 : null, estado === 'CERRADO' ? `${ANIO}-12-20 16:00:00` : null, periodoIds[mes], ddriss.otra],
    );
  }
}

async function crearEstablecimiento(codigo, { activo }) {
  const [creado] = await pool.query(
    `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, distrito_salud_id, municipio_id,
                                  reporta_5c, activo)
     SELECT ?, ?, tipo_establecimiento_id, ?, NULL, municipio_id, TRUE, ?
       FROM establecimiento WHERE codigo = 'CS-1201'`,
    [codigo, `vitest-hu40 ${codigo}`, ddriss.otra, activo],
  );
  establecimientos[codigo] = creado.insertId;
}

async function crearReporte(codigo, mes, estado) {
  const enviado = estado === 'BORRADOR' ? null : `${ANIO}-${dosDigitos(mes + 1)}-03 10:00:00`;
  await pool.query(
    `INSERT INTO reporte_produccion (establecimiento_id, periodo_id, estado, creado_por, enviado_en)
     VALUES (?, ?, ?, 1, ?)`,
    [establecimientos[codigo], periodoIds[mes], estado, enviado],
  );
}

const avance = (consulta, credencial) =>
  request(app).get('/api/v1/revision/avance').query(consulta).set('Authorization', `Bearer ${credencial}`);

describe('GET /revision/avance', () => {
  beforeAll(async () => {
    await limpiar();
    [estadigrafa, epidemiologia, autoridad, personal] = await Promise.all(
      ['estadigrafa', 'epidemiologia', 'autoridad.nacional', 'cs1201'].map(tokenDe),
    );
    for (const codigo of [DDRISS_OTRA, DDRISS_VACIA]) {
      const [creada] = await pool.query(
        "INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-hu40', 3, TRUE)",
        [codigo],
      );
      ddriss[codigo === DDRISS_OTRA ? 'otra' : 'vacia'] = creada.insertId;
    }
    for (let mes = 1; mes <= 6; mes++) await crearPeriodo(mes);

    await abrirEn(1, 1, 'ABIERTO');
    const [semilla] = await pool.query(
      "SELECT id, codigo FROM establecimiento WHERE codigo IN ('CS-1201', 'CS-1202', 'CS-1203', 'CS-1204', 'CS-1205', 'CS-1206', 'CS-1207')",
    );
    for (const e of semilla) establecimientos[e.codigo] = e.id;
    await crearReporte('CS-1201', 1, 'ENVIADO');
    await crearReporte('CS-1202', 1, 'EN_REVISION');
    await crearReporte('CS-1203', 1, 'CORRECCION_SOLICITADA');
    await crearReporte('CS-1204', 1, 'BORRADOR');
    await crearReporte('CS-1205', 1, 'APROBADO');
    await crearReporte('CS-1206', 1, 'CERRADO');
    await crearReporte('CS-1207', 1, 'RECTIFICACION');

    // Febrero CERRADO, marzo y abril EN_CIERRE, mayo y junio ABIERTO.
    await abrirEn(ddriss.otra, 2, 'CERRADO');
    await abrirEn(ddriss.otra, 3, 'EN_CIERRE');
    await abrirEn(ddriss.otra, 4, 'EN_CIERRE');
    await abrirEn(ddriss.otra, 5, 'ABIERTO');
    await abrirEn(ddriss.otra, 6, 'ABIERTO');
    await crearEstablecimiento('ZVT48-A', { activo: true });
    await crearEstablecimiento('ZVT48-B', { activo: true });
    await crearEstablecimiento('ZVT48-INACT', { activo: false });
    for (const mes of [2, 3, 4, 5, 6]) await crearReporte('ZVT48-A', mes, 'APROBADO');
  }, 120000);

  afterAll(limpiar, 60000);

  it('con periodoId, los conteos y los esperados coinciden con la bandeja, y RECTIFICACION cuenta como CERRADO', async () => {
    const [res, bandeja] = await Promise.all([
      avance({ periodoId: periodoIds[1] }, estadigrafa),
      request(app)
        .get('/api/v1/revision/bandeja')
        .query({ periodoId: periodoIds[1], porPagina: 1 })
        .set('Authorization', `Bearer ${estadigrafa}`),
    ]);

    expect(res.status).toBe(200);
    expect(res.body.periodo).toEqual({ id: periodoIds[1], anio: ANIO, mes: 1, estado: 'ABIERTO', fechaLimiteEnvio: '2099-12-31' });
    const { conteos } = bandeja.body;
    expect(res.body.esperados).toBe(conteos.TODOS);
    expect(res.body.conteos).toEqual({
      SIN_ENVIAR: conteos.SIN_ENVIAR,
      ENVIADO: conteos.ENVIADO,
      EN_REVISION: conteos.EN_REVISION,
      CORRECCION_SOLICITADA: conteos.CORRECCION_SOLICITADA,
      APROBADO: conteos.APROBADO,
      CERRADO: conteos.CERRADO,
    });
    expect(res.body.conteos).toMatchObject({ ENVIADO: 1, EN_REVISION: 1, CORRECCION_SOLICITADA: 1, APROBADO: 1, CERRADO: 2 });
  });

  it('Epidemiología ve los mismos conteos de su DDRISS', async () => {
    const [deRevisor, deEpidemiologia] = await Promise.all([
      avance({ periodoId: periodoIds[1] }, estadigrafa),
      avance({ periodoId: periodoIds[1] }, epidemiologia),
    ]);

    expect(deEpidemiologia.status).toBe(200);
    expect(deEpidemiologia.body).toEqual(deRevisor.body);
  });

  it('sin periodoId elige el EN_CIERRE más antiguo, luego el ABIERTO más antiguo y luego el último CERRADO', async () => {
    const elegido = async () => {
      const res = await avance({ ddrissId: ddriss.otra }, autoridad);
      expect(res.status).toBe(200);
      return res.body;
    };

    try {
      const enCierre = await elegido();
      expect(enCierre.periodo).toMatchObject({ id: periodoIds[3], mes: 3, estado: 'EN_CIERRE' });
      expect(enCierre).toMatchObject({ esperados: 2, conteos: { APROBADO: 1, SIN_ENVIAR: 1, CERRADO: 0 } });

      await estadosDeLaOtra({ 3: 'CERRADO', 4: 'CERRADO' });
      expect((await elegido()).periodo).toMatchObject({ id: periodoIds[5], estado: 'ABIERTO' });

      await estadosDeLaOtra({ 5: 'CERRADO', 6: 'CERRADO' });
      expect((await elegido()).periodo).toMatchObject({ id: periodoIds[6], estado: 'CERRADO' });
    } finally {
      await estadosDeLaOtra({ 3: 'EN_CIERRE', 4: 'EN_CIERRE', 5: 'ABIERTO', 6: 'ABIERTO' });
    }
  });

  it('una DDRISS sin meses responde periodo null y los conteos en 0', async () => {
    const res = await avance({ ddrissId: ddriss.vacia }, autoridad);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      periodo: null,
      esperados: 0,
      conteos: { SIN_ENVIAR: 0, ENVIADO: 0, EN_REVISION: 0, CORRECCION_SOLICITADA: 0, APROBADO: 0, CERRADO: 0 },
    });
  });

  it('un mes sin cierre_periodo de la DDRISS del usuario responde 404', async () => {
    // Febrero solo está abierto en ZVT_OTRA48.
    const res = await avance({ periodoId: periodoIds[2] }, estadigrafa);

    expect(res.status).toBe(404);
    expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
  });

  it('un parámetro desconocido o un periodoId inválido responden 400', async () => {
    const [desconocido, invalido] = await Promise.all([
      avance({ grupo: 'TODOS' }, estadigrafa),
      avance({ periodoId: 'abc' }, estadigrafa),
    ]);

    expect(desconocido.status).toBe(400);
    expect(desconocido.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'Parámetro no permitido: grupo.' });
    expect(invalido.status).toBe(400);
    expect(invalido.body.error.mensaje).toBe('periodoId debe ser un número entero mayor o igual a 1.');
  });

  it('la Autoridad nacional exige ddrissId y ve la DDRISS pedida; otro rol no puede mandarlo', async () => {
    const [sinDdriss, conDdriss, deRevisor] = await Promise.all([
      avance({ periodoId: periodoIds[2] }, autoridad),
      avance({ periodoId: periodoIds[2], ddrissId: ddriss.otra }, autoridad),
      avance({ ddrissId: 1 }, estadigrafa),
    ]);

    expect(sinDdriss.status).toBe(400);
    expect(sinDdriss.body.error.codigo).toBe('ENTRADA_INVALIDA');
    expect(conDdriss.status).toBe(200);
    expect(conDdriss.body).toMatchObject({ periodo: { id: periodoIds[2], estado: 'CERRADO' }, esperados: 2 });
    expect(deRevisor.status).toBe(400);
    expect(deRevisor.body.error.mensaje).toBe('Parámetro no permitido: ddrissId.');
  });

  it('anio y mes eligen el mismo mes que su periodoId; combinados, incompletos o sin cierre_periodo, no', async () => {
    const [porId, porFecha, combinados, soloAnio, soloMes, fueraDeRango, sinCierre] = await Promise.all([
      avance({ periodoId: periodoIds[1] }, estadigrafa),
      avance({ anio: ANIO, mes: 1 }, estadigrafa),
      avance({ periodoId: periodoIds[1], anio: ANIO, mes: 1 }, estadigrafa),
      avance({ anio: ANIO }, estadigrafa),
      avance({ mes: 1 }, estadigrafa),
      avance({ anio: ANIO, mes: 13 }, estadigrafa),
      avance({ anio: ANIO, mes: 2 }, estadigrafa),
    ]);

    expect(porFecha.status).toBe(200);
    expect(porFecha.body).toEqual(porId.body);
    expect(combinados.status).toBe(400);
    expect(combinados.body.error.mensaje).toBe('Use periodoId o anio y mes, no los dos.');
    for (const incompleto of [soloAnio, soloMes]) {
      expect(incompleto.status).toBe(400);
      expect(incompleto.body.error.mensaje).toBe('anio y mes van juntos.');
    }
    expect(fueraDeRango.status).toBe(400);
    expect(sinCierre.status).toBe(404);
  });

  it('con desglose=municipio, cada municipio trae sus conteos y suman los de la DDRISS', async () => {
    const res = await avance({ anio: ANIO, mes: 1, desglose: 'municipio' }, epidemiologia);

    expect(res.status).toBe(200);
    const { municipios } = res.body;
    const nombres = municipios.map((m) => m.municipio.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    expect(municipios.every((m) => /^\d{4}$/.test(m.municipio.codigoIne) && m.esperados > 0)).toBe(true);
    expect(municipios.reduce((suma, m) => suma + m.esperados, 0)).toBe(res.body.esperados);
    for (const estado of Object.keys(res.body.conteos)) {
      expect(municipios.reduce((suma, m) => suma + m.conteos[estado], 0)).toBe(res.body.conteos[estado]);
    }
    // CS-1201 (ENVIADO) está en San Marcos, 1201.
    const sanMarcos = municipios.find((m) => m.municipio.codigoIne === '1201');
    expect(sanMarcos.municipio).toMatchObject({ nombre: 'San Marcos' });
    expect(sanMarcos.conteos.ENVIADO).toBeGreaterThanOrEqual(1);
  });

  it('el desglose solo trae municipios con establecimientos contados, y sin desglose no trae municipios', async () => {
    const [deLaOtra, sinDesglose, vacia, invalido] = await Promise.all([
      avance({ periodoId: periodoIds[3], ddrissId: ddriss.otra, desglose: 'municipio' }, autoridad),
      avance({ periodoId: periodoIds[3], ddrissId: ddriss.otra }, autoridad),
      avance({ ddrissId: ddriss.vacia, desglose: 'municipio' }, autoridad),
      avance({ periodoId: periodoIds[1], desglose: 'establecimiento' }, estadigrafa),
    ]);

    // ZVT48-A y ZVT48-B copian el municipio de CS-1201; ZVT48-INACT, inactivo y sin reporte, no cuenta.
    expect(deLaOtra.status).toBe(200);
    expect(deLaOtra.body.municipios).toEqual([
      {
        municipio: { id: expect.any(Number), nombre: 'San Marcos', codigoIne: '1201' },
        esperados: 2,
        conteos: { SIN_ENVIAR: 1, ENVIADO: 0, EN_REVISION: 0, CORRECCION_SOLICITADA: 0, APROBADO: 1, CERRADO: 0 },
      },
    ]);
    expect(sinDesglose.status).toBe(200);
    expect(sinDesglose.body).not.toHaveProperty('municipios');
    expect(vacia.body).toMatchObject({ periodo: null, municipios: [] });
    expect(invalido.status).toBe(400);
    expect(invalido.body.error.mensaje).toBe('desglose solo admite el valor municipio.');
  });

  it('el Personal de establecimiento no tiene el permiso', async () => {
    const res = await avance({ periodoId: periodoIds[1] }, personal);

    expect(res.status).toBe(403);
  });
});
