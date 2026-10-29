import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { MARGEN_COOKIE_SEGUNDOS } from '../src/modulos/auth/cookieRefresh.js';

// Inicia sesión de verdad, así que su usuario_id queda en la bitácora y la llave foránea impide borrarla:
// es una cuenta permanente que se reinicia en cada corrida. Sus filas de sesion sí se borran.
const CUENTA = 'vitest-hu02-sesiones';
const CONTRASENA = 'pelicano naranja reloj lento';
const AGENTE = 'vitest-hu02';

let usuarioId;

async function prepararCuenta() {
  const correo = `${CUENTA}@prueba.local`;
  const [[admin]] = await pool.query(
    'SELECT e.ddriss_id FROM usuario u JOIN empleado e ON e.id = u.empleado_id WHERE u.nombre_usuario = ?',
    [process.env.PRUEBA_USUARIO],
  );
  let [[empleado]] = await pool.query('SELECT id FROM empleado WHERE correo = ?', [correo]);
  if (!empleado) {
    const [creado] = await pool.query(
      `INSERT INTO empleado (nombres, apellidos, correo, ddriss_id) VALUES ('Prueba', 'HU-02', ?, ?)`,
      [correo, admin.ddriss_id],
    );
    empleado = { id: creado.insertId };
  }
  const hash = await bcrypt.hash(CONTRASENA, 4);
  let [[usuario]] = await pool.query('SELECT id FROM usuario WHERE nombre_usuario = ?', [CUENTA]);
  if (!usuario) {
    const [creado] = await pool.query(
      `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id)
       SELECT ?, ?, ?, id FROM rol WHERE codigo = 'REVISOR'`,
      [empleado.id, CUENTA, hash],
    );
    usuario = { id: creado.insertId };
  }
  await pool.query('UPDATE empleado SET activo = TRUE, ddriss_id = ? WHERE id = ?', [admin.ddriss_id, empleado.id]);
  await pool.query(
    `UPDATE usuario SET hash_contrasena = ?, debe_cambiar_contrasena = FALSE, activo = TRUE,
            intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?`,
    [hash, usuario.id],
  );
  return usuario.id;
}

const login = () =>
  request(app).post('/api/v1/auth/login').set('User-Agent', AGENTE).send({ nombreUsuario: CUENTA, contrasena: CONTRASENA });

const logout = ({ bearer, cookie, cuerpo } = {}) => {
  const peticion = request(app).post('/api/v1/auth/logout').set('User-Agent', AGENTE);
  if (bearer) peticion.set('Authorization', `Bearer ${bearer}`);
  if (cookie) peticion.set('Cookie', `sircova_refresh=${cookie}`);
  return cuerpo === undefined ? peticion : peticion.send(cuerpo);
};

// Devuelve el valor y los atributos de la cookie sircova_refresh de una respuesta, o null.
function cookieDe(respuesta) {
  const linea = (respuesta.headers['set-cookie'] ?? []).find((texto) => texto.startsWith('sircova_refresh='));
  if (!linea) return null;
  const [par, ...atributos] = linea.split(';').map((parte) => parte.trim());
  return { valor: par.slice('sircova_refresh='.length), atributos };
}

const hashDe = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function sesionesDeLaCuenta() {
  const [filas] = await pool.query(
    `SELECT id, hash_refresh, cerrada_en IS NOT NULL AS cerrada, motivo_cierre, agente_usuario,
            TIMESTAMPDIFF(SECOND, creada_en, expira_en) AS duracion
       FROM sesion WHERE usuario_id = ? ORDER BY id`,
    [usuarioId],
  );
  return filas;
}

