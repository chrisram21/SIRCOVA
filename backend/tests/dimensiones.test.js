import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Collection, Int32 } from 'mongodb';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas insertan en MongoDB sus propias dimensiones (códigos zvt_…) y un esquema BORRADOR de la vacuna
// ficticia ZVT_HU15, y los borran al inicio y al final. No tocan las dimensiones ni los esquemas de la semilla.
const PREFIJO = /^zvt_/;
const VACUNA_PRUEBA = 'ZVT_HU15';
const SEMILLA = ['sexo', 'grupo_edad', 'estado_embarazo', 'presentacion'];

const auditoria = () => ({
  creado_por: new Int32(1),
  creado_en: new Date(),
  publicado_por: null,
  publicado_en: null,
  motivo_cambio: null,
});
const valor = (codigo, orden, extra = {}) => ({
  codigo,
  etiqueta: `Valor ${codigo}`,
  orden: new Int32(orden),
  activo: true,
  ...extra,
});
const rango = (min, max) => ({ edad_min_meses: new Int32(min), edad_max_meses: new Int32(max) });

const DIMENSIONES_PRUEBA = [
  {
    codigo: 'zvt_edad',
    nombre: 'ZVT Edad',
    tipo: 'RANGO_EDAD',
    activo: true,
    valores: [valor('MENOR_1', 1, rango(0, 12)), valor('ZVT_SIN_POB', 2, rango(12, 24))],
  },
  {
    codigo: 'zvt_uso',
    nombre: 'ZVT Uso',
    descripcion: 'Dimensión de prueba que usa un esquema en borrador.',
    tipo: 'CATEGORICA',
    activo: true,
    valores: [valor('B', 2), valor('A', 1)],
  },
  {
    codigo: 'zvt_inactiva',
    nombre: 'ZVT Inactiva',
    tipo: 'CATEGORICA',
    activo: false,
    valores: [valor('X', 1)],
  },
];

const ESQUEMA_PRUEBA = {
  vacuna: { id: new Int32(9999), codigo: VACUNA_PRUEBA, nombre: 'Vacuna de prueba HU-15' },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'BORRADOR',
  vigencia: { desde: new Date('2026-01-01'), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  dimensiones: {
    dosis: [{ codigo: 'D1', etiqueta: 'Primera dosis', desagregacion: [{ dimension: 'zvt_edad', valores: ['MENOR_1'] }] }],
    procedencia: { modo: 'PROPIO_Y_OTROS' },
    desagregacion: [{ dimension: 'zvt_uso', valores: ['A'] }],
  },
  secciones: [{ codigo: 'S1', titulo: '< 1 año', orden: new Int32(1), grupo_edad: 'MENOR_1', dosis: ['D1'] }],
  reglas: [],
};

async function limpiar() {
  const db = await obtenerDb();
  await db.collection('catalogo_dimensiones').deleteMany({ codigo: PREFIJO });
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': VACUNA_PRUEBA });
}

async function prepararMongo() {
  const db = await obtenerDb();
  await db.collection('catalogo_dimensiones').insertMany(DIMENSIONES_PRUEBA.map((d) => ({ ...d, auditoria: auditoria() })));
  await db.collection('esquemas_captura').insertOne({ ...ESQUEMA_PRUEBA, auditoria: auditoria() });
}

afterAll(limpiar);

let token;
let tokenEpidemiologia;
let tokenRevisor;

const consultar = (ruta, credencial = token) =>
  request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`);
const enviar = (metodo, ruta, cuerpo, credencial = token) =>
  request(app)[metodo](`/api/v1${ruta}`).set('Authorization', `Bearer ${credencial}`).send(cuerpo);

const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);
async function filasBitacora(entidadId) {
  const [filas] = await pool.query(
    `SELECT accion, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'CONFIGURACION' AND entidad = 'catalogo_dimensiones' AND entidad_id = ?
      ORDER BY id`,
    [entidadId],
  );
  return filas.map((f) => ({
    accion: f.accion,
    anteriores: leerJson(f.valores_anteriores),
    nuevos: leerJson(f.valores_nuevos),
  }));
}

// Sin promoteValues el driver no convierte los enteros a number: se ve si se guardaron como int o como double.
const documentoCrudo = async (codigo) =>
  (await obtenerDb()).collection('catalogo_dimensiones').findOne({ codigo }, { promoteValues: false });
const cambiarEstadoEsquema = async (estado) =>
  (await obtenerDb()).collection('esquemas_captura').updateOne({ 'vacuna.codigo': VACUNA_PRUEBA }, { $set: { estado } });

beforeAll(async () => {
  await limpiar();
  await prepararMongo();
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ nombreUsuario: process.env.PRUEBA_USUARIO, contrasena: process.env.PRUEBA_CONTRASENA });
  if (res.status !== 200) throw new Error(`No se pudo iniciar sesión con el usuario de prueba (${res.status})`);
  token = res.body.token;
  tokenEpidemiologia = await tokenDeLaSemilla('EPIDEMIOLOGIA');
  tokenRevisor = await tokenDeLaSemilla('REVISOR');
});

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function tokenDeLaSemilla(rol) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE r.codigo = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
      ORDER BY u.id LIMIT 1`,
    [rol],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa con el rol ${rol} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  return await tokenDePrueba(cuenta.id, {
    rol,
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  });
}

