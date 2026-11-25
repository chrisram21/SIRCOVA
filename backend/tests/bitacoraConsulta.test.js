import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { exportarBitacora } from '../src/modulos/auditoria/bitacora.service.js';
import { COLUMNAS } from '../src/modulos/auditoria/bitacoraExcel.service.js';
import { diaEnGuatemala } from '../src/modulos/auditoria/textosBitacora.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// La bitácora no se puede borrar (triggers del 06): las DDRISS ZVT_HU54A y ZVT_HU54B y sus cuentas vitest-hu54-*
// son permanentes (se crean si faltan y nunca inician sesión), y cada corrida agrega sus filas con fecha en 2099
// y un entidad_id propio (MARCA), por el que filtran casi todos los casos.
const MARCA = `hu54-${Date.now()}`;
const CUENTAS = {
  admin: { nombre: 'vitest-hu54-admin', rol: 'ADMINISTRADOR', ddriss: 'ZVT_HU54A' },
  revisor: { nombre: 'vitest-hu54-revisor', rol: 'REVISOR', ddriss: 'ZVT_HU54A' },
  inactivo: { nombre: 'vitest-hu54-inactivo', rol: 'REVISOR', ddriss: 'ZVT_HU54A', activo: false },
  adminB: { nombre: 'vitest-hu54-admin-b', rol: 'ADMINISTRADOR', ddriss: 'ZVT_HU54B' },
};
const ddriss = {};
const cuentas = {};
const ids = {};
const tokens = {};

async function asegurarDdriss(codigo) {
  const [[existente]] = await pool.query('SELECT id FROM ddriss WHERE codigo = ?', [codigo]);
  if (existente) return existente.id;
  const [creada] = await pool.query(
    `INSERT INTO ddriss (codigo, nombre, departamento_id, activo)
     SELECT ?, 'vitest-hu54 (permanente)', departamento_id, TRUE FROM ddriss WHERE id = 1`,
    [codigo],
  );
  return creada.insertId;
}

async function asegurarCuenta({ nombre, rol, ddriss: codigo, activo = true }) {
  const correo = `${nombre}@prueba.local`;
  let [[empleado]] = await pool.query('SELECT id FROM empleado WHERE correo = ?', [correo]);
  if (!empleado) {
    const [creado] = await pool.query(
      `INSERT INTO empleado (nombres, apellidos, correo, ddriss_id) VALUES ('Prueba', ?, ?, ?)`,
      [nombre.replace('vitest-', '').toUpperCase(), correo, ddriss[codigo]],
    );
    empleado = { id: creado.insertId };
  }
  let [[usuario]] = await pool.query('SELECT id FROM usuario WHERE nombre_usuario = ?', [nombre]);
  if (!usuario) {
    // Un hash inválido a propósito: estas cuentas nunca inician sesión.
    const [creado] = await pool.query(
      `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id)
       SELECT ?, ?, '!', id FROM rol WHERE codigo = ?`,
      [empleado.id, nombre, rol],
    );
    usuario = { id: creado.insertId };
  }
  await pool.query('UPDATE empleado SET activo = TRUE, ddriss_id = ? WHERE id = ?', [ddriss[codigo], empleado.id]);
  await pool.query(
    `UPDATE usuario SET activo = ?, debe_cambiar_contrasena = FALSE, intentos_fallidos = 0, bloqueado_hasta = NULL,
            rol_id = (SELECT id FROM rol WHERE codigo = ?)
      WHERE id = ?`,
    [activo, rol, usuario.id],
  );
  return usuario.id;
}

const tokenDeAdmin = (clave) =>
  tokenDePrueba(cuentas[clave], {
    rol: 'ADMINISTRADOR',
    permisos: ['BITACORA_CONSULTAR'],
    ddrissId: ddriss[CUENTAS[clave].ddriss],
    establecimientoId: null,
    municipioId: null,
  });