async function ultimoIdBitacora() {
  const [[fila]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS id FROM bitacora');
  return fila.id;
}

async function bitacoraDesde(id) {
  const [filas] = await pool.query('SELECT * FROM bitacora WHERE id > ? AND usuario_id = ? ORDER BY id', [id, usuarioId]);
  return filas;
}

beforeAll(async () => {
  usuarioId = await prepararCuenta();
});

beforeEach(async () => {
  await pool.query('DELETE FROM sesion WHERE usuario_id = ?', [usuarioId]);
});

describe('POST /auth/login · sesión', () => {
  it('responde el mismo cuerpo de siempre y pone la cookie sircova_refresh de la jornada', async () => {
    const res = await login();

    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['token', 'usuario']);
    const cookie = cookieDe(res);
    expect(cookie.valor).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(cookie.atributos).toEqual(
      expect.arrayContaining([
        `Max-Age=${entorno.sesion.duracionMaxima + MARGEN_COOKIE_SEGUNDOS}`,
        'Path=/api/v1/auth',
        'HttpOnly',
        'Secure',
        'SameSite=Strict',
      ]),
    );
  });

  it('crea una sesión abierta con el sid del token, la jornada y el hash del refresh', async () => {
    const res = await login();
    const datos = jwt.verify(res.body.token, entorno.jwt.secreto, { algorithms: ['HS256'] });
    const [sesion] = await sesionesDeLaCuenta();

    expect(datos.sid).toBe(sesion.id);
    expect(sesion).toMatchObject({ cerrada: 0, motivo_cierre: null, agente_usuario: AGENTE });
    expect(sesion.duracion).toBe(entorno.sesion.duracionMaxima);
    expect(sesion.hash_refresh).toBe(hashDe(cookieDe(res).valor));
  });

  it('el primer inicio de sesión no marca sesionReemplazada', async () => {
    const desde = await ultimoIdBitacora();

    await login();
    const filas = await bitacoraDesde(desde);

    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ accion: 'LOGIN_OK', valores_nuevos: null });
  });

  it('un segundo inicio de sesión cierra el anterior con REEMPLAZADA y lo marca en LOGIN_OK', async () => {
    await login();
    const desde = await ultimoIdBitacora();

    await login();
    const sesiones = await sesionesDeLaCuenta();
    const filas = await bitacoraDesde(desde);

    expect(sesiones.map((s) => [s.cerrada, s.motivo_cierre])).toEqual([[1, 'REEMPLAZADA'], [0, null]]);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ accion: 'LOGIN_OK', valores_nuevos: { sesionReemplazada: true } });
  });

  it('una sesión anterior inactiva se cierra con REEMPLAZADA, pero LOGIN_OK no lo marca', async () => {
    await login();
    await pool.query('UPDATE sesion SET ultimo_uso = NOW() - INTERVAL ? SECOND WHERE usuario_id = ?', [
      entorno.sesion.inactividad + 60,
      usuarioId,
    ]);
    const desde = await ultimoIdBitacora();

    await login();
    const sesiones = await sesionesDeLaCuenta();
    const filas = await bitacoraDesde(desde);

    expect(sesiones[0]).toMatchObject({ cerrada: 1, motivo_cierre: 'REEMPLAZADA' });
    expect(filas[0]).toMatchObject({ accion: 'LOGIN_OK', valores_nuevos: null });
  });

  it('dos inicios de sesión en paralelo dejan una sola sesión abierta', async () => {
    const respuestas = await Promise.all([login(), login()]);
    const sesiones = await sesionesDeLaCuenta();

    expect(respuestas.map((r) => r.status)).toEqual([200, 200]);
    expect(sesiones).toHaveLength(2);
    expect(sesiones.filter((s) => !s.cerrada)).toHaveLength(1);
  });

  it('la bitácora no guarda el refresh token ni su hash', async () => {
    const desde = await ultimoIdBitacora();

    const res = await login();
    const texto = JSON.stringify(await bitacoraDesde(desde));
    const refresh = cookieDe(res).valor;

    expect(texto.includes(refresh)).toBe(false);
    expect(texto.includes(hashDe(refresh))).toBe(false);
  });
});

// POST /auth/contrasena con el cuerpo vacío pasa por autenticar y responde 400 sin escribir nada:
// un 400 dice que la sesión sirve, y un 401, que no.
const usarSesion = (token) =>
  request(app).post('/api/v1/auth/contrasena').set('Authorization', `Bearer ${token}`).send({});

const moverSesion = (columna, segundosAtras) =>
  pool.query(`UPDATE sesion SET ${columna} = NOW() - INTERVAL ? SECOND WHERE usuario_id = ? AND cerrada_en IS NULL`, [
    segundosAtras,
    usuarioId,
  ]);

async function segundosDesdeUltimoUso() {
  const [[fila]] = await pool.query(
    'SELECT TIMESTAMPDIFF(SECOND, ultimo_uso, NOW()) AS segundos FROM sesion WHERE usuario_id = ? AND cerrada_en IS NULL',
    [usuarioId],
  );
  return fila.segundos;
}

