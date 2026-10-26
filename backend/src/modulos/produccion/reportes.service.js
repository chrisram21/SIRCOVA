import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { verificarAlcance } from '../auth/alcance.service.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos } from '../catalogos/catalogos.service.js';
import { esquemasDelPeriodo } from '../configuracion/esquemas.service.js';

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  periodoNoEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El periodo no existe.'),
  sinEstablecimiento: () =>
    new ErrorApi(403, 'SIN_ESTABLECIMIENTO', 'Su cuenta no tiene un establecimiento asignado.'),
  establecimientoInactivo: () =>
    new ErrorApi(409, 'ESTABLECIMIENTO_INACTIVO', 'Su establecimiento está desactivado y no puede crear reportes.'),
  noReporta: () => new ErrorApi(422, 'ESTABLECIMIENTO_NO_REPORTA', 'Su establecimiento no envía el formulario 5C.'),
  periodoNoAbierto: () => new ErrorApi(409, 'PERIODO_NO_ABIERTO', 'El mes no está abierto para reportes.'),
  reporteExistente: () => new ErrorApi(409, 'REPORTE_EXISTENTE', 'Ya existe el reporte de este mes.'),
  sinEsquemas: () => new ErrorApi(422, 'SIN_ESQUEMAS', 'No hay formularios de captura publicados para este mes.'),
};

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());
const aId = (valor) => (/^\d+$/.test(String(valor)) ? Number(valor) : 0);

// El estado y la fecha límite del mes son los de la DDRISS del establecimiento (regla 10).
const SELECT_REPORTE = `
  SELECT r.id, r.estado, r.numero_rectificacion, r.version_fila,
         UNIX_TIMESTAMP(r.creado_en) AS creado_en, UNIX_TIMESTAMP(r.actualizado_en) AS actualizado_en,
         e.id AS establecimiento_id, e.codigo AS establecimiento_codigo, e.nombre AS establecimiento_nombre,
         e.ddriss_id, p.id AS periodo_id, p.anio, p.mes, cp.estado AS periodo_estado,
         DATE_FORMAT(cp.fecha_limite_envio, '%Y-%m-%d') AS fecha_limite_envio
    FROM reporte_produccion r
    JOIN establecimiento e ON e.id = r.establecimiento_id
    JOIN periodo p ON p.id = r.periodo_id
    LEFT JOIN cierre_periodo cp ON cp.periodo_id = p.id AND cp.ddriss_id = e.ddriss_id`;

async function vacunasDelReporte(ejecutor, reporteId) {
  const [filas] = await ejecutor.query(
    `SELECT rv.id, v.id AS vacuna_id, v.codigo, v.nombre, rv.esquema_mongo_id, rv.esquema_version
       FROM reporte_vacuna rv
       JOIN vacuna v ON v.id = rv.vacuna_id
      WHERE rv.reporte_id = ?
      ORDER BY v.orden_informe, v.nombre`,
    [reporteId],
  );
  return filas.map((f) => ({
    id: f.id,
    vacuna: { id: f.vacuna_id, codigo: f.codigo, nombre: f.nombre },
    esquema: { id: f.esquema_mongo_id, version: f.esquema_version },
  }));
}

async function buscarReporte(ejecutor, id, usuario) {
  const [[fila]] = await ejecutor.query(`${SELECT_REPORTE} WHERE r.id = ?`, [aId(id)]);
  if (!fila) throw errores.noEncontrado();
  verificarAlcance(usuario, { establecimientoId: fila.establecimiento_id, ddrissId: fila.ddriss_id });
  return {
    id: fila.id,
    establecimiento: { id: fila.establecimiento_id, codigo: fila.establecimiento_codigo, nombre: fila.establecimiento_nombre },
    periodo: {
      id: fila.periodo_id,
      anio: fila.anio,
      mes: fila.mes,
      estado: fila.periodo_estado ?? null,
      fechaLimiteEnvio: fila.fecha_limite_envio ?? null,
    },
    estado: fila.estado,
    numeroRectificacion: fila.numero_rectificacion,
    versionFila: fila.version_fila,
    creadoEn: aFechaIso(fila.creado_en),
    actualizadoEn: aFechaIso(fila.actualizado_en),
    vacunas: await vacunasDelReporte(ejecutor, fila.id),
  };
}

