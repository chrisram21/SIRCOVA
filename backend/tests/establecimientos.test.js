import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';

// Los establecimientos, distritos y municipios que crean estas pruebas llevan este prefijo en el nombre y se borran
// al inicio y al final. La bitácora no tiene llave foránea a establecimiento, así que sus filas no lo impiden.
// Las cuentas de prueba se crean por SQL y nunca inician sesión ni reciben un 403: la bitácora tendría una llave
// foránea a ellas y ya no se podrían borrar.
const PREFIJO = 'vitest-hu09-';

let token;
let administrador;
let tipos;
let sede;
let otroDistrito;
let distritoInactivo;
let coatepeque;
let migrantes;
let municipioInactivo;

// Mismo usuario de prueba con otros permisos o con otra DDRISS; autenticar no compara la DDRISS ni los permisos.
const firmar = (datos) =>
  jwt.sign(
    { rol: 'ADMINISTRADOR', permisos: [], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null, ...datos },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(administrador.id), expiresIn: '5m' },
  );

const enviar = (metodo, ruta, cuerpo, credencial = token) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);

// Un puesto de tipo UM (poco usado) en el municipio de la sede, con su distrito.
const nuevo = (nombre, datos = {}) => ({
  tipoEstablecimientoId: tipos.UM,
  municipioId: sede.municipioId,
  distritoSaludId: sede.distritoId,
  nombre: `${PREFIJO}${nombre}`,
  ...datos,
});
const crear = (nombre, datos) => enviar('post', '/establecimientos', nuevo(nombre, datos));

const consecutivo = (codigo) => Number(codigo.split('-').at(-1));

