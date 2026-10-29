import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import entorno from '../src/config/entorno.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';

// Las pruebas crean por SQL las vacunas ZVT_HU21 (MUNICIPIO_DETALLADO con el 9999), ZVT_HU21N (MUNICIPIO_DETALLADO
// sin el 9999) y ZVT_HU21P (PROPIO_Y_OTROS), y sus esquemas nacionales en MongoDB desde enero de 2024. También
// crean los meses de 2024 en periodo, abiertos en la DDRISS 1, y los reportes de ese año, que crea cs1201 (CS-1201)
// con su token firmado sin iniciar sesión. Todo se borra al inicio y al final; las filas de la bitácora quedan.
const DETALLADO = 'ZVT_HU21';
const SIN_MIGRANTES = 'ZVT_HU21N';
const COMO_5C = 'ZVT_HU21P';
const VACUNAS = [DETALLADO, SIN_MIGRANTES, COMO_5C];
const ANIO = 2024;
const MESES = [1, 2];

const vacunaIds = {};
const dosisIds = {};
const periodoIds = {};
const esquemaIds = Object.fromEntries(VACUNAS.map((codigo) => [codigo, new ObjectId()]));
const municipios = {};

const base = (codigo) => ({
  _id: esquemaIds[codigo],
  vacuna: { id: new Int32(vacunaIds[codigo]), codigo, nombre: `vitest-hu21 ${codigo}` },
  version: new Int32(1),
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date('2024-01-01T00:00:00.000Z'), hasta: null },
  version_anterior_id: null,
  basado_en: null,
  campos_adicionales: [],
  reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: new Int32(1) }],
  presentacion: { filas: 'dosis', columnas: ['seccion'] },
  auditoria: {
    creado_por: new Int32(1),
    creado_en: new Date(),
    publicado_por: new Int32(1),
    publicado_en: new Date(),
    motivo_cambio: 'vitest-hu21',
  },
});

const esquemaDetallado = () => ({
  ...base(DETALLADO),
  dimensiones: {
    dosis: [
      { codigo: 'D1', etiqueta: 'Primera dosis' },
      { codigo: 'D2', etiqueta: 'Segunda dosis' },
    ],
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: true },
    desagregacion: [
      { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
      { dimension: 'sexo', valores: ['M', 'F'] },
    ],
  },
  secciones: [
    { codigo: 'MENOR_1', titulo: '< 1 año', orden: new Int32(1), grupo_edad: 'MENOR_1', dosis: ['D1', 'D2'] },
    { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: new Int32(2), grupo_edad: '1_A_5', dosis: ['D1', 'D2'] },
  ],
});

// Una sola sección sin grupo de edad: la clave de sus celdas es ''.
const esquemaSimple = (codigo, procedencia) => ({
  ...base(codigo),
  dimensiones: { dosis: [{ codigo: 'D1', etiqueta: 'Primera dosis' }], procedencia, desagregacion: [] },
  secciones: [{ codigo: 'UNICA', titulo: 'Dosis', orden: new Int32(1), grupo_edad: null, dosis: ['D1'] }],
});

const dosDigitos = (n) => String(n).padStart(2, '0');

async function limpiar() {
  const reportes = `SELECT r.id FROM reporte_produccion r JOIN periodo p ON p.id = r.periodo_id WHERE p.anio = ${ANIO}`;
  await pool.query(`DELETE FROM historial_estado_reporte WHERE reporte_id IN (SELECT id FROM (${reportes}) t)`);
  // reporte_vacuna, detalle_produccion y detalle_dimension caen por ON DELETE CASCADE.
  await pool.query(`DELETE FROM reporte_produccion WHERE id IN (SELECT id FROM (${reportes}) t)`);
  await pool.query('DELETE cp FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id WHERE p.anio = ?', [ANIO]);
  await pool.query('DELETE FROM periodo WHERE anio = ?', [ANIO]);
  const db = await obtenerDb();
  await db.collection('esquemas_captura').deleteMany({ 'vacuna.codigo': { $in: VACUNAS } });
  await pool.query('DELETE d FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id WHERE v.codigo IN (?)', [VACUNAS]);
  await pool.query('DELETE FROM vacuna WHERE codigo IN (?)', [VACUNAS]);
}

