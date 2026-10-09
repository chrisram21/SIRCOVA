
const { poolMysql } = require('./config/mysql');

const {
  clienteMongo,
  baseMongo
} = require('./config/mongodb');

async function probarConexiones() {
  try {
    // Comprobar MySQL
    const [filas] = await poolMysql.query(
      'SELECT DATABASE() AS nombre'
    );

    console.log(
      'MySQL conectado:',
      filas[0].nombre
    );

    // Comprobar MongoDB
    await clienteMongo.connect();

    await baseMongo.command({ ping: 1 });

    console.log(
      'MongoDB conectado:',
      baseMongo.databaseName
    );

    console.log('Ambas conexiones funcionan.');

  } catch (error) {
    console.error(
      'Error de conexión:',
      error.message
    );

    process.exitCode = 1;

  } finally {
    await poolMysql.end();
    await clienteMongo.close();
  }
}

probarConexiones();
