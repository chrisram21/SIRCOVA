import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
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

async function limpiar() {
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
