import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, contextoAuditoria, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos } from '../catalogos/catalogos.service.js';
import { buscarPeriodos, hoyGuatemala } from '../catalogos/periodos.service.js';

const INTERVALO_MS = 60 * 60 * 1000;

// Un reporte que sigue en el ciclo impide cerrar el mes; un borrador nunca enviado, no. Sobre reporte_produccion r;
// la usan el cierre y el resumen de la bandeja.
export const EN_CICLO =
  "(r.estado IN ('ENVIADO', 'EN_REVISION', 'CORRECCION_SOLICITADA') OR (r.estado = 'BORRADOR' AND r.enviado_en IS NOT NULL))";

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El periodo no existe.'),
  abierto: () =>
    new ErrorApi(409, 'PERIODO_NO_EN_CIERRE', 'El mes sigue abierto: se cierra cuando vence su fecha límite.'),
  yaCerrado: () => new ErrorApi(409, 'PERIODO_YA_CERRADO', 'El mes ya está cerrado.'),
  noPermitida: () => new ErrorApi(422, 'TRANSICION_NO_PERMITIDA', 'El reporte no puede pasar de Aprobado a Cerrado.'),
};

export const mensajePendientes = (n) =>
  n === 1 ? 'Falta 1 reporte por aprobar.' : `Faltan ${n} reportes por aprobar.`;

// Única excepción a que el estado de un reporte cambie solo con /transiciones (regla 3): igual revisa transicion_estado.
export async function cerrarPeriodo(id, cuerpo, req) {
  revisarCampos(cuerpo ?? {}, []);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const periodoId = Number(id);
  const { usuario } = req;
  const contexto = contextoAuditoria(req);

  const resultado = await enTransaccion(async (conexion) => {
    // Primera consulta de la transacción: crear un reporte (FOR SHARE) y otro cierre del mismo mes esperan aquí.
    const [[cierre]] = await conexion.query(
      'SELECT id, estado FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = ? FOR UPDATE',
      [periodoId, usuario.ddrissId ?? 0],
    );
    if (!cierre) throw errores.noEncontrado();
    if (cierre.estado === 'ABIERTO') throw errores.abierto();
    if (cierre.estado === 'CERRADO') throw errores.yaCerrado();

    // Todos los reportes del mes, para que un envío o un guardado en curso termine antes o espere y vea el mes cerrado.
    const [reportes] = await conexion.query(
      `SELECT r.id, r.estado, ${EN_CICLO} AS en_ciclo
         FROM reporte_produccion r JOIN establecimiento e ON e.id = r.establecimiento_id
        WHERE r.periodo_id = ? AND e.ddriss_id = ?
        FOR UPDATE OF r`,
      [periodoId, usuario.ddrissId],
    );
    const pendientes = reportes.filter((r) => r.en_ciclo).length;
    if (pendientes > 0) return { pendientes };

    const [[transicion]] = await conexion.query(
      `SELECT 1 AS hay FROM transicion_estado t JOIN rol r ON r.id = t.rol_id
        WHERE t.estado_origen = 'APROBADO' AND t.estado_destino = 'CERRADO' AND r.codigo = ?`,
      [usuario.rol],
    );
    if (!transicion) throw errores.noPermitida();

    const aprobados = reportes.filter((r) => r.estado === 'APROBADO').map((r) => r.id);
    if (aprobados.length > 0) {
      await conexion.query(
        `UPDATE reporte_produccion SET estado = 'CERRADO', cerrado_en = NOW(), version_fila = version_fila + 1
          WHERE id IN (?)`,
        [aprobados],
      );
      await conexion.query(
        'INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, usuario_id, comentario) VALUES ?',
        [aprobados.map((reporteId) => [reporteId, 'APROBADO', 'CERRADO', usuario.id, 'Cierre del periodo.'])],
      );
      for (const reporteId of aprobados) {
        await registrarBitacora(conexion, {
          ...contexto,
          modulo: MODULOS.REVISION,
          accion: ACCIONES.CAMBIO_ESTADO,
          entidad: 'reporte_produccion',
          entidadId: reporteId,
          valoresAnteriores: { estado: 'APROBADO' },
          valoresNuevos: { estado: 'CERRADO', cierrePeriodoId: cierre.id },
        });
      }
    }
    await conexion.query("UPDATE cierre_periodo SET estado = 'CERRADO', cerrado_por = ?, cerrado_en = NOW() WHERE id = ?", [
      usuario.id,
      cierre.id,
    ]);
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.REVISION,
      accion: ACCIONES.ACTUALIZAR,
      entidad: 'cierre_periodo',
      entidadId: cierre.id,
      valoresAnteriores: { estado: 'EN_CIERRE' },
      valoresNuevos: { estado: 'CERRADO', reportesCerrados: aprobados.length },
    });
    return { reportesCerrados: aprobados.length };
  });

  if (resultado.pendientes) return { pendientes: resultado.pendientes };
  const [periodo] = await buscarPeriodos(pool, usuario, { id: periodoId });
  return { periodo: { ...periodo, reportesCerrados: resultado.reportesCerrados } };
}

// El mes pasa a EN_CIERRE el día después de su fecha límite, en todas las DDRISS. hoy es un parámetro para que las
// pruebas usen una fecha fija y solo alcancen sus propios meses.
export async function pasarMesesVencidos(hoy = hoyGuatemala()) {
  return enTransaccion(async (conexion) => {
    const [vencidos] = await conexion.query(
      "SELECT id FROM cierre_periodo WHERE estado = 'ABIERTO' AND fecha_limite_envio < ? FOR UPDATE",
      [hoy],
    );
    if (vencidos.length === 0) return 0;
    await conexion.query("UPDATE cierre_periodo SET estado = 'EN_CIERRE' WHERE id IN (?)", [vencidos.map((f) => f.id)]);
    for (const { id } of vencidos) {
      await registrarBitacora(conexion, {
        usuarioId: null,
        modulo: MODULOS.CONFIGURACION,
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'cierre_periodo',
        entidadId: id,
        valoresAnteriores: { estado: 'ABIERTO' },
        valoresNuevos: { estado: 'EN_CIERRE' },
      });
    }
    return vencidos.length;
  });
}

// La arranca server.js y no app.js, así las pruebas no la corren. Un fallo (una base apagada) no detiene la API.
export function iniciarTareaDeCierre() {
  const correr = () =>
    pasarMesesVencidos().catch((err) => console.error('No se pudieron pasar los meses vencidos a EN_CIERRE:', err));
  correr();
  return setInterval(correr, INTERVALO_MS);
}
