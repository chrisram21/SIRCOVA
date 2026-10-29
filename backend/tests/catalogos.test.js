import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba, borrarSesionesDe } from './sesionDePrueba.js';

let token;
let administrador;

// autenticar compara el rol, el establecimiento y el municipio del token con los de la cuenta, así que los
// casos de otro rol usan cuentas propias, creadas por SQL con este prefijo y borradas en afterAll.
// Nunca se inicia sesión con ellas: la bitácora tendría una llave foránea a la cuenta.
const PREFIJO = 'vitest-hu05-cat-';

const firmarPara = (id, datos) =>
  tokenDePrueba(
    id,
    { rol: 'ADMINISTRADOR', permisos: [], ddrissId: administrador.ddrissId, establecimientoId: null, municipioId: null, ...datos },
  );

// Firma un token con el mismo usuario de prueba pero otros permisos o DDRISS, para los casos sin permiso o de otro ámbito.
const firmar = (datos) => firmarPara(administrador.id, datos);

async function crearCuentaPrueba(nombre, rol, { ddrissId, establecimientoId = null }) {
  const [empleado] = await pool.query(
    `INSERT INTO empleado (nombres, apellidos, correo, establecimiento_id, ddriss_id) VALUES ('Prueba', 'HU-05', ?, ?, ?)`,
    [`${PREFIJO}${nombre}@prueba.local`, establecimientoId, ddrissId],
  );
  const [usuario] = await pool.query(
    `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id, debe_cambiar_contrasena)
     SELECT ?, ?, 'sin-contrasena', id, FALSE FROM rol WHERE codigo = ?`,
    [empleado.insertId, `${PREFIJO}${nombre}`, rol],
  );
  return usuario.insertId;
}

const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);

beforeAll(async () => {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  administrador = { id: res.body.usuario.id, ddrissId: res.body.usuario.empleado.ddrissId };
});

afterAll(async () => {
  await borrarSesionesDe(`${PREFIJO}%`);
  await pool.query('DELETE FROM usuario WHERE nombre_usuario LIKE ?', [`${PREFIJO}%`]);
  await pool.query('DELETE FROM empleado WHERE correo LIKE ?', [`${PREFIJO}%`]);
});

describe('GET /roles', () => {
  it('devuelve los cinco roles con id, código y nombre', async () => {
    const res = await consultar('/roles');

    expect(res.status).toBe(200);
    expect(res.body.map((r) => r.codigo).sort()).toEqual(
      ['ADMINISTRADOR', 'AUTORIDAD', 'EPIDEMIOLOGIA', 'ESTABLECIMIENTO', 'REVISOR'],
    );
    expect(Object.keys(res.body[0]).sort()).toEqual(['codigo', 'id', 'nombre']);
  });
});

describe('GET /ddriss', () => {
  it('devuelve solo la DDRISS del usuario', async () => {
    const res = await consultar('/ddriss');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].id).toBe(administrador.ddrissId);
    expect(Object.keys(res.body[0]).sort()).toEqual(['codigo', 'departamentoId', 'departamentoNombre', 'id', 'nombre']);
  });

  it('trae el nombre del departamento sede', async () => {
    const [[{ nombre }]] = await pool.query(
      'SELECT dep.nombre FROM ddriss d JOIN departamento dep ON dep.id = d.departamento_id WHERE d.id = ?',
      [administrador.ddrissId],
    );

    const res = await consultar('/ddriss');

    expect(res.body[0].departamentoNombre).toBe(nombre);
  });
});

describe('GET /municipios', () => {
  it('devuelve solo los municipios activos del departamento sede, por nombre', async () => {
    const [[{ departamento_id: departamentoId }]] = await pool.query(
      'SELECT departamento_id FROM ddriss WHERE id = ?',
      [administrador.ddrissId],
    );
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM municipio WHERE departamento_id = ? AND activo = TRUE',
      [departamentoId],
    );

    const res = await consultar('/municipios');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
    expect(res.body.every((m) => m.departamentoId === departamentoId && m.activo === true)).toBe(true);
    const nombres = res.body.map((m) => m.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    expect(res.body[0]).not.toHaveProperty('esJurisdiccion');
  });

  it('la autoridad nacional recibe todos los municipios activos', async () => {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM municipio WHERE activo = TRUE');

    const autoridad = await crearCuentaPrueba('autoridad', 'AUTORIDAD', { ddrissId: null });

    const res = await consultar(
      '/municipios',
      await firmarPara(autoridad, { rol: 'AUTORIDAD', ddrissId: null, permisos: ['MUNICIPIO_CONSULTAR'] }),
    );

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
  });
});

