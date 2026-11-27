import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Estas pruebas trabajan en un departamento propio de código 98 (el INE no lo usa), con municipios 98NN y nombres
// vitest-spec77 …; los borran al inicio y al final. La bitácora no tiene llave foránea a municipio.
const DEPARTAMENTO_PRUEBA = '98';
const PREFIJO = 'vitest-spec77 ';
const INE = Array.from({ length: 22 }, (_, i) => String(i + 1).padStart(2, '0'));

let token;
let administrador;
let departamento;
let noEspecificado;

const enviar = (metodo, ruta, cuerpo, credencial = token) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);
const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
const crear = (codigoIne, nombre, departamentoId = departamento.id) =>
  enviar('post', '/municipios', { departamentoId, codigoIne, nombre: `${PREFIJO}${nombre}` });

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);

const filasBitacora = async (accion, municipioId) => {
  const [filas] = await pool.query(
    `SELECT valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND accion = ? AND entidad = 'municipio' AND entidad_id = ?`,
    [accion, String(municipioId)],
  );
  return filas.map((f) => ({ anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
};

// La red de prueba va en la DDRISS del usuario con un código que no es RED_{NN}, así que no cuenta para el
// consecutivo de sus redes.
const RED_PRUEBA = 'ZVT_77';

async function limpiar() {
  await pool.query('DELETE rm FROM red_municipio rm JOIN red r ON r.id = rm.red_id WHERE r.codigo = ?', [RED_PRUEBA]);
  await pool.query('DELETE FROM red WHERE codigo = ?', [RED_PRUEBA]);
  await pool.query('DELETE FROM establecimiento WHERE nombre LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM distrito_salud WHERE nombre LIKE ?', [`${PREFIJO}%`]);
  await pool.query(
    'DELETE m FROM municipio m JOIN departamento d ON d.id = m.departamento_id WHERE d.codigo_ine = ?',
    [DEPARTAMENTO_PRUEBA],
  );
  await pool.query('DELETE FROM departamento WHERE codigo_ine = ?', [DEPARTAMENTO_PRUEBA]);
}

// Mismo usuario de prueba con otros permisos; autenticar no compara los permisos.
const firmar = (datos) =>
  tokenDePrueba(administrador.id, {
    rol: 'ADMINISTRADOR', permisos: [], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null,
    ...datos,
  });

async function permisosDelRol(rol) {
  const [filas] = await pool.query(
    `SELECT p.codigo FROM rol_permiso rp JOIN rol r ON r.id = rp.rol_id JOIN permiso p ON p.id = rp.permiso_id
      WHERE r.codigo = ?`,
    [rol],
  );
  return filas.map((f) => f.codigo);
}

beforeAll(async () => {
  await limpiar();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  administrador = { id: res.body.usuario.id, ddrissId: res.body.usuario.empleado.ddrissId };

  const [insertado] = await pool.query('INSERT INTO departamento (codigo_ine, nombre) VALUES (?, ?)', [
    DEPARTAMENTO_PRUEBA,
    `${PREFIJO}departamento`,
  ]);
  departamento = { id: insertado.insertId };
  [[noEspecificado]] = await pool.query("SELECT id FROM departamento WHERE codigo_ine = '99'");
});

afterAll(limpiar);

describe('GET /departamentos', () => {
  it('trae los 22 departamentos del INE por código, sin el 99', async () => {
    const res = await consultar('/departamentos');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body[0]).sort()).toEqual(['codigoIne', 'id', 'nombre']);
    const codigos = res.body.map((d) => d.codigoIne);
    expect(codigos).not.toContain('99');
    expect(codigos).toEqual([...codigos].sort());
    // Otras pruebas pueden tener su departamento ficticio (98, ZR) mientras corren.
    expect(codigos.filter((c) => INE.includes(c))).toEqual(INE);
    expect(res.body.find((d) => d.codigoIne === '12')).toMatchObject({ id: 1, nombre: 'San Marcos' });
  });

  it('un parámetro de consulta responde 400 ENTRADA_INVALIDA', async () => {
    const res = await consultar('/departamentos?orden=nombre');

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'Parámetro no permitido: orden.' });
  });
});

