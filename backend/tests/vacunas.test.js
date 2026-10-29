import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las vacunas que crean estas pruebas tienen el código ZVT_… y el nombre vitest-hu10-…, y se borran (primero sus
// dosis) al inicio y al final. La bitácora no tiene llave foránea a vacuna ni a dosis, así que sus filas no lo impiden.
const PREFIJO = 'vitest-hu10-';
const CODIGO_PRUEBA = 'ZVT_';

let contador = 0;
const codigoNuevo = () => `${CODIGO_PRUEBA}${Date.now().toString(36).toUpperCase()}${contador++}`;

// Códigos de las 21 vacunas de la semilla (backend/db/01).
const SEMILLA = [
  'BCG', 'HEXA', 'SPR', 'TD', 'HEPB', 'POLIO', 'ROTA', 'NEUMO', 'INFLU_PED', 'DPT', 'VPH', 'TDAP', 'SR', 'HEPB_PED',
  'HEPB_ADU', 'INFLU_EST', 'NEUMO13', 'NEUMO23', 'VARICELA', 'COVID19', 'FA',
];
const TIPOS = ['UNICA', 'DOSIS', 'REFUERZO'];

let token;
let tokenEpidemiologia;

const enviar = (metodo, ruta, cuerpo, credencial = token) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);
const consultar = (ruta, credencial) => enviar('get', ruta, undefined, credencial);

// La regla del spec, escrita aparte del servicio: la última activa que no es refuerzo o, si no hay, el último
// refuerzo activo. Las dosis llegan ordenadas por orden.
const queCompleta = (dosis) => {
  const activas = dosis.filter((d) => d.activa);
  const sinRefuerzos = activas.filter((d) => d.tipo !== 'REFUERZO');
  return (sinRefuerzos.length > 0 ? sinRefuerzos : activas).at(-1)?.codigo;
};