async function preparar() {
  for (const mes of MESES) {
    const fin = new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
    const [periodo] = await pool.query('INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
      ANIO,
      mes,
      `${ANIO}-${dosDigitos(mes)}-01`,
      `${ANIO}-${dosDigitos(mes)}-${fin}`,
    ]);
    periodoIds[mes] = periodo.insertId;
    await pool.query(
      "INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, 1, ?, 'ABIERTO')",
      [periodo.insertId, `${ANIO}-${dosDigitos(mes + 1)}-10`],
    );
  }

  for (const [codigo, dosis] of [[DETALLADO, ['D1', 'D2']], [SIN_MIGRANTES, ['D1']], [COMO_5C, ['D1']]]) {
    const [vacuna] = await pool.query('INSERT INTO vacuna (codigo, nombre, activa) VALUES (?, ?, TRUE)', [
      codigo,
      `vitest-hu21 ${codigo}`,
    ]);
    vacunaIds[codigo] = vacuna.insertId;
    dosisIds[codigo] = {};
    for (const [i, dosisCodigo] of dosis.entries()) {
      const [fila] = await pool.query('INSERT INTO dosis (vacuna_id, codigo, nombre, orden, activa) VALUES (?, ?, ?, ?, TRUE)', [
        vacuna.insertId,
        dosisCodigo,
        `Dosis ${dosisCodigo}`,
        i + 1,
      ]);
      dosisIds[codigo][dosisCodigo] = fila.insertId;
    }
  }

  const db = await obtenerDb();
  await db.collection('esquemas_captura').insertMany([
    esquemaDetallado(),
    esquemaSimple(SIN_MIGRANTES, { modo: 'MUNICIPIO_DETALLADO', permite_no_especificado: false }),
    esquemaSimple(COMO_5C, { modo: 'PROPIO_Y_OTROS', permite_no_especificado: false }),
  ]);
}

// Una cuenta de la semilla con sus datos y permisos reales: autenticar compara el rol, el establecimiento y el
// municipio con la base.
async function tokenDe(nombreUsuario) {
  const [[cuenta]] = await pool.query(
    `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE u.nombre_usuario = ? AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE`,
    [nombreUsuario],
  );
  if (!cuenta) throw new Error(`No hay una cuenta activa ${nombreUsuario} en la base de prueba`);
  const [permisos] = await pool.query(
    'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
    [cuenta.rol_id],
  );
  const token = await tokenDePrueba(cuenta.id, {
    rol: cuenta.rol,
    permisos: permisos.map((p) => p.codigo),
    ddrissId: cuenta.ddriss_id,
    establecimientoId: cuenta.establecimiento_id,
    municipioId: cuenta.municipio_id,
  }, { expiresIn: '10m' });
  return { token, usuarioId: cuenta.id };
}

let personal;

const consultar = (ruta) => request(app).get(`/api/v1${ruta}`).set('Authorization', `Bearer ${personal.token}`);

