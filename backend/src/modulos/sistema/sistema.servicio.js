
const { poolMysql } = require('../../config/mysql');
const { baseMongo } = require('../../config/mongodb');

async function verificarConexiones() {
  const [resultadoMysql, resultadoMongo] =
    await Promise.allSettled([
      poolMysql.query('SELECT 1 AS conectado'),
      baseMongo.command({ ping: 1 })
    ]);

  return {
    mysql: resultadoMysql.status === 'fulfilled'
      ? 'ok'
      : 'error',

    mongo: resultadoMongo.status === 'fulfilled'
      ? 'ok'
      : 'error'
  };
}

module.exports = { verificarConexiones };