function clavesConGuionBajo(valor) {
  if (Array.isArray(valor)) return valor.flatMap(clavesConGuionBajo);
  if (valor === null || typeof valor !== 'object') return [];
  return Object.entries(valor).flatMap(([clave, hijo]) => [...(clave.includes('_') ? [clave] : []), ...clavesConGuionBajo(hijo)]);
}

const MENSAJE_CODIGO =
  'El código debe empezar con una letra minúscula y usar solo minúsculas, números y guion bajo (hasta 30).';

const MENSAJE_EDAD = 'La edad debe ser un número entero de meses entre 0 y 1,200.';

const porCodigo = (lista) => new Map(lista.map((elemento) => [elemento.codigo, elemento]));

describe('GET /dimensiones', () => {
  it('trae las dimensiones de la semilla ordenadas por nombre, en camelCase y con su uso en esquemas', async () => {
    const res = await consultar('/dimensiones');

    expect(res.status).toBe(200);
    const codigos = res.body.map((d) => d.codigo);
    expect(codigos).toEqual(expect.arrayContaining([...SEMILLA, 'zvt_edad', 'zvt_uso', 'zvt_inactiva']));
    const nombres = res.body.map((d) => d.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));

    const dimensiones = porCodigo(res.body);
    const sexo = dimensiones.get('sexo');
    expect(sexo).toMatchObject({ nombre: 'Sexo', tipo: 'CATEGORICA', activa: true, enUso: true, descripcion: null });
    expect(sexo.id).toMatch(/^[0-9a-f]{24}$/);
    expect(sexo.valores.map((v) => v.codigo)).toEqual(['M', 'F']);
    expect(sexo.valores[0]).toEqual({ codigo: 'M', etiqueta: 'Masculino', orden: 1, activo: true, enUso: true });

    const edad = dimensiones.get('grupo_edad');
    expect(edad.tipo).toBe('RANGO_EDAD');
    expect(edad.enUso).toBe(true);
    const valoresEdad = porCodigo(edad.valores);
    expect(valoresEdad.get('MENOR_1')).toMatchObject({ edadMinMeses: 0, edadMaxMeses: 12, enUso: true, sinPoblacion: false });
    expect(valoresEdad.get('2_4')).toMatchObject({ enUso: false, sinPoblacion: true });
    expect(valoresEdad.get('10_14')).toMatchObject({ enUso: true, sinPoblacion: true });
    expect(edad.valores.map((v) => v.orden)).toEqual([...edad.valores.map((v) => v.orden)].sort((a, b) => a - b));
    expect(edad.gruposPoblacionDisponibles).toBeUndefined();

    expect(clavesConGuionBajo(res.body)).toEqual([]);
  });

  it('activa=false solo trae las inactivas y activa=true las excluye', async () => {
    const inactivas = await consultar('/dimensiones?activa=false');
    expect(inactivas.status).toBe(200);
    expect(inactivas.body.every((d) => d.activa === false)).toBe(true);
    expect(inactivas.body.map((d) => d.codigo)).toContain('zvt_inactiva');

    const activas = await consultar('/dimensiones?activa=true');
    expect(activas.status).toBe(200);
    expect(activas.body.every((d) => d.activa === true)).toBe(true);
    expect(activas.body.map((d) => d.codigo)).not.toContain('zvt_inactiva');
  });

  it.each([
    ['?activa=abc', 'activa debe ser true o false.'],
    ['?tipo=CATEGORICA', 'Parámetro no permitido: tipo.'],
    ['?activa=true&activa=false', 'activa no se puede repetir.'],
  ])('%s responde 400', async (consulta, mensaje) => {
    const res = await consultar(`/dimensiones${consulta}`);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { codigo: 'ENTRADA_INVALIDA', mensaje } });
  });
});

