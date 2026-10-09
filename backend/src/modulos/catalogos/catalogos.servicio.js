
const { poolMysql } = require('../../config/mysql');

async function obtenerMunicipios(soloJurisdiccion) {
  const [filas] = await poolMysql.execute(
    `SELECT
       id,
       departamento_id AS departamentoId,
       codigo_ine AS codigoIne,
       nombre,
       es_jurisdiccion AS esJurisdiccion,
       activo
     FROM municipio
     WHERE (? = 0 OR es_jurisdiccion = 1)
     ORDER BY nombre ASC`,
    [soloJurisdiccion ? 1 : 0]
  );

  return filas.map((municipio) => ({
    ...municipio,
    esJurisdiccion: Boolean(municipio.esJurisdiccion),
    activo: Boolean(municipio.activo)
  }));
}

async function obtenerVacunas() {
  const [filas] = await poolMysql.query(`
    SELECT
      v.id AS vacunaId,
      v.codigo AS vacunaCodigo,
      v.nombre AS vacunaNombre,
      v.descripcion AS vacunaDescripcion,
      v.orden_informe AS ordenInforme,
      v.activa AS vacunaActiva,
      d.id AS dosisId,
      d.codigo AS dosisCodigo,
      d.nombre AS dosisNombre,
      d.orden AS dosisOrden,
      d.activa AS dosisActiva
    FROM vacuna v
    LEFT JOIN dosis d
      ON d.vacuna_id = v.id
    ORDER BY
      v.orden_informe,
      v.nombre,
      d.orden,
      d.id
  `);

  const vacunas = new Map();

  for (const fila of filas) {
    if (!vacunas.has(fila.vacunaId)) {
      vacunas.set(fila.vacunaId, {
        id: fila.vacunaId,
        codigo: fila.vacunaCodigo,
        nombre: fila.vacunaNombre,
        descripcion: fila.vacunaDescripcion,
        ordenInforme: fila.ordenInforme,
        activa: Boolean(fila.vacunaActiva),
        dosis: []
      });
    }

    if (fila.dosisId !== null) {
      vacunas.get(fila.vacunaId).dosis.push({
        id: fila.dosisId,
        codigo: fila.dosisCodigo,
        nombre: fila.dosisNombre,
        orden: fila.dosisOrden,
        activa: Boolean(fila.dosisActiva)
      });
    }
  }

  return Array.from(vacunas.values());
}
async function obtenerEstablecimientos(filtros = {}) {
  const condiciones = [];
  const parametros = [];

  if (filtros.municipioId !== undefined) {
    condiciones.push('e.municipio_id = ?');
    parametros.push(filtros.municipioId);
  }

  if (filtros.activo !== undefined) {
    condiciones.push('e.activo = ?');
    parametros.push(filtros.activo ? 1 : 0);
  }

  const where = condiciones.length > 0
    ? `WHERE ${condiciones.join(' AND ')}`
    : '';

  const consulta = `
    SELECT
      e.id,
      e.codigo,
      e.nombre,
      e.tipo_establecimiento_id AS tipoEstablecimientoId,
      t.nombre AS tipoEstablecimientoNombre,
      e.distrito_salud_id AS distritoSaludId,
      e.municipio_id AS municipioId,
      m.nombre AS municipioNombre,
      e.reporta_produccion AS reportaProduccion,
      e.es_externo AS esExterno,
      e.activo
    FROM establecimiento e
    INNER JOIN tipo_establecimiento t
      ON t.id = e.tipo_establecimiento_id
    INNER JOIN municipio m
      ON m.id = e.municipio_id
    ${where}
    ORDER BY m.nombre, e.nombre
  `;

  const [filas] = await poolMysql.execute(
    consulta,
    parametros
  );

  return filas.map((establecimiento) => ({
    ...establecimiento,
    reportaProduccion: Boolean(
      establecimiento.reportaProduccion
    ),
    esExterno: Boolean(establecimiento.esExterno),
    activo: Boolean(establecimiento.activo)
  }));
}
module.exports = {
  obtenerMunicipios,
  obtenerVacunas,
  obtenerEstablecimientos,
};
