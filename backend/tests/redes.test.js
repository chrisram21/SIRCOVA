import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Estas pruebas trabajan en una DDRISS ficticia con su propio departamento y sus municipios (códigos que empiezan
// con ZR), para no chocar con la Red No. 1 ni con redes de la prueba manual. Todo se borra al inicio y al final.
const DDRISS_PRUEBA = 'ZVT_RED';
const DEPARTAMENTO_PRUEBA = 'ZR';
const MUNICIPIOS_PRUEBA = ['ZR01', 'ZR02', 'ZR03', 'ZR04', 'ZR05', 'ZR06', 'ZR07', 'ZR08'];
// Vacuna ficticia con una dosis activa y otra inactiva, sin trazadoras para no cambiar las de por defecto.
const VACUNA_PRUEBA = 'ZVT_RED';
const MUNICIPIO_INACTIVO = 'ZR09';

let ddrissId;
let ddrissSede;
const municipios = {};
const tokens = {};

const consultar = (ruta, token) => request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`);
const enviar = (metodo, ruta, cuerpo, token = tokens.admin) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${token}`).send(cuerpo);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
const filasBitacora = async (accion, redId) => {
  const [filas] = await pool.query(
    `SELECT valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND accion = ? AND entidad = 'red' AND entidad_id = ?
      ORDER BY id`,
    [accion, String(redId)],
  );
  return filas.map((f) => ({ anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
};
const ordenar = (lista) => [...lista].sort((a, b) => a - b);
const ids = (...ine) => ordenar(ine.map((codigo) => municipios[codigo]));

// Token de una cuenta real de la semilla con sus permisos; la DDRISS se puede cambiar porque autenticar no la compara.
async function tokenDe(nombreUsuario, datos = {}) {
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
  return tokenDePrueba(cuenta.id, {
    rol: cuenta.rol,
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
    ...datos,
  });
}

async function limpiar() {
  const [[ddriss]] = await pool.query('SELECT id FROM ddriss WHERE codigo = ?', [DDRISS_PRUEBA]);
  if (ddriss) {
    await pool.query('DELETE rt FROM red_trazadora rt JOIN red r ON r.id = rt.red_id WHERE r.ddriss_id = ?', [ddriss.id]);
    await pool.query('DELETE rm FROM red_municipio rm JOIN red r ON r.id = rm.red_id WHERE r.ddriss_id = ?', [ddriss.id]);
    await pool.query('DELETE FROM red WHERE ddriss_id = ?', [ddriss.id]);
    await pool.query('DELETE FROM ddriss WHERE id = ?', [ddriss.id]);
  }
  await pool.query(
    'DELETE m FROM municipio m JOIN departamento d ON d.id = m.departamento_id WHERE d.codigo_ine = ?',
    [DEPARTAMENTO_PRUEBA],
  );
  await pool.query('DELETE FROM departamento WHERE codigo_ine = ?', [DEPARTAMENTO_PRUEBA]);
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = ?', [VACUNA_PRUEBA]);
  await pool.query('DELETE FROM vacuna WHERE codigo = ?', [VACUNA_PRUEBA]);
}

async function insertarRed({ codigo, nombre, activo = true, municipiosIne = [], dosisIds = [] }) {
  const [creada] = await pool.query('INSERT INTO red (ddriss_id, codigo, nombre, activo) VALUES (?, ?, ?, ?)', [
    ddrissId,
    codigo,
    nombre,
    activo,
  ]);
  for (const ine of municipiosIne) {
    await pool.query('INSERT INTO red_municipio (red_id, municipio_id) VALUES (?, ?)', [creada.insertId, municipios[ine]]);
  }
  for (const dosisId of dosisIds) {
    await pool.query('INSERT INTO red_trazadora (red_id, dosis_id) VALUES (?, ?)', [creada.insertId, dosisId]);
  }
  return creada.insertId;
}

let redActiva;
let redInactiva;
let dosisHexa3;
let dosisPruebaActiva;
let dosisPruebaInactiva;
let porDefecto;

beforeAll(async () => {
  await limpiar();
  const [departamento] = await pool.query("INSERT INTO departamento (codigo_ine, nombre) VALUES (?, 'vitest-redes')", [
    DEPARTAMENTO_PRUEBA,
  ]);
  const [ddriss] = await pool.query(
    "INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-redes', ?, TRUE)",
    [DDRISS_PRUEBA, departamento.insertId],
  );
  ddrissId = ddriss.insertId;
  for (const ine of [...MUNICIPIOS_PRUEBA, MUNICIPIO_INACTIVO]) {
    const [m] = await pool.query('INSERT INTO municipio (departamento_id, codigo_ine, nombre, activo) VALUES (?, ?, ?, ?)', [
      departamento.insertId,
      ine,
      `vitest-redes-${ine}`,
      ine !== MUNICIPIO_INACTIVO,
    ]);
    municipios[ine] = m.insertId;
  }
  [[{ id: dosisHexa3 }]] = await pool.query(
    "SELECT d.id FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo = 'HEXA' AND d.codigo = 'D3'",
  );
  [[{ id: ddrissSede }]] = await pool.query("SELECT id FROM ddriss WHERE codigo = 'DDRISS_SM'");
  const [vacuna] = await pool.query(
    "INSERT INTO vacuna (codigo, nombre, orden_informe, activa) VALUES (?, 'vitest-redes Vacuna', 999, TRUE)",
    [VACUNA_PRUEBA],
  );
  const insertarDosis = async (codigo, orden, activa) => {
    const [d] = await pool.query(
      "INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, ?, 'vitest-redes dosis', ?, ?)",
      [vacuna.insertId, codigo, orden, activa],
    );
    return d.insertId;
  };
  dosisPruebaActiva = await insertarDosis('D1', 1, true);
  dosisPruebaInactiva = await insertarDosis('D2', 2, false);
  const [defecto] = await pool.query(
    `SELECT d.id FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id
      WHERE d.es_trazadora AND d.activa AND v.activa ORDER BY d.id`,
  );
  porDefecto = defecto.map((f) => f.id);

  redActiva = await insertarRed({
    codigo: 'RED_01',
    nombre: 'vitest-redes Red A',
    municipiosIne: ['ZR02', 'ZR01'],
    dosisIds: [dosisHexa3],
  });
  redInactiva = await insertarRed({ codigo: 'RED_02', nombre: 'vitest-redes Red B', activo: false, dosisIds: [dosisHexa3] });

  // Una tras otra: dos tokens de la misma cuenta a la vez podrían abrir dos sesiones.
  const enPrueba = { ddrissId };
  tokens.admin = await tokenDe('admin.prueba', enPrueba);
  tokens.adminSede = await tokenDe('admin.prueba');
  tokens.epidemiologia = await tokenDe('epidemiologia', enPrueba);
  tokens.revisor = await tokenDe('estadigrafa', enPrueba);
  tokens.nacional = await tokenDe('autoridad.nacional');
  tokens.personal = await tokenDe('cs1201');
});

afterAll(async () => {
  await limpiar();
});

describe('GET /redes', () => {
  it('devuelve las redes de la DDRISS del usuario con sus municipios y trazadoras', async () => {
    const res = await consultar('/redes', tokens.admin);
    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.id)).toEqual([redActiva, redInactiva]);
    expect(res.body[0]).toEqual({
      id: redActiva,
      codigo: 'RED_01',
      nombre: 'vitest-redes Red A',
      activo: true,
      ddriss: { id: ddrissId, codigo: DDRISS_PRUEBA, nombre: 'vitest-redes' },
      municipios: [
        { id: municipios.ZR01, codigoIne: 'ZR01', nombre: 'vitest-redes-ZR01' },
        { id: municipios.ZR02, codigoIne: 'ZR02', nombre: 'vitest-redes-ZR02' },
      ],
      trazadoras: [
        {
          dosisId: dosisHexa3,
          codigo: 'D3',
          nombre: 'Tercera dosis',
          activa: true,
          vacuna: expect.objectContaining({ codigo: 'HEXA', activa: true }),
        },
      ],
    });
    expect(res.body[1]).toMatchObject({ activo: false, municipios: [] });
  });

  it('no muestra las redes de otra DDRISS', async () => {
    const res = await consultar('/redes', tokens.adminSede);
    expect(res.status).toBe(200);
    expect(res.body.some((r) => r.ddriss.id === ddrissId)).toBe(false);
    expect(res.body.every((r) => r.ddriss.id === ddrissSede)).toBe(true);
  });

  it('filtra por activo', async () => {
    const activas = await consultar('/redes?activo=true', tokens.admin);
    expect(activas.body.map((r) => r.id)).toEqual([redActiva]);
    const inactivas = await consultar('/redes?activo=false', tokens.admin);
    expect(inactivas.body.map((r) => r.id)).toEqual([redInactiva]);
  });

  it('la Autoridad nacional ve todas o las de ddrissId', async () => {
    const todas = await consultar('/redes', tokens.nacional);
    expect(todas.status).toBe(200);
    const ddrissVistas = new Set(todas.body.map((r) => r.ddriss.id));
    expect(ddrissVistas.has(ddrissId)).toBe(true);
    expect(ddrissVistas.has(ddrissSede)).toBe(true);

    const deUna = await consultar(`/redes?ddrissId=${ddrissId}`, tokens.nacional);
    expect(deUna.body.map((r) => r.id)).toEqual([redActiva, redInactiva]);
  });

  it('ddrissId solo lo puede mandar la Autoridad nacional', async () => {
    const res = await consultar(`/redes?ddrissId=${ddrissId}`, tokens.admin);
    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('responde 400 a un parámetro inválido, desconocido o repetido', async () => {
    for (const consulta of ['activo=si', 'orden=nombre', 'activo=true&activo=false']) {
      const res = await consultar(`/redes?${consulta}`, tokens.admin);
      expect(res.status, consulta).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('el Revisor y Epidemiología consultan; el Personal recibe 403', async () => {
    expect((await consultar('/redes', tokens.revisor)).status).toBe(200);
    expect((await consultar('/redes', tokens.epidemiologia)).status).toBe(200);
    expect((await consultar('/redes', tokens.personal)).status).toBe(403);
  });
});

describe('GET /redes/{id}', () => {
  it('devuelve una red de su DDRISS', async () => {
    const res = await consultar(`/redes/${redActiva}`, tokens.revisor);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: redActiva, codigo: 'RED_01' });
  });

  it('responde 404 a una red de otra DDRISS, inexistente o con id inválido', async () => {
    expect((await consultar(`/redes/${redActiva}`, tokens.adminSede)).status).toBe(404);
    expect((await consultar('/redes/999999', tokens.admin)).status).toBe(404);
    expect((await consultar('/redes/abc', tokens.admin)).status).toBe(404);
  });
});

describe('GET /redes/opciones', () => {
  it('da los municipios elegibles con su red y las vacunas activas con sus dosis activas', async () => {
    const res = await consultar('/redes/opciones', tokens.epidemiologia);
    expect(res.status).toBe(200);
    const redA = { id: redActiva, nombre: 'vitest-redes Red A' };
    expect(res.body.municipios).toEqual(
      MUNICIPIOS_PRUEBA.map((ine) => ({
        id: municipios[ine],
        codigoIne: ine,
        nombre: `vitest-redes-${ine}`,
        red: ['ZR01', 'ZR02'].includes(ine) ? redA : null,
      })),
    );
    const hexa = res.body.vacunas.find((v) => v.codigo === 'HEXA');
    expect(hexa.dosis).toContainEqual({ id: dosisHexa3, codigo: 'D3', nombre: 'Tercera dosis', esTrazadora: true });
    const prueba = res.body.vacunas.find((v) => v.codigo === VACUNA_PRUEBA);
    expect(prueba.dosis.map((d) => d.id)).toEqual([dosisPruebaActiva]);

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM vacuna WHERE activa = TRUE');
    expect(res.body.vacunas).toHaveLength(Number(total));
  });

  it('en la DDRISS sede no incluye el 9999 y marca los municipios de la Red No. 1', async () => {
    const res = await consultar('/redes/opciones', tokens.adminSede);
    expect(res.body.municipios.some((m) => m.codigoIne === '9999')).toBe(false);
    expect(res.body.municipios.find((m) => m.codigoIne === '1207').red).toMatchObject({ nombre: 'Red No. 1' });
  });

  it('responde 400 a un parámetro y 403 al Revisor y a la Autoridad', async () => {
    expect((await consultar('/redes/opciones?activo=true', tokens.admin)).status).toBe(400);
    expect((await consultar('/redes/opciones', tokens.revisor)).status).toBe(403);
    expect((await consultar('/redes/opciones', tokens.nacional)).status).toBe(403);
  });
});

describe('POST /redes', () => {
  it('crea la red con el siguiente código de la DDRISS y las trazadoras por defecto', async () => {
    const res = await enviar('post', '/redes', { nombre: '  vitest-redes   Red C ', municipioIds: ids('ZR04', 'ZR03') });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ codigo: 'RED_03', nombre: 'vitest-redes Red C', activo: true });
    expect(res.body.municipios.map((m) => m.codigoIne)).toEqual(['ZR03', 'ZR04']);
    expect(ordenar(res.body.trazadoras.map((t) => t.dosisId))).toEqual(porDefecto);

    expect(await filasBitacora('CREAR', res.body.id)).toEqual([
      {
        anteriores: null,
        nuevos: { codigo: 'RED_03', nombre: 'vitest-redes Red C', municipioIds: ids('ZR03', 'ZR04'), dosisIds: porDefecto },
      },
    ]);
  });

  it('dos altas a la vez reciben códigos distintos', async () => {
    const [una, otra] = await Promise.all([
      enviar('post', '/redes', { nombre: 'vitest-redes Red D', municipioIds: ids('ZR05') }),
      enviar('post', '/redes', { nombre: 'vitest-redes Red E', municipioIds: ids('ZR06') }),
    ]);
    expect([una.status, otra.status]).toEqual([201, 201]);
    expect([una.body.codigo, otra.body.codigo].sort()).toEqual(['RED_04', 'RED_05']);
  });

  it('rechaza un municipio que ya está en otra red', async () => {
    const res = await enviar('post', '/redes', { nombre: 'vitest-redes Red F', municipioIds: ids('ZR07', 'ZR01') });
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'MUNICIPIO_EN_OTRA_RED',
      mensaje: 'vitest-redes-ZR01 ya pertenece a la vitest-redes Red A.',
    });
  });

  it('rechaza un municipio inactivo, de otro departamento, el 9999 o inexistente', async () => {
    const [[tacana]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '1207'");
    const [[migrantes]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '9999'");
    for (const municipioId of [municipios[MUNICIPIO_INACTIVO], tacana.id, migrantes.id, 999999]) {
      const res = await enviar('post', '/redes', { nombre: 'vitest-redes Red F', municipioIds: [municipioId] });
      expect(res.status, String(municipioId)).toBe(422);
      expect(res.body.error.codigo).toBe('MUNICIPIO_INVALIDO');
    }
  });

  it('rechaza un nombre repetido en la DDRISS, sin distinguir mayúsculas ni tildes', async () => {
    const res = await enviar('post', '/redes', { nombre: 'VITEST-REDES RÉD A', municipioIds: ids('ZR07') });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('RED_DUPLICADA');
  });

  it('responde 400 a un cuerpo inválido', async () => {
    const casos = [
      { nombre: 'vitest-redes Red F', municipioIds: [] },
      { nombre: 'vitest-redes Red F' },
      { nombre: 'vitest-redes Red F', municipioIds: [municipios.ZR07, municipios.ZR07] },
      { nombre: 'vitest-redes Red F', municipioIds: ['7'] },
      { nombre: 'R1', municipioIds: ids('ZR07') },
      { nombre: 'vitest-redes Red F', municipioIds: ids('ZR07'), codigo: 'RED_99' },
      { nombre: 'vitest-redes Red F', municipioIds: ids('ZR07'), dosisIds: [dosisHexa3] },
    ];
    for (const cuerpo of casos) {
      const res = await enviar('post', '/redes', cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('el Revisor recibe 403', async () => {
    const res = await enviar('post', '/redes', { nombre: 'vitest-redes Red F', municipioIds: ids('ZR07') }, tokens.revisor);
    expect(res.status).toBe(403);
  });
});

describe('PATCH /redes/{id}', () => {
  let redId;

  beforeAll(async () => {
    redId = await insertarRed({
      codigo: 'RED_10',
      nombre: 'vitest-redes Red G',
      municipiosIne: ['ZR08'],
      dosisIds: [dosisHexa3, dosisPruebaInactiva],
    });
  });

  it('cambia nombre, municipios y trazadoras y registra solo lo que cambió', async () => {
    const res = await enviar(
      'patch',
      `/redes/${redId}`,
      { nombre: 'vitest-redes Red H', municipioIds: ids('ZR08', 'ZR07'), dosisIds: [dosisPruebaActiva, dosisHexa3] },
      tokens.epidemiologia,
    );
    expect(res.status).toBe(200);
    expect(res.body.nombre).toBe('vitest-redes Red H');
    expect(res.body.municipios.map((m) => m.codigoIne)).toEqual(['ZR07', 'ZR08']);
    expect(ordenar(res.body.trazadoras.map((t) => t.dosisId))).toEqual(ordenar([dosisHexa3, dosisPruebaActiva]));
    expect(await filasBitacora('ACTUALIZAR', redId)).toEqual([
      {
        anteriores: {
          nombre: 'vitest-redes Red G',
          municipioIds: ids('ZR08'),
          dosisIds: ordenar([dosisHexa3, dosisPruebaInactiva]),
        },
        nuevos: {
          nombre: 'vitest-redes Red H',
          municipioIds: ids('ZR07', 'ZR08'),
          dosisIds: ordenar([dosisHexa3, dosisPruebaActiva]),
        },
      },
    ]);
  });

  it('sin cambios responde 200 y no escribe en la bitácora', async () => {
    const res = await enviar('patch', `/redes/${redId}`, { nombre: 'vitest-redes Red H', municipioIds: ids('ZR07', 'ZR08') });
    expect(res.status).toBe(200);
    expect(await filasBitacora('ACTUALIZAR', redId)).toHaveLength(1);
  });

  it('conserva una trazadora guardada que se desactivó, pero no acepta una nueva inactiva', async () => {
    await pool.query('INSERT INTO red_trazadora (red_id, dosis_id) VALUES (?, ?)', [redId, dosisPruebaInactiva]);
    const conserva = await enviar('patch', `/redes/${redId}`, { dosisIds: [dosisPruebaInactiva, dosisHexa3] });
    expect(conserva.status).toBe(200);
    expect(conserva.body.trazadoras.find((t) => t.dosisId === dosisPruebaInactiva).activa).toBe(false);

    await enviar('patch', `/redes/${redId}`, { dosisIds: [dosisHexa3] });
    const nueva = await enviar('patch', `/redes/${redId}`, { dosisIds: [dosisHexa3, dosisPruebaInactiva] });
    expect(nueva.status).toBe(422);
    expect(nueva.body.error.codigo).toBe('DOSIS_INVALIDA');
    expect((await enviar('patch', `/redes/${redId}`, { dosisIds: [999999] })).status).toBe(422);
  });

  it('rechaza un municipio de otra red y un nombre repetido', async () => {
    const municipio = await enviar('patch', `/redes/${redId}`, { municipioIds: ids('ZR02') });
    expect(municipio.status).toBe(409);
    expect(municipio.body.error.codigo).toBe('MUNICIPIO_EN_OTRA_RED');
    const nombre = await enviar('patch', `/redes/${redId}`, { nombre: 'vitest-redes red a' });
    expect(nombre.status).toBe(409);
    expect(nombre.body.error.codigo).toBe('RED_DUPLICADA');
  });

  it('responde 400 a un cuerpo inválido', async () => {
    for (const cuerpo of [{}, { municipioIds: [] }, { dosisIds: [] }, { codigo: 'RED_99' }, { activo: false }]) {
      const res = await enviar('patch', `/redes/${redId}`, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
    }
  });

  it('no edita una red inactiva ni una de otra DDRISS', async () => {
    const inactiva = await enviar('patch', `/redes/${redInactiva}`, { nombre: 'vitest-redes Red Z' });
    expect(inactiva.status).toBe(409);
    expect(inactiva.body.error.codigo).toBe('RED_INACTIVA');
    expect((await enviar('patch', `/redes/${redId}`, { nombre: 'vitest-redes Red Z' }, tokens.adminSede)).status).toBe(404);
  });

  it('el Revisor recibe 403', async () => {
    expect((await enviar('patch', `/redes/${redId}`, { nombre: 'vitest-redes Red Z' }, tokens.revisor)).status).toBe(403);
  });
});

describe('POST /redes/{id}/desactivar y /reactivar', () => {
  let redId;

  beforeAll(async () => {
    // Municipios propios de este bloque: los de las otras pruebas siguen ocupados.
    await pool.query(
      'DELETE rm FROM red_municipio rm JOIN red r ON r.id = rm.red_id WHERE r.ddriss_id = ? AND rm.municipio_id IN (?)',
      [ddrissId, ids('ZR07', 'ZR08')],
    );
    redId = await insertarRed({
      codigo: 'RED_20',
      nombre: 'vitest-redes Red I',
      municipiosIne: ['ZR07', 'ZR08'],
      dosisIds: [dosisHexa3, dosisPruebaActiva],
    });
  });

  it('desactivar libera los municipios, conserva las trazadoras y lo registra', async () => {
    const res = await enviar('post', `/redes/${redId}/desactivar`, undefined, tokens.epidemiologia);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activo: false, municipios: [] });
    expect(ordenar(res.body.trazadoras.map((t) => t.dosisId))).toEqual(ordenar([dosisHexa3, dosisPruebaActiva]));
    expect(await filasBitacora('DESACTIVAR', redId)).toEqual([
      { anteriores: { activo: true, municipioIds: ids('ZR07', 'ZR08') }, nuevos: { activo: false, municipioIds: [] } },
    ]);
  });

  it('desactivar una red ya inactiva responde 200 sin registrar nada', async () => {
    const res = await enviar('post', `/redes/${redId}/desactivar`);
    expect(res.status).toBe(200);
    expect(await filasBitacora('DESACTIVAR', redId)).toHaveLength(1);
  });

  it('otra red puede tomar los municipios liberados', async () => {
    const otra = await enviar('post', '/redes', { nombre: 'vitest-redes Red J', municipioIds: ids('ZR07') });
    expect(otra.status).toBe(201);
  });

  it('reactivar exige al menos un municipio libre', async () => {
    for (const cuerpo of [{}, { municipioIds: [] }, { nombre: 'vitest-redes Red I' }]) {
      const res = await enviar('post', `/redes/${redId}/reactivar`, cuerpo);
      expect(res.status, JSON.stringify(cuerpo)).toBe(400);
    }
    const ocupado = await enviar('post', `/redes/${redId}/reactivar`, { municipioIds: ids('ZR07') });
    expect(ocupado.status).toBe(409);
    expect(ocupado.body.error).toEqual({
      codigo: 'MUNICIPIO_EN_OTRA_RED',
      mensaje: 'vitest-redes-ZR07 ya pertenece a la vitest-redes Red J.',
    });
    const inactivo = await enviar('post', `/redes/${redId}/reactivar`, { municipioIds: [municipios[MUNICIPIO_INACTIVO]] });
    expect(inactivo.status).toBe(422);
  });

  it('reactiva con sus municipios, puede cambiar nombre y trazadoras, y lo registra', async () => {
    const res = await enviar('post', `/redes/${redId}/reactivar`, {
      municipioIds: ids('ZR08'),
      nombre: 'vitest-redes Red K',
      dosisIds: [dosisHexa3],
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activo: true, nombre: 'vitest-redes Red K' });
    expect(res.body.municipios.map((m) => m.codigoIne)).toEqual(['ZR08']);
    expect(res.body.trazadoras.map((t) => t.dosisId)).toEqual([dosisHexa3]);
    expect(await filasBitacora('REACTIVAR', redId)).toEqual([
      {
        anteriores: {
          nombre: 'vitest-redes Red I',
          activo: false,
          municipioIds: [],
          dosisIds: ordenar([dosisHexa3, dosisPruebaActiva]),
        },
        nuevos: { nombre: 'vitest-redes Red K', activo: true, municipioIds: ids('ZR08'), dosisIds: [dosisHexa3] },
      },
    ]);
  });

  it('reactivar una red activa responde 409', async () => {
    const res = await enviar('post', `/redes/${redId}/reactivar`, { municipioIds: ids('ZR08') });
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('RED_ACTIVA');
  });

  it('el Revisor recibe 403 y otra DDRISS 404', async () => {
    expect((await enviar('post', `/redes/${redId}/desactivar`, undefined, tokens.revisor)).status).toBe(403);
    const reactivar = await enviar('post', `/redes/${redId}/reactivar`, { municipioIds: ids('ZR08') }, tokens.revisor);
    expect(reactivar.status).toBe(403);
    expect((await enviar('post', `/redes/${redId}/desactivar`, undefined, tokens.adminSede)).status).toBe(404);
  });
});
