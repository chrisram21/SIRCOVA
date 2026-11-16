import pool from '../../config/mysql.js';
import { filtroAlcance } from '../auth/alcance.service.js';
import { revisarParametros } from '../catalogos/catalogos.service.js';

const LIMITE = 50;
const SEVERIDADES = ['CRITICA', 'ADVERTENCIA', 'INFO'];

const aFechaIso = (segundos) => new Date(Number(segundos) * 1000).toISOString();

// Las activas dirigidas al rol del usuario, dentro de su ámbito (DDRISS, establecimiento o todo el país).
export async function listarAlertas(usuario, query) {
  revisarParametros(query, []);
  const alcance = filtroAlcance(usuario, { ddriss: 'a.ddriss_id', establecimiento: 'a.establecimiento_id' });
  const filtro = `a.estado = 'ACTIVA' AND r.codigo = ? AND ${alcance.condicion}`;
  const valores = [usuario.rol, ...alcance.parametros];

  const [[filas], [conteos]] = await Promise.all([
    pool.query(
      `SELECT a.id, a.tipo, a.severidad, a.titulo, a.mensaje, UNIX_TIMESTAMP(a.generada_en) AS generada,
              p.id AS periodo_id, p.anio, p.mes, e.id AS establecimiento_id, e.codigo, e.nombre, a.reporte_id
         FROM alerta a
         JOIN rol r ON r.id = a.rol_destino_id
         LEFT JOIN periodo p ON p.id = a.periodo_id
         LEFT JOIN establecimiento e ON e.id = a.establecimiento_id
        WHERE ${filtro}
        ORDER BY FIELD(a.severidad, 'CRITICA', 'ADVERTENCIA', 'INFO'), a.generada_en DESC, a.id DESC
        LIMIT ${LIMITE}`,
      valores,
    ),
    pool.query(
      `SELECT a.severidad, COUNT(*) AS n FROM alerta a JOIN rol r ON r.id = a.rol_destino_id
        WHERE ${filtro} GROUP BY a.severidad`,
      valores,
    ),
  ]);

  const porSeveridad = Object.fromEntries(SEVERIDADES.map((s) => [s, 0]));
  for (const { severidad, n } of conteos) porSeveridad[severidad] = Number(n);

  return {
    total: SEVERIDADES.reduce((suma, s) => suma + porSeveridad[s], 0),
    porSeveridad,
    alertas: filas.map((f) => ({
      id: f.id,
      tipo: f.tipo,
      severidad: f.severidad,
      titulo: f.titulo,
      mensaje: f.mensaje,
      generadaEn: aFechaIso(f.generada),
      periodo: f.periodo_id == null ? null : { id: f.periodo_id, anio: f.anio, mes: f.mes },
      establecimiento:
        f.establecimiento_id == null ? null : { id: f.establecimiento_id, codigo: f.codigo, nombre: f.nombre },
      reporteId: f.reporte_id,
    })),
  };
}
