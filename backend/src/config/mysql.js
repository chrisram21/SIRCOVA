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

export default pool;