describe('GET /dimensiones/{codigo}', () => {
  it('una dimensión RANGO_EDAD marca los valores sin población y trae los grupos disponibles', async () => {
    const res = await consultar('/dimensiones/zvt_edad');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ codigo: 'zvt_edad', tipo: 'RANGO_EDAD', enUso: true });
    expect(res.body.valores).toEqual([
      expect.objectContaining({ codigo: 'MENOR_1', enUso: true, sinPoblacion: false, edadMinMeses: 0, edadMaxMeses: 12 }),
      expect.objectContaining({ codigo: 'ZVT_SIN_POB', enUso: false, sinPoblacion: true }),
    ]);

    const [grupos] = await pool.query('SELECT codigo, descripcion FROM clasificacion_poblacion ORDER BY id');
    expect(res.body.gruposPoblacionDisponibles).toEqual(grupos.filter((g) => g.codigo !== 'MENOR_1'));
  });

  it('una dimensión CATEGORICA trae sus valores por orden, sin edades ni grupos disponibles', async () => {
    const res = await consultar('/dimensiones/zvt_uso');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      codigo: 'zvt_uso',
      descripcion: 'Dimensión de prueba que usa un esquema en borrador.',
      activa: true,
      enUso: true,
    });
    expect(res.body.valores).toEqual([
      { codigo: 'A', etiqueta: 'Valor A', orden: 1, activo: true, enUso: true },
      { codigo: 'B', etiqueta: 'Valor B', orden: 2, activo: true, enUso: false },
    ]);
    expect(res.body).not.toHaveProperty('gruposPoblacionDisponibles');
  });

  it('una dimensión que no usa ningún esquema vigente o en borrador no está en uso', async () => {
    const res = await consultar('/dimensiones/zvt_inactiva');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ activa: false, enUso: false });
  });

  it('un código inexistente responde 404', async () => {
    const res = await consultar('/dimensiones/zvt_no_existe');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { codigo: 'NO_ENCONTRADO', mensaje: 'El recurso solicitado no existe.' } });
  });
});

describe('permisos de la consulta', () => {
  it('sin token responde 401', async () => {
    const res = await request(app).get('/api/v1/dimensiones');
    expect(res.status).toBe(401);
  });

  it.each(['/dimensiones', '/dimensiones/sexo'])('Epidemiología recibe 403 en %s', async (ruta) => {
    const res = await consultar(ruta, tokenEpidemiologia);
    expect(res.status).toBe(403);
    expect(res.body.error.codigo).toBe('SIN_PERMISO');
  });

  it('el Revisor puede consultar', async () => {
    const res = await consultar('/dimensiones/sexo', tokenRevisor);
    expect(res.status).toBe(200);
  });
});