describe('autenticar · sesión', () => {
  it('con la sesión abierta, el token sirve', async () => {
    const { body } = await login();

    expect((await usarSesion(body.token)).status).toBe(400);
  });

  it('después de otro inicio de sesión responde 401 SESION_REEMPLAZADA', async () => {
    const primera = await login();
    await login();

    const res = await usarSesion(primera.body.token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: {
        codigo: 'SESION_REEMPLAZADA',
        mensaje: 'Se inició sesión con su cuenta en otro equipo. Inicie sesión de nuevo para continuar aquí.',
      },
    });
  });

  it('después del logout responde 401 SESION_CERRADA', async () => {
    const { body } = await login();
    await logout({ bearer: body.token });

    const res = await usarSesion(body.token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { codigo: 'SESION_CERRADA', mensaje: 'Su sesión se cerró; inicie sesión de nuevo.' } });
  });

  it('sin peticiones durante SESION_INACTIVIDAD responde 401 SESION_INACTIVA', async () => {
    const { body } = await login();
    await moverSesion('ultimo_uso', entorno.sesion.inactividad + 60);

    const res = await usarSesion(body.token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { codigo: 'SESION_INACTIVA', mensaje: 'Su sesión se cerró por inactividad. Inicie sesión de nuevo.' },
    });
  });

  it('pasada la jornada responde 401 JORNADA_TERMINADA', async () => {
    const { body } = await login();
    await moverSesion('expira_en', 1);

    const res = await usarSesion(body.token);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({
      error: { codigo: 'JORNADA_TERMINADA', mensaje: 'Su jornada de 8 horas terminó; inicie sesión de nuevo.' },
    });
  });

  it('actualiza ultimo_uso si tenía más de 1 minuto, y si tenía menos no lo toca', async () => {
    const { body } = await login();

    await moverSesion('ultimo_uso', 300);
    await usarSesion(body.token);
    expect(await segundosDesdeUltimoUso()).toBeLessThan(10);

    await moverSesion('ultimo_uso', 30);
    await usarSesion(body.token);
    expect(await segundosDesdeUltimoUso()).toBeGreaterThanOrEqual(30);
  });

  it('la actualización de ultimo_uso no escribe en la bitácora', async () => {
    const { body } = await login();
    await moverSesion('ultimo_uso', 300);
    const desde = await ultimoIdBitacora();

    await usarSesion(body.token);

    expect(await bitacoraDesde(desde)).toHaveLength(0);
  });
});

const refrescar = (cookie) => {
  const peticion = request(app).post('/api/v1/auth/refrescar').set('User-Agent', AGENTE);
  return cookie ? peticion.set('Cookie', `sircova_refresh=${cookie}`) : peticion;
};

const errorDe = (res) => [res.status, res.body.error?.codigo];

