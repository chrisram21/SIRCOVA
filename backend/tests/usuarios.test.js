import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import bcrypt from 'bcrypt';
import { randomInt } from 'node:crypto';
import { ALFABETO, LARGO } from '../src/modulos/auth/contrasenaTemporal.service.js';
import { huellaCui } from '../src/modulos/usuarios/cui.service.js';

// Todo lo que crean estas pruebas lleva este prefijo y se borra en afterAll. Nunca se inicia sesión con las cuentas
// creadas: la bitácora tiene llave foránea a usuario y entonces ya no se podrían borrar.
const PREFIJO = 'vitest-hu04-';

let token;
let administrador;
let establecimientoActivo;
let establecimientoInactivoId;

const firmar = (datos) =>
  jwt.sign(
    { rol: 'ADMINISTRADOR', permisos: [], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null, ...datos },
    entorno.jwt.secreto,
    { algorithm: 'HS256', subject: String(administrador.id), expiresIn: '5m' },
  );

let consecutivo = 0;
const unico = () => `${Date.now().toString(36)}${(consecutivo += 1)}`;
const correoUnico = () => `${PREFIJO}${unico()}@prueba.local`;

// CUI ficticio al azar que cumple el dígito verificador, para que las corridas no choquen por uq_empleado_cui.
function cuiFicticio() {
  for (;;) {
    const correlativo = String(randomInt(0, 1e8)).padStart(8, '0');
    const residuo = [...correlativo].reduce((suma, digito, i) => suma + Number(digito) * (i + 2), 0) % 11;
    if (residuo === 10) continue;
    return `${correlativo}${residuo}${String(randomInt(1, 23)).padStart(2, '0')}01`;
  }
}
const conEspacios = (cui) => `${cui.slice(0, 4)} ${cui.slice(4, 9)} ${cui.slice(9)}`;

const registrar = (cuerpo, credencial = token) =>
  request(app).post('/api/v1/empleados').set('Authorization', `Bearer ${credencial}`).send(cuerpo);

const minimo = (extra = {}) => ({
  nombres: 'Prueba', apellidos: 'Prueba Cuatro', correo: correoUnico(), cui: cuiFicticio(), ...extra,
});

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  administrador = { id: res.body.usuario.id, ddrissId: res.body.usuario.empleado.ddrissId };

  [[establecimientoActivo]] = await pool.query(
    'SELECT id, municipio_id, tipo_establecimiento_id FROM establecimiento WHERE ddriss_id = ? AND activo = TRUE LIMIT 1',
    [administrador.ddrissId],
  );
  if (!establecimientoActivo) throw new Error('La base de prueba no tiene establecimientos activos en la DDRISS del usuario');

  const [resultado] = await pool.query(
    `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, municipio_id, activo)
     VALUES (?, 'Establecimiento inactivo de prueba', ?, ?, ?, FALSE)`,
    [`${PREFIJO}inact`, establecimientoActivo.tipo_establecimiento_id, administrador.ddrissId, establecimientoActivo.municipio_id],
  );
  establecimientoInactivoId = resultado.insertId;
});

afterAll(async () => {
  await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM establecimiento WHERE codigo = ?', [`${PREFIJO}inact`]);
});