describe('POST /dimensiones', () => {
  const VIA = {
    codigo: 'zvt_via',
    nombre: 'ZVT Vía de aplicación',
    descripcion: '  Cómo se aplicó la dosis.  ',
    valores: [
      { codigo: 'im', etiqueta: 'Intramuscular' },
      { codigo: 'SC', etiqueta: '  Subcutánea ' },
    ],
  };

  it('crea una dimensión CATEGORICA activa, con orden por posición, enteros int y una fila CREAR', async () => {
    const res = await enviar('post', '/dimensiones', VIA);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      codigo: 'zvt_via',
      nombre: 'ZVT Vía de aplicación',
      descripcion: 'Cómo se aplicó la dosis.',
      tipo: 'CATEGORICA',
      activa: true,
      enUso: false,
    });
    expect(res.body.valores).toEqual([
      { codigo: 'IM', etiqueta: 'Intramuscular', orden: 1, activo: true, enUso: false },
      { codigo: 'SC', etiqueta: 'Subcutánea', orden: 2, activo: true, enUso: false },
    ]);

    const crudo = await documentoCrudo('zvt_via');
    expect(crudo._id.toString()).toBe(res.body.id);
    expect(crudo.valores.map((v) => v.orden._bsontype)).toEqual(['Int32', 'Int32']);
    expect(crudo.auditoria.creado_por._bsontype).toBe('Int32');
    expect(crudo.auditoria.creado_por.valueOf()).toBe(Number(jwt.decode(token).sub));

    const { id, enUso, valores, ...datos } = res.body;
    expect(await filasBitacora(id)).toEqual([
      {
        accion: 'CREAR',
        anteriores: null,
        nuevos: { ...datos, valores: valores.map(({ enUso: _enUso, ...v }) => v) },
      },
    ]);
  });

  it('un código que ya existe responde 409 DIMENSION_DUPLICADA', async () => {
    const res = await enviar('post', '/dimensiones', { ...VIA, nombre: 'Otra' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { codigo: 'DIMENSION_DUPLICADA', mensaje: 'Ya existe una dimensión con el código zvt_via.' },
    });
  });

  it('dos altas en paralelo con el mismo código: una 201 y otra 409, y queda un solo documento', async () => {
    const cuerpo = { codigo: 'zvt_doble', nombre: 'ZVT Doble', valores: [{ codigo: 'A', etiqueta: 'A' }] };
    const respuestas = await Promise.all([enviar('post', '/dimensiones', cuerpo), enviar('post', '/dimensiones', cuerpo)]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(respuestas.find((r) => r.status === 409).body.error.codigo).toBe('DIMENSION_DUPLICADA');
    const total = await (await obtenerDb()).collection('catalogo_dimensiones').countDocuments({ codigo: 'zvt_doble' });
    expect(total).toBe(1);
    expect(await filasBitacora(respuestas.find((r) => r.status === 201).body.id)).toHaveLength(1);
  });

  it.each([
    [
      'dos valores con el mismo código',
      { valores: [{ codigo: 'A', etiqueta: 'A' }, { codigo: 'a', etiqueta: 'B' }] },
      'El valor A está repetido.',
    ],
    ['valores vacío', { valores: [] }, 'Indique al menos un valor.'],
    ['sin valores', { valores: undefined }, 'Indique al menos un valor.'],
    ['un tipo', { tipo: 'RANGO_EDAD' }, 'Campo no permitido: tipo.'],
    ['un campo extra', { activa: false }, 'Campo no permitido: activa.'],
    ['un campo extra en un valor', { valores: [{ codigo: 'A', etiqueta: 'A', orden: 3 }] }, 'Campo no permitido: orden.'],
    ['un código inválido', { codigo: 'Zvt_mal' }, MENSAJE_CODIGO],
    ['una etiqueta vacía', { valores: [{ codigo: 'A', etiqueta: ' ' }] }, 'La etiqueta debe tener entre 1 y 60 caracteres.'],
  ])('con %s responde 400', async (_caso, cambios, mensaje) => {
    const cuerpo = { codigo: 'zvt_invalida', nombre: 'ZVT Inválida', valores: [{ codigo: 'A', etiqueta: 'A' }], ...cambios };
    const res = await enviar('post', '/dimensiones', cuerpo);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { codigo: 'ENTRADA_INVALIDA', mensaje } });
    expect(await documentoCrudo('zvt_invalida')).toBeNull();
  });

  it('si MongoDB falla, no queda la dimensión ni su fila de bitácora', async () => {
    const insertar = vi.spyOn(Collection.prototype, 'insertOne').mockRejectedValueOnce(new Error('Falla simulada'));
    const registro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const res = await enviar('post', '/dimensiones', {
        codigo: 'zvt_falla',
        nombre: 'ZVT Falla',
        valores: [{ codigo: 'A', etiqueta: 'A' }],
      });
      expect(res.status).toBe(500);
    } finally {
      insertar.mockRestore();
      registro.mockRestore();
    }
    expect(await documentoCrudo('zvt_falla')).toBeNull();
    const [[{ filas }]] = await pool.query(
      `SELECT COUNT(*) AS filas FROM bitacora
        WHERE entidad = 'catalogo_dimensiones' AND JSON_UNQUOTE(JSON_EXTRACT(valores_nuevos, '$.codigo')) = 'zvt_falla'`,
    );
    expect(filas).toBe(0);
  });
});

describe('PATCH /dimensiones/{codigo}', () => {
  it('cambia el nombre y deja una fila ACTUALIZAR solo con lo que cambió', async () => {
    const res = await enviar('patch', '/dimensiones/zvt_via', { nombre: 'ZVT Vía', descripcion: 'Cómo se aplicó la dosis.' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombre: 'ZVT Vía', descripcion: 'Cómo se aplicó la dosis.' });
    const filas = await filasBitacora(res.body.id);
    expect(filas.at(-1)).toEqual({
      accion: 'ACTUALIZAR',
      anteriores: { nombre: 'ZVT Vía de aplicación' },
      nuevos: { nombre: 'ZVT Vía' },
    });
  });

  it('una descripción vacía quita el campo del documento', async () => {
    const res = await enviar('patch', '/dimensiones/zvt_via', { descripcion: '' });

    expect(res.status).toBe(200);
    expect(res.body.descripcion).toBeNull();
    expect(await documentoCrudo('zvt_via')).not.toHaveProperty('descripcion');
    expect((await filasBitacora(res.body.id)).at(-1)).toEqual({
      accion: 'ACTUALIZAR',
      anteriores: { descripcion: 'Cómo se aplicó la dosis.' },
      nuevos: { descripcion: null },
    });
  });

  it('sin cambios responde 200 y no deja filas', async () => {
    const antes = await filasBitacora((await documentoCrudo('zvt_via'))._id.toString());
    const res = await enviar('patch', '/dimensiones/zvt_via', { nombre: 'ZVT Vía', descripcion: null });

    expect(res.status).toBe(200);
    expect(await filasBitacora(res.body.id)).toHaveLength(antes.length);
  });

  it('también edita una dimensión inactiva', async () => {
    const res = await enviar('patch', '/dimensiones/zvt_inactiva', { nombre: 'ZVT Inactiva editada' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ nombre: 'ZVT Inactiva editada', activa: false });
  });

  it.each([
    [{ codigo: 'zvt_otra' }, 'Campo no permitido: codigo.'],
    [{ tipo: 'RANGO_EDAD' }, 'Campo no permitido: tipo.'],
    [{}, 'Indique al menos un dato de la dimensión.'],
    [{ nombre: 'Z' }, 'El nombre debe tener entre 2 y 60 caracteres.'],
  ])('%j responde 400', async (cuerpo, mensaje) => {
    const res = await enviar('patch', '/dimensiones/zvt_via', cuerpo);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { codigo: 'ENTRADA_INVALIDA', mensaje } });
  });

  it('un código inexistente responde 404', async () => {
    const res = await enviar('patch', '/dimensiones/zvt_no_existe', { nombre: 'Nada' });
    expect(res.status).toBe(404);
  });
});