// Una cuenta real de la semilla con ese rol, con sus permisos de la base.
async function tokenDeRol(rol) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u JOIN empleado e ON e.id = u.empleado_id JOIN rol r ON r.id = u.rol_id
      WHERE r.codigo = ? AND u.activo AND e.activo AND u.nombre_usuario NOT LIKE 'vitest-%'
      ORDER BY u.id LIMIT 1`,
    [rol],
  );
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  return tokenDePrueba(cuenta.id, {
    rol,
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  });
}

// [clave, fecha UTC, usuario, intento, módulo, acción, entidad, anteriores, nuevos]. Guatemala es UTC-6.
const FILAS = [
  ['crear', '2099-03-10 18:00:00.000', 'admin', null, 'USUARIOS', 'CREAR', 'usuario', null, { rol: 'REVISOR' }],
  // 23:59:59.999 y 00:00 de Guatemala: los extremos de los días 10 y 11.
  ['estado', '2099-03-11 05:59:59.999', 'revisor', null, 'REVISION', 'CAMBIO_ESTADO', 'reporte_produccion',
    { estado: 'EN_REVISION' }, { estado: 'APROBADO' }],
  ['rectificacion', '2099-03-11 06:00:00.000', 'revisor', null, 'RECTIFICACION', 'APLICAR_RECTIFICACION',
    'solicitud_rectificacion', null, null],
  ['intento', '2099-03-12 15:00:00.000', null, 'vitest-hu54-revisor', 'USUARIOS', 'LOGIN_FALLIDO', 'usuario',
    null, null],
  ['otraDdriss', '2099-03-12 16:00:00.000', 'adminB', null, 'REVISION', 'CAMBIO_ESTADO', 'reporte_produccion',
    null, null],
  ['automatica', '2099-03-12 17:00:00.000', null, null, 'INDICADORES', 'CALCULAR_INDICADORES', 'corrida_calculo',
    null, null],
  ['intentoSinCuenta', '2099-03-12 18:00:00.000', null, 'vitest-hu54-nadie', 'USUARIOS', 'LOGIN_FALLIDO', 'usuario',
    null, null],
  ['vacuna', '2099-03-13 15:00:00.000', 'revisor', null, 'CONFIGURACION', 'ACTUALIZAR', 'vacuna',
    { activo: true }, { activo: false }],
  ['denegado', '2099-03-13 16:00:00.000', 'admin', null, 'SISTEMA', 'ACCESO_DENEGADO', 'permiso', null, null],
];

async function consultar(clave, parametros = {}) {
  return request(app)
    .get('/api/v1/auditoria/bitacora')
    .query(parametros)
    .set('Authorization', `Bearer ${tokens[clave]}`);
}

const claves = (respuesta) => respuesta.body.elementos.map((e) => Object.keys(ids).find((k) => ids[k] === e.id));

beforeAll(async () => {
  ddriss.ZVT_HU54A = await asegurarDdriss('ZVT_HU54A');
  ddriss.ZVT_HU54B = await asegurarDdriss('ZVT_HU54B');
  for (const [clave, cuenta] of Object.entries(CUENTAS)) cuentas[clave] = await asegurarCuenta(cuenta);
  for (const [clave, fecha, autor, intento, modulo, accion, entidad, anteriores, nuevos] of FILAS) {
    const [creada] = await pool.query(
      `INSERT INTO bitacora (fecha, usuario_id, nombre_usuario_intento, modulo, accion, entidad, entidad_id,
                             valores_anteriores, valores_nuevos, ip_origen, agente_usuario)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '10.0.0.54', 'vitest-hu54')`,
      [fecha, autor && cuentas[autor], intento, modulo, accion, entidad, MARCA,
        anteriores && JSON.stringify(anteriores), nuevos && JSON.stringify(nuevos)],
    );
    ids[clave] = creada.insertId;
  }
  tokens.admin = await tokenDeAdmin('admin');
  tokens.adminB = await tokenDeAdmin('adminB');
}, 120000);

describe('GET /auditoria/bitacora: alcance', () => {
  it('ve las filas de las cuentas de su DDRISS y los intentos contra ellas, de la más reciente primero', async () => {
    const respuesta = await consultar('admin', { entidadId: MARCA });

    expect(respuesta.status).toBe(200);
    expect(claves(respuesta)).toEqual(['denegado', 'vacuna', 'intento', 'rectificacion', 'estado', 'crear']);
    expect(respuesta.body).toMatchObject({
      total: 6,
      pagina: 1,
      porPagina: 20,
      resumen: { usuarios: 2, rectificaciones: 1, accesosFallidos: 2 },
    });
  });

  it('devuelve cada fila con su autor, su rol y sus valores', async () => {
    const { body } = await consultar('admin', { entidadId: MARCA });
    const estado = body.elementos.find((e) => e.id === ids.estado);
    const intento = body.elementos.find((e) => e.id === ids.intento);

    expect(estado).toEqual({
      id: ids.estado,
      fecha: '2099-03-11T05:59:59.999Z',
      usuario: {
        id: cuentas.revisor,
        nombreUsuario: 'vitest-hu54-revisor',
        nombre: 'Prueba HU54-REVISOR',
        rol: { codigo: 'REVISOR', nombre: expect.any(String) },
      },
      nombreUsuarioIntento: null,
      modulo: 'REVISION',
      accion: 'CAMBIO_ESTADO',
      entidad: 'reporte_produccion',
      entidadId: MARCA,
      valoresAnteriores: { estado: 'EN_REVISION' },
      valoresNuevos: { estado: 'APROBADO' },
      ipOrigen: '10.0.0.54',
      agenteUsuario: 'vitest-hu54',
    });
    expect(intento).toMatchObject({
      usuario: null,
      nombreUsuarioIntento: 'vitest-hu54-revisor',
      accion: 'LOGIN_FALLIDO',
    });
  });

  it('otra DDRISS solo ve lo suyo; las automáticas y los intentos sin cuenta no los ve nadie', async () => {
    const respuesta = await consultar('adminB', { entidadId: MARCA });

    expect(claves(respuesta)).toEqual(['otraDdriss']);
    expect(respuesta.body.resumen).toEqual({ usuarios: 1, rectificaciones: 0, accesosFallidos: 0 });
  });

  it('sin filtros, todas las filas son de cuentas de su DDRISS o intentos contra ellas', async () => {
    const { body } = await consultar('admin', { porPagina: '100' });
    const nombres = Object.values(CUENTAS).filter((c) => c.ddriss === 'ZVT_HU54A').map((c) => c.nombre);

    expect(body.total).toBeGreaterThanOrEqual(6);
    for (const registro of body.elementos) {
      expect(nombres).toContain(registro.usuario?.nombreUsuario ?? registro.nombreUsuarioIntento);
    }
  });
});

describe('GET /auditoria/bitacora: filtros', () => {
  it.each([
    ['usuarioId trae también los intentos contra esa cuenta', () => ({ usuarioId: cuentas.revisor }),
      ['vacuna', 'intento', 'rectificacion', 'estado']],
    ['usuarioId de otra DDRISS da la lista vacía', () => ({ usuarioId: cuentas.adminB }), []],
    ['modulo', () => ({ modulo: 'REVISION' }), ['estado']],
    ['accion', () => ({ accion: 'LOGIN_FALLIDO' }), ['intento']],
    ['varias entidades', () => ({ entidad: 'vacuna,permiso' }), ['denegado', 'vacuna']],
    ['usuario y módulo combinados', () => ({ usuarioId: cuentas.revisor, modulo: 'USUARIOS' }), ['intento']],
    ['un día de Guatemala incluye las 23:59:59.999', () => ({ desde: '2099-03-10', hasta: '2099-03-10' }),
      ['estado', 'crear']],
    ['el día siguiente empieza a las 00:00', () => ({ desde: '2099-03-11', hasta: '2099-03-11' }), ['rectificacion']],
    ['solo desde', () => ({ desde: '2099-03-13' }), ['denegado', 'vacuna']],
    ['solo hasta', () => ({ hasta: '2099-03-10' }), ['estado', 'crear']],
  ])('%s', async (_nombre, parametros, esperadas) => {
    const respuesta = await consultar('admin', { entidadId: MARCA, ...parametros() });

    expect(respuesta.status).toBe(200);
    expect(claves(respuesta)).toEqual(esperadas);
    expect(respuesta.body.total).toBe(esperadas.length);
  });

  it('el resumen cuenta sobre las filas filtradas', async () => {
    const { body } = await consultar('admin', { entidadId: MARCA, desde: '2099-03-12' });

    expect(body.resumen).toEqual({ usuarios: 2, rectificaciones: 0, accesosFallidos: 2 });
  });

  it('pagina y porPagina; una página fuera de rango viene vacía con el total real', async () => {
    const segunda = await consultar('admin', { entidadId: MARCA, porPagina: '2', pagina: '2' });
    const fuera = await consultar('admin', { entidadId: MARCA, porPagina: '2', pagina: '9' });

    expect(claves(segunda)).toEqual(['intento', 'rectificacion']);
    expect(segunda.body).toMatchObject({ total: 6, pagina: 2, porPagina: 2 });
    expect(fuera.body).toMatchObject({ elementos: [], total: 6, pagina: 9 });
    expect(fuera.body.resumen.usuarios).toBe(2);
  });
});

describe('GET /auditoria/bitacora/opciones', () => {
  const opciones = (clave, consulta = '') =>
    request(app).get(`/api/v1/auditoria/bitacora/opciones${consulta}`).set('Authorization', `Bearer ${tokens[clave]}`);

  it('da las cuentas de su DDRISS, activas e inactivas, por nombre, y los módulos', async () => {
    const respuesta = await opciones('admin');

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.usuarios).toEqual([
      { id: cuentas.admin, nombreUsuario: 'vitest-hu54-admin', nombre: 'Prueba HU54-ADMIN',
        rol: { codigo: 'ADMINISTRADOR', nombre: expect.any(String) }, activo: true },
      { id: cuentas.inactivo, nombreUsuario: 'vitest-hu54-inactivo', nombre: 'Prueba HU54-INACTIVO',
        rol: { codigo: 'REVISOR', nombre: expect.any(String) }, activo: false },
      { id: cuentas.revisor, nombreUsuario: 'vitest-hu54-revisor', nombre: 'Prueba HU54-REVISOR',
        rol: { codigo: 'REVISOR', nombre: expect.any(String) }, activo: true },
    ]);
    expect(respuesta.body.modulos).toEqual([
      'USUARIOS', 'CONFIGURACION', 'PRODUCCION', 'REVISION', 'RECTIFICACION', 'INDICADORES', 'REPORTES', 'SISTEMA',
    ]);
  });

  it('da las acciones y entidades de las filas de su alcance, en orden alfabético', async () => {
    const { body } = await opciones('admin');

    // Las exportaciones de esta prueba (EXPORTAR de bitacora) también son suyas: se comprueba que estén estas.
    expect(body.acciones).toEqual(expect.arrayContaining([
      'ACCESO_DENEGADO', 'ACTUALIZAR', 'APLICAR_RECTIFICACION', 'CAMBIO_ESTADO', 'CREAR', 'LOGIN_FALLIDO',
    ]));
    expect(body.entidades).toEqual(expect.arrayContaining([
      'permiso', 'reporte_produccion', 'solicitud_rectificacion', 'usuario', 'vacuna',
    ]));
    expect(body.acciones).toEqual([...body.acciones].sort());
    expect(body.entidades).toEqual([...body.entidades].sort());
    // Solo de la fila automática.
    expect(body.acciones).not.toContain('CALCULAR_INDICADORES');
    expect(body.entidades).not.toContain('corrida_calculo');
  });

  it('otra DDRISS solo ve sus cuentas y los valores de sus filas', async () => {
    const { body } = await opciones('adminB');

    expect(body.usuarios.map((u) => u.nombreUsuario)).toEqual(['vitest-hu54-admin-b']);
    expect(body.acciones).toEqual(['CAMBIO_ESTADO']);
    expect(body.entidades).toEqual(['reporte_produccion']);
  });

  it('400 con cualquier parámetro', async () => {
    const respuesta = await opciones('admin', '?modulo=USUARIOS');

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('403 sin BITACORA_CONSULTAR y 401 sin sesión', async () => {
    const token = await tokenDeRol('REVISOR');

    expect(
      (await request(app).get('/api/v1/auditoria/bitacora/opciones').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);
    expect((await request(app).get('/api/v1/auditoria/bitacora/opciones')).status).toBe(401);
  });
});

describe('GET /auditoria/bitacora/excel', () => {
  const binario = (res, listo) => {
    const partes = [];
    res.on('data', (parte) => partes.push(parte));
    res.on('end', () => listo(null, Buffer.concat(partes)));
  };
  const excel = (parametros, token = tokens.admin) =>
    request(app)
      .get('/api/v1/auditoria/bitacora/excel')
      .query(parametros)
      .set('Authorization', `Bearer ${token}`)
      .buffer(true)
      .parse(binario);

  async function hojaDe(respuesta) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(respuesta.body);
    return libro.getWorksheet('Bitácora');
  }

  // Una celda vacía se lee como null o undefined: se compara como ''.
  const valores = (fila, columnas = COLUMNAS.length) =>
    Array.from({ length: columnas }, (_, i) => fila.getCell(i + 1).value ?? '');

  // El libro tiene dos hojas (plantillaExcel.js): «Información» y «Bitácora», con los títulos en la fila 1.
  const info = (hoja) => hoja.workbook.getWorksheet('Información');
  // La última celda con texto de una fila de «Información»: la DDRISS (fila 3) y las fechas (fila 6).
  const ultimoTexto = (hoja, n) => {
    let texto = null;
    info(hoja).getRow(n).eachCell((celda) => { if (celda.text) texto = celda.text; });
    return texto;
  };

  // El encabezado como { etiqueta: valor }: la DDRISS y las fechas de arriba y el recuadro de filtros, que empieza en
  // la fila 9 de «Información» y llega hasta la fila vacía; y los títulos y las filas de datos de «Bitácora».
  function partesDe(hoja) {
    const encabezado = { DDRISS: ultimoTexto(hoja, 3), Fechas: ultimoTexto(hoja, 6) };
    for (let numero = 9; info(hoja).getRow(numero).cellCount > 0; numero += 1) {
      const [etiqueta, valor] = valores(info(hoja).getRow(numero), 2);
      encabezado[etiqueta] = valor;
    }
    const titulos = valores(hoja.getRow(1));
    const datos = [];
    for (let n = 2; n <= hoja.rowCount; n += 1) datos.push(valores(hoja.getRow(n)));
    return { encabezado, titulos, datos };
  }

  const exportaciones = async () => {
    const [[{ n }]] = await pool.query(
      `SELECT COUNT(*) AS n FROM bitacora
        WHERE usuario_id = ? AND accion = 'EXPORTAR' AND entidad = 'bitacora'
          AND JSON_UNQUOTE(JSON_EXTRACT(valores_nuevos, '$.filtros.entidadId')) = ?`,
      [cuentas.admin, MARCA],
    );
    return Number(n);
  };

  it('descarga las mismas filas que la lista, con el encabezado y las etiquetas en español', async () => {
    const antes = await exportaciones();
    const respuesta = await excel({ entidadId: MARCA });
    const lista = await consultar('admin', { entidadId: MARCA });

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['content-type']).toContain('spreadsheetml');
    expect(respuesta.headers['content-disposition'])
      .toBe(`attachment; filename="bitacora-${diaEnGuatemala(new Date())}.xlsx"`);

    const hoja = await hojaDe(respuesta);
    const { encabezado, titulos, datos } = partesDe(hoja);
    expect(hoja.name).toBe('Bitácora');
    expect(hoja.workbook.worksheets.map((h) => h.name)).toEqual(['Información', 'Bitácora']);
    expect(info(hoja).getCell('A1').value).toBe('SIRCOVA');
    expect(info(hoja).getCell('A6').value).toBe('Bitácora del sistema');
    expect(hoja.autoFilter).toBeTruthy();
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(encabezado).toMatchObject({
      DDRISS: 'vitest-hu54 (permanente)',
      Fechas: 'Todo el historial',
      Elemento: `#${MARCA}`,
      Registros: 6,
      Generado: expect.stringMatching(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2} por Prueba HU54-ADMIN$/),
    });
    expect(titulos).toEqual(COLUMNAS.map((c) => c.titulo));
    expect(datos).toEqual(lista.body.elementos.map((r) => COLUMNAS.map((c) => c.valor(r))));

    const estado = datos[lista.body.elementos.findIndex((r) => r.id === ids.estado)];
    expect(estado.slice(0, 9)).toEqual([
      '10/03/2099 23:59:59', 'Prueba HU54-REVISOR', expect.any(String), 'Revisión', 'Cambio de estado',
      'reporte_produccion', MARCA, '{"estado":"EN_REVISION"}', '{"estado":"APROBADO"}',
    ]);
    const intento = datos[lista.body.elementos.findIndex((r) => r.id === ids.intento)];
    expect(intento.slice(1, 5)).toEqual(['Intento: vitest-hu54-revisor', '', 'Usuarios', 'Inicio de sesión fallido']);

    expect(await exportaciones()).toBe(antes + 1);
  });

  it('deja su fila EXPORTAR del módulo SISTEMA con los filtros, el formato y las filas', async () => {
    await excel({ entidadId: MARCA, modulo: 'USUARIOS' });
    const [[fila]] = await pool.query(
      `SELECT modulo, entidad_id, valores_nuevos FROM bitacora
        WHERE usuario_id = ? AND accion = 'EXPORTAR' AND entidad = 'bitacora'
          AND JSON_UNQUOTE(JSON_EXTRACT(valores_nuevos, '$.filtros.entidadId')) = ?
        ORDER BY id DESC LIMIT 1`,
      [cuentas.admin, MARCA],
    );

    expect(fila).toEqual({
      modulo: 'SISTEMA',
      entidad_id: null,
      valores_nuevos: { formato: 'xlsx', filas: 2, filtros: { modulo: 'USUARIOS', entidadId: MARCA } },
    });
  });

  it('el encabezado muestra los filtros aplicados con sus etiquetas', async () => {
    const respuesta = await excel({
      entidadId: MARCA, entidad: 'usuario', usuarioId: cuentas.revisor, modulo: 'USUARIOS', accion: 'LOGIN_FALLIDO',
      desde: '2099-03-12', hasta: '2099-03-12',
    });
    const { encabezado, datos } = partesDe(await hojaDe(respuesta));

    expect(encabezado).toMatchObject({
      Fechas: 'Del 12/03/2099 al 12/03/2099',
      Usuario: 'Prueba HU54-REVISOR',
      Módulo: 'Usuarios',
      Acción: 'Inicio de sesión fallido',
      Elemento: `usuario #${MARCA}`,
      Registros: 1,
    });
    expect(datos).toHaveLength(1);
  });

  it('con más filas que el tope responde 422 sin armar el archivo ni dejar la fila EXPORTAR', async () => {
    const antes = await exportaciones();
    const usuario = { id: cuentas.admin, rol: 'ADMINISTRADOR', ddrissId: ddriss.ZVT_HU54A };
    const contexto = { usuarioId: cuentas.admin, ipOrigen: '127.0.0.1', agenteUsuario: 'vitest-hu54' };

    await expect(exportarBitacora(usuario, { entidadId: MARCA }, contexto, { tope: 5 })).rejects.toMatchObject({
      status: 422,
      codigo: 'DEMASIADAS_FILAS',
      message: 'El resultado tiene 6 registros; acote los filtros para exportar 5 o menos.',
    });
    expect(await exportaciones()).toBe(antes);
  });

  it('400 con pagina o porPagina, 403 sin BITACORA_CONSULTAR', async () => {
    expect((await excel({ pagina: '1' })).status).toBe(400);
    expect((await excel({ porPagina: '10' })).status).toBe(400);
    expect((await excel({}, await tokenDeRol('REVISOR'))).status).toBe(403);
  });
});

