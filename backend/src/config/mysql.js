import fs from 'node:fs';
import mysql from 'mysql2/promise';
import entorno from './entorno.js';

const pool = mysql.createPool({
  host: entorno.mysql.host,
  port: entorno.mysql.puerto,
  user: entorno.mysql.usuario,
  password: entorno.mysql.contrasena,
  database: entorno.mysql.baseDatos,
  ssl: { ca: fs.readFileSync(entorno.mysql.rutaCertificado) },
  connectTimeout: 5000,
  connectionLimit: 10,
});

// Para "cambio + bitácora (+ MongoDB)": se confirma solo si fn termina sin errores.
export async function enTransaccion(fn) {
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();
    const resultado = await fn(conexion);
    await conexion.commit();
    return resultado;
  } catch (err) {
    await conexion.rollback();
    throw err;
  } finally {
    conexion.release();
  }
}

export default pool;