describe('POST /municipios', () => {
  it('registra un municipio activo con su departamento y deja CREAR en la bitácora', async () => {
    const res = await enviar('post', '/municipios', {
      departamentoId: departamento.id,
      codigoIne: ' 9801 ',
      nombre: `  ${PREFIJO}Alta   Primera `,
    });

    expect(res.status).toBe(201);
    expect(res.body).toEqual({
      id: expect.any(Number),
      departamentoId: departamento.id,
      departamentoNombre: `${PREFIJO}departamento`,
      codigoIne: '9801',
      nombre: `${PREFIJO}Alta Primera`,
      activo: true,
    });
    const bitacora = await filasBitacora('CREAR', res.body.id);
    expect(bitacora).toHaveLength(1);
    expect(bitacora[0].nuevos).toEqual(res.body);
  });

  it.each([
    [{ activo: true }, 'Campo no permitido: activo.'],
    [{ departamentoId: 'x' }, 'departamentoId debe ser un número entero positivo.'],
    [{ departamentoId: undefined }, 'departamentoId debe ser un número entero positivo.'],
    [{ codigoIne: '981' }, 'El código INE debe tener 4 dígitos.'],
    [{ codigoIne: '98A1' }, 'El código INE debe tener 4 dígitos.'],
    [{ codigoIne: '' }, 'El código INE es obligatorio.'],
    [{ nombre: 'ab' }, 'El nombre del municipio debe tener entre 3 y 80 caracteres.'],
    [
      { nombre: 'San Pedro #2' },
      'El nombre del municipio solo puede tener letras, números, espacios y los signos . - ( ).',
    ],
  ])('con %j responde 400 ENTRADA_INVALIDA', async (cambio, mensaje) => {
    const cuerpo = { departamentoId: departamento.id, codigoIne: '9802', nombre: `${PREFIJO}Formato`, ...cambio };

    const res = await enviar('post', '/municipios', cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('el departamento 99 o uno que no existe responden 422 DEPARTAMENTO_INVALIDO', async () => {
    const [[{ siguiente }]] = await pool.query('SELECT MAX(id) + 1 AS siguiente FROM departamento');
    const respuestas = [await crear('9903', 'Del 99', noEspecificado.id), await crear('9803', 'Sin depto', siguiente)];

    for (const res of respuestas) {
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'DEPARTAMENTO_INVALIDO',
        mensaje: 'El departamento no existe o no admite municipios.',
      });
    }
  });

  it('un código que no empieza con el del departamento responde 422 CODIGO_INE_DEPARTAMENTO', async () => {
    const res = await crear('0915', 'Otro prefijo');

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({
      codigo: 'CODIGO_INE_DEPARTAMENTO',
      mensaje: 'El código INE debe empezar con 98, el código del departamento.',
    });
  });

  it('un código repetido, también de un municipio inactivo, responde 409 MUNICIPIO_DUPLICADO', async () => {
    const primero = await crear('9804', 'Codigo');
    expect(primero.status).toBe(201);

    const activo = await crear('9804', 'Codigo otro');
    await pool.query('UPDATE municipio SET activo = FALSE WHERE id = ?', [primero.body.id]);
    const inactivo = await crear('9804', 'Codigo otro mas');

    for (const res of [activo, inactivo]) {
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        codigo: 'MUNICIPIO_DUPLICADO',
        mensaje: 'Ya hay un municipio con el código INE 9804.',
      });
    }
  });

  it('un nombre repetido en el departamento, con otras mayúsculas o tildes, responde 409', async () => {
    expect((await crear('9805', 'Tacaná Alto')).status).toBe(201);

    const res = await enviar('post', '/municipios', {
      departamentoId: departamento.id,
      codigoIne: '9806',
      nombre: `${PREFIJO.toUpperCase()}TACANA ALTO`,
    });

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'MUNICIPIO_NOMBRE_DUPLICADO',
      mensaje: 'Ya hay un municipio con ese nombre en el departamento.',
    });
  });

  it('acepta el nombre de un municipio de otro departamento', async () => {
    const res = await enviar('post', '/municipios', {
      departamentoId: departamento.id,
      codigoIne: '9807',
      nombre: 'San Marcos',
    });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ codigoIne: '9807', nombre: 'San Marcos', departamentoId: departamento.id });
  });

  it('dos altas a la vez con el mismo nombre: una pasa y la otra responde 409', async () => {
    const respuestas = await Promise.all([crear('9808', 'Paralelo'), crear('9809', 'Paralelo')]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409).body.error.codigo).toBe('MUNICIPIO_NOMBRE_DUPLICADO');
  });

  // revisarCuenta compara el rol del token con el de la cuenta: se firman los permisos del Revisor, no su rol.
  it('con los permisos de un rol sin MUNICIPIO_CREAR (el Revisor) responde 403 SIN_PERMISO', async () => {
    const permisos = await permisosDelRol('REVISOR');
    expect(permisos).not.toContain('MUNICIPIO_CREAR');
    const revisor = await firmar({ permisos });

    const res = await enviar(
      'post',
      '/municipios',
      { departamentoId: departamento.id, codigoIne: '9810', nombre: `${PREFIJO}Sin permiso` },
      revisor,
    );

    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });
});