const filasBitacora = async (accion, establecimientoId) => {
  const [filas] = await pool.query(
    `SELECT valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND accion = ? AND entidad = 'establecimiento' AND entidad_id = ?`,
    [accion, String(establecimientoId)],
  );
  return filas.map((f) => ({ anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
};

async function limpiar() {
  await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO}%`]);
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

  const [filasTipos] = await pool.query('SELECT id, codigo FROM tipo_establecimiento');
  tipos = Object.fromEntries(filasTipos.map((t) => [t.codigo, t.id]));

  // Un municipio activo del departamento sede con un distrito activo de la DDRISS.
  [[sede]] = await pool.query(
    `SELECT m.id AS municipioId, m.codigo_ine AS codigoIne, ds.id AS distritoId
       FROM distrito_salud ds
       JOIN municipio m ON m.id = ds.municipio_id
       JOIN ddriss d ON d.id = ds.ddriss_id AND d.departamento_id = m.departamento_id
      WHERE ds.ddriss_id = ? AND ds.activo = TRUE AND m.activo = TRUE
      ORDER BY m.id LIMIT 1`,
    [administrador.ddrissId],
  );
  [[otroDistrito]] = await pool.query(
    'SELECT id FROM distrito_salud WHERE ddriss_id = ? AND municipio_id <> ? AND activo = TRUE LIMIT 1',
    [administrador.ddrissId, sede.municipioId],
  );
  const sufijo = String(Math.floor(Math.random() * 1000)).padStart(3, '0');
  const [distrito] = await pool.query(
    'INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre, activo) VALUES (?, ?, ?, ?, FALSE)',
    [administrador.ddrissId, sede.municipioId, `ZDS-${sufijo}`, `${PREFIJO}distrito inactivo`],
  );
  distritoInactivo = { id: distrito.insertId };

  [[coatepeque]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '0920'");
  [[migrantes]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '9999'");

  // Municipio inactivo del departamento sede, propio de estas pruebas; el código empieza con letra, así que no es un INE.
  const [[{ departamento_id: departamentoId }]] = await pool.query('SELECT departamento_id FROM ddriss WHERE id = ?', [
    administrador.ddrissId,
  ]);
  const [municipio] = await pool.query(
    'INSERT INTO municipio (departamento_id, codigo_ine, nombre, activo) VALUES (?, ?, ?, FALSE)',
    [departamentoId, `Z${sufijo}`, `${PREFIJO}municipio`],
  );
  municipioInactivo = { id: municipio.insertId };
});

afterAll(limpiar);

describe('POST /establecimientos', () => {
  it('registra uno de la sede con código {TIPO}-{INE}-{NN}, y el siguiente del mismo tipo y municipio sigue el consecutivo', async () => {
    const primero = await crear('Unidad Mínima Uno', {
      direccion: 'Aldea   Tochab, zona 1',
      telefono: '5550 3010',
      correo: '',
      nombreContacto: 'Ana Lucía Pérez',
    });

    expect(primero.status).toBe(201);
    expect(primero.body.codigo).toMatch(new RegExp(`^UM-${sede.codigoIne}-\\d{2,}$`));
    expect(primero.body).toMatchObject({
      nombre: `${PREFIJO}Unidad Mínima Uno`,
      tipoEstablecimientoCodigo: 'UM',
      ddrissId: administrador.ddrissId,
      municipioId: sede.municipioId,
      distritoSaludId: sede.distritoId,
      esExterno: false,
      reportaProduccion: true,
      reporta5c: false,
      soloCobertura: false,
      direccion: 'Aldea Tochab, zona 1',
      telefono: '5550-3010',
      correo: null,
      nombreContacto: 'Ana Lucía Pérez',
      cuentasActivas: 0,
      activo: true,
    });
    const [[guardado]] = await pool.query('SELECT telefono, correo FROM establecimiento WHERE id = ?', [primero.body.id]);
    expect(guardado).toEqual({ telefono: '5550-3010', correo: null });

    const segundo = await crear('Unidad Mínima Dos');

    expect(segundo.status).toBe(201);
    expect(consecutivo(segundo.body.codigo)).toBe(consecutivo(primero.body.codigo) + 1);
  });

  it('dos altas a la vez del mismo tipo y municipio reciben códigos distintos', async () => {
    const [a, b] = await Promise.all([crear('Paralelo A'), crear('Paralelo B')]);

    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body.codigo).not.toBe(b.body.codigo);
  });

  it('un centro de salud en San Marcos cuenta el CS-1201 de la semilla como 01', async () => {
    const [[sanMarcos]] = await pool.query(
      `SELECT m.id, ds.id AS distrito_id FROM municipio m
         JOIN distrito_salud ds ON ds.municipio_id = m.id AND ds.activo = TRUE AND ds.ddriss_id = ?
        WHERE m.codigo_ine = '1201' LIMIT 1`,
      [administrador.ddrissId],
    );
    const [codigos] = await pool.query("SELECT codigo FROM establecimiento WHERE codigo LIKE 'CS-1201-%'");
    const ultimo = Math.max(1, ...codigos.map((f) => consecutivo(f.codigo)).filter(Number.isInteger));

    const res = await crear('Centro de Salud de prueba', {
      tipoEstablecimientoId: tipos.CS,
      municipioId: sanMarcos.id,
      distritoSaludId: sanMarcos.distrito_id,
    });

    expect(res.status).toBe(201);
    expect(res.body.codigo).toBe(`CS-1201-${String(ultimo + 1).padStart(2, '0')}`);
  });

  it('en un municipio de otro departamento queda externo y sin distrito; con distrito responde 422', async () => {
    const externo = await crear('Externo Coatepeque', { municipioId: coatepeque.id, distritoSaludId: null });

    expect(externo.status).toBe(201);
    expect(externo.body).toMatchObject({
      esExterno: true, distritoSaludId: null, distritoSaludCodigo: null, municipioCodigoIne: '0920',
    });
    expect(externo.body.codigo).toMatch(/^UM-0920-\d{2,}$/);

    const sinDistrito = await crear('Externo sin distrito', { municipioId: coatepeque.id, distritoSaludId: undefined });
    expect(sinDistrito.status).toBe(201);

    const conDistrito = await crear('Externo con distrito', { municipioId: coatepeque.id });
    expect(conDistrito.status).toBe(422);
    expect(conDistrito.body.error).toEqual({
      codigo: 'DISTRITO_INVALIDO',
      mensaje: 'Un establecimiento externo no lleva distrito de salud.',
    });
  });

  it('en la sede, sin distrito, con uno de otro municipio o con uno inactivo responde 422 DISTRITO_INVALIDO', async () => {
    for (const distritoSaludId of [null, otroDistrito.id, distritoInactivo.id, 65000]) {
      const res = await crear('Distrito inválido', { distritoSaludId });

      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'DISTRITO_INVALIDO',
        mensaje: 'El distrito de salud no existe, está inactivo o no es del municipio.',
      });
    }
  });

  it('el 9999, un municipio inexistente o uno inactivo responden 422 MUNICIPIO_INVALIDO', async () => {
    for (const municipioId of [migrantes.id, 65000, municipioInactivo.id]) {
      const res = await crear('Municipio inválido', { municipioId, distritoSaludId: null });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('MUNICIPIO_INVALIDO');
    }
  });

  it('un tipo inexistente responde 422 TIPO_INVALIDO', async () => {
    const res = await crear('Tipo inválido', { tipoEstablecimientoId: 250 });

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ codigo: 'TIPO_INVALIDO', mensaje: 'El tipo de establecimiento no existe.' });
  });

  it('reporta5c o soloCobertura sin reportaProduccion responden 422 MARCAS_INVALIDAS', async () => {
    for (const marca of ['reporta5c', 'soloCobertura']) {
      const res = await crear('Marcas inválidas', { reportaProduccion: false, [marca]: true });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('MARCAS_INVALIDAS');
    }
  });

  it('acepta las marcas del 5C y de solo cobertura juntas', async () => {
    const res = await crear('Hospital de cobertura', { reporta5c: true, soloCobertura: true });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ reportaProduccion: true, reporta5c: true, soloCobertura: true });
  });

  it('un nombre repetido en el mismo municipio, con otras mayúsculas o sin tildes, responde 409', async () => {
    const original = await crear('Puesto Árbol Único');
    expect(original.status).toBe(201);

    for (const nombre of ['PUESTO ÁRBOL ÚNICO', 'Puesto Arbol Unico']) {
      const res = await crear(nombre);

      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        codigo: 'ESTABLECIMIENTO_DUPLICADO',
        mensaje: 'Ya hay un establecimiento con ese nombre en el municipio.',
      });
    }
  });

  it.each([
    [{ codigo: 'UM-0000-01' }, 'Campo no permitido: codigo.'],
    [{ ddrissId: 1 }, 'Campo no permitido: ddrissId.'],
    [{ esExterno: true }, 'Campo no permitido: esExterno.'],
    [{ activo: false }, 'Campo no permitido: activo.'],
    [{ tipoEstablecimientoId: '4' }, 'tipoEstablecimientoId debe ser un número entero positivo.'],
    [{ reporta5c: 'si' }, 'reporta5c debe ser true o false.'],
    [{ nombre: 'PS' }, 'El nombre del establecimiento debe tener entre 3 y 150 caracteres.'],
    [{ telefono: '1234' }, 'El teléfono debe tener 8 dígitos y empezar con 2 a 7.'],
    [{ correo: 'sin-arroba' }, 'El correo no es válido.'],
  ])('%j responde 400 ENTRADA_INVALIDA', async (datos, mensaje) => {
    const res = await enviar('post', '/establecimientos', { ...nuevo('Entrada inválida'), ...datos });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('deja una fila CONFIGURACION / CREAR con el establecimiento completo', async () => {
    const res = await crear('Con bitácora');

    expect(res.status).toBe(201);
    const filas = await filasBitacora('CREAR', res.body.id);
    expect(filas).toHaveLength(1);
    expect(filas[0].anteriores).toBeNull();
    expect(filas[0].nuevos).toEqual(res.body);
  });
});

describe('PATCH /establecimientos/{id}', () => {
  let establecimiento;

  beforeAll(async () => {
    const res = await crear('Para editar', { nombreContacto: 'Ana Pérez', reporta5c: true });
    establecimiento = res.body;
  });

  it('cambia el nombre y el contacto y deja una fila ACTUALIZAR; con los mismos valores no deja otra', async () => {
    const cambios = { nombre: `${PREFIJO}Editado`, nombreContacto: 'Luis Fernando García' };

    const res = await enviar('patch', `/establecimientos/${establecimiento.id}`, cambios);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ...cambios, codigo: establecimiento.codigo });
    expect(await filasBitacora('ACTUALIZAR', establecimiento.id)).toEqual([
      { anteriores: { nombre: establecimiento.nombre, nombreContacto: 'Ana Pérez' }, nuevos: cambios },
    ]);

    const igual = await enviar('patch', `/establecimientos/${establecimiento.id}`, cambios);
    expect(igual.status).toBe(200);
    expect(await filasBitacora('ACTUALIZAR', establecimiento.id)).toHaveLength(1);
  });

  it('vacío o null guardan NULL en los datos opcionales', async () => {
    const res = await enviar('patch', `/establecimientos/${establecimiento.id}`, { nombreContacto: '', correo: null });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombreContacto: null, correo: null });
  });

  it.each([
    ['codigo', 'UM-0000-01'],
    ['tipoEstablecimientoId', 1],
    ['municipioId', 1],
    ['distritoSaludId', 1],
    ['ddrissId', 1],
    ['esExterno', true],
  ])('%s responde 400 porque no se puede cambiar', async (campo, valor) => {
    const res = await enviar('patch', `/establecimientos/${establecimiento.id}`, { [campo]: valor });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: `${campo} no se puede cambiar.` });
  });

  it('activo, un campo desconocido o un cuerpo vacío responden 400', async () => {
    for (const [cuerpo, mensaje] of [
      [{ activo: false }, 'Campo no permitido: activo.'],
      [{ color: 'azul' }, 'Campo no permitido: color.'],
      [{}, 'Indique al menos un dato del establecimiento.'],
    ]) {
      const res = await enviar('patch', `/establecimientos/${establecimiento.id}`, cuerpo);

      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
    }
  });

  it('desmarcar reportaProduccion en uno que envía el 5C responde 422 MARCAS_INVALIDAS', async () => {
    const res = await enviar('patch', `/establecimientos/${establecimiento.id}`, { reportaProduccion: false });

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('MARCAS_INVALIDAS');

    const juntas = await enviar('patch', `/establecimientos/${establecimiento.id}`, {
      reportaProduccion: false,
      reporta5c: false,
    });
    expect(juntas.status).toBe(200);
    expect(juntas.body).toMatchObject({ reportaProduccion: false, reporta5c: false });
  });

  it('con un teléfono guardado en otro formato, cambiar solo el nombre responde 200', async () => {
    await pool.query("UPDATE establecimiento SET telefono = '1234' WHERE id = ?", [establecimiento.id]);

    const res = await enviar('patch', `/establecimientos/${establecimiento.id}`, {
      nombre: `${PREFIJO}Teléfono viejo`,
      telefono: '1234',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombre: `${PREFIJO}Teléfono viejo`, telefono: '1234' });
  });

  it('un nombre que ya tiene otro del mismo municipio responde 409', async () => {
    const otro = await crear('Nombre ocupado');

    const res = await enviar('patch', `/establecimientos/${establecimiento.id}`, { nombre: `${PREFIJO}nombre OCUPADO` });

    expect(otro.status).toBe(201);
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('ESTABLECIMIENTO_DUPLICADO');
  });
});

describe('desactivar y reactivar', () => {
  it('con una cuenta activa responde 409 ESTABLECIMIENTO_CON_CUENTAS y no lo cambia', async () => {
    const { body: establecimiento } = await crear('Con cuenta');
    const [empleado] = await pool.query(
      "INSERT INTO empleado (nombres, apellidos, correo, establecimiento_id, ddriss_id) VALUES ('Prueba', 'HU-09', ?, ?, ?)",
      [`${PREFIJO}cuenta@prueba.local`, establecimiento.id, administrador.ddrissId],
    );
    await pool.query(
      `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id, debe_cambiar_contrasena)
       SELECT ?, ?, 'sin-contrasena', id, FALSE FROM rol WHERE codigo = 'ESTABLECIMIENTO'`,
      [empleado.insertId, `${PREFIJO}cuenta`],
    );

    const consulta = await enviar('get', `/establecimientos/${establecimiento.id}`);
    const res = await enviar('post', `/establecimientos/${establecimiento.id}/desactivar`);

    expect(consulta.body.cuentasActivas).toBe(1);
    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'ESTABLECIMIENTO_CON_CUENTAS',
      mensaje: 'El establecimiento tiene 1 cuenta activa; muévala o desactívela en Usuarios primero.',
    });
    const [[guardado]] = await pool.query('SELECT activo FROM establecimiento WHERE id = ?', [establecimiento.id]);
    expect(Boolean(guardado.activo)).toBe(true);
    expect(await filasBitacora('DESACTIVAR', establecimiento.id)).toEqual([]);
  });

  it('desactivar y reactivar dejan sus filas; repetir la acción no deja otra', async () => {
    const { body: establecimiento } = await crear('Desactivar y reactivar');

    const desactivado = await enviar('post', `/establecimientos/${establecimiento.id}/desactivar`);
    const otraVez = await enviar('post', `/establecimientos/${establecimiento.id}/desactivar`);
    const activos = await enviar('get', '/establecimientos?activo=true');

    expect(desactivado.status).toBe(200);
    expect(desactivado.body.activo).toBe(false);
    expect(otraVez.status).toBe(200);
    expect(activos.body.find((e) => e.id === establecimiento.id)).toBeUndefined();
    expect(await filasBitacora('DESACTIVAR', establecimiento.id)).toEqual([
      { anteriores: { activo: true }, nuevos: { activo: false } },
    ]);

    const reactivado = await enviar('post', `/establecimientos/${establecimiento.id}/reactivar`);
    const deNuevo = await enviar('post', `/establecimientos/${establecimiento.id}/reactivar`);

    expect(reactivado.status).toBe(200);
    expect(reactivado.body.activo).toBe(true);
    expect(deNuevo.status).toBe(200);
    expect(await filasBitacora('REACTIVAR', establecimiento.id)).toEqual([
      { anteriores: { activo: false }, nuevos: { activo: true } },
    ]);
  });

  it('reactivar con su distrito inactivo responde 422 DISTRITO_INVALIDO', async () => {
    const [distrito] = await pool.query(
      'INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre) VALUES (?, ?, ?, ?)',
      [administrador.ddrissId, sede.municipioId, `ZDT-${Date.now() % 100000}`, `${PREFIJO}distrito temporal`],
    );
    const { body: establecimiento } = await crear('Distrito que se apaga', { distritoSaludId: distrito.insertId });
    await enviar('post', `/establecimientos/${establecimiento.id}/desactivar`);
    await pool.query('UPDATE distrito_salud SET activo = FALSE WHERE id = ?', [distrito.insertId]);

    const res = await enviar('post', `/establecimientos/${establecimiento.id}/reactivar`);

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('DISTRITO_INVALIDO');
  });
});

describe('alcance, permisos y rutas', () => {
  let establecimiento;

  beforeAll(async () => {
    ({ body: establecimiento } = await crear('Alcance'));
  });

  it('un id inexistente o de otra DDRISS responde 404 en las tres escrituras', async () => {
    const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['ESTABLECIMIENTO_EDITAR'] });

    for (const [ruta, credencial] of [
      ['/establecimientos/999999999', token],
      [`/establecimientos/${establecimiento.id}`, otraDdriss],
    ]) {
      for (const [metodo, sufijo, cuerpo] of [
        ['patch', '', { nombre: `${PREFIJO}Fuera` }],
        ['post', '/desactivar'],
        ['post', '/reactivar'],
      ]) {
        const res = await enviar(metodo, `${ruta}${sufijo}`, cuerpo, credencial);
        expect(res.status).toBe(404);
        expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El establecimiento no existe.' });
      }
    }
  });

  it('sin ESTABLECIMIENTO_CREAR o ESTABLECIMIENTO_EDITAR responde 403', async () => {
    const soloConsulta = firmar({ permisos: ['ESTABLECIMIENTO_CONSULTAR'] });

    for (const [metodo, ruta, cuerpo] of [
      ['post', '/establecimientos', nuevo('Sin permiso')],
      ['patch', `/establecimientos/${establecimiento.id}`, { nombre: `${PREFIJO}Sin permiso` }],
      ['post', `/establecimientos/${establecimiento.id}/desactivar`],
      ['post', `/establecimientos/${establecimiento.id}/reactivar`],
    ]) {
      const res = await enviar(metodo, ruta, cuerpo, soloConsulta);
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    }
  });

  it('DELETE /establecimientos/{id} responde 404 porque la ruta no existe', async () => {
    const res = await enviar('delete', `/establecimientos/${establecimiento.id}`);

    expect(res.status).toBe(404);
    const [[guardado]] = await pool.query('SELECT id FROM establecimiento WHERE id = ?', [establecimiento.id]);
    expect(guardado).toBeDefined();
  });
});
