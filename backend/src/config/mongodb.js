const { MongoClient } = require('mongodb');
const entorno = require('./entorno');

const cliente = new MongoClient(entorno.mongo.uri, {
  serverSelectionTimeoutMS: 5000,
});

let conexion = null;

// Si la conexión automática del driver falla, el cliente queda cerrado ("Topology is closed")
// y no reintenta; por eso se conecta explícitamente y se reintenta en la siguiente llamada.
async function obtenerDb() {
  if (!conexion) {
    conexion = cliente.connect().catch((err) => {
      conexion = null;
      throw err;
    });
  }
  await conexion;
  return cliente.db(entorno.mongo.baseDatos);
}

module.exports = { cliente, obtenerDb };
