import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';

// Los distritos que crean estas pruebas llevan este prefijo en el nombre y se borran al inicio y al final.
// La bitácora no tiene llave foránea a distrito_salud, así que sus filas no impiden borrarlos.
const PREFIJO = 'vitest-hu08-';

let token;
let administrador;
let municipioSemilla;
let coatepeque;
let migrantes;
let municipioInactivo;

const enviar = (metodo, ruta, cuerpo, credencial = token) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);
const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
const crear = (municipioId, nombre) => enviar('post', '/distritos', { municipioId, nombre: `${PREFIJO}${nombre}` });

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);

// Mismo usuario de prueba con otros permisos o con otra DDRISS; autenticar no compara la DDRISS ni los permisos.
const firmar = (datos) =>
  jwt.sign(
    { rol: 'ADMINISTRADOR', permisos: [], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null, ...datos },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(administrador.id), expiresIn: '5m' },
  );

const filasBitacora = async (accion, distritoId) => {
  const [filas] = await pool.query(
    `SELECT valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND accion = ? AND entidad = 'distrito_salud' AND entidad_id = ?`,
    [accion, String(distritoId)],
  );
  return filas.map((f) => ({ anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
};

async function limpiar() {
  await pool.query('DELETE FROM establecimiento WHERE nombre LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM distrito_salud WHERE nombre LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM municipio WHERE nombre LIKE ?', [`${PREFIJO}%`]);
}

beforeAll(async () => {
  await limpiar();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  administrador = { id: res.body.usuario.id, ddrissId: res.body.usuario.empleado.ddrissId };

  // Un municipio del departamento sede cuyo único código es el de la semilla de prueba (DS-{INE}, sin consecutivo).
  [[municipioSemilla]] = await pool.query(
    `SELECT m.id, m.codigo_ine FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id
      WHERE d.id = ? AND m.activo = TRUE
        AND EXISTS (SELECT 1 FROM distrito_salud ds WHERE ds.codigo = CONCAT('DS-', m.codigo_ine))
        AND NOT EXISTS (SELECT 1 FROM distrito_salud ds WHERE ds.codigo LIKE CONCAT('DS-', m.codigo_ine, '-%'))
      ORDER BY m.id LIMIT 1`,
    [administrador.ddrissId],
  );
  [[coatepeque]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '0920'");
  [[migrantes]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '9999'");

  // Municipio inactivo del departamento sede, propio de estas pruebas; el código empieza con letra, así que no es un INE.
  const [[{ departamento_id: departamentoId }]] = await pool.query('SELECT departamento_id FROM ddriss WHERE id = ?', [
    administrador.ddrissId,
  ]);
  const codigoIne = `Z${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  const [insertado] = await pool.query(
    'INSERT INTO municipio (departamento_id, codigo_ine, nombre, activo) VALUES (?, ?, ?, FALSE)',
    [departamentoId, codigoIne, `${PREFIJO}municipio`],
  );
  municipioInactivo = { id: insertado.insertId, codigoIne };
});

afterAll(limpiar);

describe('GET /distritos', () => {
  it('trae solo los distritos de la DDRISS del usuario, con su municipio y sus establecimientos activos', async () => {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM distrito_salud WHERE ddriss_id = ?', [
      administrador.ddrissId,
    ]);

    const res = await consultar('/distritos');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
    expect(res.body.every((d) => d.ddrissId === administrador.ddrissId)).toBe(true);
    if (res.body.length > 0) {
      expect(Object.keys(res.body[0]).sort()).toEqual([
        'activo', 'codigo', 'ddrissId', 'establecimientosActivos', 'id', 'municipioCodigoIne', 'municipioId',
        'municipioNombre', 'nombre',
      ]);
    }
  });

  it('filtra por municipioId y por activo', async () => {
    const delMunicipio = await consultar(`/distritos?municipioId=${municipioSemilla.id}`);
    expect(delMunicipio.status).toBe(200);
    expect(delMunicipio.body.length).toBeGreaterThan(0);
    expect(delMunicipio.body.every((d) => d.municipioId === municipioSemilla.id)).toBe(true);

    const inactivos = await consultar('/distritos?activo=false');
    expect(inactivos.status).toBe(200);
    expect(inactivos.body.every((d) => d.activo === false)).toBe(true);
  });

  it.each(['municipioId=abc', 'municipioId=0', 'activo=si', 'orden=codigo', 'activo=true&activo=false'])(
    '%s responde 400 ENTRADA_INVALIDA',
    async (consulta) => {
      const res = await consultar(`/distritos?${consulta}`);

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    },
  );
});

describe('POST /distritos', () => {
  it('el primer distrito nuevo de un municipio con el código de la semilla recibe DS-{INE}-02', async () => {
    const res = await crear(municipioSemilla.id, 'Semilla');

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: `DS-${municipioSemilla.codigo_ine}-02`,
      nombre: `${PREFIJO}Semilla`,
      ddrissId: administrador.ddrissId,
      municipioId: municipioSemilla.id,
      municipioCodigoIne: municipioSemilla.codigo_ine,
      establecimientosActivos: 0,
      activo: true,
    });
  });

  it('un segundo distrito en el mismo municipio recibe el consecutivo siguiente', async () => {
    const primero = await crear(municipioSemilla.id, 'Primero');
    const segundo = await crear(municipioSemilla.id, 'Segundo');

    expect(primero.status).toBe(201);
    expect(segundo.status).toBe(201);
    const consecutivo = (codigo) => Number(codigo.split('-').at(-1));
    expect(primero.body.codigo).toMatch(new RegExp(`^DS-${municipioSemilla.codigo_ine}-\\d{2,}$`));
    expect(consecutivo(segundo.body.codigo)).toBe(consecutivo(primero.body.codigo) + 1);
  });

  it('dos altas a la vez en el mismo municipio reciben códigos distintos', async () => {
    const [uno, dos] = await Promise.all([crear(municipioSemilla.id, 'Paralelo A'), crear(municipioSemilla.id, 'Paralelo B')]);

    expect(uno.status).toBe(201);
    expect(dos.status).toBe(201);
    expect(uno.body.codigo).not.toBe(dos.body.codigo);
  });

  it('limpia los espacios del nombre', async () => {
    const res = await enviar('post', '/distritos', { municipioId: municipioSemilla.id, nombre: `  ${PREFIJO}Con   espacios ` });

    expect(res.status).toBe(201);
    expect(res.body.nombre).toBe(`${PREFIJO}Con espacios`);
  });

  it('el 9999, Coatepeque, un municipio inexistente y uno inactivo responden 422 MUNICIPIO_INVALIDO', async () => {
    for (const municipioId of [migrantes.id, coatepeque.id, 65535, municipioInactivo.id]) {
      const res = await crear(municipioId, 'Municipio inválido');
      expect(res.status, `municipioId ${municipioId}`).toBe(422);
      expect(res.body.error.codigo).toBe('MUNICIPIO_INVALIDO');
    }
  });

  it('un nombre repetido en el mismo municipio, con otras mayúsculas o sin tildes, responde 409 DISTRITO_DUPLICADO', async () => {
    const original = await crear(municipioSemilla.id, 'Tacaná Norte');
    expect(original.status).toBe(201);

    for (const nombre of ['TACANÁ NORTE', 'tacana norte']) {
      const res = await crear(municipioSemilla.id, nombre);
      expect(res.status, nombre).toBe(409);
      expect(res.body.error.codigo).toBe('DISTRITO_DUPLICADO');
    }
  });

  it.each([
    [{ codigo: 'DS-9999-01' }, 'Campo no permitido: codigo.'],
    [{ ddrissId: 2 }, 'Campo no permitido: ddrissId.'],
    [{ activo: false }, 'Campo no permitido: activo.'],
    [{ municipioId: 'uno' }, 'municipioId debe ser un número entero positivo.'],
    [{ nombre: 'DS' }, 'El nombre del distrito debe tener entre 3 y 120 caracteres.'],
    [{ nombre: undefined }, 'El nombre del distrito es obligatorio.'],
  ])('%j responde 400 ENTRADA_INVALIDA', async (cambio, mensaje) => {
    const res = await enviar('post', '/distritos', { municipioId: municipioSemilla.id, nombre: `${PREFIJO}Cuerpo`, ...cambio });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('deja una fila CONFIGURACION / CREAR en la bitácora con el distrito completo', async () => {
    const res = await crear(municipioSemilla.id, 'Bitácora');
    expect(res.status).toBe(201);

    const [filas] = await pool.query(
      `SELECT usuario_id, valores_anteriores, valores_nuevos FROM bitacora
        WHERE modulo = 'CONFIGURACION' AND accion = 'CREAR' AND entidad = 'distrito_salud' AND entidad_id = ?`,
      [String(res.body.id)],
    );
    expect(filas).toHaveLength(1);
    expect(filas[0].usuario_id).toBe(administrador.id);
    expect(filas[0].valores_anteriores).toBeNull();
    expect(leerJson(filas[0].valores_nuevos)).toEqual(res.body);
  });
});

describe('PATCH /distritos/{id}', () => {
  it('cambia el nombre y deja una fila ACTUALIZAR; con el mismo nombre no deja otra', async () => {
    const { body: distrito } = await crear(municipioSemilla.id, 'Antes');

    const res = await enviar('patch', `/distritos/${distrito.id}`, { nombre: `${PREFIJO}Después` });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...distrito, nombre: `${PREFIJO}Después` });
    expect(await filasBitacora('ACTUALIZAR', distrito.id)).toEqual([
      { anteriores: { nombre: `${PREFIJO}Antes` }, nuevos: { nombre: `${PREFIJO}Después` } },
    ]);

    const igual = await enviar('patch', `/distritos/${distrito.id}`, { nombre: ` ${PREFIJO}Después ` });
    expect(igual.status).toBe(200);
    expect(await filasBitacora('ACTUALIZAR', distrito.id)).toHaveLength(1);
  });

  it('el nombre de otro distrito del mismo municipio responde 409 DISTRITO_DUPLICADO', async () => {
    await crear(municipioSemilla.id, 'Ocupado');
    const { body: distrito } = await crear(municipioSemilla.id, 'Libre');

    const res = await enviar('patch', `/distritos/${distrito.id}`, { nombre: `${PREFIJO}ocupado` });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('DISTRITO_DUPLICADO');
  });

  it.each([
    [{ municipioId: 1 }, 'municipioId no se puede cambiar.'],
    [{ codigo: 'DS-1201-99' }, 'codigo no se puede cambiar.'],
    [{ activo: false }, 'Campo no permitido: activo.'],
    [{ nombre: undefined }, 'El nombre del distrito es obligatorio.'],
  ])('%j responde 400 ENTRADA_INVALIDA', async (cambio, mensaje) => {
    const { body: distrito } = await crear(municipioSemilla.id, `Cuerpo ${Object.keys(cambio)[0]}`);

    const res = await enviar('patch', `/distritos/${distrito.id}`, { nombre: `${PREFIJO}Otro`, ...cambio });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });
});

describe('desactivar y reactivar', () => {
  it('desactivar y reactivar dejan sus filas; repetir la misma acción no deja otra', async () => {
    const { body: distrito } = await crear(municipioSemilla.id, 'Estado');

    const desactivado = await enviar('post', `/distritos/${distrito.id}/desactivar`);
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.activo).toBe(false);
    expect((await enviar('post', `/distritos/${distrito.id}/desactivar`)).status).toBe(200);

    const reactivado = await enviar('post', `/distritos/${distrito.id}/reactivar`);
    expect(reactivado.status).toBe(200);
    expect(reactivado.body.activo).toBe(true);
    expect((await enviar('post', `/distritos/${distrito.id}/reactivar`)).status).toBe(200);

    expect(await filasBitacora('DESACTIVAR', distrito.id)).toEqual([{ anteriores: { activo: true }, nuevos: { activo: false } }]);
    expect(await filasBitacora('REACTIVAR', distrito.id)).toEqual([{ anteriores: { activo: false }, nuevos: { activo: true } }]);
  });

  it('un distrito inactivo se puede renombrar', async () => {
    const { body: distrito } = await crear(municipioSemilla.id, 'Inactivo');
    await enviar('post', `/distritos/${distrito.id}/desactivar`);

    const res = await enviar('patch', `/distritos/${distrito.id}`, { nombre: `${PREFIJO}Inactivo renombrado` });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombre: `${PREFIJO}Inactivo renombrado`, activo: false });
  });

  it('con un establecimiento activo, desactivar responde 409 DISTRITO_CON_ESTABLECIMIENTOS y no lo cambia', async () => {
    const { body: distrito } = await crear(municipioSemilla.id, 'Con establecimiento');
    const [[tipo]] = await pool.query('SELECT id FROM tipo_establecimiento ORDER BY id LIMIT 1');
    await pool.query(
      `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, distrito_salud_id, municipio_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [`VT08-${distrito.id}`, `${PREFIJO}establecimiento`, tipo.id, administrador.ddrissId, distrito.id, municipioSemilla.id],
    );

    const lista = await consultar(`/distritos?municipioId=${municipioSemilla.id}`);
    expect(lista.body.find((d) => d.id === distrito.id).establecimientosActivos).toBe(1);

    const res = await enviar('post', `/distritos/${distrito.id}/desactivar`);

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('DISTRITO_CON_ESTABLECIMIENTOS');
    const [[fila]] = await pool.query('SELECT activo FROM distrito_salud WHERE id = ?', [distrito.id]);
    expect(Boolean(fila.activo)).toBe(true);
    expect(await filasBitacora('DESACTIVAR', distrito.id)).toEqual([]);
  });

  it('reactivar con el municipio inactivo responde 422 MUNICIPIO_INVALIDO', async () => {
    const [insertado] = await pool.query(
      'INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre, activo) VALUES (?, ?, ?, ?, FALSE)',
      [administrador.ddrissId, municipioInactivo.id, `DS-${municipioInactivo.codigoIne}-01`, `${PREFIJO}en municipio inactivo`],
    );

    const res = await enviar('post', `/distritos/${insertado.insertId}/reactivar`);

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('MUNICIPIO_INVALIDO');
  });
});

describe('alcance y permisos', () => {
  it('un id inexistente o de otra DDRISS responde 404 NO_ENCONTRADO en las tres operaciones', async () => {
    const { body: distrito } = await crear(municipioSemilla.id, 'Ajeno');
    const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 100, permisos: ['DISTRITO_CONSULTAR', 'DISTRITO_EDITAR'] });

    const listado = await consultar('/distritos', otraDdriss);
    expect(listado.body.find((d) => d.id === distrito.id)).toBeUndefined();

    for (const [id, credencial] of [[65535, token], ['abc', token], [distrito.id, otraDdriss]]) {
      const respuestas = [
        await enviar('patch', `/distritos/${id}`, { nombre: `${PREFIJO}Ajeno 2` }, credencial),
        await enviar('post', `/distritos/${id}/desactivar`, undefined, credencial),
        await enviar('post', `/distritos/${id}/reactivar`, undefined, credencial),
      ];
      for (const res of respuestas) {
        expect(res.status, `id ${id}`).toBe(404);
        expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El distrito de salud no existe.' });
      }
    }
  });

  it('sin el permiso de cada operación responde 403 SIN_PERMISO', async () => {
    const { body: distrito } = await crear(municipioSemilla.id, 'Permisos');
    const soloConsulta = firmar({ permisos: ['DISTRITO_CONSULTAR'] });
    const sinPermisos = firmar({ permisos: ['POBLACION_REGISTRAR'] });

    const respuestas = [
      await consultar('/distritos', sinPermisos),
      await enviar('post', '/distritos', { municipioId: municipioSemilla.id, nombre: `${PREFIJO}Sin permiso` }, soloConsulta),
      await enviar('patch', `/distritos/${distrito.id}`, { nombre: `${PREFIJO}Sin permiso` }, soloConsulta),
      await enviar('post', `/distritos/${distrito.id}/desactivar`, undefined, soloConsulta),
      await enviar('post', `/distritos/${distrito.id}/reactivar`, undefined, soloConsulta),
    ];
    for (const res of respuestas) {
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    }
  });

  it('no hay ruta para borrar, crear ni editar municipios', async () => {
    const respuestas = [
      await enviar('delete', '/municipios/1'),
      await enviar('post', '/municipios', { nombre: 'Nuevo' }),
      await enviar('patch', '/municipios/1', { nombre: 'Otro' }),
    ];
    for (const res of respuestas) expect(res.status).toBe(404);
  });
});