describe('PATCH /municipios/{id}', () => {
  it('cambia el nombre y deja ACTUALIZAR con la diferencia; el mismo nombre no deja otra fila', async () => {
    const { body: municipio } = await crear('9820', 'Antes');

    const res = await enviar('patch', `/municipios/${municipio.id}`, { nombre: `${PREFIJO}Despues` });
    const igual = await enviar('patch', `/municipios/${municipio.id}`, { nombre: ` ${PREFIJO}Despues ` });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...municipio, nombre: `${PREFIJO}Despues` });
    expect(igual.status).toBe(200);
    expect(igual.body).toEqual(res.body);
    expect(await filasBitacora('ACTUALIZAR', municipio.id)).toEqual([
      { anteriores: { nombre: `${PREFIJO}Antes` }, nuevos: { nombre: `${PREFIJO}Despues` } },
    ]);
  });

  it.each([
    [{ codigoIne: '9899' }, 'codigoIne no se puede cambiar.'],
    [{ departamentoId: 1 }, 'departamentoId no se puede cambiar.'],
    [{ activo: false }, 'Campo no permitido: activo.'],
    [{ nombre: undefined }, 'El nombre del municipio es obligatorio.'],
  ])('con %j responde 400 ENTRADA_INVALIDA', async (cambio, mensaje) => {
    const res = await enviar('patch', '/municipios/1', { nombre: `${PREFIJO}Campos`, ...cambio });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('el nombre de otro municipio del departamento responde 409 MUNICIPIO_NOMBRE_DUPLICADO', async () => {
    await crear('9830', 'Ocupado');
    const { body: municipio } = await crear('9831', 'Libre');

    const res = await enviar('patch', `/municipios/${municipio.id}`, { nombre: `${PREFIJO}ocupadó` });

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('MUNICIPIO_NOMBRE_DUPLICADO');
  });
});