describe('GET /municipios (HU-08)', () => {
  const SAN_MARCOS = Array.from({ length: 30 }, (_, i) => String(1201 + i));

  it('sin parámetros devuelve los 30 municipios de San Marcos con el nombre del departamento, sin el 9999', async () => {
    const res = await consultar('/municipios');

    expect(res.status).toBe(200);
    expect(res.body.map((m) => m.codigoIne).sort()).toEqual(SAN_MARCOS);
    expect(res.body.every((m) => m.departamentoNombre === 'San Marcos')).toBe(true);
    expect(Object.keys(res.body[0]).sort()).toEqual(
      ['activo', 'codigoIne', 'departamentoId', 'departamentoNombre', 'id', 'nombre'],
    );
  });

  it('con alcance=procedencia suma el 9999 (al final) y los municipios de sus establecimientos externos', async () => {
    const [externos] = await pool.query(
      `SELECT DISTINCT m.codigo_ine
         FROM establecimiento e
         JOIN municipio m ON m.id = e.municipio_id
         JOIN ddriss d ON d.id = e.ddriss_id
        WHERE e.ddriss_id = ? AND m.departamento_id <> d.departamento_id AND m.activo = TRUE`,
      [administrador.ddrissId],
    );

    const res = await consultar('/municipios?alcance=procedencia');

    expect(res.status).toBe(200);
    const codigos = res.body.map((m) => m.codigoIne);
    expect(codigos.at(-1)).toBe('9999');
    expect(res.body.at(-1).nombre).toBe('Migrantes / fuera de San Marcos');
    expect(codigos).toEqual(expect.arrayContaining([...SAN_MARCOS, '0920', ...externos.map((m) => m.codigo_ine)]));
    expect(codigos).toHaveLength(SAN_MARCOS.length + 1 + new Set(['0920', ...externos.map((m) => m.codigo_ine)]).size);
  });

  it.each(['alcance=otro', 'incluirInactivos=si', 'orden=nombre', 'alcance=departamento&alcance=procedencia'])(
    '%s responde 400 ENTRADA_INVALIDA',
    async (consulta) => {
      const res = await consultar(`/municipios?${consulta}`);

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    },
  );

  it('la autoridad nacional recibe todos los municipios activos con los dos alcances', async () => {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM municipio WHERE activo = TRUE');
    const autoridad = await crearCuentaPrueba('autoridad-hu08', 'AUTORIDAD', { ddrissId: null });
    const credencial = await firmarPara(autoridad, { rol: 'AUTORIDAD', ddrissId: null, permisos: ['MUNICIPIO_CONSULTAR'] });

    for (const alcance of ['departamento', 'procedencia']) {
      const res = await consultar(`/municipios?alcance=${alcance}`, credencial);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(total);
    }
  });

  describe('con un municipio desactivado', () => {
    // Coatepeque: fuera del departamento sede y sin distritos, así que desactivarlo un momento no afecta a otras pruebas.
    let coatepeque;

    beforeAll(async () => {
      [[coatepeque]] = await pool.query("SELECT id FROM municipio WHERE codigo_ine = '0920'");
      await pool.query('UPDATE municipio SET activo = FALSE WHERE id = ?', [coatepeque.id]);
    });

    afterAll(async () => {
      await pool.query('UPDATE municipio SET activo = TRUE WHERE id = ?', [coatepeque.id]);
    });

    it('solo aparece con incluirInactivos=true, marcado como inactivo', async () => {
      const sinInactivos = await consultar('/municipios?alcance=procedencia');
      const conInactivos = await consultar('/municipios?alcance=procedencia&incluirInactivos=true');

      expect(sinInactivos.body.find((m) => m.id === coatepeque.id)).toBeUndefined();
      expect(conInactivos.body.find((m) => m.id === coatepeque.id)).toMatchObject({ codigoIne: '0920', activo: false });
    });
  });
});

