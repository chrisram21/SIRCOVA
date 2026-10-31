import pool from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { entradaInvalida, revisarParametros } from '../catalogos/catalogos.service.js';

// SPEC 35: la bandeja de revisión de un mes de la DDRISS y los revisores para asignar.

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

// La condición de cada chip sobre la consulta base; ASIGNADOS_A_MI recibe el id del usuario.
const GRUPOS = {
  POR_ATENDER: () => ({ sql: "r.estado IN ('ENVIADO', 'EN_REVISION')", parametros: [] }),
  ASIGNADOS_A_MI: (usuarioId) => ({ sql: "r.estado = 'EN_REVISION' AND r.revisor_id = ?", parametros: [usuarioId] }),
  EN_REVISION: () => ({ sql: "r.estado = 'EN_REVISION'", parametros: [] }),
  ENVIADO: () => ({ sql: "r.estado = 'ENVIADO'", parametros: [] }),
  CORRECCION_SOLICITADA: () => ({ sql: "r.estado = 'CORRECCION_SOLICITADA'", parametros: [] }),
  SIN_ENVIAR: () => ({ sql: "(r.id IS NULL OR r.estado = 'BORRADOR')", parametros: [] }),
  APROBADO: () => ({ sql: "r.estado = 'APROBADO'", parametros: [] }),
  CERRADO: () => ({ sql: "r.estado IN ('CERRADO', 'RECTIFICACION')", parametros: [] }),
  TODOS: () => ({ sql: 'TRUE', parametros: [] }),
};

function leerEntero(valor, nombre, { minimo = 1, maximo = Number.MAX_SAFE_INTEGER } = {}) {
  const numero = /^\d+$/.test(valor) ? Number(valor) : NaN;
  if (!(numero >= minimo && numero <= maximo)) {
    throw entradaInvalida(
      maximo === Number.MAX_SAFE_INTEGER
        ? `${nombre} debe ser un número entero mayor o igual a ${minimo}.`
        : `${nombre} debe ser un número entero entre ${minimo} y ${maximo}.`,
    );
  }
  return numero;
}

function leerFiltros(query) {
  revisarParametros(query, ['periodoId', 'municipioId', 'grupo', 'pagina', 'porPagina']);
  if (query.periodoId === undefined) throw entradaInvalida('periodoId es obligatorio.');
  if (query.grupo !== undefined && !Object.hasOwn(GRUPOS, query.grupo)) throw entradaInvalida('grupo no es válido.');
  return {
    periodoId: leerEntero(query.periodoId, 'periodoId'),
    municipioId: query.municipioId === undefined ? null : leerEntero(query.municipioId, 'municipioId'),
    grupo: query.grupo ?? 'POR_ATENDER',
    pagina: query.pagina === undefined ? 1 : leerEntero(query.pagina, 'pagina'),
    porPagina: query.porPagina === undefined ? 20 : leerEntero(query.porPagina, 'porPagina', { maximo: 100 }),
  };
}

// La consulta base: los establecimientos de la DDRISS que deben reportar (activos con reporta_5c) y los que, sin
// serlo ya, tienen reporte del mes. La usan el COUNT de los grupos y la página, así no se separan.
function consultaBase(filtros, ddrissId, uniones = '') {
  const condiciones = ['e.ddriss_id = ?', '(r.id IS NOT NULL OR (e.activo = TRUE AND e.reporta_5c = TRUE))'];
  const parametros = [filtros.periodoId, ddrissId];
  if (filtros.municipioId !== null) {
    condiciones.push('e.municipio_id = ?');
    parametros.push(filtros.municipioId);
  }
  return {
    desde: `FROM establecimiento e
       JOIN municipio m ON m.id = e.municipio_id
       LEFT JOIN reporte_produccion r ON r.establecimiento_id = e.id AND r.periodo_id = ?
       ${uniones}
      WHERE ${condiciones.join(' AND ')}`,
    parametros,
  };
}

async function contarGrupos(base, usuarioId) {
  const columnas = Object.entries(GRUPOS).map(([codigo, condicion]) => ({ codigo, ...condicion(usuarioId) }));
  const [[fila]] = await pool.query(
    `SELECT ${columnas.map((c) => `COALESCE(SUM(${c.sql}), 0) AS ${c.codigo}`).join(', ')} ${base.desde}`,
    [...columnas.flatMap((c) => c.parametros), ...base.parametros],
  );
  return Object.fromEntries(columnas.map((c) => [c.codigo, Number(fila[c.codigo])]));
}

