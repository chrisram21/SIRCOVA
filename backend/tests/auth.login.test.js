import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import entorno from '../src/config/entorno.js';

const USUARIO = process.env.PRUEBA_USUARIO;
const CONTRASENA = process.env.PRUEBA_CONTRASENA;
const AGENTE = 'vitest-sircova';

let usuarioId;
let empleadoId;
let ddrissOriginal;
let rolOriginal;
let rolNombre;
let establecimientoOriginal;

const login = (cuerpo) =>
  request(app).post('/api/v1/auth/login').set('User-Agent', AGENTE).send(cuerpo);

async function estadoUsuario() {
  const [[fila]] = await pool.query(
    `SELECT intentos_fallidos, bloqueado_hasta, TIMESTAMPDIFF(SECOND, ultimo_acceso, NOW()) AS segundos_desde_acceso
       FROM usuario WHERE id = ?`,
    [usuarioId],
  );
  return fila;
}

async function ultimoIdBitacora() {
  const [[fila]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS id FROM bitacora');
  return fila.id;
}

async function bitacoraDesde(id) {
  const [filas] = await pool.query('SELECT * FROM bitacora WHERE id > ? ORDER BY id', [id]);
  return filas;
}

function sinCamposDeContrasena(valor) {
  const texto = JSON.stringify(valor);
  expect(texto).not.toMatch(/\$2[aby]\$/);
  expect(texto).not.toMatch(/"(contrasena|hash_?contrasena|hashContrasena)"/i);
}

// La aserción es booleana a propósito: si falla, Vitest no imprime la contraseña.
function sinValorDeContrasena(valor) {
  expect(JSON.stringify(valor).includes(CONTRASENA)).toBe(false);
}

beforeAll(async () => {
  if (!USUARIO || !CONTRASENA) throw new Error('Defina PRUEBA_USUARIO y PRUEBA_CONTRASENA en backend/.env');
  const [[fila]] = await pool.query(
    `SELECT u.id, u.empleado_id, u.rol_id, e.ddriss_id, e.establecimiento_id, r.codigo AS rol, r.nombre AS rol_nombre
       FROM usuario u JOIN empleado e ON e.id = u.empleado_id JOIN rol r ON r.id = u.rol_id
      WHERE u.nombre_usuario = ?`,
    [USUARIO],
  );
  if (!fila) throw new Error(`No existe el usuario de prueba ${USUARIO}; créelo con npm run crear-usuario`);
  if (fila.rol !== 'ADMINISTRADOR' || fila.ddriss_id == null) {
    throw new Error('El usuario de prueba debe ser ADMINISTRADOR y tener DDRISS asignada');
  }
  usuarioId = fila.id;
  empleadoId = fila.empleado_id;
  ddrissOriginal = fila.ddriss_id;
  rolOriginal = fila.rol_id;
  rolNombre = fila.rol_nombre;
  establecimientoOriginal = fila.establecimiento_id;
});

// Las pruebas cambian directamente al usuario de prueba; aquí vuelve a su estado normal.
afterEach(async () => {
  await pool.query(
    'UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL, activo = TRUE, rol_id = ? WHERE id = ?',
    [rolOriginal, usuarioId],
  );
  await pool.query(
    'UPDATE empleado SET activo = TRUE, ddriss_id = ?, establecimiento_id = ? WHERE id = ?',
    [ddrissOriginal, establecimientoOriginal, empleadoId],
  );
});

const correcta = () => login({ nombreUsuario: USUARIO, contrasena: CONTRASENA });
const incorrecta = () => login({ nombreUsuario: USUARIO, contrasena: 'incorrecta-123' });

describe('POST /api/v1/auth/login · login correcto', () => {
  it('responde 200 con el token y los datos de la sesión', async () => {
    const res = await login({ nombreUsuario: USUARIO, contrasena: CONTRASENA });

    expect(res.status).toBe(200);
    expect(res.body.usuario).toMatchObject({ id: usuarioId, nombreUsuario: USUARIO, rol: 'ADMINISTRADOR', rolNombre });
    expect(Array.isArray(res.body.usuario.permisos)).toBe(true);
    expect(typeof res.body.usuario.debeCambiarContrasena).toBe('boolean');
    expect(Object.keys(res.body.usuario.empleado).sort()).toEqual(
      ['apellidos', 'ddrissId', 'establecimientoId', 'municipioId', 'nombres'],
    );
    sinCamposDeContrasena(res.body);
  });

  it('el token lleva el rol, los permisos y el alcance, y vence según JWT_EXPIRACION', async () => {
    const res = await login({ nombreUsuario: USUARIO, contrasena: CONTRASENA });
    const datos = jwt.verify(res.body.token, entorno.jwt.secreto, { algorithms: ['HS256'] });
    const referencia = jwt.decode(jwt.sign({}, 'x', { expiresIn: entorno.jwt.expiracion }));

    expect(datos.sub).toBe(String(usuarioId));
    expect(datos).toMatchObject({
      rol: res.body.usuario.rol,
      permisos: res.body.usuario.permisos,
      ddrissId: res.body.usuario.empleado.ddrissId,
      establecimientoId: res.body.usuario.empleado.establecimientoId,
      municipioId: res.body.usuario.empleado.municipioId,
    });
    expect(datos.exp - datos.iat).toBe(referencia.exp - referencia.iat);
    expect(datos).not.toHaveProperty('rolNombre');
    expect(datos).not.toHaveProperty('debeCambiarContrasena');
  });

  it('reinicia el contador de intentos y actualiza ultimo_acceso', async () => {
    await pool.query('UPDATE usuario SET intentos_fallidos = 3 WHERE id = ?', [usuarioId]);

    await login({ nombreUsuario: USUARIO, contrasena: CONTRASENA });
    const estado = await estadoUsuario();

    expect(estado.intentos_fallidos).toBe(0);
    expect(estado.bloqueado_hasta).toBeNull();
    expect(estado.segundos_desde_acceso).toBeLessThanOrEqual(10);
  });

  it('registra LOGIN_OK en la bitácora con IP y agente de usuario', async () => {
    const desde = await ultimoIdBitacora();

    await login({ nombreUsuario: USUARIO, contrasena: CONTRASENA });
    const filas = await bitacoraDesde(desde);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      accion: 'LOGIN_OK', modulo: 'USUARIOS', entidad: 'usuario',
      usuario_id: usuarioId, entidad_id: String(usuarioId), agente_usuario: AGENTE,
    });
    expect(filas[0].ip_origen).toBeTruthy();
    sinCamposDeContrasena(filas[0]);
    sinValorDeContrasena(filas[0]);
  });
});