describe('GET /auditoria/bitacora: errores', () => {
  it.each([
    ['una fecha que no existe', 'desde=2099-02-30'],
    ['una fecha con otro formato', 'hasta=10/03/2099'],
    ['desde posterior a hasta', 'desde=2099-03-12&hasta=2099-03-11'],
    ['un módulo fuera de la lista', 'modulo=AUDITORIA'],
    ['una acción en minúsculas', 'accion=crear'],
    ['una entidad con mayúsculas', 'entidad=Vacuna'],
    ['un entidadId de más de 40 caracteres', `entidadId=${'x'.repeat(41)}`],
    ['un usuarioId que no es entero', 'usuarioId=abc'],
    ['porPagina mayor a 100', 'porPagina=101'],
    ['un parámetro desconocido', 'estado=ACTIVA'],
    ['un parámetro repetido', 'modulo=USUARIOS&modulo=SISTEMA'],
  ])('400 con %s', async (_nombre, consulta) => {
    const respuesta = await request(app)
      .get(`/api/v1/auditoria/bitacora?${consulta}`)
      .set('Authorization', `Bearer ${tokens.admin}`);

    expect(respuesta.status).toBe(400);
    expect(respuesta.body.error.codigo).toBe('ENTRADA_INVALIDA');
  });

  it('el mensaje de desde posterior a hasta es el del contrato', async () => {
    const respuesta = await consultar('admin', { desde: '2099-03-12', hasta: '2099-03-11' });

    expect(respuesta.body.error.mensaje).toBe('La fecha desde no puede ser posterior a la fecha hasta.');
  });

  it.each(['REVISOR', 'AUTORIDAD'])('403 para %s, que no tiene BITACORA_CONSULTAR', async (rol) => {
    const token = await tokenDeRol(rol);
    const respuesta = await request(app).get('/api/v1/auditoria/bitacora').set('Authorization', `Bearer ${token}`);

    expect(respuesta.status).toBe(403);
  });

  it('401 sin sesión', async () => {
    expect((await request(app).get('/api/v1/auditoria/bitacora')).status).toBe(401);
  });
});