describe('desactivar y reactivar una dimensión', () => {
  it('desactiva, rechaza repetirlo, reactiva y deja DESACTIVAR y REACTIVAR', async () => {
    const desactivada = await enviar('post', '/dimensiones/zvt_via/desactivar');
    expect(desactivada.status).toBe(200);
    expect(desactivada.body.activa).toBe(false);
    expect(desactivada.body.valores.every((v) => v.activo)).toBe(true);

    const otraVez = await enviar('post', '/dimensiones/zvt_via/desactivar');
    expect(otraVez.status).toBe(409);
    expect(otraVez.body).toEqual({ error: { codigo: 'DIMENSION_YA_INACTIVA', mensaje: 'La dimensión ya está inactiva.' } });

    const reactivada = await enviar('post', '/dimensiones/zvt_via/reactivar');
    expect(reactivada.status).toBe(200);
    expect(reactivada.body.activa).toBe(true);

    const yaActiva = await enviar('post', '/dimensiones/zvt_via/reactivar');
    expect(yaActiva.status).toBe(409);
    expect(yaActiva.body).toEqual({ error: { codigo: 'DIMENSION_YA_ACTIVA', mensaje: 'La dimensión ya está activa.' } });

    const filas = (await filasBitacora(desactivada.body.id)).slice(-2);
    expect(filas).toEqual([
      { accion: 'DESACTIVAR', anteriores: { activa: true }, nuevos: { activa: false } },
      { accion: 'REACTIVAR', anteriores: { activa: false }, nuevos: { activa: true } },
    ]);
  });

  it('una dimensión que usa un esquema BORRADOR responde 409 DIMENSION_EN_USO', async () => {
    const res = await enviar('post', '/dimensiones/zvt_uso/desactivar');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: {
        codigo: 'DIMENSION_EN_USO',
        mensaje: 'La dimensión zvt_uso la usa un esquema de captura vigente o en borrador.',
      },
    });
    expect((await documentoCrudo('zvt_uso')).activo).toBe(true);
  });

  it('si el esquema que la usa pasa a HISTORICO, sí se puede desactivar', async () => {
    await cambiarEstadoEsquema('HISTORICO');
    try {
      const res = await enviar('post', '/dimensiones/zvt_uso/desactivar');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ activa: false, enUso: false });
    } finally {
      await enviar('post', '/dimensiones/zvt_uso/reactivar');
      await cambiarEstadoEsquema('BORRADOR');
    }
  });

  it('una dimensión de la semilla en uso tampoco se desactiva', async () => {
    const res = await enviar('post', '/dimensiones/sexo/desactivar');
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('DIMENSION_EN_USO');
  });

  it('un código inexistente responde 404', async () => {
    const res = await enviar('post', '/dimensiones/zvt_no_existe/reactivar');
    expect(res.status).toBe(404);
  });
});

describe('permisos de las escrituras de la dimensión', () => {
  it.each([
    ['post', '/dimensiones'],
    ['patch', '/dimensiones/zvt_via'],
    ['post', '/dimensiones/zvt_via/desactivar'],
    ['post', '/dimensiones/zvt_via/reactivar'],
  ])('Epidemiología recibe 403 en %s %s', async (metodo, ruta) => {
    const res = await enviar(metodo, ruta, {}, tokenEpidemiologia);
    expect(res.status).toBe(403);
  });
});

