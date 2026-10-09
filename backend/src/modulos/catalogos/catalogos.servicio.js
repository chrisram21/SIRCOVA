
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

module.exports = { obtenerMunicipios };
