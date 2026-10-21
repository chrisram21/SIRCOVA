import pool from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { esAlcanceNacional, filtroAlcance } from '../auth/alcance.service.js';

const entradaInvalida = (mensaje) => new ErrorApi(400, 'ENTRADA_INVALIDA', mensaje);

// Versiones mínimas para el formulario de HU-04; HU-08 y HU-09 las amplían.

export async function listarDdriss(usuario) {
  const { condicion, parametros } = filtroAlcance(usuario, { ddriss: 'd.id' });
  const [filas] = await pool.query(
    `SELECT d.id, d.codigo, d.nombre, d.departamento_id
       FROM ddriss d
      WHERE d.activo = TRUE AND ${condicion}
      ORDER BY d.nombre`,
    parametros,
  );
  return filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre, departamentoId: f.departamento_id }));
}

// Los municipios de una DDRISS son los de su departamento sede; la autoridad nacional los ve todos.
export async function listarMunicipios(usuario) {
  const { condicion, parametros } = filtroAlcance(usuario, { ddriss: 'd.id' });
  const ambito = esAlcanceNacional(usuario)
    ? '1 = 1'
    : `EXISTS (SELECT 1 FROM ddriss d WHERE d.departamento_id = m.departamento_id AND ${condicion})`;
  const [filas] = await pool.query(
    `SELECT m.id, m.departamento_id, m.codigo_ine, m.nombre, m.activo
       FROM municipio m
      WHERE m.activo = TRUE AND ${ambito}
      ORDER BY m.nombre`,
    parametros,
  );
  return filas.map((f) => ({
    id: f.id,
    departamentoId: f.departamento_id,
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