describe('POST /empleados', () => {
  it('con datos mínimos responde 201, guarda la DDRISS del administrador y registra la bitácora', async () => {
    const res = await registrar(minimo({ cargo: '  ', telefono: '' }));

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      cuiRegistrado: true,
      nombres: 'Prueba',
      apellidos: 'Prueba Cuatro',
      cargo: null,
      telefono: null,
      establecimientoId: null,
      municipioId: null,
      ddrissId: administrador.ddrissId,
      activo: true,
    });

    const [[fila]] = await pool.query('SELECT ddriss_id, cargo FROM empleado WHERE id = ?', [res.body.id]);
    expect(fila).toEqual({ ddriss_id: administrador.ddrissId, cargo: null });

    const [bitacora] = await pool.query(
      `SELECT usuario_id, valores_nuevos FROM bitacora
        WHERE modulo = 'USUARIOS' AND accion = 'CREAR' AND entidad = 'empleado' AND entidad_id = ?`,
      [String(res.body.id)],
    );
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0].usuario_id).toBe(administrador.id);
    const valores = typeof bitacora[0].valores_nuevos === 'string' ? JSON.parse(bitacora[0].valores_nuevos) : bitacora[0].valores_nuevos;
    expect(valores).toMatchObject({ id: res.body.id, ddrissId: administrador.ddrissId });
  });

  it('ignora una DDRISS enviada en el cuerpo', async () => {
    const res = await registrar(minimo({ ddrissId: administrador.ddrissId + 100 }));

    expect(res.status).toBe(201);
    expect(res.body.ddrissId).toBe(administrador.ddrissId);
  });

  it('con establecimiento, el municipio sale del establecimiento', async () => {
    const res = await registrar(minimo({ establecimientoId: establecimientoActivo.id }));

    expect(res.status).toBe(201);
    expect(res.body.establecimientoId).toBe(establecimientoActivo.id);
    expect(res.body.municipioId).toBe(establecimientoActivo.municipio_id);
  });

  it('sin establecimiento acepta un municipio del departamento sede', async () => {
    const res = await registrar(minimo({ municipioId: establecimientoActivo.municipio_id }));

    expect(res.status).toBe(201);
    expect(res.body.municipioId).toBe(establecimientoActivo.municipio_id);
  });

  it('sin nombres, o con establecimiento y municipio juntos, responde 400 ENTRADA_INVALIDA', async () => {
    for (const cuerpo of [
      minimo({ nombres: '   ' }),
      minimo({ establecimientoId: establecimientoActivo.id, municipioId: establecimientoActivo.municipio_id }),
      minimo({ correo: 'sin-arroba' }),
      minimo({ establecimientoId: 'uno' }),
    ]) {
      const res = await registrar(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('con nombres mal escritos o sin correo responde 400 con el mensaje de la regla y no crea nada', async () => {
    const correo = correoUnico();
    for (const [cuerpo, mensaje] of [
      [minimo({ nombres: '123', correo }), 'Los nombres solo pueden tener letras, espacios, apóstrofos y guiones.'],
      [minimo({ correo: undefined }), 'El correo es obligatorio.'],
      [minimo({ correo: '   ' }), 'El correo es obligatorio.'],
      [minimo({ telefono: '9551-1001', correo }), 'El teléfono debe tener 8 dígitos y empezar con 2 a 7.'],
      [minimo({ cargo: '123', correo }), 'El cargo solo puede tener letras, espacios y los signos . , ( ) / -.'],
    ]) {
      const res = await registrar(cuerpo);
      expect(res.status).toBe(400);
      expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
    }
    const [filas] = await pool.query('SELECT id FROM empleado WHERE correo = ?', [correo]);
    expect(filas).toHaveLength(0);
  });

  it('acepta nombres de varias palabras con apóstrofo, guarda el teléfono como NNNN-NNNN y el correo en minúsculas', async () => {
    const correo = correoUnico();
    const res = await registrar(
      minimo({ nombres: "  María   de los Ángeles ", apellidos: "B'alam Pérez-Gómez", telefono: '+502 5551 1001',
        correo: correo.toUpperCase() }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      nombres: 'María de los Ángeles', apellidos: "B'alam Pérez-Gómez", telefono: '5551-1001', correo,
    });
    const [[fila]] = await pool.query('SELECT nombres, telefono, correo FROM empleado WHERE id = ?', [res.body.id]);
    expect(fila).toEqual({ nombres: 'María de los Ángeles', telefono: '5551-1001', correo });
  });

  it('un establecimiento inexistente, inactivo o de otra DDRISS responde 422 ESTABLECIMIENTO_INVALIDO', async () => {
    const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 100, permisos: ['EMPLEADO_CREAR'] });
    for (const [cuerpo, credencial] of [
      [minimo({ establecimientoId: 999999999 }), token],
      [minimo({ establecimientoId: establecimientoInactivoId }), token],
      [minimo({ establecimientoId: establecimientoActivo.id }), otraDdriss],
    ]) {
      const res = await registrar(cuerpo, credencial);
      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('ESTABLECIMIENTO_INVALIDO');
    }
  });

  it('un municipio de otro departamento responde 422 MUNICIPIO_INVALIDO', async () => {
    const [[municipio]] = await pool.query(
      `SELECT m.id FROM municipio m
        WHERE m.departamento_id <> (SELECT departamento_id FROM ddriss WHERE id = ?) LIMIT 1`,
      [administrador.ddrissId],
    );
    if (!municipio) return;

    const res = await registrar(minimo({ municipioId: municipio.id }));

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('MUNICIPIO_INVALIDO');
  });

  it('un correo o un CUI repetidos responden 409, aunque el CUI se escriba con espacios', async () => {
    const correo = correoUnico();
    const cui = cuiFicticio();
    expect((await registrar(minimo({ correo, cui }))).status).toBe(201);

    const porCorreo = await registrar(minimo({ correo }));
    expect(porCorreo.status).toBe(409);
    expect(porCorreo.body.error.codigo).toBe('CORREO_DUPLICADO');

    const porCui = await registrar(minimo({ cui: conEspacios(cui) }));
    expect(porCui.status).toBe(409);
    expect(porCui.body.error).toEqual({ codigo: 'CUI_DUPLICADO', mensaje: 'Ya hay un empleado registrado con ese CUI.' });
  });

  it('sin EMPLEADO_CREAR responde 403 SIN_PERMISO', async () => {
    const res = await registrar(minimo(), firmar({ permisos: ['USUARIO_CREAR'] }));

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('POST /usuarios', () => {
  let roles;

  const crearCuenta = (cuerpo, credencial = token) =>
    request(app).post('/api/v1/usuarios').set('Authorization', `Bearer ${credencial}`).send(cuerpo);

  const nuevoEmpleado = async (extra) => (await registrar(minimo(extra))).body;
  const nombreUnico = () => `${PREFIJO}${unico()}`;
  const cuenta = (empleado, extra = {}) => ({
    empleadoId: empleado.id,
    nombreUsuario: nombreUnico(),
    rolId: roles.REVISOR,
    ...extra,
  });

  beforeAll(async () => {
    const [filas] = await pool.query('SELECT id, codigo FROM rol');
    roles = Object.fromEntries(filas.map((r) => [r.codigo, r.id]));
  });

  it('responde 201 con la contraseña generada y sin hash, guarda bcrypt y el administrador que la creó, y registra la bitácora', async () => {
    const empleado = await nuevoEmpleado();
    const cuerpo = cuenta(empleado);

    const res = await crearCuenta(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      empleadoId: empleado.id,
      nombreUsuario: cuerpo.nombreUsuario,
      rol: 'REVISOR',
      rolNombre: expect.any(String),
      activo: true,
      debeCambiarContrasena: true,
      contrasenaTemporal: expect.stringMatching(new RegExp(`^[${ALFABETO}]{${LARGO}}$`)),
    });
    const CONTRASENA = res.body.contrasenaTemporal;
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);

    const [[fila]] = await pool.query(
      'SELECT hash_contrasena, creado_por, debe_cambiar_contrasena, rol_id FROM usuario WHERE id = ?',
      [res.body.id],
    );
    expect(fila.hash_contrasena).toMatch(/^\$2[aby]\$12\$/);
    // Se comprueba contra el hash, sin iniciar sesión: un LOGIN_OK impediría borrar la cuenta.
    expect(await bcrypt.compare(CONTRASENA, fila.hash_contrasena)).toBe(true);
    expect(fila.creado_por).toBe(administrador.id);
    expect(Boolean(fila.debe_cambiar_contrasena)).toBe(true);
    expect(fila.rol_id).toBe(roles.REVISOR);

    const [bitacora] = await pool.query(
      `SELECT usuario_id, valores_nuevos FROM bitacora
        WHERE modulo = 'USUARIOS' AND accion = 'CREAR' AND entidad = 'usuario' AND entidad_id = ?`,
      [String(res.body.id)],
    );
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0].usuario_id).toBe(administrador.id);
    const texto = JSON.stringify(bitacora[0].valores_nuevos);
    expect(texto.includes(CONTRASENA)).toBe(false);
    expect(texto).not.toMatch(/\$2[aby]\$/);
  });

  it('un segundo intento para el mismo empleado responde 409 EMPLEADO_CON_CUENTA', async () => {
    const empleado = await nuevoEmpleado();
    expect((await crearCuenta(cuenta(empleado))).status).toBe(201);

    const res = await crearCuenta(cuenta(empleado));

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('EMPLEADO_CON_CUENTA');
  });

  it('un nombre de usuario repetido responde 409 NOMBRE_USUARIO_DUPLICADO', async () => {
    const nombreUsuario = nombreUnico();
    expect((await crearCuenta(cuenta(await nuevoEmpleado(), { nombreUsuario }))).status).toBe(201);

    const res = await crearCuenta(cuenta(await nuevoEmpleado(), { nombreUsuario }));

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('NOMBRE_USUARIO_DUPLICADO');
  });

  it('un empleado inexistente, inactivo o de otra DDRISS responde 404 NO_ENCONTRADO', async () => {
    const inactivo = await nuevoEmpleado();
    await pool.query('UPDATE empleado SET activo = FALSE WHERE id = ?', [inactivo.id]);
    const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 100, permisos: ['USUARIO_CREAR'] });

    for (const [cuerpo, credencial] of [
      [cuenta({ id: 999999999 }), token],
      [cuenta(inactivo), token],
      [cuenta(await nuevoEmpleado()), otraDdriss],
    ]) {
      const res = await crearCuenta(cuerpo, credencial);
      expect(res.status).toBe(404);
      expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
    }
  });

  it('un rol inexistente responde 422 ROL_INVALIDO', async () => {
    const res = await crearCuenta(cuenta(await nuevoEmpleado(), { rolId: 250 }));

    expect(res.status).toBe(422);
    expect(res.body.error.codigo).toBe('ROL_INVALIDO');
  });

  it('el rol ESTABLECIMIENTO exige que el empleado tenga establecimiento', async () => {
    const sinEstablecimiento = await crearCuenta(cuenta(await nuevoEmpleado(), { rolId: roles.ESTABLECIMIENTO }));
    expect(sinEstablecimiento.status).toBe(422);
    expect(sinEstablecimiento.body.error.codigo).toBe('EMPLEADO_SIN_ESTABLECIMIENTO');

    const conEstablecimiento = await crearCuenta(
      cuenta(await nuevoEmpleado({ establecimientoId: establecimientoActivo.id }), { rolId: roles.ESTABLECIMIENTO }),
    );
    expect(conEstablecimiento.status).toBe(201);
    expect(conEstablecimiento.body.rol).toBe('ESTABLECIMIENTO');
  });

  it('un nombre de usuario con espacios, un rol no numérico o una contraseña enviada responden 400 ENTRADA_INVALIDA', async () => {
    const empleado = await nuevoEmpleado();
    for (const extra of [
      { nombreUsuario: `${PREFIJO}con espacio` },
      { nombreUsuario: 'ab' },
      { nombreUsuario: 'Ana López' },
      { nombreUsuario: `${PREFIJO}Mayuscula` },
      { contrasenaTemporal: 'Temporal-hu04-larga' },
      { contrasenaTemporal: null },
      { rolId: 'REVISOR' },
    ]) {
      const res = await crearCuenta(cuenta(empleado, extra));
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
    const [conCuenta] = await pool.query('SELECT id FROM usuario WHERE empleado_id = ?', [empleado.id]);
    expect(conCuenta).toHaveLength(0);
  });

  it('sin USUARIO_CREAR responde 403 SIN_PERMISO', async () => {
    const res = await crearCuenta(cuenta(await nuevoEmpleado()), firmar({ permisos: ['EMPLEADO_CREAR'] }));

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});

// HU-05. Mismas reglas que arriba, con su propio prefijo: el personal se crea con la API y se borra en afterAll.
describe('HU-05: cuentas existentes', () => {
  const PREFIJO_HU05 = 'vitest-hu05-';
  let roles;

  const pedir = (metodo, ruta, credencial = token) =>
    request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
  // Con la paginación, una cuenta recién creada puede no estar en la primera página: se busca por su nombre de usuario.
  const buscarCuenta = async (nombreUsuario) => {
    const res = await pedir('get', '/usuarios').query({ busqueda: nombreUsuario });
    expect(res.status).toBe(200);
    return res.body.elementos.find((u) => u.nombreUsuario === nombreUsuario);
  };

  async function crearPersonal({ empleado = {}, rol = 'REVISOR', prefijo = PREFIJO_HU05 } = {}) {
    const alta = await registrar({
      nombres: 'Prueba',
      apellidos: 'Prueba Cinco',
      correo: `${prefijo}${unico()}@prueba.local`,
      cui: cuiFicticio(),
      ...empleado,
    });
    expect(alta.status).toBe(201);
    const cuenta = await request(app)
      .post('/api/v1/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .send({ empleadoId: alta.body.id, nombreUsuario: `${prefijo}${unico()}`, rolId: roles[rol] });
    expect(cuenta.status).toBe(201);
    const { contrasenaTemporal, ...usuario } = cuenta.body;
    return { empleado: alta.body, usuario, contrasenaTemporal };
  }

  const desactivarPorSql = (id) =>
    pool.query('UPDATE usuario SET activo = FALSE, desactivado_en = NOW() WHERE id = ?', [id]);

  const bitacoraDe = async (entidad, id, accion) => {
    const [filas] = await pool.query(
      `SELECT usuario_id, valores_anteriores, valores_nuevos FROM bitacora
        WHERE entidad = ? AND entidad_id = ? AND accion = ? ORDER BY id`,
      [entidad, String(id), accion],
    );
    return filas;
  };

  beforeAll(async () => {
    const [filas] = await pool.query('SELECT id, codigo FROM rol');
    roles = Object.fromEntries(filas.map((r) => [r.codigo, r.id]));
  });

  afterAll(async () => {
    await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO_HU05}%`]);
    await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO_HU05}%`]);
  });

  describe('GET /usuarios y GET /usuarios/{id}', () => {
    it('GET /usuarios devuelve solo las cuentas de su DDRISS, activas y desactivadas, sin hash ni contraseña', async () => {
      const activa = await crearPersonal({ empleado: { establecimientoId: establecimientoActivo.id, cargo: 'Enfermera' } });
      const desactivada = await crearPersonal();
      await desactivarPorSql(desactivada.usuario.id);
      const [[{ total }]] = await pool.query(
        'SELECT COUNT(*) AS total FROM usuario u JOIN empleado e ON e.id = u.empleado_id WHERE e.ddriss_id = ?',
        [administrador.ddrissId],
      );
      const [[{ hash }]] = await pool.query('SELECT hash_contrasena AS hash FROM usuario WHERE id = ?', [activa.usuario.id]);

      const res = await pedir('get', '/usuarios');

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ total, pagina: 1, porPagina: 20 });
      expect(res.body.elementos).toHaveLength(Math.min(total, 20));
      expect(res.body.elementos.every((u) => u.empleado.ddrissId === administrador.ddrissId)).toBe(true);
      for (const clave of ['hashContrasena', 'intentosFallidos', 'bloqueadoHasta']) {
        expect(res.body.elementos[0]).not.toHaveProperty(clave);
      }

      const filaActiva = await buscarCuenta(activa.usuario.nombreUsuario);
      expect(JSON.stringify(filaActiva)).not.toContain(hash);
      expect(filaActiva).toEqual({
        ...activa.usuario,
        bloqueada: false,
        ultimoAcceso: null,
        desactivadoEn: null,
        empleado: {
          ...activa.empleado,
          establecimientoNombre: expect.any(String),
          municipioNombre: expect.any(String),
        },
      });

      const filaDesactivada = await buscarCuenta(desactivada.usuario.nombreUsuario);
      expect(filaDesactivada.activo).toBe(false);
      // La fecha debe ser la de ahora en UTC: si saliera corrida por la zona horaria, quedaría a horas de distancia.
      expect(Math.abs(Date.parse(filaDesactivada.desactivadoEn) - Date.now())).toBeLessThan(5 * 60_000);
    });

    it('GET /usuarios/{id} devuelve la misma cuenta que el listado', async () => {
      const { usuario } = await crearPersonal();

      const detalle = await pedir('get', `/usuarios/${usuario.id}`);
      const enListado = await buscarCuenta(usuario.nombreUsuario);

      expect(detalle.status).toBe(200);
      expect(detalle.body).toEqual(enListado);
    });

    it('GET /usuarios/{id} de otra DDRISS o inexistente responde 404 NO_ENCONTRADO', async () => {
      const { usuario } = await crearPersonal();
      const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['USUARIO_CONSULTAR'] });

      for (const [ruta, credencial] of [
        [`/usuarios/${usuario.id}`, otraDdriss],
        ['/usuarios/999999999', token],
        ['/usuarios/abc', token],
      ]) {
        const res = await pedir('get', ruta, credencial);
        expect(res.status).toBe(404);
        expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
      }

      const listadoAjeno = await pedir('get', '/usuarios', otraDdriss);
      expect(listadoAjeno.status).toBe(200);
      expect(listadoAjeno.body).toEqual({ elementos: [], total: 0, pagina: 1, porPagina: 20 });
    });

    it('sin USUARIO_CONSULTAR responde 403 SIN_PERMISO', async () => {
      const sinPermiso = firmar({ permisos: ['USUARIO_CREAR'] });

      for (const ruta of ['/usuarios', `/usuarios/${administrador.id}`]) {
        const res = await pedir('get', ruta, sinPermiso);
        expect(res.status).toBe(403);
        expect(res.body.error.codigo).toBe('SIN_PERMISO');
      }
    });
  });

  describe('PATCH /usuarios/{id}', () => {
    const cambiarRol = (id, cuerpo, credencial) => pedir('patch', `/usuarios/${id}`, credencial).send(cuerpo);

    it('cambia el rol y registra ACTUALIZAR con el rol antes y después', async () => {
      const { usuario } = await crearPersonal();

      const res = await cambiarRol(usuario.id, { rolId: roles.EPIDEMIOLOGIA });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: usuario.id, rol: 'EPIDEMIOLOGIA', activo: true });
      const filas = await bitacoraDe('usuario', usuario.id, 'ACTUALIZAR');
      expect(filas).toHaveLength(1);
      expect(filas[0]).toEqual({
        usuario_id: administrador.id,
        valores_anteriores: { rol: 'REVISOR' },
        valores_nuevos: { rol: 'EPIDEMIOLOGIA' },
      });
    });

    it('el mismo rol responde 200 sin fila nueva en la bitácora', async () => {
      const { usuario } = await crearPersonal();

      const res = await cambiarRol(usuario.id, { rolId: roles.REVISOR });

      expect(res.status).toBe(200);
      expect(res.body.rol).toBe('REVISOR');
      expect(await bitacoraDe('usuario', usuario.id, 'ACTUALIZAR')).toHaveLength(0);
    });

    it('la cuenta propia responde 422 CUENTA_PROPIA y una desactivada 409 CUENTA_DESACTIVADA', async () => {
      const propia = await cambiarRol(administrador.id, { rolId: roles.REVISOR });
      expect(propia.status).toBe(422);
      expect(propia.body.error.codigo).toBe('CUENTA_PROPIA');

      const { usuario } = await crearPersonal();
      await desactivarPorSql(usuario.id);
      const desactivada = await cambiarRol(usuario.id, { rolId: roles.EPIDEMIOLOGIA });
      expect(desactivada.status).toBe(409);
      expect(desactivada.body.error.codigo).toBe('CUENTA_DESACTIVADA');
    });

    it('un rol inexistente responde 422 ROL_INVALIDO y ESTABLECIMIENTO sin establecimiento 422 EMPLEADO_SIN_ESTABLECIMIENTO', async () => {
      const { usuario } = await crearPersonal();

      const inexistente = await cambiarRol(usuario.id, { rolId: 999 });
      expect(inexistente.status).toBe(422);
      expect(inexistente.body.error.codigo).toBe('ROL_INVALIDO');

      const sinEstablecimiento = await cambiarRol(usuario.id, { rolId: roles.ESTABLECIMIENTO });
      expect(sinEstablecimiento.status).toBe(422);
      expect(sinEstablecimiento.body.error.codigo).toBe('EMPLEADO_SIN_ESTABLECIMIENTO');

      const conEstablecimiento = await crearPersonal({ empleado: { establecimientoId: establecimientoActivo.id } });
      const permitido = await cambiarRol(conEstablecimiento.usuario.id, { rolId: roles.ESTABLECIMIENTO });
      expect(permitido.status).toBe(200);
      expect(permitido.body.rol).toBe('ESTABLECIMIENTO');
    });

    it('un campo distinto de rolId o sin rolId responde 400, y otra DDRISS 404', async () => {
      const { usuario } = await crearPersonal();

      for (const cuerpo of [{ rolId: roles.EPIDEMIOLOGIA, activo: false }, {}, { rolId: 'REVISOR' }]) {
        const res = await cambiarRol(usuario.id, cuerpo);
        expect(res.status).toBe(400);
        expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
      }

      const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['USUARIO_EDITAR'] });
      const ajena = await cambiarRol(usuario.id, { rolId: roles.EPIDEMIOLOGIA }, otraDdriss);
      expect(ajena.status).toBe(404);
      expect(ajena.body.error.codigo).toBe('NO_ENCONTRADO');
    });

    it('sin USUARIO_EDITAR responde 403 SIN_PERMISO', async () => {
      const { usuario } = await crearPersonal();

      const res = await cambiarRol(usuario.id, { rolId: roles.EPIDEMIOLOGIA }, firmar({ permisos: ['USUARIO_CONSULTAR'] }));

      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    });
  });

  describe('POST /usuarios/{id}/desactivar y /restaurar', () => {
    const desactivar = (id, credencial) => pedir('post', `/usuarios/${id}/desactivar`, credencial);
    const restaurar = (id, credencial) => pedir('post', `/usuarios/${id}/restaurar`, credencial);

    const estadoEnBase = async (id) => {
      const [[fila]] = await pool.query(
        `SELECT u.activo, u.desactivado_en, u.intentos_fallidos, u.bloqueado_hasta, e.activo AS empleado_activo
           FROM usuario u JOIN empleado e ON e.id = u.empleado_id WHERE u.id = ?`,
        [id],
      );
      return fila;
    };

    it('desactivar deja la cuenta inactiva, el empleado activo y una fila DESACTIVAR', async () => {
      const { usuario } = await crearPersonal();

      const res = await desactivar(usuario.id);

      expect(res.status).toBe(200);
      expect(res.body.activo).toBe(false);
      expect(Math.abs(Date.parse(res.body.desactivadoEn) - Date.now())).toBeLessThan(5 * 60_000);
      const enBase = await estadoEnBase(usuario.id);
      expect(enBase.activo).toBe(0);
      expect(enBase.desactivado_en).not.toBeNull();
      expect(enBase.empleado_activo).toBe(1);
      expect(await bitacoraDe('usuario', usuario.id, 'DESACTIVAR')).toEqual([
        { usuario_id: administrador.id, valores_anteriores: { activo: true }, valores_nuevos: { activo: false } },
      ]);
      // Las acciones pasadas de la cuenta siguen en la bitácora.
      expect(await bitacoraDe('usuario', usuario.id, 'CREAR')).toHaveLength(1);
    });

    it('una cuenta desactivada no puede iniciar sesión y su token ya emitido recibe 401 CUENTA_DESACTIVADA', async () => {
      const { usuario, contrasenaTemporal } = await crearPersonal();
      // POST /usuarios la deja con la contraseña temporal pendiente; sin esto, GET /roles respondería 403.
      await pool.query('UPDATE usuario SET debe_cambiar_contrasena = FALSE WHERE id = ?', [usuario.id]);
      // Token con los mismos datos que daría el login de esa cuenta; nunca se inicia sesión con ella mientras está activa.
      const tokenDeLaCuenta = jwt.sign(
        { rol: 'REVISOR', permisos: ['ROL_CONSULTAR'], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null },
        entorno.jwt.secreto,
        { algorithm: 'HS256', subject: String(usuario.id), expiresIn: '5m' },
      );
      expect((await pedir('get', '/roles', tokenDeLaCuenta)).status).toBe(200);

      expect((await desactivar(usuario.id)).status).toBe(200);

      const conToken = await pedir('get', '/roles', tokenDeLaCuenta);
      expect(conToken.status).toBe(401);
      expect(conToken.body.error.codigo).toBe('CUENTA_DESACTIVADA');

      // El LOGIN_FALLIDO guarda el id solo en entidad_id, sin llave foránea, así que la cuenta se puede borrar después.
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ nombreUsuario: usuario.nombreUsuario, contrasena: contrasenaTemporal });
      expect(login.status).toBe(403);
      expect(login.body.error.codigo).toBe('CUENTA_DESACTIVADA');
    });

    it('restaurar deja la cuenta activa, sin fecha de desactivación ni bloqueo, y una fila REACTIVAR', async () => {
      const { usuario } = await crearPersonal();
      await desactivar(usuario.id);
      await pool.query(
        'UPDATE usuario SET intentos_fallidos = 3, bloqueado_hasta = NOW() + INTERVAL 1 HOUR WHERE id = ?',
        [usuario.id],
      );

      const res = await restaurar(usuario.id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ activo: true, desactivadoEn: null });
      expect(await estadoEnBase(usuario.id)).toMatchObject({
        activo: 1,
        desactivado_en: null,
        intentos_fallidos: 0,
        bloqueado_hasta: null,
      });
      expect(await bitacoraDe('usuario', usuario.id, 'REACTIVAR')).toEqual([
        { usuario_id: administrador.id, valores_anteriores: { activo: false }, valores_nuevos: { activo: true } },
      ]);
    });

    it('repetir desactivar o restaurar responde 200 sin fila nueva', async () => {
      const { usuario } = await crearPersonal();

      expect((await desactivar(usuario.id)).status).toBe(200);
      expect((await desactivar(usuario.id)).status).toBe(200);
      expect((await restaurar(usuario.id)).status).toBe(200);
      expect((await restaurar(usuario.id)).status).toBe(200);

      expect(await bitacoraDe('usuario', usuario.id, 'DESACTIVAR')).toHaveLength(1);
      expect(await bitacoraDe('usuario', usuario.id, 'REACTIVAR')).toHaveLength(1);
    });

    it('desactivar la cuenta propia responde 422 CUENTA_PROPIA', async () => {
      const res = await desactivar(administrador.id);

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('CUENTA_PROPIA');
    });

    it('restaurar una cuenta con el empleado inactivo responde 409 EMPLEADO_INACTIVO', async () => {
      const { usuario, empleado } = await crearPersonal();
      await desactivar(usuario.id);
      await pool.query('UPDATE empleado SET activo = FALSE WHERE id = ?', [empleado.id]);

      const res = await restaurar(usuario.id);

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('EMPLEADO_INACTIVO');
    });

    it('otra DDRISS responde 404 y sin USUARIO_DESACTIVAR 403', async () => {
      const { usuario } = await crearPersonal();
      const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['USUARIO_DESACTIVAR'] });
      const sinPermiso = firmar({ permisos: ['USUARIO_EDITAR'] });

      for (const accion of [desactivar, restaurar]) {
        const ajena = await accion(usuario.id, otraDdriss);
        expect(ajena.status).toBe(404);
        expect(ajena.body.error.codigo).toBe('NO_ENCONTRADO');

        const prohibida = await accion(usuario.id, sinPermiso);
        expect(prohibida.status).toBe(403);
        expect(prohibida.body.error.codigo).toBe('SIN_PERMISO');
      }
    });
  });

  describe('HU-07: búsqueda, filtros y paginación de GET /usuarios', () => {
    const PREFIJO_HU07 = 'vitest-hu07-';
    // Marca solo con letras (la regla de apellidos no acepta números) para que la búsqueda no encuentre cuentas ajenas.
    const marca = Array.from({ length: 10 }, () => 'abcdefghijklmnopqrstuvwxyz'[randomInt(0, 26)]).join('');
    const apellidos = `López ${marca[0].toUpperCase()}${marca.slice(1)}`;
    const cuentas = {};

    const listar = (query, credencial) => pedir('get', '/usuarios', credencial).query(query);
    const idsDe = (res) => res.body.elementos.map((u) => u.id);

    beforeAll(async () => {
      // Mismos apellidos, así el orden (apellidos, nombres) queda Ana, Beto, Ceci, Dora.
      cuentas.ana = await crearPersonal({
        prefijo: PREFIJO_HU07,
        empleado: { nombres: 'Ana', apellidos, establecimientoId: establecimientoActivo.id },
      });
      cuentas.beto = await crearPersonal({ prefijo: PREFIJO_HU07, rol: 'EPIDEMIOLOGIA', empleado: { nombres: 'Beto', apellidos } });
      cuentas.ceci = await crearPersonal({ prefijo: PREFIJO_HU07, empleado: { nombres: 'Ceci', apellidos } });
      cuentas.dora = await crearPersonal({ prefijo: PREFIJO_HU07, empleado: { nombres: 'Dora', apellidos } });
      await desactivarPorSql(cuentas.beto.usuario.id);
      await pool.query(
        'UPDATE usuario SET intentos_fallidos = 5, bloqueado_hasta = NOW() + INTERVAL 15 MINUTE WHERE id = ?',
        [cuentas.ceci.usuario.id],
      );
    });

    afterAll(async () => {
      await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO_HU07}%`]);
      await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO_HU07}%`]);
    });

    const ids = (...nombres) => nombres.map((n) => cuentas[n].usuario.id);

    it('busca por nombre y apellido juntos y por parte del nombre de usuario', async () => {
      const porNombre = await listar({ busqueda: `Ana ${apellidos}` });
      expect(porNombre.status).toBe(200);
      expect(idsDe(porNombre)).toEqual(ids('ana'));
      expect(porNombre.body.total).toBe(1);

      const usuario = cuentas.dora.usuario.nombreUsuario;
      const porUsuario = await listar({ busqueda: usuario.slice(PREFIJO_HU07.length - 3) });
      expect(idsDe(porUsuario)).toEqual(ids('dora'));
    });

    it('busca sin distinguir mayúsculas ni tildes y limpia los espacios', async () => {
      const res = await listar({ busqueda: `  LOPEZ   ${marca}  ` });
      expect(idsDe(res)).toEqual(ids('ana', 'beto', 'ceci', 'dora'));
      expect(res.body.total).toBe(4);
    });

    // Ningún nombre ni nombre de usuario válido tiene %, \ ni "L_pez": si se tomaran como comodines, habría resultados.
    it('trata %, _ y \\ como texto y no como comodines', async () => {
      for (const busqueda of [`${marca}%`, `L_pez ${marca}`, `López\\ ${marca}`, '%']) {
        const res = await listar({ busqueda });
        expect(res.status, busqueda).toBe(200);
        expect(res.body.total, busqueda).toBe(0);
      }
    });

    it('filtra por rol, establecimiento (incluido ninguno) y estado, combinados con la búsqueda', async () => {
      const casos = [
        [{ rolId: roles.EPIDEMIOLOGIA }, ['beto']],
        [{ rolId: roles.REVISOR }, ['ana', 'ceci', 'dora']],
        [{ establecimientoId: establecimientoActivo.id }, ['ana']],
        [{ establecimientoId: 'ninguno' }, ['beto', 'ceci', 'dora']],
        [{ estado: 'ACTIVA' }, ['ana', 'ceci', 'dora']],
        [{ estado: 'DESACTIVADA' }, ['beto']],
        [{ estado: 'BLOQUEADA' }, ['ceci']],
        [{ rolId: roles.REVISOR, establecimientoId: 'ninguno', estado: 'ACTIVA' }, ['ceci', 'dora']],
        [{ rolId: 999999 }, []],
      ];
      for (const [filtros, esperadas] of casos) {
        const res = await listar({ busqueda: marca, ...filtros });
        expect(res.status, JSON.stringify(filtros)).toBe(200);
        expect(idsDe(res), JSON.stringify(filtros)).toEqual(ids(...esperadas));
        expect(res.body.total, JSON.stringify(filtros)).toBe(esperadas.length);
      }
    });

    it('pagina sin repetir cuentas, con el mismo total en cada página', async () => {
      const primera = await listar({ busqueda: marca, porPagina: 2 });
      const segunda = await listar({ busqueda: marca, porPagina: 2, pagina: 2 });

      expect(primera.body).toMatchObject({ total: 4, pagina: 1, porPagina: 2 });
      expect(segunda.body).toMatchObject({ total: 4, pagina: 2, porPagina: 2 });
      expect(idsDe(primera)).toEqual(ids('ana', 'beto'));
      expect(idsDe(segunda)).toEqual(ids('ceci', 'dora'));
    });

    it('una página mayor que la última responde 200 vacía con el total real', async () => {
      const res = await listar({ busqueda: marca, porPagina: 2, pagina: 3 });
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ elementos: [], total: 4, pagina: 3, porPagina: 2 });
    });

    it('no muestra ni cuenta las cuentas de otra DDRISS', async () => {
      const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['USUARIO_CONSULTAR'] });
      const res = await listar({ busqueda: marca }, otraDdriss);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ elementos: [], total: 0, pagina: 1, porPagina: 20 });
    });

    it('responde 400 ENTRADA_INVALIDA ante un parámetro inválido, desconocido o repetido', async () => {
      const casos = [
        ['pagina=0', 'pagina debe ser un número entero mayor o igual a 1.'],
        ['pagina=1.5', 'pagina debe ser un número entero mayor o igual a 1.'],
        ['porPagina=101', 'porPagina debe ser un número entero entre 1 y 100.'],
        ['porPagina=0', 'porPagina debe ser un número entero entre 1 y 100.'],
        ['rolId=abc', 'rolId debe ser un número entero positivo.'],
        ['rolId=', 'rolId debe ser un número entero positivo.'],
        ['establecimientoId=otro', "establecimientoId debe ser un número entero positivo o 'ninguno'."],
        ['estado=OTRO', 'estado debe ser ACTIVA, DESACTIVADA o BLOQUEADA.'],
        ['estado=activa', 'estado debe ser ACTIVA, DESACTIVADA o BLOQUEADA.'],
        [`busqueda=${'a'.repeat(101)}`, 'busqueda: como máximo 100 caracteres.'],
        ['orden=nombre', 'Parámetro no permitido: orden.'],
        ['estado=ACTIVA&estado=BLOQUEADA', 'estado no se puede repetir.'],
      ];
      for (const [consulta, mensaje] of casos) {
        const res = await pedir('get', `/usuarios?${consulta}`);
        expect(res.status, consulta).toBe(400);
        expect(res.body.error, consulta).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
      }
    });

    it('ningún elemento trae el hash, los intentos fallidos ni la fecha del bloqueo', async () => {
      const res = await listar({ busqueda: marca });
      const [[{ hash }]] = await pool.query('SELECT hash_contrasena AS hash FROM usuario WHERE id = ?', [cuentas.ceci.usuario.id]);
      expect(JSON.stringify(res.body)).not.toContain(hash);
      for (const cuenta of res.body.elementos) {
        for (const clave of ['hashContrasena', 'intentosFallidos', 'bloqueadoHasta']) {
          expect(cuenta).not.toHaveProperty(clave);
        }
      }
      expect(res.body.elementos.find((u) => u.id === cuentas.ceci.usuario.id).bloqueada).toBe(true);
    });
  });

  describe('HU-62: POST /usuarios/{id}/desbloquear', () => {
    const PREFIJO_HU62 = 'vitest-hu62-';
    const desbloquear = (id, credencial) => pedir('post', `/usuarios/${id}/desbloquear`, credencial);
    const crearCuenta = () => crearPersonal({ prefijo: PREFIJO_HU62 });
    const bloquearPorSql = (id, intervalo = '+ INTERVAL 15 MINUTE') =>
      pool.query(`UPDATE usuario SET intentos_fallidos = 5, bloqueado_hasta = NOW() ${intervalo} WHERE id = ?`, [id]);

    afterAll(async () => {
      await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO_HU62}%`]);
      await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO_HU62}%`]);
    });

    it('GET /usuarios trae bloqueada, sin la fecha del bloqueo ni los intentos', async () => {
      const bloqueada = await crearCuenta();
      const libre = await crearCuenta();
      await bloquearPorSql(bloqueada.usuario.id);

      const res = await pedir('get', '/usuarios').query({ busqueda: PREFIJO_HU62, porPagina: 100 });

      expect(res.status).toBe(200);
      expect(res.body.elementos.find((u) => u.id === bloqueada.usuario.id).bloqueada).toBe(true);
      expect(res.body.elementos.find((u) => u.id === libre.usuario.id).bloqueada).toBe(false);
      for (const cuenta of res.body.elementos) {
        expect(cuenta).not.toHaveProperty('bloqueadoHasta');
        expect(cuenta).not.toHaveProperty('intentosFallidos');
      }
      expect((await pedir('get', `/usuarios/${bloqueada.usuario.id}`)).body.bloqueada).toBe(true);
    });

    it('desbloquea, limpia los intentos y registra DESBLOQUEAR; después la contraseña incorrecta da 401 y no 423', async () => {
      const { usuario } = await crearCuenta();
      await bloquearPorSql(usuario.id);

      const res = await desbloquear(usuario.id);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ id: usuario.id, bloqueada: false, activo: true });
      const [[enBase]] = await pool.query('SELECT intentos_fallidos, bloqueado_hasta FROM usuario WHERE id = ?', [usuario.id]);
      expect(enBase).toEqual({ intentos_fallidos: 0, bloqueado_hasta: null });
      expect(await bitacoraDe('usuario', usuario.id, 'DESBLOQUEAR')).toEqual([
        { usuario_id: administrador.id, valores_anteriores: { bloqueada: true }, valores_nuevos: { bloqueada: false } },
      ]);

      // Con contraseña incorrecta no se crea un LOGIN_OK, así que la cuenta se puede borrar después.
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ nombreUsuario: usuario.nombreUsuario, contrasena: 'no-es-la-contrasena' });
      expect(login.status).toBe(401);
      expect(login.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    });

    it('una cuenta no bloqueada o con el bloqueo vencido responde 409 CUENTA_NO_BLOQUEADA, sin fila nueva', async () => {
      const libre = await crearCuenta();
      const vencida = await crearCuenta();
      await bloquearPorSql(vencida.usuario.id, '- INTERVAL 1 MINUTE');

      for (const { usuario } of [libre, vencida]) {
        const res = await desbloquear(usuario.id);
        expect(res.status).toBe(409);
        expect(res.body.error.codigo).toBe('CUENTA_NO_BLOQUEADA');
        expect(await bitacoraDe('usuario', usuario.id, 'DESBLOQUEAR')).toHaveLength(0);
      }
    });

    it('una cuenta desactivada responde 409 CUENTA_DESACTIVADA aunque esté bloqueada', async () => {
      const { usuario } = await crearCuenta();
      await bloquearPorSql(usuario.id);
      await desactivarPorSql(usuario.id);

      const res = await desbloquear(usuario.id);

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CUENTA_DESACTIVADA');
    });

    it('otra DDRISS o un id inexistente responden 404 y sin USUARIO_DESBLOQUEAR 403', async () => {
      const { usuario } = await crearCuenta();
      await bloquearPorSql(usuario.id);
      const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['USUARIO_DESBLOQUEAR'] });

      for (const [id, credencial] of [[usuario.id, otraDdriss], [999999999, token], ['abc', token]]) {
        const res = await desbloquear(id, credencial);
        expect(res.status).toBe(404);
        expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
      }

      const prohibida = await desbloquear(usuario.id, firmar({ permisos: ['USUARIO_DESACTIVAR'] }));
      expect(prohibida.status).toBe(403);
      expect(prohibida.body.error.codigo).toBe('SIN_PERMISO');
      expect((await pedir('get', `/usuarios/${usuario.id}`)).body.bloqueada).toBe(true);
    });
  });

  describe('HU-63: POST /usuarios/{id}/restablecer-contrasena', () => {
    const PREFIJO_HU63 = 'vitest-hu63-';
    const restablecer = (id, credencial) => pedir('post', `/usuarios/${id}/restablecer-contrasena`, credencial);
    const crearCuenta = () => crearPersonal({ prefijo: PREFIJO_HU63 });
    const enBase = async (id) => {
      const [[fila]] = await pool.query(
        'SELECT hash_contrasena, debe_cambiar_contrasena, intentos_fallidos, bloqueado_hasta FROM usuario WHERE id = ?',
        [id],
      );
      return fila;
    };

    afterAll(async () => {
      await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO_HU63}%`]);
      await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO_HU63}%`]);
    });

    it('genera una temporal nueva, la anterior deja de servir, quita el bloqueo y registra RESTABLECER_CONTRASENA', async () => {
      const { usuario, contrasenaTemporal: anterior } = await crearCuenta();
      await pool.query(
        `UPDATE usuario SET debe_cambiar_contrasena = FALSE, intentos_fallidos = 5,
                bloqueado_hasta = NOW() + INTERVAL 15 MINUTE WHERE id = ?`,
        [usuario.id],
      );
      const hashAnterior = (await enBase(usuario.id)).hash_contrasena;

      const res = await restablecer(usuario.id);

      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(['contrasenaTemporal', 'usuario']);
      expect(res.body.contrasenaTemporal).toMatch(new RegExp(`^[${ALFABETO}]{${LARGO}}$`));
      expect(res.body.usuario).toMatchObject({ id: usuario.id, debeCambiarContrasena: true, bloqueada: false, activo: true });

      const despues = await enBase(usuario.id);
      expect(despues.hash_contrasena).not.toBe(hashAnterior);
      expect(await bcrypt.compare(res.body.contrasenaTemporal, despues.hash_contrasena)).toBe(true);
      expect(await bcrypt.compare(anterior, despues.hash_contrasena)).toBe(false);
      expect(despues).toMatchObject({ debe_cambiar_contrasena: 1, intentos_fallidos: 0, bloqueado_hasta: null });

      const filas = await bitacoraDe('usuario', usuario.id, 'RESTABLECER_CONTRASENA');
      expect(filas).toEqual([
        {
          usuario_id: administrador.id,
          valores_anteriores: { debeCambiarContrasena: false, bloqueada: true },
          valores_nuevos: { debeCambiarContrasena: true, bloqueada: false },
        },
      ]);
      const texto = JSON.stringify(filas);
      expect(texto).not.toContain(res.body.contrasenaTemporal);
      expect(texto).not.toMatch(/\$2[aby]\$/);
    });

    it('se registra aunque la cuenta ya debiera cambiar la contraseña y no estuviera bloqueada', async () => {
      // POST /usuarios la deja con debe_cambiar_contrasena = TRUE y sin bloqueo: ningún otro dato cambia.
      const { usuario } = await crearCuenta();

      const res = await restablecer(usuario.id);

      expect(res.status).toBe(200);
      expect(await bitacoraDe('usuario', usuario.id, 'RESTABLECER_CONTRASENA')).toEqual([
        {
          usuario_id: administrador.id,
          valores_anteriores: { debeCambiarContrasena: true, bloqueada: false },
          valores_nuevos: { debeCambiarContrasena: true, bloqueada: false },
        },
      ]);
    });

    it('la cuenta propia responde 422 CUENTA_PROPIA y una desactivada 409 CUENTA_DESACTIVADA, sin cambiar la contraseña', async () => {
      const hashPropio = (await enBase(administrador.id)).hash_contrasena;
      const propia = await restablecer(administrador.id);
      expect(propia.status).toBe(422);
      expect(propia.body.error.codigo).toBe('CUENTA_PROPIA');
      expect((await enBase(administrador.id)).hash_contrasena).toBe(hashPropio);

      const { usuario } = await crearCuenta();
      await desactivarPorSql(usuario.id);
      const hashDesactivada = (await enBase(usuario.id)).hash_contrasena;
      const desactivada = await restablecer(usuario.id);
      expect(desactivada.status).toBe(409);
      expect(desactivada.body.error.codigo).toBe('CUENTA_DESACTIVADA');
      expect((await enBase(usuario.id)).hash_contrasena).toBe(hashDesactivada);
      expect(await bitacoraDe('usuario', usuario.id, 'RESTABLECER_CONTRASENA')).toHaveLength(0);
    });

    it('otra DDRISS o un id inexistente responden 404 y sin USUARIO_RESTABLECER_CONTRASENA 403', async () => {
      const { usuario } = await crearCuenta();
      const hash = (await enBase(usuario.id)).hash_contrasena;
      const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['USUARIO_RESTABLECER_CONTRASENA'] });

      for (const [id, credencial] of [[usuario.id, otraDdriss], [999999999, token], ['abc', token]]) {
        const res = await restablecer(id, credencial);
        expect(res.status).toBe(404);
        expect(res.body.error.codigo).toBe('NO_ENCONTRADO');
      }

      const prohibida = await restablecer(usuario.id, firmar({ permisos: ['USUARIO_DESBLOQUEAR'] }));
      expect(prohibida.status).toBe(403);
      expect(prohibida.body.error.codigo).toBe('SIN_PERMISO');
      expect((await enBase(usuario.id)).hash_contrasena).toBe(hash);
    });
  });

  describe('PATCH /empleados/{id}', () => {
    const editar = (id, cuerpo, credencial) => pedir('patch', `/empleados/${id}`, credencial).send(cuerpo);
    let otroMunicipioId;

    beforeAll(async () => {
      [[{ id: otroMunicipioId }]] = await pool.query(
        `SELECT m.id FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id
          WHERE d.id = ? AND m.activo = TRUE AND m.id <> ? ORDER BY m.id LIMIT 1`,
        [administrador.ddrissId, establecimientoActivo.municipio_id],
      );
    });

    it('cambiar el cargo responde 200 y deja una fila ACTUALIZAR solo con el cargo; sin cambios, ninguna', async () => {
      const { empleado } = await crearPersonal({ empleado: { cargo: 'Enfermera' } });

      const res = await editar(empleado.id, { cargo: 'Epidemióloga', nombres: 'Prueba' });

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ...empleado, cargo: 'Epidemióloga' });
      expect(await bitacoraDe('empleado', empleado.id, 'ACTUALIZAR')).toEqual([
        { usuario_id: administrador.id, valores_anteriores: { cargo: 'Enfermera' }, valores_nuevos: { cargo: 'Epidemióloga' } },
      ]);

      const igual = await editar(empleado.id, { cargo: 'Epidemióloga' });
      expect(igual.status).toBe(200);
      expect(await bitacoraDe('empleado', empleado.id, 'ACTUALIZAR')).toHaveLength(1);
    });

    it('poner un establecimiento copia su municipio; quitarlo y poner un municipio guarda el municipio', async () => {
      const { empleado } = await crearPersonal();

      const conEstablecimiento = await editar(empleado.id, { establecimientoId: establecimientoActivo.id });
      expect(conEstablecimiento.status).toBe(200);
      expect(conEstablecimiento.body).toMatchObject({
        establecimientoId: establecimientoActivo.id,
        municipioId: establecimientoActivo.municipio_id,
      });

      const conMunicipio = await editar(empleado.id, { establecimientoId: null, municipioId: otroMunicipioId });
      expect(conMunicipio.status).toBe(200);
      expect(conMunicipio.body).toMatchObject({ establecimientoId: null, municipioId: otroMunicipioId });
      const [[fila]] = await pool.query('SELECT establecimiento_id, municipio_id FROM empleado WHERE id = ?', [empleado.id]);
      expect(fila).toEqual({ establecimiento_id: null, municipio_id: otroMunicipioId });
    });

    it('quitar el establecimiento a un empleado con cuenta ESTABLECIMIENTO responde 422 EMPLEADO_SIN_ESTABLECIMIENTO', async () => {
      const { empleado } = await crearPersonal({
        empleado: { establecimientoId: establecimientoActivo.id },
        rol: 'ESTABLECIMIENTO',
      });

      const res = await editar(empleado.id, { establecimientoId: null });

      expect(res.status).toBe(422);
      expect(res.body.error.codigo).toBe('EMPLEADO_SIN_ESTABLECIMIENTO');
    });

    it('nombres vacíos, cuerpo vacío, ddrissId, activo o establecimiento y municipio juntos responden 400', async () => {
      const { empleado } = await crearPersonal({ empleado: { establecimientoId: establecimientoActivo.id } });

      for (const cuerpo of [
        { nombres: '  ' },
        {},
        { ddrissId: administrador.ddrissId },
        { activo: false },
        { establecimientoId: establecimientoActivo.id, municipioId: otroMunicipioId },
        { municipioId: otroMunicipioId },
      ]) {
        const res = await editar(empleado.id, cuerpo);
        expect(res.status).toBe(400);
        expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
      }
    });

    it('solo valida los campos que llegan: con un teléfono viejo mal escrito se puede cambiar el cargo', async () => {
      const { empleado } = await crearPersonal();
      await pool.query("UPDATE empleado SET telefono = '9999' WHERE id = ?", [empleado.id]);

      const res = await editar(empleado.id, { cargo: 'Estadígrafa' });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ cargo: 'Estadígrafa', telefono: '9999' });

      const telefono = await editar(empleado.id, { telefono: '9999' });
      expect(telefono.status).toBe(400);
      expect(telefono.body.error.mensaje).toBe('El teléfono debe tener 8 dígitos y empezar con 2 a 7.');
    });

    it('el correo no se puede borrar, y al cambiarlo se guarda en minúsculas', async () => {
      const { empleado } = await crearPersonal();

      for (const correo of [null, '', '  ']) {
        const res = await editar(empleado.id, { correo });
        expect(res.status).toBe(400);
        expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'El correo es obligatorio.' });
      }

      const nuevo = `vitest-hu05-${unico()}@prueba.local`;
      const res = await editar(empleado.id, { correo: nuevo.toUpperCase() });
      expect(res.status).toBe(200);
      expect(res.body.correo).toBe(nuevo);
    });

    it('un correo de otro empleado responde 409 CORREO_DUPLICADO', async () => {
      const uno = await crearPersonal();
      const otro = await crearPersonal();

      const res = await editar(uno.empleado.id, { correo: otro.empleado.correo });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CORREO_DUPLICADO');
    });

    it('un empleado con la cuenta desactivada responde 409 CUENTA_DESACTIVADA y uno de otra DDRISS 404', async () => {
      const { empleado, usuario } = await crearPersonal();
      const otraDdriss = firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['EMPLEADO_EDITAR'] });

      const ajena = await editar(empleado.id, { cargo: 'Otro' }, otraDdriss);
      expect(ajena.status).toBe(404);
      expect(ajena.body.error.codigo).toBe('NO_ENCONTRADO');

      await desactivarPorSql(usuario.id);
      const desactivada = await editar(empleado.id, { cargo: 'Otro' });
      expect(desactivada.status).toBe(409);
      expect(desactivada.body.error.codigo).toBe('CUENTA_DESACTIVADA');
    });

    it('sin EMPLEADO_EDITAR responde 403 SIN_PERMISO', async () => {
      const { empleado } = await crearPersonal();

      const res = await editar(empleado.id, { cargo: 'Otro' }, firmar({ permisos: ['USUARIO_EDITAR'] }));

      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    });
  });

  // SPEC 11: el CUI se guarda solo como huella HMAC y nunca sale de la API ni llega a la bitácora.
  describe('CUI del empleado', () => {
    const PREFIJO_CUI = 'vitest-hucui-';
    const editar = (id, cuerpo) => pedir('patch', `/empleados/${id}`).send(cuerpo);
    const huellaEnBase = async (id) => (await pool.query('SELECT cui_hmac FROM empleado WHERE id = ?', [id]))[0][0].cui_hmac;
    const sinCui = (texto, cui) => {
      expect(texto.includes(cui)).toBe(false);
      expect(texto).not.toMatch(/[0-9a-f]{64}/);
    };

    afterAll(async () => {
      await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO_CUI}%`]);
      await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO_CUI}%`]);
    });

    it('POST /empleados sin CUI, con uno inválido o con codigoEmpleado responde 400', async () => {
      for (const [extra, mensaje] of [
        [{ cui: undefined }, 'El CUI es obligatorio.'],
        [{ cui: '' }, 'El CUI es obligatorio.'],
        [{ cui: '1234567880101' }, 'El CUI no es válido; revise los dígitos.'],
        [{ cui: '1234567892301' }, 'El CUI no es válido; el departamento debe estar entre 01 y 22.'],
        [{ cui: '123456789010' }, 'El CUI debe tener 13 dígitos.'],
        [{ codigoEmpleado: 'EMP-0001' }, 'El código de empleado ya no se usa; envíe el CUI.'],
      ]) {
        const res = await registrar(minimo({ correo: `${PREFIJO_CUI}${unico()}@prueba.local`, ...extra }));
        expect(res.status).toBe(400);
        expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
      }
    });

    it('con un CUI válido responde 201 con cuiRegistrado y guarda solo la huella, sin el CUI en la bitácora', async () => {
      const cui = cuiFicticio();
      const { empleado, usuario } = await crearPersonal({ prefijo: PREFIJO_CUI, empleado: { cui: conEspacios(cui) } });

      expect(empleado.cuiRegistrado).toBe(true);
      expect(empleado).not.toHaveProperty('cui');
      expect(empleado).not.toHaveProperty('cuiHmac');
      sinCui(JSON.stringify(empleado), cui);

      const huella = await huellaEnBase(empleado.id);
      expect(huella).toMatch(/^[0-9a-f]{64}$/);
      expect(huella).toBe(huellaCui(cui));
      expect(huella.includes(cui)).toBe(false);

      const [crear] = await bitacoraDe('empleado', empleado.id, 'CREAR');
      expect(crear.valores_nuevos.cuiRegistrado).toBe(true);
      sinCui(JSON.stringify(crear), cui);

      const detalle = await pedir('get', `/usuarios/${usuario.id}`);
      expect(detalle.body.empleado.cuiRegistrado).toBe(true);
      sinCui(JSON.stringify(detalle.body), cui);
    });

    it('PATCH registra el CUI de un empleado que no tenía: cuiRegistrado pasa de false a true', async () => {
      const { empleado } = await crearPersonal({ prefijo: PREFIJO_CUI });
      await pool.query('UPDATE empleado SET cui_hmac = NULL WHERE id = ?', [empleado.id]);
      const cui = cuiFicticio();

      const res = await editar(empleado.id, { cui });

      expect(res.status).toBe(200);
      expect(res.body.cuiRegistrado).toBe(true);
      expect(await huellaEnBase(empleado.id)).toBe(huellaCui(cui));
      const filas = await bitacoraDe('empleado', empleado.id, 'ACTUALIZAR');
      expect(filas).toHaveLength(1);
      expect(filas[0].valores_anteriores).toEqual({ cuiRegistrado: false });
      expect(filas[0].valores_nuevos).toEqual({ cuiRegistrado: true });
    });

    it('PATCH reemplaza el CUI con cuiReemplazado en la bitácora; el mismo CUI responde 200 sin fila nueva', async () => {
      const { empleado } = await crearPersonal({ prefijo: PREFIJO_CUI });
      const cui = cuiFicticio();

      const res = await editar(empleado.id, { cui, cargo: 'Estadígrafa' });
      expect(res.status).toBe(200);
      expect(await huellaEnBase(empleado.id)).toBe(huellaCui(cui));
      const filas = await bitacoraDe('empleado', empleado.id, 'ACTUALIZAR');
      expect(filas).toHaveLength(1);
      expect(filas[0].valores_nuevos).toEqual({ cargo: 'Estadígrafa', cuiReemplazado: true });
      sinCui(JSON.stringify(filas[0]), cui);

      const igual = await editar(empleado.id, { cui: conEspacios(cui) });
      expect(igual.status).toBe(200);
      expect(await bitacoraDe('empleado', empleado.id, 'ACTUALIZAR')).toHaveLength(1);

      const soloCui = await editar(empleado.id, { cui: cuiFicticio() });
      expect(soloCui.status).toBe(200);
      const [, reemplazo] = await bitacoraDe('empleado', empleado.id, 'ACTUALIZAR');
      expect(reemplazo.valores_anteriores).toBeNull();
      expect(reemplazo.valores_nuevos).toEqual({ cuiReemplazado: true });
    });

    it('PATCH con el CUI de otro empleado responde 409 CUI_DUPLICADO', async () => {
      const cui = cuiFicticio();
      await crearPersonal({ prefijo: PREFIJO_CUI, empleado: { cui } });
      const { empleado } = await crearPersonal({ prefijo: PREFIJO_CUI });

      const res = await editar(empleado.id, { cui: conEspacios(cui) });

      expect(res.status).toBe(409);
      expect(res.body.error.codigo).toBe('CUI_DUPLICADO');
    });

    it('PATCH con cui null o vacío, o con codigoEmpleado, responde 400', async () => {
      const { empleado } = await crearPersonal({ prefijo: PREFIJO_CUI });

      for (const [cuerpo, mensaje] of [
        [{ cui: null }, 'El CUI es obligatorio.'],
        [{ cui: '' }, 'El CUI es obligatorio.'],
        [{ codigoEmpleado: 'EMP-0001' }, 'El código de empleado ya no se usa; envíe el CUI.'],
      ]) {
        const res = await editar(empleado.id, cuerpo);
        expect(res.status).toBe(400);
        expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
      }
      expect(await huellaEnBase(empleado.id)).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
