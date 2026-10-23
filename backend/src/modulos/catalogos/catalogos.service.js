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

export function revisarCampos(cuerpo, permitidos) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw entradaInvalida('El cuerpo debe ser un objeto JSON.');
  }
  for (const campo of Object.keys(cuerpo)) {
    if (!permitidos.includes(campo)) throw entradaInvalida(`Campo no permitido: ${campo}.`);
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

const ALCANCES_MUNICIPIO = ['departamento', 'procedencia', 'todos'];
const ORDEN_MUNICIPIOS = {
  departamento: 'm.nombre',
  procedencia: "m.codigo_ine = '9999', m.nombre",
  todos: "m.codigo_ine = '9999', dep.nombre, m.nombre",
};

function leerFiltrosMunicipios(query) {
  revisarParametros(query, ['alcance', 'incluirInactivos']);
  const alcance = query.alcance ?? 'departamento';
  if (!ALCANCES_MUNICIPIO.includes(alcance)) throw entradaInvalida('alcance debe ser departamento, procedencia o todos.');
  return { alcance, incluirInactivos: leerBooleano(query, 'incluirInactivos') ?? false };
}

// Los municipios de una DDRISS son los de su departamento sede; con alcance=procedencia se suman el 9999 y los
// municipios de sus establecimientos externos (p. ej. Coatepeque). Con alcance=todos, o para la autoridad
// nacional, son todos los de la tabla.
export async function listarMunicipios(usuario, query = {}) {
  const { alcance, incluirInactivos } = leerFiltrosMunicipios(query);
  const deLaDdriss = filtroAlcance(usuario, { ddriss: 'd.id' });
  const parametros = [...deLaDdriss.parametros];
  let ambito = `EXISTS (SELECT 1 FROM ddriss d WHERE d.departamento_id = m.departamento_id AND ${deLaDdriss.condicion})`;

  if (alcance === 'todos' || esAlcanceNacional(usuario)) {
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
      ORDER BY ${ORDEN_MUNICIPIOS[alcance]}`,
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
