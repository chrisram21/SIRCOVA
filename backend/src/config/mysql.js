const fs = require('node:fs');
const mysql = require('mysql2/promise');
const entorno = require('./entorno');

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

module.exports = pool;