export async function obtenerReporte(id, usuario) {
  return buscarReporte(pool, id, usuario);
}

function leerReporteNuevo(cuerpo) {
  revisarCampos(cuerpo, ['periodoId']);
  const { periodoId } = cuerpo;
  if (!Number.isInteger(periodoId) || periodoId <= 0) throw entradaInvalida('periodoId debe ser un número entero positivo.');
  return periodoId;
}

async function establecimientoDe(usuario) {
  if (!Number.isInteger(usuario.establecimientoId)) throw errores.sinEstablecimiento();
  const [[fila]] = await pool.query(
    `SELECT e.id, e.activo, e.reporta_5c, e.ddriss_id, d.codigo AS ddriss_codigo
       FROM establecimiento e
       JOIN ddriss d ON d.id = e.ddriss_id
      WHERE e.id = ?`,
    [usuario.establecimientoId],
  );
  if (!fila) throw errores.sinEstablecimiento();
  if (!fila.activo) throw errores.establecimientoInactivo();
  if (!fila.reporta_5c) throw errores.noReporta();
  return fila;
}

// Las vacunas activas con el esquema que cubre el día 1 del mes; las que no tienen uno se omiten.
async function vacunasConEsquema(periodo, ddrissCodigo) {
  const [vacunas] = await pool.query('SELECT id, codigo FROM vacuna WHERE activa = TRUE');
  const fecha = new Date(Date.UTC(periodo.anio, periodo.mes - 1, 1));
  const esquemas = await esquemasDelPeriodo(vacunas.map((v) => v.codigo), ddrissCodigo, fecha);
  return vacunas.filter((v) => esquemas.has(v.codigo)).map((v) => ({ vacunaId: v.id, ...esquemas.get(v.codigo) }));
}

// El reporte fija sus vacunas y la versión de cada esquema al crearse: lo que cambie después no lo toca.
export async function crearReporte(cuerpo, usuario, contexto) {
  const periodoId = leerReporteNuevo(cuerpo);
  const establecimiento = await establecimientoDe(usuario);
  const [[periodo]] = await pool.query('SELECT id, anio, mes FROM periodo WHERE id = ?', [periodoId]);
  if (!periodo) throw errores.periodoNoEncontrado();
  const vacunas = await vacunasConEsquema(periodo, establecimiento.ddriss_codigo);

  let reporteId;
  try {
    reporteId = await enTransaccion(async (conexion) => {
      // Primera consulta de la transacción: así un cambio de estado del mes espera a que esta termine.
      const [[cierre]] = await conexion.query(
        'SELECT estado FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = ? FOR SHARE',
        [periodo.id, establecimiento.ddriss_id],
      );
      if (cierre?.estado !== 'ABIERTO') throw errores.periodoNoAbierto();
      const [[existente]] = await conexion.query(
        'SELECT id FROM reporte_produccion WHERE establecimiento_id = ? AND periodo_id = ?',
        [establecimiento.id, periodo.id],
      );
      if (existente) throw errores.reporteExistente();
      if (vacunas.length === 0) throw errores.sinEsquemas();

      const [resultado] = await conexion.query(
        'INSERT INTO reporte_produccion (establecimiento_id, periodo_id, creado_por) VALUES (?, ?, ?)',
        [establecimiento.id, periodo.id, contexto.usuarioId],
      );
      const id = resultado.insertId;
      await conexion.query(
        'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES ?',
        [vacunas.map((v) => [id, v.vacunaId, v.id, v.version])],
      );
      await conexion.query(
        "INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, usuario_id) VALUES (?, NULL, 'BORRADOR', ?)",
        [id, contexto.usuarioId],
      );
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.PRODUCCION,
        accion: ACCIONES.CREAR,
        entidad: 'reporte_produccion',
        entidadId: id,
        valoresNuevos: await buscarReporte(conexion, id, usuario),
      });
      return id;
    });
  } catch (err) {
    // Dos altas a la vez: uq_reporte_est_periodo deja pasar una; la otra choca o InnoDB la elige como víctima.
    if (err.code === 'ER_DUP_ENTRY' || err.code === 'ER_LOCK_DEADLOCK') throw errores.reporteExistente();
    throw err;
  }
  return obtenerReporte(reporteId, usuario);
}
