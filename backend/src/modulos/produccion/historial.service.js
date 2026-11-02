import pool from '../../config/mysql.js';
import { entradaInvalida, revisarParametros } from '../catalogos/catalogos.service.js';
import { leerReporte } from './validacion.service.js';

const aFechaIso = (segundos) => new Date(Number(segundos) * 1000).toISOString();

// A igual fecha manda el id: la rectificación y el cierre del mes insertan varias filas en el mismo segundo.
// El rol es el actual de la cuenta; la tabla no guarda el de ese momento.
export async function listarHistorial(id, query, usuario) {
  revisarParametros(query, []);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const reporte = await leerReporte(Number(id), usuario);
  const [filas] = await pool.query(
    `SELECT h.id, h.estado_anterior, h.estado_nuevo, h.comentario, UNIX_TIMESTAMP(h.fecha) AS fecha,
            u.id AS usuario_id, CONCAT(em.nombres, ' ', em.apellidos) AS usuario_nombre,
            r.codigo AS rol_codigo, r.nombre AS rol_nombre
       FROM historial_estado_reporte h
       JOIN usuario u ON u.id = h.usuario_id
       JOIN empleado em ON em.id = u.empleado_id
       JOIN rol r ON r.id = u.rol_id
      WHERE h.reporte_id = ?
      ORDER BY h.fecha, h.id`,
    [reporte.id],
  );
  return filas.map((f) => ({
    id: f.id,
    estadoAnterior: f.estado_anterior,
    estadoNuevo: f.estado_nuevo,
    usuario: { id: f.usuario_id, nombre: f.usuario_nombre, rol: { codigo: f.rol_codigo, nombre: f.rol_nombre } },
    fecha: aFechaIso(f.fecha),
    comentario: f.comentario,
  }));
}
