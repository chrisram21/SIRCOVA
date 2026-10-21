import pool from '../../config/mysql.js';

export async function listarRoles() {
  const [filas] = await pool.query('SELECT id, codigo, nombre FROM rol ORDER BY id');
  return filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre }));
}
