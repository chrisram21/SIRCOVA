const app = require('./app');
const entorno = require('./config/entorno');
const pool = require('./config/mysql');
const { cliente } = require('./config/mongodb');

// Arranca aunque una base no responda, para que /salud pueda informarlo.
const servidor = app.listen(entorno.puerto, () => {
  console.log(`API en http://localhost:${entorno.puerto}/api/v1 · documentación en /api/docs`);
});

async function detener() {
  servidor.close();
  await Promise.allSettled([pool.end(), cliente.close()]);
  process.exit(0);
}

process.on('SIGINT', detener);
process.on('SIGTERM', detener);