describe('POST /municipios/{id}/desactivar y /reactivar', () => {
  it('desactiva y reactiva con su fila en la bitácora; repetirlos no deja otra', async () => {
    const { body: municipio } = await crear('9840', 'Estado');

    const desactivado = await enviar('post', `/municipios/${municipio.id}/desactivar`);
    const otraVez = await enviar('post', `/municipios/${municipio.id}/desactivar`);
    expect(desactivado.status).toBe(200);
    expect(desactivado.body).toEqual({ ...municipio, activo: false });
    expect(otraVez.status).toBe(200);
    expect(otraVez.body.activo).toBe(false);

    const reactivado = await enviar('post', `/municipios/${municipio.id}/reactivar`);
    const deNuevo = await enviar('post', `/municipios/${municipio.id}/reactivar`);
    expect(reactivado.status).toBe(200);
    expect(reactivado.body).toEqual(municipio);
    expect(deNuevo.status).toBe(200);

    expect(await filasBitacora('DESACTIVAR', municipio.id)).toEqual([
      { anteriores: { activo: true }, nuevos: { activo: false } },
    ]);
    expect(await filasBitacora('REACTIVAR', municipio.id)).toEqual([
      { anteriores: { activo: false }, nuevos: { activo: true } },
    ]);
  });

  it('con distritos o establecimientos activos responde 409 MUNICIPIO_EN_USO con lo que lo bloquea', async () => {
    const { body: municipio } = await crear('9841', 'Con distrito');
    await pool.query('INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre) VALUES (?, ?, ?, ?)', [
      administrador.ddrissId,
      municipio.id,
      'ZVT77-D1',
      `${PREFIJO}distrito`,
    ]);
    const conDistrito = await enviar('post', `/municipios/${municipio.id}/desactivar`);

    const [[tipo]] = await pool.query("SELECT id FROM tipo_establecimiento WHERE codigo = 'CS'");
    await pool.query(
      `INSERT INTO establecimiento (codigo, nombre, tipo_establecimiento_id, ddriss_id, municipio_id, es_externo)
       VALUES (?, ?, ?, ?, ?, TRUE)`,
      ['ZVT77-E1', `${PREFIJO}establecimiento`, tipo.id, administrador.ddrissId, municipio.id],
    );
    const conAmbos = await enviar('post', `/municipios/${municipio.id}/desactivar`);

    expect(conDistrito.status).toBe(409);
    expect(conDistrito.body.error).toEqual({
      codigo: 'MUNICIPIO_EN_USO',
      mensaje: 'El municipio tiene 1 distrito activo; desactívelos o quítelo de la red primero.',
    });
    expect(conAmbos.status).toBe(409);
    expect(conAmbos.body.error.mensaje).toBe(
      'El municipio tiene 1 distrito activo y 1 establecimiento activo; desactívelos o quítelo de la red primero.',
    );
    const [[{ activo }]] = await pool.query('SELECT activo FROM municipio WHERE id = ?', [municipio.id]);
    expect(Boolean(activo)).toBe(true);
    expect(await filasBitacora('DESACTIVAR', municipio.id)).toEqual([]);
  });

  it('en una red activa responde 409 MUNICIPIO_EN_USO con el nombre de la red', async () => {
    const { body: municipio } = await crear('9842', 'En red');
    const [red] = await pool.query('INSERT INTO red (ddriss_id, codigo, nombre) VALUES (?, ?, ?)', [
      administrador.ddrissId,
      RED_PRUEBA,
      `${PREFIJO}red`,
    ]);
    await pool.query('INSERT INTO red_municipio (red_id, municipio_id) VALUES (?, ?)', [red.insertId, municipio.id]);

    const res = await enviar('post', `/municipios/${municipio.id}/desactivar`);

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'MUNICIPIO_EN_USO',
      mensaje: `El municipio tiene la red activa ${PREFIJO}red; desactívelos o quítelo de la red primero.`,
    });
  });
});

describe('municipio especial, inexistente y permisos', () => {
  it('el 9999 no se renombra ni se desactiva: 409 MUNICIPIO_ESPECIAL', async () => {
    const [[migrantes]] = await pool.query("SELECT id, nombre, activo FROM municipio WHERE codigo_ine = '9999'");

    const respuestas = [
      await enviar('patch', `/municipios/${migrantes.id}`, { nombre: `${PREFIJO}Migrantes` }),
      await enviar('post', `/municipios/${migrantes.id}/desactivar`),
    ];

    for (const res of respuestas) {
      expect(res.status).toBe(409);
      expect(res.body.error).toEqual({
        codigo: 'MUNICIPIO_ESPECIAL',
        mensaje: 'El municipio Migrantes / fuera de San Marcos no se puede cambiar.',
      });
    }
    const [[despues]] = await pool.query('SELECT id, nombre, activo FROM municipio WHERE id = ?', [migrantes.id]);
    expect(despues).toEqual(migrantes);
  });

  it('un id que no existe responde 404 NO_ENCONTRADO', async () => {
    const [[{ siguiente }]] = await pool.query('SELECT MAX(id) + 1 AS siguiente FROM municipio');

    const respuestas = [
      await enviar('patch', `/municipios/${siguiente}`, { nombre: `${PREFIJO}Nadie` }),
      await enviar('post', `/municipios/${siguiente}/desactivar`),
      await enviar('post', `/municipios/${siguiente}/reactivar`),
      await enviar('post', '/municipios/abc/desactivar'),
    ];

    for (const res of respuestas) {
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El municipio no existe.' });
    }
  });

  it('sin MUNICIPIO_EDITAR responde 403 SIN_PERMISO', async () => {
    const { body: municipio } = await crear('9850', 'Permisos');
    const sinEditar = await firmar({ permisos: ['MUNICIPIO_CONSULTAR', 'MUNICIPIO_CREAR'] });

    const respuestas = [
      await enviar('patch', `/municipios/${municipio.id}`, { nombre: `${PREFIJO}Sin permiso` }, sinEditar),
      await enviar('post', `/municipios/${municipio.id}/desactivar`, undefined, sinEditar),
      await enviar('post', `/municipios/${municipio.id}/reactivar`, undefined, sinEditar),
    ];

    for (const res of respuestas) {
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    }
  });
});