describe('POST /api/v1/auth/login · credenciales incorrectas', () => {
  it('contraseña incorrecta: 401 genérico, suma un intento y registra LOGIN_FALLIDO', async () => {
    const desde = await ultimoIdBitacora();

    const res = await login({ nombreUsuario: USUARIO, contrasena: 'incorrecta-123' });
    const filas = await bitacoraDesde(desde);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { codigo: 'CREDENCIALES_INVALIDAS', mensaje: 'Usuario o contraseña incorrectos.' },
    });
    expect((await estadoUsuario()).intentos_fallidos).toBe(1);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({
      accion: 'LOGIN_FALLIDO', usuario_id: null, nombre_usuario_intento: USUARIO,
      entidad_id: String(usuarioId), valores_nuevos: { motivo: 'CREDENCIALES' },
    });
    expect(JSON.stringify(filas[0])).not.toContain('incorrecta-123');
  });

  it('usuario inexistente: el mismo 401, con LOGIN_FALLIDO sin entidad', async () => {
    const inexistente = `no_existe_${Date.now()}`;
    const desde = await ultimoIdBitacora();

    const incorrecta = await login({ nombreUsuario: USUARIO, contrasena: 'incorrecta-123' });
    const res = await login({ nombreUsuario: inexistente, contrasena: 'incorrecta-123' });
    const filas = await bitacoraDesde(desde);

    expect(res.status).toBe(401);
    expect(res.body).toEqual(incorrecta.body);
    expect(filas.at(-1)).toMatchObject({
      accion: 'LOGIN_FALLIDO', usuario_id: null, nombre_usuario_intento: inexistente, entidad_id: null,
    });
  });
});

