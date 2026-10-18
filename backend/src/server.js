import app from './app.js';
import entorno from './config/entorno.js';
import pool from './config/mysql.js';
import { cliente } from './config/mongodb.js';

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