async function crearReporte(mes) {
  const res = await request(app)
    .post('/api/v1/reportes')
    .set('Authorization', `Bearer ${personal.token}`)
    .send({ periodoId: periodoIds[mes] });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function reporteVacunaId(reporteId, codigo) {
  const [[fila]] = await pool.query('SELECT id FROM reporte_vacuna WHERE reporte_id = ? AND vacuna_id = ?', [
    reporteId,
    vacunaIds[codigo],
  ]);
  return fila.id;
}

// Una fila de detalle insertada a mano, con sus dimensiones; la clave sigue la regla canónica.
async function insertarCelda(repVacId, { codigo, dosis, procedencia, dimensiones, cantidad }) {
  const clave = Object.keys(dimensiones).sort().map((d) => `${d}=${dimensiones[d]}`).join('|');
  const [fila] = await pool.query(
    `INSERT INTO detalle_produccion (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [repVacId, dosisIds[codigo][dosis], procedencia, clave, cantidad, personal.usuarioId],
  );
  for (const [dimension, valor] of Object.entries(dimensiones)) {
    await pool.query('INSERT INTO detalle_dimension (detalle_id, dimension_codigo, valor_codigo) VALUES (?, ?, ?)', [
      fila.insertId,
      dimension,
      valor,
    ]);
  }
  return fila.insertId;
}

const delFormulario = (formulario, codigo) => formulario.vacunas.find((v) => v.vacunaId === vacunaIds[codigo]);

beforeAll(async () => {
  await limpiar();
  await preparar();
  personal = await tokenDe('cs1201');
  const [filas] = await pool.query(
    "SELECT id, codigo_ine FROM municipio WHERE codigo_ine IN ('1201', '1202', '0920', '9999')",
  );
  for (const f of filas) municipios[f.codigo_ine] = f.id;
  const [[propio]] = await pool.query("SELECT municipio_id FROM establecimiento WHERE codigo = 'CS-1201'");
  expect(propio.municipio_id).toBe(municipios['1201']);
}, 60000);

afterAll(limpiar, 60000);

describe('GET /reportes/{id}/formulario: procedencias', () => {
  let reporteId;

  beforeAll(async () => {
    reporteId = await crearReporte(1);
  });

  it('MUNICIPIO_DETALLADO con permiteNoEspecificado ofrece el territorio y el 9999, sin el propio ni Coatepeque', async () => {
    const res = await consultar(`/reportes/${reporteId}/formulario`);

    expect(res.status).toBe(200);
    const permitidas = delFormulario(res.body, DETALLADO).procedenciasPermitidas;
    expect(permitidas).toContain(municipios['1202']);
    expect(permitidas).not.toContain(municipios['1201']);
    expect(permitidas).not.toContain(municipios['0920']);
    expect(permitidas.at(-1)).toBe(municipios['9999']);
  });

  it('MUNICIPIO_DETALLADO sin permiteNoEspecificado no ofrece el 9999, y PROPIO_Y_OTROS solo ofrece el 9999', async () => {
    const res = await consultar(`/reportes/${reporteId}/formulario`);

    const sinMigrantes = delFormulario(res.body, SIN_MIGRANTES).procedenciasPermitidas;
    expect(sinMigrantes).toContain(municipios['1202']);
    expect(sinMigrantes).not.toContain(municipios['9999']);
    expect(delFormulario(res.body, COMO_5C).procedenciasPermitidas).toEqual([municipios['9999']]);
  });

  it('municipios trae el territorio y el 9999 al final, ordenados por nombre y sin el propio', async () => {
    const res = await consultar(`/reportes/${reporteId}/formulario`);

    const lista = res.body.municipios;
    const ids = lista.map((m) => m.id);
    expect(ids).toContain(municipios['1202']);
    expect(ids).not.toContain(municipios['1201']);
    expect(ids).not.toContain(municipios['0920']);
    expect(lista.at(-1)).toEqual({ id: municipios['9999'], codigoIne: '9999', nombre: expect.any(String) });
    const nombres = lista.slice(0, -1).map((m) => m.nombre);
    expect(nombres).toEqual([...nombres].sort((a, b) => a.localeCompare(b, 'es')));
    for (const m of lista) expect(Object.keys(m).sort()).toEqual(['codigoIne', 'id', 'nombre']);
    // Las permitidas van en el orden de municipios.
    const permitidas = delFormulario(res.body, DETALLADO).procedenciasPermitidas;
    expect(permitidas).toEqual(ids.filter((id) => permitidas.includes(id)));
  });

  it('con una fila guardada de Coatepeque, municipios también la trae, pero no es una procedencia permitida', async () => {
    const repVac = await reporteVacunaId(reporteId, DETALLADO);
    await insertarCelda(repVac, {
      codigo: DETALLADO,
      dosis: 'D1',
      procedencia: municipios['0920'],
      dimensiones: { grupo_edad: 'MENOR_1', sexo: 'F' },
      cantidad: 2,
    });

    const res = await consultar(`/reportes/${reporteId}/formulario`);

    expect(res.body.municipios.map((m) => m.id)).toContain(municipios['0920']);
    expect(delFormulario(res.body, DETALLADO).procedenciasPermitidas).not.toContain(municipios['0920']);
    expect(delFormulario(res.body, DETALLADO).celdas).toEqual([
      {
        dosisCodigo: 'D1',
        municipioProcedenciaId: municipios['0920'],
        dimensiones: { grupo_edad: 'MENOR_1', sexo: 'F' },
        claveCombinacion: 'grupo_edad=MENOR_1|sexo=F',
        cantidad: 2,
      },
    ]);
  });
});

const guardar = (reporteId, codigo, cuerpo) =>
  request(app)
    .put(`/api/v1/reportes/${reporteId}/vacunas/${vacunaIds[codigo]}`)
    .set('Authorization', `Bearer ${personal.token}`)
    .send(cuerpo);

const error = (res) => [res.status, res.body.error?.codigo];
const leerJson = (valor) => (typeof valor === 'string' ? JSON.parse(valor) : valor);

async function filasDeDetalle(repVac) {
  const [filas] = await pool.query(
    `SELECT dp.id, d.codigo AS dosis, dp.municipio_procedencia_id AS procedencia, dp.clave_combinacion AS clave, dp.cantidad,
            (SELECT GROUP_CONCAT(CONCAT(dd.dimension_codigo, '=', dd.valor_codigo) ORDER BY dd.dimension_codigo SEPARATOR '|')
               FROM detalle_dimension dd WHERE dd.detalle_id = dp.id) AS dimensiones
       FROM detalle_produccion dp JOIN dosis d ON d.id = dp.dosis_id
      WHERE dp.reporte_vacuna_id = ? ORDER BY d.orden, dp.clave_combinacion, dp.municipio_procedencia_id`,
    [repVac],
  );
  return filas;
}

async function filasBitacora(repVac) {
  const [filas] = await pool.query(
    `SELECT accion, valores_anteriores, valores_nuevos FROM bitacora
      WHERE modulo = 'PRODUCCION' AND entidad = 'reporte_vacuna' AND entidad_id = ? ORDER BY id`,
    [String(repVac)],
  );
  return filas.map((f) => ({ accion: f.accion, anteriores: leerJson(f.valores_anteriores), nuevos: leerJson(f.valores_nuevos) }));
}

describe('PUT /reportes/{id}/vacunas/{vacunaId}: procedencias', () => {
  let reporteId;
  let repVac;

  const version = async () => {
    const [[fila]] = await pool.query('SELECT version_fila FROM reporte_produccion WHERE id = ?', [reporteId]);
    return fila.version_fila;
  };
  // Una celda de ZVT_HU21: D1 de menores de 1 año, por sexo.
  const celda = (codigoIne, cantidad, sexo = 'F') => ({
    dosisCodigo: 'D1',
    municipioProcedenciaId: municipios[codigoIne],
    dimensiones: { grupo_edad: 'MENOR_1', sexo },
    cantidad,
  });
  // Una celda de ZVT_HU21N o ZVT_HU21P, que no desagregan.
  const simple = (codigoIne, cantidad) => ({
    dosisCodigo: 'D1',
    municipioProcedenciaId: municipios[codigoIne],
    dimensiones: {},
    cantidad,
  });
  const procedenciaInvalida = (nombre) => `La celda ${nombre} tiene una procedencia que no se puede usar en esta vacuna.`;

  beforeAll(async () => {
    reporteId = await crearReporte(2);
    repVac = await reporteVacunaId(reporteId, DETALLADO);
  });

  it('guarda celdas del propio, de otro municipio y del 9999, cada una con su procedencia, y el total las suma', async () => {
    const res = await guardar(reporteId, DETALLADO, {
      versionFila: await version(),
      celdas: [celda('1201', 10), celda('1202', 3), celda('9999', 0)],
    });

    expect(res.status).toBe(200);
    expect(res.body.vacuna.totalDeclarado).toBe(13);
    const filas = await filasDeDetalle(repVac);
    const porProcedencia = Object.fromEntries(filas.map((f) => [f.procedencia, f]));
    expect(filas).toHaveLength(3);
    for (const [codigo, cantidad] of [['1201', 10], ['1202', 3], ['9999', 0]]) {
      expect(porProcedencia[municipios[codigo]]).toMatchObject({
        dosis: 'D1',
        clave: 'grupo_edad=MENOR_1|sexo=F',
        cantidad,
        dimensiones: 'grupo_edad=MENOR_1|sexo=F',
      });
    }
    const [[vacuna]] = await pool.query('SELECT total_declarado FROM reporte_vacuna WHERE id = ?', [repVac]);
    expect(vacuna.total_declarado).toBe(13);
  });

  it('la fila ACTUALIZAR lleva la procedencia en cada clave de celda', async () => {
    const ultima = (await filasBitacora(repVac)).at(-1);
    const clave = (codigo) => `celda:D1|${municipios[codigo]}|grupo_edad=MENOR_1|sexo=F`;

    expect(ultima.accion).toBe('ACTUALIZAR');
    expect(ultima.nuevos).toEqual({ [clave('1201')]: 10, [clave('1202')]: 3, [clave('9999')]: 0, totalDeclarado: 13 });
  });

  it('repetir el mismo guardado no escribe nada, y uno sin las celdas de otro municipio las borra', async () => {
    const versionFila = await version();
    const filasAntes = (await filasBitacora(repVac)).length;

    const igual = await guardar(reporteId, DETALLADO, {
      versionFila,
      celdas: [celda('9999', 0), celda('1202', 3), celda('1201', 10)],
    });
    expect(igual.status).toBe(200);
    expect(igual.body.versionFila).toBe(versionFila);
    expect((await filasBitacora(repVac)).length).toBe(filasAntes);

    const sinOtro = await guardar(reporteId, DETALLADO, { versionFila, celdas: [celda('1201', 10), celda('9999', 0)] });
    expect(sinOtro.status).toBe(200);
    expect((await filasDeDetalle(repVac)).map((f) => f.procedencia)).not.toContain(municipios['1202']);
    expect(sinOtro.body.vacuna.totalDeclarado).toBe(10);
  });

  it('PROPIO_Y_OTROS acepta el 9999', async () => {
    const res = await guardar(reporteId, COMO_5C, { versionFila: await version(), celdas: [simple('9999', 4)] });

    expect(res.status).toBe(200);
    expect(res.body.vacuna.celdas.map((c) => [c.municipioProcedenciaId, c.claveCombinacion, c.cantidad])).toEqual([
      [municipios['9999'], '', 4],
    ]);
  });

  it('422 CELDA_INVALIDA con una procedencia que no está permitida ni tenía filas, o que no existe', async () => {
    const versionFila = await version();
    const casos = [
      [DETALLADO, celda('0920', 1), 'Dosis D1 · < 1 año · Femenino'],
      [DETALLADO, { ...celda('1202', 1), municipioProcedenciaId: 999999 }, 'Dosis D1 · < 1 año · Femenino'],
      [SIN_MIGRANTES, simple('9999', 1), 'Dosis D1'],
      [COMO_5C, simple('1202', 1), 'Dosis D1'],
    ];
    for (const [codigo, celdaPedida, nombre] of casos) {
      const res = await guardar(reporteId, codigo, { versionFila, celdas: [celdaPedida] });
      expect(error(res)).toEqual([422, 'CELDA_INVALIDA']);
      expect(res.body.error.mensaje).toBe(procedenciaInvalida(nombre));
    }
    expect(await version()).toBe(versionFila);
  });

  it('422 CELDA_REPETIDA con dos celdas iguales de otro municipio', async () => {
    const res = await guardar(reporteId, DETALLADO, {
      versionFila: await version(),
      celdas: [celda('1202', 1), { ...celda('1202', 2), dimensiones: { sexo: 'F', grupo_edad: 'MENOR_1' } }],
    });

    expect(error(res)).toEqual([422, 'CELDA_REPETIDA']);
    expect(res.body.error.mensaje).toBe('La celda Dosis D1 · < 1 año · Femenino está repetida.');
  });

  it('una procedencia heredada con filas se acepta; al omitirla se borra, y después se rechaza', async () => {
    const heredada = await insertarCelda(repVac, {
      codigo: DETALLADO,
      dosis: 'D1',
      procedencia: municipios['0920'],
      dimensiones: { grupo_edad: '1_A_5', sexo: 'M' },
      cantidad: 2,
    });
    const deCoatepeque = { ...celda('0920', 6, 'M'), dimensiones: { grupo_edad: '1_A_5', sexo: 'M' } };
    const propias = [celda('1201', 10), celda('9999', 0)];

    const conElla = await guardar(reporteId, DETALLADO, { versionFila: await version(), celdas: [...propias, deCoatepeque] });
    expect(conElla.status).toBe(200);
    const fila = (await filasDeDetalle(repVac)).find((f) => f.procedencia === municipios['0920']);
    expect(fila).toMatchObject({ id: heredada, cantidad: 6 });

    const sinElla = await guardar(reporteId, DETALLADO, { versionFila: await version(), celdas: propias });
    expect(sinElla.status).toBe(200);
    expect((await filasDeDetalle(repVac)).map((f) => f.procedencia)).not.toContain(municipios['0920']);

    const otraVez = await guardar(reporteId, DETALLADO, { versionFila: await version(), celdas: [...propias, deCoatepeque] });
    expect(error(otraVez)).toEqual([422, 'CELDA_INVALIDA']);
    expect(otraVez.body.error.mensaje).toBe(procedenciaInvalida('Dosis D1 · De 1 a < 6 años · Masculino'));
  });
});