describe('POST /auth/refrescar', () => {
  it('devuelve un token nuevo de la misma sesión y rota la cookie', async () => {
    const res = await login();
    const anterior = cookieDe(res).valor;

    const renovado = await refrescar(anterior);
    const nueva = cookieDe(renovado);
    const [sesion] = await sesionesDeLaCuenta();

    expect(renovado.status).toBe(200);
    expect(Object.keys(renovado.body).sort()).toEqual(['token', 'usuario']);
    expect(renovado.body.usuario).toEqual(res.body.usuario);
    expect(jwt.decode(renovado.body.token).sid).toBe(jwt.decode(res.body.token).sid);
    expect(nueva.valor).not.toBe(anterior);
    expect(sesion.hash_refresh).toBe(hashDe(nueva.valor));
    expect(nueva.atributos).toEqual(expect.arrayContaining(['Path=/api/v1/auth', 'HttpOnly', 'Secure', 'SameSite=Strict']));
    const maxAge = Number(nueva.atributos.find((a) => a.startsWith('Max-Age=')).slice('Max-Age='.length));
    expect(maxAge).toBeGreaterThan(entorno.sesion.duracionMaxima + MARGEN_COOKIE_SEGUNDOS - 60);
    expect(maxAge).toBeLessThanOrEqual(entorno.sesion.duracionMaxima + MARGEN_COOKIE_SEGUNDOS);
    expect((await usarSesion(renovado.body.token)).status).toBe(400);
  });

  it('el token renovado lleva los permisos actuales de la cuenta', async () => {
    const res = await login();
    const [permisos] = await pool.query(
      `SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id
         JOIN usuario u ON u.rol_id = rp.rol_id WHERE u.id = ? ORDER BY p.codigo`,
      [usuarioId],
    );

    const renovado = await refrescar(cookieDe(res).valor);

    expect(jwt.decode(renovado.body.token).permisos).toEqual(permisos.map((p) => p.codigo));
  });

  it('el refresh anterior sirve dentro de los 30 s, sin cookie nueva, y después responde 401 NO_AUTENTICADO', async () => {
    const res = await login();
    const anterior = cookieDe(res).valor;
    await refrescar(anterior);

    const dentro = await refrescar(anterior);
    expect(dentro.status).toBe(200);
    expect(cookieDe(dentro)).toBeNull();
    expect((await usarSesion(dentro.body.token)).status).toBe(400);

    await moverSesion('rotado_en', 31);
    const fuera = await refrescar(anterior);
    expect(errorDe(fuera)).toEqual([401, 'NO_AUTENTICADO']);
    expect(cookieDe(fuera).valor).toBe('');
  });

  it('sin cookie o con una inventada responde 401 NO_AUTENTICADO y borra la cookie', async () => {
    for (const cookie of [null, 'no-es-un-refresh-token']) {
      const res = await refrescar(cookie);

      expect(errorDe(res)).toEqual([401, 'NO_AUTENTICADO']);
      expect(cookieDe(res).atributos).toEqual(expect.arrayContaining(['Max-Age=0']));
    }
  });

  it('con la sesión cerrada, reemplazada, inactiva o con la jornada terminada responde su 401', async () => {
    const cerrada = await login();
    await logout({ bearer: cerrada.body.token });
    expect(errorDe(await refrescar(cookieDe(cerrada).valor))).toEqual([401, 'SESION_CERRADA']);

    const reemplazada = await login();
    await login();
    expect(errorDe(await refrescar(cookieDe(reemplazada).valor))).toEqual([401, 'SESION_REEMPLAZADA']);

    const inactiva = await login();
    await moverSesion('ultimo_uso', entorno.sesion.inactividad + 60);
    expect(errorDe(await refrescar(cookieDe(inactiva).valor))).toEqual([401, 'SESION_INACTIVA']);

    const terminada = await login();
    await moverSesion('expira_en', 1);
    const res = await refrescar(cookieDe(terminada).valor);
    expect(errorDe(res)).toEqual([401, 'JORNADA_TERMINADA']);
    expect(cookieDe(res).valor).toBe('');
  });

  it('funciona con la contraseña temporal pendiente y lo indica', async () => {
    const res = await login();
    await pool.query('UPDATE usuario SET debe_cambiar_contrasena = TRUE WHERE id = ?', [usuarioId]);
    try {
      const renovado = await refrescar(cookieDe(res).valor);

      expect(renovado.status).toBe(200);
      expect(renovado.body.usuario.debeCambiarContrasena).toBe(true);
    } finally {
      await pool.query('UPDATE usuario SET debe_cambiar_contrasena = FALSE WHERE id = ?', [usuarioId]);
    }
  });

  it('no escribe en la bitácora ni deja en ella el refresh token o su hash', async () => {
    const res = await login();
    const desde = await ultimoIdBitacora();

    const renovado = await refrescar(cookieDe(res).valor);
    const [filas] = await pool.query('SELECT * FROM bitacora WHERE usuario_id = ? OR entidad_id = ?', [
      usuarioId,
      String(usuarioId),
    ]);
    const texto = JSON.stringify(filas);

    expect(await bitacoraDesde(desde)).toHaveLength(0);
    for (const refresh of [cookieDe(res).valor, cookieDe(renovado).valor]) {
      expect(texto.includes(refresh)).toBe(false);
      expect(texto.includes(hashDe(refresh))).toBe(false);
    }
  });
});