const dosis = (tipo, nombre, datos = {}) => ({ tipo, nombre, ...datos });
const vacunaNueva = (nombre, listaDosis, datos = {}) => ({
  codigo: codigoNuevo(),
  nombre: `${PREFIJO}${nombre}`,
  dosis: listaDosis,
  ...datos,
});
const crear = (cuerpo, credencial) => enviar('post', '/vacunas', cuerpo, credencial);
const resumen = (vacuna) => vacuna.dosis.map((d) => [d.codigo, d.orden, d.completaEsquema]);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
const filasBitacora = async (accion, entidad, entidadId) => {
  const [filas] = await pool.query(
    `SELECT valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND accion = ? AND entidad = ? AND entidad_id = ?
      ORDER BY id`,
    [accion, entidad, String(entidadId)],
  );
  return filas.map((f) => ({ anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
};

async function limpiar() {
  const condicion = 'v.codigo LIKE ? OR v.nombre LIKE ?';
  const parametros = [`${CODIGO_PRUEBA.replace('_', '\\_')}%`, `${PREFIJO}%`];
  await pool.query(`DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE ${condicion}`, parametros);
  await pool.query(`DELETE v FROM vacuna v WHERE ${condicion}`, parametros);
}

afterAll(limpiar);

beforeAll(async () => {
  await limpiar();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;

  // Una cuenta de Epidemiología de la semilla, con sus datos y permisos reales: autenticar compara el rol, el
  // establecimiento y el municipio con la base.
  const [[cuenta]] = await pool.query(
    `SELECT u.id, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE r.codigo = 'EPIDEMIOLOGIA' AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
  );
  if (!cuenta) throw new Error('No hay una cuenta de Epidemiología activa en la base de prueba');
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  tokenEpidemiologia = await tokenDePrueba(cuenta.id, {
    rol: 'EPIDEMIOLOGIA',
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  });
});

describe('GET /vacunas', () => {
  it('trae las 21 de la semilla ordenadas por ordenInforme, cada una con sus dosis por orden y su tipo', async () => {
    const res = await consultar('/vacunas');

    expect(res.status).toBe(200);
    const codigos = res.body.map((v) => v.codigo);
    expect(codigos).toEqual(expect.arrayContaining(SEMILLA));
    const ordenes = res.body.map((v) => v.ordenInforme);
    expect(ordenes).toEqual([...ordenes].sort((a, b) => a - b));

    const hexa = res.body.find((v) => v.codigo === 'HEXA');
    expect(Object.keys(hexa).sort()).toEqual(['activa', 'codigo', 'descripcion', 'dosis', 'id', 'nombre', 'ordenInforme']);
    expect(hexa).toMatchObject({ nombre: 'Hexavalente', descripcion: null, ordenInforme: 4, activa: true });
    expect(hexa.dosis.map((d) => [d.codigo, d.tipo, d.orden])).toEqual([
      ['D1', 'DOSIS', 1],
      ['D2', 'DOSIS', 2],
      ['D3', 'DOSIS', 3],
      ['R1', 'REFUERZO', 4],
    ]);
    expect(Object.keys(hexa.dosis[0]).sort()).toEqual(
      ['activa', 'codigo', 'completaEsquema', 'esTrazadora', 'id', 'nombre', 'orden', 'tipo'],
    );
    for (const vacuna of res.body) {
      const ordenesDosis = vacuna.dosis.map((d) => d.orden);
      expect(ordenesDosis, vacuna.codigo).toEqual([...ordenesDosis].sort((a, b) => a - b));
    }
  });

  it('todas las dosis de la semilla tienen un tipo válido y una sola completa el esquema, según la regla', async () => {
    const res = await consultar('/vacunas');
    const semilla = res.body.filter((v) => SEMILLA.includes(v.codigo));

    expect(semilla).toHaveLength(SEMILLA.length);
    expect(semilla.flatMap((v) => v.dosis)).toHaveLength(60);
    for (const vacuna of semilla) {
      for (const dosis of vacuna.dosis) expect(TIPOS, `${vacuna.codigo} ${dosis.codigo}`).toContain(dosis.tipo);
      const completan = vacuna.dosis.filter((d) => d.completaEsquema).map((d) => d.codigo);
      expect(completan, vacuna.codigo).toEqual([queCompleta(vacuna.dosis)]);
    }
    expect(semilla.find((v) => v.codigo === 'DPT').dosis.find((d) => d.completaEsquema).codigo).toBe('R2');
  });

  it('activa=true y activa=false filtran por estado', async () => {
    const activas = await consultar('/vacunas?activa=true');
    const inactivas = await consultar('/vacunas?activa=false');
    const todas = await consultar('/vacunas');

    expect(activas.status).toBe(200);
    expect(inactivas.status).toBe(200);
    expect(activas.body.every((v) => v.activa)).toBe(true);
    expect(inactivas.body.every((v) => !v.activa)).toBe(true);
    expect(activas.body.length + inactivas.body.length).toBe(todas.body.length);
  });

  it.each([
    ['activa=abc', 'activa debe ser true o false.'],
    ['orden=1', 'Parámetro no permitido: orden.'],
    ['activa=true&activa=false', 'activa no se puede repetir.'],
  ])('%s responde 400 ENTRADA_INVALIDA', async (query, mensaje) => {
    const res = await consultar(`/vacunas?${query}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });
});

describe('GET /vacunas/{id}', () => {
  it('devuelve HEXA con D3 como la dosis que completa el esquema', async () => {
    const lista = await consultar('/vacunas');
    const { id } = lista.body.find((v) => v.codigo === 'HEXA');

    const res = await consultar(`/vacunas/${id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(lista.body.find((v) => v.codigo === 'HEXA'));
    expect(res.body.dosis.filter((d) => d.completaEsquema).map((d) => d.codigo)).toEqual(['D3']);
  });

  it.each(['999999', 'abc'])('el id %s responde 404 NO_ENCONTRADO', async (id) => {
    const res = await consultar(`/vacunas/${id}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La vacuna no existe.' });
  });
});

describe('permisos de consulta', () => {
  it('una cuenta de Epidemiología recibe 403 SIN_PERMISO en GET /vacunas y GET /vacunas/{id}', async () => {
    for (const ruta of ['/vacunas', '/vacunas/1']) {
      const res = await consultar(ruta, tokenEpidemiologia);
      expect(res.status, ruta).toBe(403);
      expect(res.body.error.codigo, ruta).toBe('SIN_PERMISO');
    }
  });
});

describe('POST /vacunas', () => {
  it('con DOSIS, DOSIS y REFUERZO crea D1, D2 y R1 con orden 1 a 3, y D2 completa el esquema', async () => {
    const cuerpo = vacunaNueva('Tres dosis', [
      dosis('DOSIS', 'Primera dosis'),
      dosis('DOSIS', '  Segunda   dosis ', { esTrazadora: true }),
      dosis('REFUERZO', 'Primer refuerzo'),
    ], { descripcion: '', ordenInforme: 900 });

    const res = await crear(cuerpo);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: cuerpo.codigo,
      nombre: `${PREFIJO}Tres dosis`,
      descripcion: null,
      ordenInforme: 900,
      activa: true,
    });
    expect(res.body.dosis.map((d) => [d.codigo, d.tipo, d.nombre, d.orden, d.completaEsquema, d.esTrazadora, d.activa]))
      .toEqual([
        ['D1', 'DOSIS', 'Primera dosis', 1, false, false, true],
        ['D2', 'DOSIS', 'Segunda dosis', 2, true, true, true],
        ['R1', 'REFUERZO', 'Primer refuerzo', 3, false, false, true],
      ]);
    expect((await enviar('get', `/vacunas/${res.body.id}`)).body).toEqual(res.body);

    const filas = await filasBitacora('CREAR', 'vacuna', res.body.id);
    expect(filas).toEqual([{ anteriores: null, nuevos: res.body }]);
    expect(await filasBitacora('CREAR', 'dosis', res.body.dosis[0].id)).toEqual([]);
  });

  it('solo con refuerzos marca el último refuerzo; UNICA con refuerzo marca la UNICA', async () => {
    const refuerzos = await crear(vacunaNueva('Solo refuerzos', [
      dosis('REFUERZO', 'Primer refuerzo'),
      dosis('REFUERZO', 'Segundo refuerzo'),
    ]));
    const unica = await crear(vacunaNueva('Unica con refuerzo', [
      dosis('UNICA', 'Dosis única'),
      dosis('REFUERZO', 'Primer refuerzo'),
    ]));

    expect(refuerzos.status).toBe(201);
    expect(resumen(refuerzos.body)).toEqual([['R1', 1, false], ['R2', 2, true]]);
    expect(unica.status).toBe(201);
    expect(resumen(unica.body)).toEqual([['UNICA', 1, true], ['R1', 2, false]]);
  });

  it.each([
    ['UNICA con DOSIS', ['UNICA', 'DOSIS'], 'Una vacuna con dosis única no lleva otras dosis, solo refuerzos.'],
    ['dos UNICA', ['UNICA', 'UNICA'], 'Una vacuna con dosis única no lleva otras dosis, solo refuerzos.'],
    ['un refuerzo antes de una dosis', ['DOSIS', 'REFUERZO', 'DOSIS'], 'Los refuerzos van después de las dosis.'],
  ])('%s responde 422 SECUENCIA_INVALIDA', async (_caso, tipos, mensaje) => {
    const cuerpo = vacunaNueva('Secuencia invalida', tipos.map((t, i) => dosis(t, `Dosis numero ${i + 1}`)));

    const res = await crear(cuerpo);

    expect(res.status).toBe(422);
    expect(res.body.error).toEqual({ codigo: 'SECUENCIA_INVALIDA', mensaje });
    const [filas] = await pool.query('SELECT id FROM vacuna WHERE codigo = ?', [cuerpo.codigo]);
    expect(filas).toEqual([]);
  });

  it('guarda el código en mayúsculas, y un código o un nombre repetidos responden 409 VACUNA_DUPLICADA', async () => {
    const codigo = codigoNuevo();
    const original = await crear(
      vacunaNueva('Vacuna Única', [dosis('UNICA', 'Dosis única')], { codigo: codigo.toLowerCase() }),
    );
    expect(original.status).toBe(201);
    expect(original.body.codigo).toBe(codigo);

    const mismoCodigo = await crear(vacunaNueva('Otra vacuna', [dosis('UNICA', 'Dosis única')], { codigo }));
    expect(mismoCodigo.status).toBe(409);
    expect(mismoCodigo.body.error).toEqual({ codigo: 'VACUNA_DUPLICADA', mensaje: 'Ya hay una vacuna con ese código.' });

    const mismoNombre = await crear({
      ...vacunaNueva('', [dosis('UNICA', 'Dosis única')]),
      nombre: `${PREFIJO.toUpperCase()}vacuna unica`,
    });
    expect(mismoNombre.status).toBe(409);
    expect(mismoNombre.body.error).toEqual({ codigo: 'VACUNA_DUPLICADA', mensaje: 'Ya hay una vacuna con ese nombre.' });
  });

  it('dos dosis con el mismo nombre responden 409 DOSIS_DUPLICADA', async () => {
    const res = await crear(vacunaNueva('Dosis repetidas', [
      dosis('DOSIS', 'Primera dosis'),
      dosis('DOSIS', 'PRIMERA DÓSIS'),
    ]));

    expect(res.status).toBe(409);
    expect(res.body.error).toEqual({
      codigo: 'DOSIS_DUPLICADA',
      mensaje: 'La vacuna ya tiene una dosis con ese nombre.',
    });
  });

  it.each([
    ['dosis vacío', { dosis: [] }, 'Indique al menos una dosis.'],
    ['sin dosis', { dosis: undefined }, 'Indique al menos una dosis.'],
    ['activa', { activa: true }, 'Campo no permitido: activa.'],
    ['completaEsquema en una dosis', { dosis: [dosis('UNICA', 'Dosis única', { completaEsquema: true })] },
      'Campo no permitido: completaEsquema.'],
    ['codigo en una dosis', { dosis: [dosis('UNICA', 'Dosis única', { codigo: 'D9' })] }, 'Campo no permitido: codigo.'],
    ['un tipo inválido', { dosis: [dosis('ADICIONAL', 'Dosis adicional')] },
      'El tipo de la dosis debe ser UNICA, DOSIS o REFUERZO.'],
    ['un código con guion', { codigo: 'ZVT-1' },
      'El código de la vacuna debe empezar con una letra y solo puede tener letras sin tildes, números y guion bajo.'],
    ['un ordenInforme negativo', { ordenInforme: -1 }, 'ordenInforme debe ser un número entero entre 0 y 65535.'],
  ])('%s responde 400 ENTRADA_INVALIDA', async (_caso, cambios, mensaje) => {
    const res = await crear({ ...vacunaNueva('Entrada invalida', [dosis('UNICA', 'Dosis única')]), ...cambios });

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('sin ordenInforme queda el mayor más uno', async () => {
    const [[{ mayor }]] = await pool.query('SELECT MAX(orden_informe) AS mayor FROM vacuna');

    const res = await crear(vacunaNueva('Al final del informe', [dosis('UNICA', 'Dosis única')]));

    expect(res.status).toBe(201);
    expect(res.body.ordenInforme).toBe(mayor + 1);
  });
});

describe('PATCH /vacunas/{id}', () => {
  const editar = (id, cuerpo) => enviar('patch', `/vacunas/${id}`, cuerpo);

  it('editar el nombre y el orden deja una fila ACTUALIZAR; con los mismos valores no deja fila', async () => {
    const { body: vacuna } = await crear(vacunaNueva('Para editar', [dosis('UNICA', 'Dosis única')], { ordenInforme: 900 }));

    const res = await editar(vacuna.id, { nombre: `${PREFIJO}Editada`, ordenInforme: 901, descripcion: '' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ...vacuna, nombre: `${PREFIJO}Editada`, ordenInforme: 901 });
    expect(await filasBitacora('ACTUALIZAR', 'vacuna', vacuna.id)).toEqual([
      {
        anteriores: { nombre: `${PREFIJO}Para editar`, ordenInforme: 900 },
        nuevos: { nombre: `${PREFIJO}Editada`, ordenInforme: 901 },
      },
    ]);

    const igual = await editar(vacuna.id, { nombre: `${PREFIJO}Editada`, ordenInforme: 901, descripcion: null });
    expect(igual.status).toBe(200);
    expect(await filasBitacora('ACTUALIZAR', 'vacuna', vacuna.id)).toHaveLength(1);
  });

  it('un nombre de otra vacuna responde 409, y su propio nombre con otras mayúsculas no', async () => {
    const { body: una } = await crear(vacunaNueva('Nombre tomado', [dosis('UNICA', 'Dosis única')]));
    const { body: otra } = await crear(vacunaNueva('Nombre libre', [dosis('UNICA', 'Dosis única')]));

    const tomado = await editar(otra.id, { nombre: `${PREFIJO}NOMBRE TOMADO` });
    const propio = await editar(una.id, { nombre: `${PREFIJO}Nombre Tomado` });

    expect(tomado.status).toBe(409);
    expect(tomado.body.error.codigo).toBe('VACUNA_DUPLICADA');
    expect(propio.status).toBe(200);
  });

  it.each([
    ['codigo', { codigo: 'ZVT_OTRO' }, 'codigo no se puede cambiar.'],
    ['activa', { activa: false }, 'Campo no permitido: activa.'],
    ['dosis', { dosis: [] }, 'Campo no permitido: dosis.'],
    ['un cuerpo vacío', {}, 'Indique al menos un dato de la vacuna.'],
    ['un nombre de 2 caracteres', { nombre: 'AB' }, 'El nombre de la vacuna debe tener entre 3 y 120 caracteres.'],
  ])('%s responde 400 ENTRADA_INVALIDA', async (caso, cuerpo, mensaje) => {
    const { body: vacuna } = await crear(vacunaNueva(`Cambio invalido ${caso}`, [dosis('UNICA', 'Dosis única')]));

    const res = await editar(vacuna.id, cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('una vacuna inexistente responde 404', async () => {
    const res = await editar(999999, { nombre: `${PREFIJO}No existe` });

    expect(res.status).toBe(404);
    expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La vacuna no existe.' });
  });
});

describe('POST /vacunas/{id}/desactivar y /reactivar', () => {
  it('desactivar deja DESACTIVAR, saca la vacuna de activa=true y no cambia sus dosis; reactivar la deja igual', async () => {
    const { body: creada } = await crear(vacunaNueva('Para desactivar', [
      dosis('DOSIS', 'Primera dosis'),
      dosis('DOSIS', 'Segunda dosis'),
    ]));
    // Una dosis inactiva, para comprobar que conserva su estado al desactivar y reactivar la vacuna.
    await pool.query('UPDATE dosis SET activa = FALSE WHERE id = ?', [creada.dosis[0].id]);
    const { body: vacuna } = await enviar('get', `/vacunas/${creada.id}`);

    const desactivada = await enviar('post', `/vacunas/${vacuna.id}/desactivar`);

    expect(desactivada.status).toBe(200);
    expect(desactivada.body).toEqual({ ...vacuna, activa: false });
    expect(await filasBitacora('DESACTIVAR', 'vacuna', vacuna.id)).toEqual([
      { anteriores: { activa: true }, nuevos: { activa: false } },
    ]);
    const activas = await enviar('get', '/vacunas?activa=true');
    expect(activas.body.map((v) => v.id)).not.toContain(vacuna.id);
    const inactivas = await enviar('get', '/vacunas?activa=false');
    expect(inactivas.body.map((v) => v.id)).toContain(vacuna.id);

    const otraVez = await enviar('post', `/vacunas/${vacuna.id}/desactivar`);
    expect(otraVez.status).toBe(200);
    expect(await filasBitacora('DESACTIVAR', 'vacuna', vacuna.id)).toHaveLength(1);

    const reactivada = await enviar('post', `/vacunas/${vacuna.id}/reactivar`);
    expect(reactivada.status).toBe(200);
    expect(reactivada.body).toEqual(vacuna);
    expect(await filasBitacora('REACTIVAR', 'vacuna', vacuna.id)).toEqual([
      { anteriores: { activa: false }, nuevos: { activa: true } },
    ]);

    const yaActiva = await enviar('post', `/vacunas/${vacuna.id}/reactivar`);
    expect(yaActiva.status).toBe(200);
    expect(await filasBitacora('REACTIVAR', 'vacuna', vacuna.id)).toHaveLength(1);
  });

  it('editar una vacuna inactiva funciona', async () => {
    const { body: vacuna } = await crear(vacunaNueva('Inactiva editable', [dosis('UNICA', 'Dosis única')]));
    await enviar('post', `/vacunas/${vacuna.id}/desactivar`);

    const res = await enviar('patch', `/vacunas/${vacuna.id}`, { descripcion: 'Ya no se aplica.' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activa: false, descripcion: 'Ya no se aplica.' });
  });

  it('una vacuna inexistente responde 404, y DELETE /vacunas/{id} responde 404 porque la ruta no existe', async () => {
    const { body: vacuna } = await crear(vacunaNueva('Sin borrar', [dosis('UNICA', 'Dosis única')]));

    const inexistente = await enviar('post', '/vacunas/999999/desactivar');
    const borrar = await enviar('delete', `/vacunas/${vacuna.id}`);

    expect(inexistente.status).toBe(404);
    expect(inexistente.body.error.mensaje).toBe('La vacuna no existe.');
    expect(borrar.status).toBe(404);
    expect(borrar.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La ruta solicitada no existe.' });
    expect((await enviar('get', `/vacunas/${vacuna.id}`)).status).toBe(200);
  });
});

describe('dosis de una vacuna', () => {
  const agregar = (vacunaId, cuerpo, credencial) => enviar('post', `/vacunas/${vacunaId}/dosis`, cuerpo, credencial);
  const editarDosis = (vacunaId, dosisId, cuerpo) => enviar('patch', `/vacunas/${vacunaId}/dosis/${dosisId}`, cuerpo);
  const cambiarDosis = (vacunaId, dosisId, accion) =>
    enviar('post', `/vacunas/${vacunaId}/dosis/${dosisId}/${accion}`);
  const idDe = (vacuna, codigo) => vacuna.dosis.find((d) => d.codigo === codigo).id;

  // D1, D2 y R1: D2 completa el esquema.
  const crearTresDosis = async (nombre) => {
    const res = await crear(vacunaNueva(nombre, [
      dosis('DOSIS', 'Primera dosis'),
      dosis('DOSIS', 'Segunda dosis'),
      dosis('REFUERZO', 'Primer refuerzo'),
    ]));
    expect(res.status).toBe(201);
    return res.body;
  };

  it('agregar una DOSIS a D1, D2, R1 devuelve D3 con orden 4, que pasa a completar el esquema', async () => {
    const vacuna = await crearTresDosis('Agregar dosis');

    const res = await agregar(vacuna.id, dosis('DOSIS', 'Tercera dosis', { esTrazadora: true }));

    expect(res.status).toBe(201);
    expect(resumen(res.body)).toEqual([['D1', 1, false], ['D2', 2, false], ['R1', 3, false], ['D3', 4, true]]);
    const d3 = res.body.dosis.find((d) => d.codigo === 'D3');
    expect(d3).toMatchObject({ tipo: 'DOSIS', nombre: 'Tercera dosis', esTrazadora: true, activa: true });
    expect(await filasBitacora('CREAR', 'dosis', d3.id)).toEqual([
      { anteriores: null, nuevos: { vacunaId: vacuna.id, ...d3 } },
    ]);
    expect(await filasBitacora('ACTUALIZAR', 'dosis', idDe(vacuna, 'D2'))).toEqual([
      { anteriores: { completaEsquema: true }, nuevos: { completaEsquema: false } },
    ]);
    expect(await filasBitacora('ACTUALIZAR', 'dosis', idDe(vacuna, 'D1'))).toEqual([]);
  });

  it('un refuerzo agregado va al final y no completa el esquema', async () => {
    const vacuna = await crearTresDosis('Agregar refuerzo');

    const res = await agregar(vacuna.id, dosis('REFUERZO', 'Segundo refuerzo'));

    expect(res.status).toBe(201);
    expect(resumen(res.body)).toEqual([['D1', 1, false], ['D2', 2, true], ['R1', 3, false], ['R2', 4, false]]);
    expect(await filasBitacora('ACTUALIZAR', 'dosis', idDe(vacuna, 'D2'))).toEqual([]);
  });

  it('una UNICA en una vacuna con DOSIS, o una DOSIS en una con UNICA, responde 422', async () => {
    const conDosis = await crearTresDosis('Sin unica');
    const { body: conUnica } = await crear(vacunaNueva('Con unica', [dosis('UNICA', 'Dosis única')]));

    const unica = await agregar(conDosis.id, dosis('UNICA', 'Dosis única'));
    const otraDosis = await agregar(conUnica.id, dosis('DOSIS', 'Primera dosis'));
    const otraUnica = await agregar(conUnica.id, dosis('UNICA', 'Otra dosis única'));

    for (const res of [unica, otraDosis, otraUnica]) {
      expect(res.status).toBe(422);
      expect(res.body.error).toEqual({
        codigo: 'SECUENCIA_INVALIDA',
        mensaje: 'Una vacuna con dosis única no lleva otras dosis, solo refuerzos.',
      });
    }
    expect((await agregar(conUnica.id, dosis('REFUERZO', 'Primer refuerzo'))).status).toBe(201);
  });

  it('un nombre repetido en la vacuna responde 409 DOSIS_DUPLICADA', async () => {
    const vacuna = await crearTresDosis('Nombre de dosis repetido');

    const res = await agregar(vacuna.id, dosis('DOSIS', 'SEGUNDA DÓSIS'));

    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('DOSIS_DUPLICADA');
  });

  it('dos POST en paralelo a la misma vacuna reciben códigos y órdenes distintos', async () => {
    const vacuna = await crearTresDosis('Dosis en paralelo');

    const respuestas = await Promise.all([
      agregar(vacuna.id, dosis('DOSIS', 'Dosis paralela A')),
      agregar(vacuna.id, dosis('DOSIS', 'Dosis paralela B')),
    ]);

    expect(respuestas.map((r) => r.status)).toEqual([201, 201]);
    const { body: final } = await enviar('get', `/vacunas/${vacuna.id}`);
    const nuevas = final.dosis.filter((d) => d.nombre.startsWith('Dosis paralela'));
    expect(nuevas.map((d) => d.codigo).sort()).toEqual(['D3', 'D4']);
    expect(nuevas.map((d) => d.orden).sort()).toEqual([4, 5]);
    expect(final.dosis.filter((d) => d.completaEsquema).map((d) => d.orden)).toEqual([5]);
  });

  it('desactivar la que completa pasa la marca a la anterior y reactivarla la devuelve; el código no se reutiliza', async () => {
    const vacuna = await crearTresDosis('Desactivar dosis');
    const { body: conD3 } = await agregar(vacuna.id, dosis('DOSIS', 'Tercera dosis'));
    const d3 = idDe(conD3, 'D3');

    const desactivada = await cambiarDosis(vacuna.id, d3, 'desactivar');

    expect(desactivada.status).toBe(200);
    expect(desactivada.body.dosis.find((d) => d.id === d3)).toMatchObject({ activa: false, completaEsquema: false });
    expect(desactivada.body.dosis.find((d) => d.completaEsquema).codigo).toBe('D2');
    expect(await filasBitacora('DESACTIVAR', 'dosis', d3)).toEqual([
      { anteriores: { activa: true, completaEsquema: true }, nuevos: { activa: false, completaEsquema: false } },
    ]);

    const otraVez = await cambiarDosis(vacuna.id, d3, 'desactivar');
    expect(otraVez.status).toBe(200);
    expect(await filasBitacora('DESACTIVAR', 'dosis', d3)).toHaveLength(1);

    const reactivada = await cambiarDosis(vacuna.id, d3, 'reactivar');
    expect(reactivada.status).toBe(200);
    expect(reactivada.body.dosis.find((d) => d.completaEsquema).codigo).toBe('D3');
    expect(await filasBitacora('REACTIVAR', 'dosis', d3)).toEqual([
      { anteriores: { activa: false, completaEsquema: false }, nuevos: { activa: true, completaEsquema: true } },
    ]);
    // D2: true → false al agregar D3, false → true al desactivarla y true → false al reactivarla.
    const marcasD2 = (await filasBitacora('ACTUALIZAR', 'dosis', idDe(vacuna, 'D2'))).map((f) => f.nuevos.completaEsquema);
    expect(marcasD2).toEqual([false, true, false]);

    await cambiarDosis(vacuna.id, d3, 'desactivar');
    const siguiente = await agregar(vacuna.id, dosis('DOSIS', 'Cuarta dosis'));
    expect(siguiente.status).toBe(201);
    expect(resumen(siguiente.body).at(-1)).toEqual(['D4', 5, true]);
  });

  it('desactivar la única dosis activa responde 409 VACUNA_SIN_DOSIS_ACTIVAS, también con la vacuna inactiva', async () => {
    const { body: vacuna } = await crear(vacunaNueva('Una sola dosis', [dosis('UNICA', 'Dosis única')]));
    const unica = vacuna.dosis[0].id;

    const res = await cambiarDosis(vacuna.id, unica, 'desactivar');
    await enviar('post', `/vacunas/${vacuna.id}/desactivar`);
    const inactiva = await cambiarDosis(vacuna.id, unica, 'desactivar');

    for (const respuesta of [res, inactiva]) {
      expect(respuesta.status).toBe(409);
      expect(respuesta.body.error).toEqual({
        codigo: 'VACUNA_SIN_DOSIS_ACTIVAS',
        mensaje: 'La vacuna debe conservar al menos una dosis activa; desactive la vacuna si ya no se aplica.',
      });
    }
    const { body: final } = await enviar('get', `/vacunas/${vacuna.id}`);
    expect(final.dosis).toEqual(vacuna.dosis);
    expect(await filasBitacora('DESACTIVAR', 'dosis', unica)).toEqual([]);
  });

  it('editar el nombre y esTrazadora deja una fila ACTUALIZAR; con los mismos valores no deja fila', async () => {
    const vacuna = await crearTresDosis('Editar dosis');
    const d1 = idDe(vacuna, 'D1');

    const res = await editarDosis(vacuna.id, d1, { nombre: 'Dosis 1 (2 meses)', esTrazadora: true });

    expect(res.status).toBe(200);
    expect(res.body.dosis.find((d) => d.id === d1)).toMatchObject({ nombre: 'Dosis 1 (2 meses)', esTrazadora: true });
    expect(await filasBitacora('ACTUALIZAR', 'dosis', d1)).toEqual([
      {
        anteriores: { nombre: 'Primera dosis', esTrazadora: false },
        nuevos: { nombre: 'Dosis 1 (2 meses)', esTrazadora: true },
      },
    ]);

    const igual = await editarDosis(vacuna.id, d1, { nombre: 'Dosis 1 (2 meses)', esTrazadora: true });
    expect(igual.status).toBe(200);
    expect(await filasBitacora('ACTUALIZAR', 'dosis', d1)).toHaveLength(1);

    const repetido = await editarDosis(vacuna.id, d1, { nombre: 'segunda dosis' });
    expect(repetido.status).toBe(409);
    expect(repetido.body.error.codigo).toBe('DOSIS_DUPLICADA');
  });

  it.each([
    ['codigo', { codigo: 'D9' }, 'codigo no se puede cambiar.'],
    ['tipo', { tipo: 'REFUERZO' }, 'tipo no se puede cambiar.'],
    ['orden', { orden: 9 }, 'orden no se puede cambiar.'],
    ['completaEsquema', { completaEsquema: true }, 'completaEsquema no se puede cambiar.'],
    ['activa', { activa: false }, 'Campo no permitido: activa.'],
    ['un cuerpo vacío', {}, 'Indique al menos un dato de la dosis.'],
    ['esTrazadora no booleano', { esTrazadora: 'si' }, 'esTrazadora debe ser true o false.'],
  ])('editar una dosis con %s responde 400 ENTRADA_INVALIDA', async (caso, cuerpo, mensaje) => {
    const vacuna = await crearTresDosis(`Cambio de dosis invalido ${caso}`);

    const res = await editarDosis(vacuna.id, idDe(vacuna, 'D1'), cuerpo);

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje });
  });

  it('una dosis de otra vacuna, o una vacuna inexistente, responden 404', async () => {
    const una = await crearTresDosis('Vacuna propia');
    const otra = await crearTresDosis('Vacuna ajena');
    const ajena = idDe(otra, 'D1');

    const respuestas = [
      await editarDosis(una.id, ajena, { nombre: 'Otro nombre' }),
      await cambiarDosis(una.id, ajena, 'desactivar'),
      await cambiarDosis(una.id, ajena, 'reactivar'),
      await cambiarDosis(una.id, 'abc', 'desactivar'),
    ];

    for (const res of respuestas) {
      expect(res.status).toBe(404);
      expect(res.body.error).toEqual({ codigo: 'NO_ENCONTRADO', mensaje: 'La dosis no existe.' });
    }
    const sinVacuna = await agregar(999999, dosis('DOSIS', 'Primera dosis'));
    expect(sinVacuna.status).toBe(404);
    expect(sinVacuna.body.error.mensaje).toBe('La vacuna no existe.');
  });

  it('con Epidemiología, POST /vacunas, PATCH /vacunas/{id} y POST /vacunas/{id}/dosis responden 403', async () => {
    const vacuna = await crearTresDosis('Sin permiso');

    const respuestas = [
      await crear(vacunaNueva('No se crea', [dosis('UNICA', 'Dosis única')]), tokenEpidemiologia),
      await enviar('patch', `/vacunas/${vacuna.id}`, { nombre: `${PREFIJO}No se edita` }, tokenEpidemiologia),
      await agregar(vacuna.id, dosis('DOSIS', 'Tercera dosis'), tokenEpidemiologia),
    ];

    for (const res of respuestas) {
      expect(res.status).toBe(403);
      expect(res.body.error.codigo).toBe('SIN_PERMISO');
    }
    expect((await enviar('get', `/vacunas/${vacuna.id}`)).body).toEqual(vacuna);
  });
});