describe('POST /api/v1/auth/login · bloqueo por intentos fallidos', () => {
  it('4 fallos dan 401 y el 5.º da 423, bloquea 15 minutos y registra CUENTA_BLOQUEADA', async () => {
    const desde = await ultimoIdBitacora();

    for (let i = 1; i <= 4; i++) {
      expect((await incorrecta()).status).toBe(401);
    }
    const quinto = await incorrecta();
    const [[bloqueo]] = await pool.query(
      'SELECT intentos_fallidos, TIMESTAMPDIFF(SECOND, NOW(), bloqueado_hasta) AS segundos FROM usuario WHERE id = ?',
      [usuarioId],
    );
    const filas = await bitacoraDesde(desde);

    expect(quinto.status).toBe(423);
    expect(quinto.body.error.codigo).toBe('CUENTA_BLOQUEADA');
    expect(bloqueo.intentos_fallidos).toBe(5);
    expect(bloqueo.segundos).toBeGreaterThan(14 * 60);
    expect(bloqueo.segundos).toBeLessThanOrEqual(15 * 60);
    expect(filas.filter((f) => f.accion === 'LOGIN_FALLIDO')).toHaveLength(5);
    expect(filas.find((f) => f.accion === 'CUENTA_BLOQUEADA')).toMatchObject({
      usuario_id: null, entidad_id: String(usuarioId), nombre_usuario_intento: USUARIO,
      valores_nuevos: { bloqueadoHasta: expect.any(String) },
    });
  });

  it('con el bloqueo activo, la contraseña correcta también da 423 y no cambia el contador', async () => {
    await pool.query(
      'UPDATE usuario SET intentos_fallidos = 5, bloqueado_hasta = NOW() + INTERVAL 15 MINUTE WHERE id = ?',
      [usuarioId],
    );
    const desde = await ultimoIdBitacora();

    const res = await correcta();
    const filas = await bitacoraDesde(desde);

    expect(res.status).toBe(423);
    expect((await estadoUsuario()).intentos_fallidos).toBe(5);
    expect(filas[0]).toMatchObject({ accion: 'LOGIN_FALLIDO', valores_nuevos: { motivo: 'BLOQUEADA' } });
  });

  it('con el bloqueo vencido, la contraseña correcta da 200 y el contador vuelve a 0', async () => {
    await pool.query(
      'UPDATE usuario SET intentos_fallidos = 5, bloqueado_hasta = NOW() - INTERVAL 1 MINUTE WHERE id = ?',
      [usuarioId],
    );

    const res = await correcta();
    const estado = await estadoUsuario();

    expect(res.status).toBe(200);
    expect(estado.intentos_fallidos).toBe(0);
    expect(estado.bloqueado_hasta).toBeNull();
  });

  it('con el bloqueo vencido, un fallo empieza a contar desde 1', async () => {
    await pool.query(
      'UPDATE usuario SET intentos_fallidos = 5, bloqueado_hasta = NOW() - INTERVAL 1 MINUTE WHERE id = ?',
      [usuarioId],
    );

    const res = await incorrecta();
    const estado = await estadoUsuario();

    expect(res.status).toBe(401);
    expect(estado.intentos_fallidos).toBe(1);
    expect(estado.bloqueado_hasta).toBeNull();
  });
});

