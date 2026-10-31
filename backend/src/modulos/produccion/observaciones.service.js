import pool from '../../config/mysql.js';
import { entradaInvalida, revisarParametros } from '../catalogos/catalogos.service.js';
import { leerReporte } from './validacion.service.js';

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

// Las observaciones de una devolución se insertan en un solo INSERT, así que comparten creado_en (SPEC 36).
export async function listarObservaciones(id, query, usuario) {
  revisarParametros(query, []);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const reporte = await leerReporte(Number(id), usuario);
  const [filas] = await pool.query(
    `SELECT o.id, o.texto, o.atendida, UNIX_TIMESTAMP(o.creado_en) AS creado_en,
            UNIX_TIMESTAMP(o.atendida_en) AS atendida_en,
            v.id AS vacuna_id, v.codigo AS vacuna_codigo, v.nombre AS vacuna_nombre,
            u.id AS autor_id, CONCAT(em.nombres, ' ', em.apellidos) AS autor_nombre
       FROM observacion_revision o
       LEFT JOIN reporte_vacuna rv ON rv.id = o.reporte_vacuna_id
       LEFT JOIN vacuna v ON v.id = rv.vacuna_id
       JOIN usuario u ON u.id = o.usuario_id
       JOIN empleado em ON em.id = u.empleado_id
      WHERE o.reporte_id = ?
      ORDER BY o.creado_en DESC, v.id IS NOT NULL, v.orden_informe, v.nombre, o.id`,
    [reporte.id],
  );
  return filas.map((f) => ({
    id: f.id,
    vacuna: f.vacuna_id === null ? null : { id: f.vacuna_id, codigo: f.vacuna_codigo, nombre: f.vacuna_nombre },
    texto: f.texto,
    autor: { id: f.autor_id, nombre: f.autor_nombre },
    creadoEn: aFechaIso(f.creado_en),
    atendida: Boolean(f.atendida),
    atendidaEn: aFechaIso(f.atendida_en),
  }));
}