describe('GET /establecimientos', () => {
  it('devuelve solo los establecimientos de su DDRISS', async () => {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM establecimiento WHERE ddriss_id = ?', [
      administrador.ddrissId,
    ]);

    const res = await consultar('/establecimientos');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
    const ids = res.body.map((e) => e.id);
    if (ids.length > 0) {
      const [fuera] = await pool.query('SELECT id FROM establecimiento WHERE id IN (?) AND ddriss_id <> ?', [
        ids,
        administrador.ddrissId,
      ]);
      expect(fuera).toEqual([]);
    }
  });

  it('con activo=true no devuelve inactivos y con municipioId filtra por municipio', async () => {
    const activos = await consultar('/establecimientos?activo=true');
    expect(activos.status).toBe(200);
    expect(activos.body.every((e) => e.activo === true)).toBe(true);

    const municipioId = activos.body[0]?.municipioId;
    if (municipioId) {
      const delMunicipio = await consultar(`/establecimientos?municipioId=${municipioId}`);
      expect(delMunicipio.status).toBe(200);
      expect(delMunicipio.body.every((e) => e.municipioId === municipioId)).toBe(true);
    }
  });

  it('un filtro mal formado responde 400 ENTRADA_INVALIDA', async () => {
    for (const consulta of ['activo=si', 'municipioId=abc']) {
      const res = await consultar(`/establecimientos?${consulta}`);
      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    }
  });

  it('el personal de establecimiento solo recibe el suyo', async () => {
    const [[establecimiento]] = await pool.query('SELECT id FROM establecimiento WHERE ddriss_id = ? LIMIT 1', [
      administrador.ddrissId,
    ]);
    if (!establecimiento) return;
    const personal = await crearCuentaPrueba('establecimiento', 'ESTABLECIMIENTO', {
      ddrissId: administrador.ddrissId,
      establecimientoId: establecimiento.id,
    });

    const res = await consultar(
      '/establecimientos',
      await firmarPara(personal, { rol: 'ESTABLECIMIENTO', establecimientoId: establecimiento.id, permisos: ['ESTABLECIMIENTO_CONSULTAR'] }),
    );

    expect(res.status).toBe(200);
    expect(res.body.map((e) => e.id)).toEqual([establecimiento.id]);
  });
});

describe('GET /establecimientos (HU-09)', () => {
  it('trae las marcas, el distrito, el contacto y las cuentas activas', async () => {
    const res = await consultar('/establecimientos');

    expect(res.status).toBe(200);
    expect(Object.keys(res.body[0]).sort()).toEqual([
      'activo', 'codigo', 'correo', 'cuentasActivas', 'ddrissId', 'direccion', 'distritoSaludCodigo',
      'distritoSaludId', 'distritoSaludNombre', 'esExterno', 'id', 'municipioCodigoIne', 'municipioId',
      'municipioNombre', 'nombre', 'nombreContacto', 'reporta5c', 'reportaProduccion', 'soloCobertura', 'telefono',
      'tipoEstablecimientoCodigo', 'tipoEstablecimientoId', 'tipoEstablecimientoNombre',
    ]);
    expect(res.body.find((e) => e.codigo === 'HOSP-SM')).toMatchObject({
      reporta5c: true, soloCobertura: true, esExterno: false, tipoEstablecimientoCodigo: 'HOSP',
    });
    expect(res.body.find((e) => e.codigo === 'EXT-COATE')).toMatchObject({
      esExterno: true, distritoSaludId: null, distritoSaludCodigo: null, distritoSaludNombre: null,
      municipioCodigoIne: '0920',
    });
  });

  it('cuentasActivas coincide con las cuentas activas de su personal', async () => {
    const [[esperado]] = await pool.query(
      `SELECT e.id, COUNT(u.id) AS total
         FROM establecimiento e
         JOIN empleado em ON em.establecimiento_id = e.id AND em.activo = TRUE
         JOIN usuario u ON u.empleado_id = em.id AND u.activo = TRUE
        WHERE e.ddriss_id = ?
        GROUP BY e.id
        ORDER BY total DESC
        LIMIT 1`,
      [administrador.ddrissId],
    );
    if (!esperado) return;

    const res = await consultar('/establecimientos');

    expect(res.body.find((e) => e.id === esperado.id).cuentasActivas).toBe(Number(esperado.total));
  });

  it('con tipoEstablecimientoId filtra por tipo', async () => {
    const [[tipo]] = await pool.query("SELECT id FROM tipo_establecimiento WHERE codigo = 'PS'");

    const res = await consultar(`/establecimientos?tipoEstablecimientoId=${tipo.id}`);

    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body.every((e) => e.tipoEstablecimientoId === tipo.id)).toBe(true);
  });

  it.each(['tipoEstablecimientoId=abc', 'tipoEstablecimientoId=0', 'orden=nombre', 'activo=true&activo=false'])(
    '%s responde 400 ENTRADA_INVALIDA',
    async (consulta) => {
      const res = await consultar(`/establecimientos?${consulta}`);

      expect(res.status).toBe(400);
      expect(res.body.error.codigo).toBe('ENTRADA_INVALIDA');
    },
  );
});