// Usan las dimensiones que dejan las pruebas anteriores: zvt_via (IM, SC), zvt_edad, zvt_uso y zvt_inactiva.
describe('POST /dimensiones/{codigo}/valores', () => {
  it('agrega un valor al final de una CATEGORICA y deja ACTUALIZAR con el valor nuevo', async () => {
    const res = await enviar('post', '/dimensiones/zvt_via/valores', { codigo: 'id', etiqueta: 'Intradérmica' });

    expect(res.status).toBe(201);
    expect(res.body.valores.map((v) => [v.codigo, v.orden])).toEqual([['IM', 1], ['SC', 2], ['ID', 3]]);
    expect(res.body.valores.at(-1)).toEqual({ codigo: 'ID', etiqueta: 'Intradérmica', orden: 3, activo: true, enUso: false });
    expect((await documentoCrudo('zvt_via')).valores.at(-1).orden._bsontype).toBe('Int32');
    expect((await filasBitacora(res.body.id)).at(-1)).toEqual({
      accion: 'ACTUALIZAR',
      anteriores: null,
      nuevos: { valor: { codigo: 'ID', etiqueta: 'Intradérmica', orden: 3, activo: true } },
    });
  });

  it.each(['ID', 'im'])('un código que la dimensión ya tiene (%s) responde 409 VALOR_DUPLICADO', async (codigo) => {
    const res = await enviar('post', '/dimensiones/zvt_via/valores', { codigo, etiqueta: 'Otra' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { codigo: 'VALOR_DUPLICADO', mensaje: `La dimensión ya tiene el valor ${codigo.toUpperCase()}.` },
    });
  });

  it('mandar edades a una CATEGORICA responde 400', async () => {
    const res = await enviar('post', '/dimensiones/zvt_via/valores', {
      codigo: 'OR',
      etiqueta: 'Oral',
      edadMinMeses: 0,
      edadMaxMeses: 12,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe('Campo no permitido: edadMinMeses.');
  });

  it('agrega a la RANGO_EDAD un grupo de la clasificación de población con su rango', async () => {
    const res = await enviar('post', '/dimensiones/zvt_edad/valores', {
      codigo: '4_ANIOS',
      etiqueta: '4 años',
      edadMinMeses: 48,
      edadMaxMeses: 60,
    });

    expect(res.status).toBe(201);
    expect(res.body.valores.at(-1)).toEqual({
      codigo: '4_ANIOS',
      etiqueta: '4 años',
      orden: 3,
      activo: true,
      edadMinMeses: 48,
      edadMaxMeses: 60,
      enUso: false,
      sinPoblacion: false,
    });
    expect(res.body.gruposPoblacionDisponibles.map((g) => g.codigo)).not.toContain('4_ANIOS');
    const crudo = (await documentoCrudo('zvt_edad')).valores.at(-1);
    expect([crudo.edad_min_meses._bsontype, crudo.edad_max_meses._bsontype]).toEqual(['Int32', 'Int32']);
  });

  it.each([
    ['un código fuera de la clasificación', { codigo: 'NO_EXISTE' }, 'El grupo NO_EXISTE no existe en la clasificación de población.'],
    ['el mínimo igual al máximo', { edadMinMeses: 60 }, 'La edad mínima debe ser menor que la máxima.'],
    ['el mínimo mayor que el máximo', { edadMinMeses: 72 }, 'La edad mínima debe ser menor que la máxima.'],
    ['sin edad mínima', { edadMinMeses: undefined }, MENSAJE_EDAD],
    ['sin edad máxima', { edadMaxMeses: undefined }, MENSAJE_EDAD],
    ['una edad en texto', { edadMinMeses: '24' }, MENSAJE_EDAD],
    ['una edad fuera de rango', { edadMaxMeses: 1201 }, MENSAJE_EDAD],
  ])('en la RANGO_EDAD, %s responde 400', async (_caso, cambios, mensaje) => {
    const cuerpo = { codigo: 'EMBARAZADAS', etiqueta: 'Embarazadas', edadMinMeses: 0, edadMaxMeses: 60, ...cambios };
    const res = await enviar('post', '/dimensiones/zvt_edad/valores', cuerpo);
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: { codigo: 'ENTRADA_INVALIDA', mensaje } });
  });

  it('también agrega un valor a una dimensión inactiva', async () => {
    const res = await enviar('post', '/dimensiones/zvt_inactiva/valores', { codigo: 'Y', etiqueta: 'Ye' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ activa: false });
    expect(res.body.valores.map((v) => v.codigo)).toEqual(['X', 'Y']);
  });

  it('dos altas en paralelo del mismo valor: una 201 y otra 409, y queda un solo valor', async () => {
    const cuerpo = { codigo: 'TR', etiqueta: 'Transdérmica' };
    const respuestas = await Promise.all([
      enviar('post', '/dimensiones/zvt_via/valores', cuerpo),
      enviar('post', '/dimensiones/zvt_via/valores', cuerpo),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    const crudo = await documentoCrudo('zvt_via');
    expect(crudo.valores.filter((v) => v.codigo === 'TR')).toHaveLength(1);
  });

  it('el Revisor puede agregar un valor', async () => {
    const res = await enviar('post', '/dimensiones/zvt_via/valores', { codigo: 'NA', etiqueta: 'Nasal' }, tokenRevisor);
    expect(res.status).toBe(201);
  });

  it('una dimensión inexistente responde 404', async () => {
    const res = await enviar('post', '/dimensiones/zvt_no_existe/valores', { codigo: 'A', etiqueta: 'A' });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /dimensiones/{codigo}/valores/{valor}', () => {
  it('cambia la etiqueta y deja ACTUALIZAR con la etiqueta antes y después', async () => {
    const res = await enviar('patch', '/dimensiones/zvt_via/valores/IM', { etiqueta: '  Inyección intramuscular ' });

    expect(res.status).toBe(200);
    expect(res.body.valores[0]).toMatchObject({ codigo: 'IM', etiqueta: 'Inyección intramuscular', orden: 1 });
    expect((await filasBitacora(res.body.id)).at(-1)).toEqual({
      accion: 'ACTUALIZAR',
      anteriores: { valor: 'IM', etiqueta: 'Intramuscular' },
      nuevos: { valor: 'IM', etiqueta: 'Inyección intramuscular' },
    });
  });

  it('una etiqueta igual responde 200 y no deja filas', async () => {
    const id = (await documentoCrudo('zvt_via'))._id.toString();
    const antes = (await filasBitacora(id)).length;
    const res = await enviar('patch', '/dimensiones/zvt_via/valores/IM', { etiqueta: 'Inyección intramuscular' });
    expect(res.status).toBe(200);
    expect(await filasBitacora(id)).toHaveLength(antes);
  });

  it.each([
    [{ etiqueta: 'Otra', orden: 4 }, 'Campo no permitido: orden.'],
    [{ codigo: 'IM2' }, 'Campo no permitido: codigo.'],
    [{}, 'La etiqueta debe tener entre 1 y 60 caracteres.'],
  ])('%j responde 400', async (cuerpo, mensaje) => {
    const res = await enviar('patch', '/dimensiones/zvt_via/valores/IM', cuerpo);
    expect(res.status).toBe(400);
    expect(res.body.error.mensaje).toBe(mensaje);
  });

  it('un valor inexistente responde 404', async () => {
    const res = await enviar('patch', '/dimensiones/zvt_via/valores/NO_EXISTE', { etiqueta: 'Nada' });
    expect(res.status).toBe(404);
  });
});

describe('PUT /dimensiones/{codigo}/valores/orden', () => {
  it('con la lista completa cambia los orden y deja ACTUALIZAR con el orden anterior y el nuevo', async () => {
    const antes = (await consultar('/dimensiones/zvt_via')).body.valores.map((v) => v.codigo);
    const nuevo = [...antes].reverse();
    const res = await enviar('put', '/dimensiones/zvt_via/valores/orden', { codigos: nuevo });

    expect(res.status).toBe(200);
    expect(res.body.valores.map((v) => [v.codigo, v.orden])).toEqual(nuevo.map((c, i) => [c, i + 1]));
    expect((await documentoCrudo('zvt_via')).valores.every((v) => v.orden._bsontype === 'Int32')).toBe(true);
    expect((await filasBitacora(res.body.id)).at(-1)).toEqual({
      accion: 'ACTUALIZAR',
      anteriores: { orden: antes },
      nuevos: { orden: nuevo },
    });
  });

  it('el mismo orden responde 200 y no deja filas', async () => {
    const actual = await consultar('/dimensiones/zvt_via');
    const filas = (await filasBitacora(actual.body.id)).length;
    const res = await enviar('put', '/dimensiones/zvt_via/valores/orden', { codigos: actual.body.valores.map((v) => v.codigo) });
    expect(res.status).toBe(200);
    expect(await filasBitacora(actual.body.id)).toHaveLength(filas);
  });

  it('la lista incluye también los valores inactivos', async () => {
    await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/desactivar');
    try {
      const sinInactivo = await enviar('put', '/dimensiones/zvt_inactiva/valores/orden', { codigos: ['X'] });
      expect(sinInactivo.status).toBe(400);
      const conInactivo = await enviar('put', '/dimensiones/zvt_inactiva/valores/orden', { codigos: ['Y', 'X'] });
      expect(conInactivo.status).toBe(200);
      expect(conInactivo.body.valores.map((v) => [v.codigo, v.orden, v.activo])).toEqual([['Y', 1, false], ['X', 2, true]]);
    } finally {
      await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/reactivar');
    }
  });

  it.each([
    ['incompleta', (codigos) => codigos.slice(1)],
    ['con un código repetido', (codigos) => [...codigos.slice(1), codigos[1]]],
    ['con un código que no es de la dimensión', (codigos) => [...codigos.slice(1), 'OTRO']],
    ['que no es una lista', () => 'IM,SC'],
  ])('una lista %s responde 400', async (_caso, armar) => {
    const actual = (await consultar('/dimensiones/zvt_via')).body.valores.map((v) => v.codigo);
    const res = await enviar('put', '/dimensiones/zvt_via/valores/orden', { codigos: armar(actual) });
    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      error: { codigo: 'ENTRADA_INVALIDA', mensaje: 'La lista debe traer cada valor de la dimensión una sola vez.' },
    });
  });
});

describe('desactivar y reactivar un valor', () => {
  it('desactiva, rechaza repetirlo, reactiva y deja DESACTIVAR y REACTIVAR', async () => {
    const desactivado = await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/desactivar');
    expect(desactivado.status).toBe(200);
    expect(desactivado.body.valores.find((v) => v.codigo === 'Y').activo).toBe(false);

    const otraVez = await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/desactivar');
    expect(otraVez.status).toBe(409);
    expect(otraVez.body).toEqual({ error: { codigo: 'VALOR_YA_INACTIVO', mensaje: 'El valor ya está inactivo.' } });

    const reactivado = await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/reactivar');
    expect(reactivado.status).toBe(200);
    expect(reactivado.body.valores.find((v) => v.codigo === 'Y').activo).toBe(true);

    const yaActivo = await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/reactivar');
    expect(yaActivo.status).toBe(409);
    expect(yaActivo.body).toEqual({ error: { codigo: 'VALOR_YA_ACTIVO', mensaje: 'El valor ya está activo.' } });

    expect((await filasBitacora(desactivado.body.id)).slice(-2)).toEqual([
      { accion: 'DESACTIVAR', anteriores: { valor: 'Y', activo: true }, nuevos: { valor: 'Y', activo: false } },
      { accion: 'REACTIVAR', anteriores: { valor: 'Y', activo: false }, nuevos: { valor: 'Y', activo: true } },
    ]);
  });

  it('un valor que usa un esquema BORRADOR responde 409 VALOR_EN_USO', async () => {
    const res = await enviar('post', '/dimensiones/zvt_edad/valores/MENOR_1/desactivar');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { codigo: 'VALOR_EN_USO', mensaje: 'El valor MENOR_1 lo usa un esquema de captura vigente o en borrador.' },
    });
  });

  it('un grupo de la semilla que usa una sección vigente tampoco se desactiva', async () => {
    const res = await enviar('post', '/dimensiones/grupo_edad/valores/4_ANIOS/desactivar');
    expect(res.status).toBe(409);
    expect(res.body.error.codigo).toBe('VALOR_EN_USO');
  });

  it('el último valor activo responde 409 ULTIMO_VALOR_ACTIVO', async () => {
    expect((await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/desactivar')).status).toBe(200);
    const res = await enviar('post', '/dimensiones/zvt_inactiva/valores/X/desactivar');
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: { codigo: 'ULTIMO_VALOR_ACTIVO', mensaje: 'La dimensión debe conservar al menos un valor activo.' },
    });
  });

  it('dos desactivaciones a la vez no dejan la dimensión sin valores activos', async () => {
    await enviar('post', '/dimensiones/zvt_inactiva/valores/Y/reactivar');
    const respuestas = await Promise.all([
      enviar('post', '/dimensiones/zvt_inactiva/valores/X/desactivar'),
      enviar('post', '/dimensiones/zvt_inactiva/valores/Y/desactivar'),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(respuestas.find((r) => r.status === 409).body.error.codigo).toBe('ULTIMO_VALOR_ACTIVO');
    expect((await documentoCrudo('zvt_inactiva')).valores.filter((v) => v.activo)).toHaveLength(1);
  });

  it('un valor inexistente responde 404', async () => {
    const res = await enviar('post', '/dimensiones/zvt_via/valores/NO_EXISTE/reactivar');
    expect(res.status).toBe(404);
  });
});

describe('permisos de las escrituras de los valores', () => {
  it.each([
    ['post', '/dimensiones/zvt_via/valores'],
    ['patch', '/dimensiones/zvt_via/valores/IM'],
    ['put', '/dimensiones/zvt_via/valores/orden'],
    ['post', '/dimensiones/zvt_via/valores/IM/desactivar'],
    ['post', '/dimensiones/zvt_via/valores/IM/reactivar'],
  ])('Epidemiología recibe 403 en %s %s', async (metodo, ruta) => {
    const res = await enviar(metodo, ruta, {}, tokenEpidemiologia);
    expect(res.status).toBe(403);
  });
});
