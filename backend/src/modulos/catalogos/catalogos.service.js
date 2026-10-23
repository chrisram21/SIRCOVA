import pool from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { esAlcanceNacional, filtroAlcance } from '../auth/alcance.service.js';

export const entradaInvalida = (mensaje) => new ErrorApi(400, 'ENTRADA_INVALIDA', mensaje);

// Un parámetro desconocido o repetido (Express lo entrega como arreglo) responde 400, como en GET /usuarios.
export function revisarParametros(query, permitidos) {
  for (const nombre of Object.keys(query)) {
    if (!permitidos.includes(nombre)) throw entradaInvalida(`Parámetro no permitido: ${nombre}.`);
    if (typeof query[nombre] !== 'string') throw entradaInvalida(`${nombre} no se puede repetir.`);
  }
}

export function leerBooleano(query, nombre) {
  if (query[nombre] === undefined) return undefined;
  if (query[nombre] !== 'true' && query[nombre] !== 'false') throw entradaInvalida(`${nombre} debe ser true o false.`);
  return query[nombre] === 'true';
}

export async function listarDdriss(usuario) {
  const { condicion, parametros } = filtroAlcance(usuario, { ddriss: 'd.id' });
  const [filas] = await pool.query(
    `SELECT d.id, d.codigo, d.nombre, d.departamento_id, dep.nombre AS departamento_nombre
       FROM ddriss d
       JOIN departamento dep ON dep.id = d.departamento_id
      WHERE d.activo = TRUE AND ${condicion}
      ORDER BY d.nombre`,
    parametros,
  );
  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    departamentoId: f.departamento_id,
    departamentoNombre: f.departamento_nombre,
  }));
}

const ALCANCES_MUNICIPIO = ['departamento', 'procedencia'];

function leerFiltrosMunicipios(query) {
  revisarParametros(query, ['alcance', 'incluirInactivos']);
  const alcance = query.alcance ?? 'departamento';
  if (!ALCANCES_MUNICIPIO.includes(alcance)) throw entradaInvalida('alcance debe ser departamento o procedencia.');
  return { alcance, incluirInactivos: leerBooleano(query, 'incluirInactivos') ?? false };
}

// Los municipios de una DDRISS son los de su departamento sede; con alcance=procedencia se suman el 9999 y los
// municipios de sus establecimientos externos (p. ej. Coatepeque). La autoridad nacional los ve todos.
export async function listarMunicipios(usuario, query = {}) {
  const { alcance, incluirInactivos } = leerFiltrosMunicipios(query);
  const deLaDdriss = filtroAlcance(usuario, { ddriss: 'd.id' });
  const parametros = [...deLaDdriss.parametros];
  let ambito = `EXISTS (SELECT 1 FROM ddriss d WHERE d.departamento_id = m.departamento_id AND ${deLaDdriss.condicion})`;

  if (esAlcanceNacional(usuario)) {
    ambito = '1 = 1';
    parametros.length = 0;
  } else if (alcance === 'procedencia') {
    const deSusEstablecimientos = filtroAlcance(usuario, { ddriss: 'e.ddriss_id' });
    // El 9999 solo se suma si el usuario tiene una DDRISS en su ámbito.
    ambito = `(${ambito}
           OR (m.codigo_ine = '9999' AND EXISTS (SELECT 1 FROM ddriss d WHERE ${deLaDdriss.condicion}))
           OR EXISTS (SELECT 1 FROM establecimiento e WHERE e.municipio_id = m.id AND ${deSusEstablecimientos.condicion}))`;
    parametros.push(...deLaDdriss.parametros, ...deSusEstablecimientos.parametros);
  }

  const [filas] = await pool.query(
    `SELECT m.id, m.departamento_id, dep.nombre AS departamento_nombre, m.codigo_ine, m.nombre, m.activo
       FROM municipio m
       JOIN departamento dep ON dep.id = m.departamento_id
      WHERE ${incluirInactivos ? '1 = 1' : 'm.activo = TRUE'} AND ${ambito}
      ORDER BY ${alcance === 'procedencia' ? "m.codigo_ine = '9999', " : ''}m.nombre`,
    parametros,
  );
  return filas.map((f) => ({
    id: f.id,
    departamentoId: f.departamento_id,
    departamentoNombre: f.departamento_nombre,
    codigoIne: f.codigo_ine,
    nombre: f.nombre,
    activo: Boolean(f.activo),
  }));
}

function leerFiltrosEstablecimientos(consulta) {
  const filtros = {};
  if (consulta.municipioId !== undefined) {
    const id = Number(consulta.municipioId);
    if (!Number.isInteger(id) || id <= 0) throw entradaInvalida('El parámetro municipioId no es válido.');
    filtros.municipioId = id;
  }
  if (consulta.activo !== undefined) {
    if (consulta.activo !== 'true' && consulta.activo !== 'false') {
      throw entradaInvalida('El parámetro activo debe ser true o false.');
    }
    filtros.activo = consulta.activo === 'true';
  }
  return filtros;
}

export async function listarEstablecimientos(usuario, consulta = {}) {
  const filtros = leerFiltrosEstablecimientos(consulta);
  const alcance = filtroAlcance(usuario, { establecimiento: 'e.id', ddriss: 'e.ddriss_id' });
  const condiciones = [alcance.condicion];
  const parametros = [...alcance.parametros];

  if (filtros.municipioId !== undefined) {
    condiciones.push('e.municipio_id = ?');
    parametros.push(filtros.municipioId);
  }
  if (filtros.activo !== undefined) {
    condiciones.push('e.activo = ?');
    parametros.push(filtros.activo);
  }

  const [filas] = await pool.query(
    `SELECT e.id, e.codigo, e.nombre, e.tipo_establecimiento_id, t.nombre AS tipo_nombre,
            e.distrito_salud_id, e.municipio_id, m.nombre AS municipio_nombre,
            e.reporta_produccion, e.es_externo, e.activo
       FROM establecimiento e
       JOIN tipo_establecimiento t ON t.id = e.tipo_establecimiento_id
       JOIN municipio m ON m.id = e.municipio_id
      WHERE ${condiciones.join(' AND ')}
      ORDER BY e.nombre`,
    parametros,
  );
  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    tipoEstablecimientoId: f.tipo_establecimiento_id,
    tipoEstablecimientoNombre: f.tipo_nombre,
    distritoSaludId: f.distrito_salud_id,
    municipioId: f.municipio_id,
    municipioNombre: f.municipio_nombre,
    reportaProduccion: Boolean(f.reporta_produccion),
    esExterno: Boolean(f.es_externo),
    activo: Boolean(f.activo),
  }));
}
