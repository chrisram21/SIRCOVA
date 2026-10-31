import { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { revisarPermiso } from '../../middlewares/permisos.js';
import { registrarBitacora, contextoAuditoria, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos } from '../catalogos/catalogos.service.js';
import { leerReporte } from '../produccion/validacion.service.js';
import { revisorDeLaDdriss } from './bandeja.service.js';

// SPEC 35: el revisor asignado pasa un reporte EN_REVISION a otro revisor. No es una transición: no escribe historial.

const errores = {
  noEnRevision: () => new ErrorApi(409, 'REPORTE_NO_EN_REVISION', 'El reporte no está en revisión.'),
  noAsignado: () =>
    new ErrorApi(403, 'NO_ES_REVISOR_ASIGNADO', 'Solo el revisor asignado puede pasar el reporte a otro revisor.'),
  revisorInvalido: () =>
    new ErrorApi(422, 'REVISOR_INVALIDO', 'El revisor elegido no es un revisor activo de la DDRISS del reporte.'),
  mismoRevisor: () => new ErrorApi(422, 'REVISOR_INVALIDO', 'El reporte ya está asignado a ese revisor.'),
  desactualizado: () =>
    new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'),
};

function leerPedido(id, cuerpo) {
  revisarCampos(cuerpo, ['revisorId', 'versionFila']);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const { revisorId, versionFila } = cuerpo;
  if (revisorId === undefined) throw entradaInvalida('El campo revisorId es obligatorio.');
  if (!Number.isInteger(revisorId) || revisorId <= 0) throw entradaInvalida('revisorId debe ser un número entero positivo.');
  if (versionFila === undefined) throw entradaInvalida('El campo versionFila es obligatorio.');
  if (!Number.isInteger(versionFila) || versionFila <= 0) throw entradaInvalida('versionFila debe ser un número entero positivo.');
  return { id: Number(id), revisorId, versionFila };
}

// El permiso se revisa después del cuerpo, como en las transiciones (orden de errores del contrato).
export async function reasignarRevisor(id, cuerpo, req) {
  const pedido = leerPedido(id, cuerpo);
  await revisarPermiso(req, 'REPORTE_ASIGNAR');
  const { usuario } = req;
  const reporte = await leerReporte(pedido.id, usuario);

  return enTransaccion(async (conexion) => {
    // Primera consulta de la transacción (nota del 2026-10-23): dos cambios del mismo reporte se ordenan aquí.
    const [[bloqueado]] = await conexion.query(
      'SELECT estado, version_fila, revisor_id FROM reporte_produccion WHERE id = ? FOR UPDATE',
      [reporte.id],
    );
    if (bloqueado.estado !== 'EN_REVISION') throw errores.noEnRevision();
    if (bloqueado.revisor_id !== usuario.id) throw errores.noAsignado();
    if (pedido.revisorId === bloqueado.revisor_id) throw errores.mismoRevisor();
    const revisor = await revisorDeLaDdriss(conexion, pedido.revisorId, reporte.ddriss_id);
    if (!revisor) throw errores.revisorInvalido();
    if (bloqueado.version_fila !== pedido.versionFila) throw errores.desactualizado();

    await conexion.query(
      'UPDATE reporte_produccion SET revisor_id = ?, asignado_en = NOW(), version_fila = version_fila + 1 WHERE id = ?',
      [revisor.id, reporte.id],
    );
    await registrarBitacora(conexion, {
      ...contextoAuditoria(req),
      modulo: MODULOS.REVISION,
      accion: ACCIONES.ACTUALIZAR,
      entidad: 'reporte_produccion',
      entidadId: reporte.id,
      valoresAnteriores: { revisorId: bloqueado.revisor_id },
      valoresNuevos: { revisorId: revisor.id },
    });
    return { versionFila: bloqueado.version_fila + 1, revisor };
  });
}