describe('GET /establecimientos/{id}', () => {
  it('devuelve un establecimiento de su DDRISS', async () => {
    const [[establecimiento]] = await pool.query("SELECT id FROM establecimiento WHERE codigo = 'CS-1201'");

    const res = await consultar(`/establecimientos/${establecimiento.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: establecimiento.id, codigo: 'CS-1201', municipioCodigoIne: '1201' });
  });

  it('uno inexistente o de otra DDRISS responde 404 NO_ENCONTRADO', async () => {
    const [[establecimiento]] = await pool.query("SELECT id FROM establecimiento WHERE codigo = 'CS-1201'");
    const otraDdriss = await firmar({ ddrissId: administrador.ddrissId + 1000, permisos: ['ESTABLECIMIENTO_CONSULTAR'] });

    for (const [ruta, credencial] of [
      ['/establecimientos/999999999', token],
      ['/establecimientos/abc', token],
      [`/establecimientos/${establecimiento.id}`, otraDdriss],
    ]) {
      const res = await consultar(ruta, credencial);
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'El establecimiento no existe.' });
    }
  });
});

describe('GET /tipos-establecimiento', () => {
  it('devuelve los tipos de la tabla ordenados por nombre', async () => {
    const [tipos] = await pool.query('SELECT id, codigo, nombre FROM tipo_establecimiento');

    const res = await consultar('/tipos-establecimiento');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(tipos.length);
    expect(res.body).toEqual(expect.arrayContaining(tipos.map((t) => ({ ...t }))));
    const nombres = res.body.map((t) => t.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
  });

  it('con un parámetro responde 400 ENTRADA_INVALIDA', async () => {
    const res = await consultar('/tipos-establecimiento?activo=true');

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'Parámetro no permitido: activo.' });
  });
});

describe('GET /municipios?alcance=todos (HU-09)', () => {
  it('trae los de San Marcos, Coatepeque y el 9999 al final', async () => {
    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM municipio WHERE activo = TRUE');

    const res = await consultar('/municipios?alcance=todos');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(total);
    const codigos = res.body.map((m) => m.codigoIne);
    expect(codigos.at(-1)).toBe('9999');
    expect(codigos).toEqual(expect.arrayContaining(['1201', '1230', '0920']));
    const resto = res.body.slice(0, -1).map((m) => `${m.departamentoNombre}|${m.nombre}`);
    const comparar = (a, b) => {
      const [depA, munA] = a.split('|');
      const [depB, munB] = b.split('|');
      return depA.localeCompare(depB, 'es') || munA.localeCompare(munB, 'es');
    };
    expect(resto).toEqual([...resto].sort(comparar));
  });

  it('alcance=otro responde 400 con el mensaje de los tres valores', async () => {
    const res = await consultar('/municipios?alcance=otro');

    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('alcance debe ser departamento, procedencia o todos.');
  });
});

describe('permisos de los catálogos', () => {
  it.each(['/roles', '/ddriss', '/municipios', '/establecimientos', '/tipos-establecimiento'])(
    '%s sin su permiso responde 403 SIN_PERMISO',
    async (ruta) => {
      const res = await consultar(ruta, await firmar({ permisos: ['POBLACION_REGISTRAR'] }));

      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    },
  );
});