describe('POST /auth/contrasena · sesión', () => {
  it('cambiar la propia contraseña no cierra la sesión', async () => {
    const { body } = await login();
    try {
      const cambio = await request(app)
        .post('/api/v1/auth/contrasena')
        .set('Authorization', `Bearer ${body.token}`)
        .send({ contrasenaActual: CONTRASENA, contrasenaNueva: 'tucan violeta grapa nube' });

      expect(cambio.status).toBe(204);
      expect((await usarSesion(body.token)).status).toBe(400);
      expect((await sesionesDeLaCuenta()).map((s) => s.cerrada)).toEqual([0]);
    } finally {
      // Los demás casos inician sesión con la contraseña de siempre.
      await pool.query('UPDATE usuario SET hash_contrasena = ? WHERE id = ?', [await bcrypt.hash(CONTRASENA, 4), usuarioId]);
    }
  });
});

describe('POST /auth/logout · sesión', () => {
  it('con el Bearer cierra la sesión con MANUAL, registra LOGOUT y borra la cookie', async () => {
    const { body } = await login();
    const desde = await ultimoIdBitacora();

    const res = await logout({ bearer: body.token });
    const [sesion] = await sesionesDeLaCuenta();

    expect(res.status).toBe(204);
    expect(sesion).toMatchObject({ cerrada: 1, motivo_cierre: 'MANUAL' });
    expect(cookieDe(res)).toEqual({ valor: '', atributos: expect.arrayContaining(['Max-Age=0', 'Path=/api/v1/auth']) });
    const filas = await bitacoraDesde(desde);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ accion: 'LOGOUT', valores_nuevos: { motivo: 'MANUAL' } });
  });

  it('con el JWT vencido y la cookie cierra la sesión con el motivo indicado', async () => {
    const res = await login();
    const vencido = jwt.sign({ sid: jwt.decode(res.body.token).sid }, entorno.jwt.secreto, {
      algorithm: 'HS256',
      subject: String(usuarioId),
      expiresIn: -10,
    });
    const desde = await ultimoIdBitacora();

    const salida = await logout({ bearer: vencido, cookie: cookieDe(res).valor, cuerpo: { motivo: 'INACTIVIDAD' } });
    const [sesion] = await sesionesDeLaCuenta();

    expect(salida.status).toBe(204);
    expect(sesion).toMatchObject({ cerrada: 1, motivo_cierre: 'INACTIVIDAD' });
    const filas = await bitacoraDesde(desde);
    expect(filas).toHaveLength(1);
    expect(filas[0]).toMatchObject({ accion: 'LOGOUT', usuario_id: usuarioId, valores_nuevos: { motivo: 'INACTIVIDAD' } });
  });

  it('solo con la cookie también cierra la sesión', async () => {
    const res = await login();

    const salida = await logout({ cookie: cookieDe(res).valor });
    const [sesion] = await sesionesDeLaCuenta();

    expect(salida.status).toBe(204);
    expect(sesion).toMatchObject({ cerrada: 1, motivo_cierre: 'MANUAL' });
  });

  it('una sesión ya cerrada responde 204, borra la cookie y no escribe en la bitácora', async () => {
    const primera = await login();
    await login();
    const desde = await ultimoIdBitacora();

    const res = await logout({ bearer: primera.body.token });
    const sesiones = await sesionesDeLaCuenta();

    expect(res.status).toBe(204);
    expect(cookieDe(res).valor).toBe('');
    expect(sesiones.map((s) => s.motivo_cierre)).toEqual(['REEMPLAZADA', null]);
    expect(await bitacoraDesde(desde)).toHaveLength(0);
  });

  it('una cookie que no corresponde a ninguna sesión responde 204 sin escribir en la bitácora', async () => {
    await login();
    const desde = await ultimoIdBitacora();

    const res = await logout({ cookie: 'no-es-un-refresh-token' });
    const [sesion] = await sesionesDeLaCuenta();

    expect(res.status).toBe(204);
    expect(sesion.cerrada).toBe(0);
    expect(await bitacoraDesde(desde)).toHaveLength(0);
  });

  it('el JWT vencido sin cookie responde 401 SESION_VENCIDA', async () => {
    const vencido = jwt.sign({ sid: 1 }, entorno.jwt.secreto, { algorithm: 'HS256', subject: String(usuarioId), expiresIn: -10 });

    const res = await logout({ bearer: vencido });

    expect(res.status).toBe(401);
    expect(res.body.error.codigo).toBe('SESION_VENCIDA');
  });
});