describe('POST /api/v1/auth/login · cuenta desactivada y sin alcance', () => {
  it('usuario desactivado: 403 con la contraseña correcta y 401 con la incorrecta', async () => {
    await pool.query('UPDATE usuario SET activo = FALSE WHERE id = ?', [usuarioId]);
    const desde = await ultimoIdBitacora();

    const conCorrecta = await correcta();
    const conIncorrecta = await incorrecta();
    const filas = await bitacoraDesde(desde);

    expect(conCorrecta.status).toBe(403);
    expect(conCorrecta.body).toEqual({
      error: { codigo: 'CUENTA_DESACTIVADA', mensaje: 'Su cuenta está desactivada; contacte al administrador.' },
    });
    expect(conIncorrecta.status).toBe(401);
    expect(conIncorrecta.body.error.codigo).toBe('CREDENCIALES_INVALIDAS');
    expect(filas[0]).toMatchObject({ accion: 'LOGIN_FALLIDO', valores_nuevos: { motivo: 'DESACTIVADA' } });
  });

  it('empleado desactivado: 403 CUENTA_DESACTIVADA con la contraseña correcta', async () => {
    await pool.query('UPDATE empleado SET activo = FALSE WHERE id = ?', [empleadoId]);

    const res = await correcta();

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('CUENTA_DESACTIVADA');
  });

  it('rol distinto de AUTORIDAD sin DDRISS: 403 CUENTA_SIN_ALCANCE', async () => {
    await pool.query('UPDATE empleado SET ddriss_id = NULL WHERE id = ?', [empleadoId]);
    const desde = await ultimoIdBitacora();

    const res = await correcta();
    const filas = await bitacoraDesde(desde);

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('CUENTA_SIN_ALCANCE');
    expect(filas[0]).toMatchObject({ accion: 'LOGIN_FALLIDO', valores_nuevos: { motivo: 'SIN_ALCANCE' } });
  });

  async function convertirEnEstablecimiento(establecimientoId) {
    await pool.query(
      `UPDATE usuario SET rol_id = (SELECT id FROM rol WHERE codigo = 'ESTABLECIMIENTO') WHERE id = ?`,
      [usuarioId],
    );
    await pool.query('UPDATE empleado SET establecimiento_id = ? WHERE id = ?', [establecimientoId, empleadoId]);
  }

  it('rol ESTABLECIMIENTO sin establecimiento: 403 CUENTA_SIN_ALCANCE', async () => {
    await convertirEnEstablecimiento(null);

    const res = await correcta();

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('CUENTA_SIN_ALCANCE');
  });

  it('rol ESTABLECIMIENTO con establecimiento: 200 y el establecimiento va en el token', async () => {
    const [[est]] = await pool.query(
      'SELECT id FROM establecimiento WHERE ddriss_id = ? AND activo = TRUE ORDER BY id LIMIT 1',
      [ddrissOriginal],
    );
    if (!est) throw new Error('La prueba necesita al menos un establecimiento activo en la DDRISS del usuario de prueba');
    await convertirEnEstablecimiento(est.id);

    const res = await correcta();
    const datos = jwt.verify(res.body.token, entorno.jwt.secreto, { algorithms: ['HS256'] });

    expect(res.status).toBe(200);
    expect(res.body.usuario.rol).toBe('ESTABLECIMIENTO');
    expect(res.body.usuario.empleado.establecimientoId).toBe(est.id);
    expect(datos.establecimientoId).toBe(est.id);
  });
});

describe('POST /api/v1/auth/login · datos mal formados', () => {
  it.each([
    ['sin cuerpo', undefined],
    ['sin contraseña', { nombreUsuario: 'alguien' }],
    ['sin usuario', { contrasena: 'algo-123' }],
    ['usuario en blanco', { nombreUsuario: '   ', contrasena: 'algo-123' }],
    ['usuario que no es texto', { nombreUsuario: 5, contrasena: 'algo-123' }],
  ])('%s: responde 400 ENTRADA_INVALIDA', async (_, cuerpo) => {
    const res = await login(cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });
});