const aElemento = (f) => ({
  reporteId: f.reporte_id ?? null,
  versionFila: f.version_fila ?? null,
  establecimiento: { id: f.establecimiento_id, codigo: f.establecimiento_codigo, nombre: f.establecimiento_nombre },
  municipio: { id: f.municipio_id, nombre: f.municipio_nombre },
  estado: f.estado ?? null,
  enviadoEn: aFechaIso(f.enviado_en),
  revisor: f.revisor_id ? { id: f.revisor_id, nombre: f.revisor_nombre } : null,
  advertencias: Number(f.advertencias ?? 0),
  dosisTotales: f.dosis_totales == null ? null : Number(f.dosis_totales),
});

export async function obtenerBandeja(usuario, query = {}) {
  const filtros = leerFiltros(query);
  const [[cierre]] = await pool.query('SELECT 1 AS hay FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = ?', [
    filtros.periodoId,
    usuario.ddrissId ?? 0,
  ]);
  if (!cierre) throw new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.');

  const conteos = await contarGrupos(consultaBase(filtros, usuario.ddrissId), usuario.id);
  const base = consultaBase(
    filtros,
    usuario.ddrissId,
    'LEFT JOIN usuario u ON u.id = r.revisor_id LEFT JOIN empleado em ON em.id = u.empleado_id',
  );
  const grupo = GRUPOS[filtros.grupo](usuario.id);
  const total = conteos[filtros.grupo];
  const [filas] = await pool.query(
    `SELECT r.id AS reporte_id, r.version_fila, r.estado, UNIX_TIMESTAMP(r.enviado_en) AS enviado_en,
            e.id AS establecimiento_id, e.codigo AS establecimiento_codigo, e.nombre AS establecimiento_nombre,
            m.id AS municipio_id, m.nombre AS municipio_nombre,
            r.revisor_id, CONCAT(em.nombres, ' ', em.apellidos) AS revisor_nombre,
            (SELECT COUNT(*) FROM resultado_validacion rv
              WHERE rv.reporte_id = r.id AND rv.severidad = 'ADVERTENCIA' AND rv.estado IN ('ABIERTO', 'JUSTIFICADO')
            ) AS advertencias,
            (SELECT SUM(rva.total_declarado) FROM reporte_vacuna rva WHERE rva.reporte_id = r.id) AS dosis_totales
       ${base.desde} AND ${grupo.sql}
      ORDER BY r.enviado_en IS NULL, r.enviado_en, m.nombre, e.nombre, e.id
      LIMIT ? OFFSET ?`,
    [...base.parametros, ...grupo.parametros, filtros.porPagina, (filtros.pagina - 1) * filtros.porPagina],
  );
  return { elementos: filas.map(aElemento), total, pagina: filtros.pagina, porPagina: filtros.porPagina, conteos };
}

// Un revisor al que se puede asignar un reporte de la DDRISS: cuenta y empleado activos, rol REVISOR.
const CONDICION_REVISOR = `r.codigo = 'REVISOR' AND u.activo = TRUE AND em.activo = TRUE AND em.ddriss_id = ?`;
const DESDE_REVISOR = `FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN empleado em ON em.id = u.empleado_id`;

export async function listarRevisores(usuario, query = {}) {
  revisarParametros(query, []);
  const [filas] = await pool.query(
    `SELECT u.id, CONCAT(em.nombres, ' ', em.apellidos) AS nombre ${DESDE_REVISOR}
      WHERE ${CONDICION_REVISOR}
      ORDER BY nombre, u.id`,
    [usuario.ddrissId ?? 0],
  );
  return filas.map((f) => ({ id: f.id, nombre: f.nombre }));
}

// Para asignar y reasignar: { id, nombre } si se le puede asignar un reporte de la DDRISS; si no, null.
export async function revisorDeLaDdriss(ejecutor, revisorId, ddrissId) {
  const [[fila]] = await ejecutor.query(
    `SELECT u.id, CONCAT(em.nombres, ' ', em.apellidos) AS nombre ${DESDE_REVISOR}
      WHERE u.id = ? AND ${CONDICION_REVISOR}`,
    [revisorId, ddrissId],
  );
  return fila ? { id: fila.id, nombre: fila.nombre } : null;
}
