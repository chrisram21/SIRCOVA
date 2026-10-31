import { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { revisarPermiso } from '../../middlewares/permisos.js';
import { registrarBitacora, contextoAuditoria, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos } from '../catalogos/catalogos.service.js';
import { reglasQueAplican } from '../configuracion/reglas.service.js';
import { MESES_EDITABLES } from '../produccion/captura.service.js';
import { ESTADOS_REPORTE, obtenerReporte } from '../produccion/reportes.service.js';
import { corridaEnTransaccion, leerReporte } from '../produccion/validacion.service.js';
import { revisorDeLaDdriss } from './bandeja.service.js';

// Cada spec de revisión agrega su destino; uno que no está aquí responde 422 TRANSICION_NO_DISPONIBLE.
const PERMISO_POR_DESTINO = { ENVIADO: 'REPORTE_ENVIAR', EN_REVISION: 'REPORTE_ASIGNAR' };
const LARGO_COMENTARIO = 1000;

const errores = {
  noDisponible: () => new ErrorApi(422, 'TRANSICION_NO_DISPONIBLE', 'Esa transición todavía no está disponible.'),
  noPermitida: (origen, destino) =>
    new ErrorApi(422, 'TRANSICION_NO_PERMITIDA', `El reporte no puede pasar de ${origen} a ${destino}.`),
  comentarioRequerido: () => new ErrorApi(422, 'COMENTARIO_REQUERIDO', 'Esta transición requiere un comentario.'),
  periodoCerrado: () => new ErrorApi(409, 'PERIODO_CERRADO', 'El mes ya está cerrado.'),
  desactualizado: () =>
    new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'),
  revisorInvalido: () =>
    new ErrorApi(422, 'REVISOR_INVALIDO', 'El revisor elegido no es un revisor activo de la DDRISS del reporte.'),
};

function leerPedido(id, cuerpo) {
  revisarCampos(cuerpo, ['estadoDestino', 'versionFila', 'comentario', 'revisorId']);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const { estadoDestino, versionFila, comentario, revisorId } = cuerpo;
  if (estadoDestino === undefined) throw entradaInvalida('El campo estadoDestino es obligatorio.');
  if (!ESTADOS_REPORTE.includes(estadoDestino)) throw entradaInvalida('El estado destino no es válido.');
  if (versionFila === undefined) throw entradaInvalida('El campo versionFila es obligatorio.');
  if (!Number.isInteger(versionFila) || versionFila <= 0) throw entradaInvalida('versionFila debe ser un número entero positivo.');
  if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
    throw entradaInvalida('comentario debe ser un texto.');
  }
  const texto = comentario?.trim() || null;
  if (texto && texto.length > LARGO_COMENTARIO) {
    throw entradaInvalida(`comentario no puede tener más de ${LARGO_COMENTARIO} caracteres.`);
  }
  if (estadoDestino === 'EN_REVISION') {
    if (revisorId === undefined) throw entradaInvalida('El campo revisorId es obligatorio para asignar el reporte.');
    if (!Number.isInteger(revisorId) || revisorId <= 0) throw entradaInvalida('revisorId debe ser un número entero positivo.');
  } else if (revisorId !== undefined) {
    throw entradaInvalida('revisorId solo se usa al asignar el reporte (EN_REVISION).');
  }
  return { id: Number(id), estadoDestino, versionFila, comentario: texto, revisorId: revisorId ?? null };
}

async function nombresDeEstados(conexion, codigos) {
  const [filas] = await conexion.query('SELECT codigo, nombre FROM estado_reporte WHERE codigo IN (?)', [codigos]);
  const nombres = new Map(filas.map((f) => [f.codigo, f.nombre]));
  return codigos.map((c) => nombres.get(c) ?? c);
}

const mensajeConErrores = (n) =>
  n === 1
    ? 'El reporte tiene 1 error de validación. Corríjalo para poder enviarlo.'
    : `El reporte tiene ${n} errores de validación. Corríjalos para poder enviarlo.`;

// Devuelve { reporte } con el reporte ya en el destino, o { rechazo } si al enviar quedan errores: en ese caso la
// transacción se confirma igual, para que queden los resultados de la corrida, y el controlador responde 422.
export async function cambiarEstado(id, cuerpo, req) {
  const pedido = leerPedido(id, cuerpo);
  const permiso = PERMISO_POR_DESTINO[pedido.estadoDestino];
  if (!permiso) throw errores.noDisponible();
  await revisarPermiso(req, permiso);

  const { usuario } = req;
  const contexto = contextoAuditoria(req);
  const reporte = await leerReporte(pedido.id, usuario);
  const enviar = pedido.estadoDestino === 'ENVIADO';
  const asignar = pedido.estadoDestino === 'EN_REVISION';
  // Las versiones publicadas no cambian (regla 5): se pueden leer antes del bloqueo.
  const reglas = enviar ? await reglasQueAplican(reporte.ddriss_codigo) : null;

  const rechazo = await enTransaccion(async (conexion) => {
    // Primera consulta de la transacción (nota del 2026-10-23): un guardado o un envío del mismo reporte se ordenan aquí.
    const [[bloqueado]] = await conexion.query(
      'SELECT estado, version_fila FROM reporte_produccion WHERE id = ? FOR UPDATE',
      [reporte.id],
    );
    const [[transicion]] = await conexion.query(
      `SELECT t.requiere_comentario FROM transicion_estado t JOIN rol r ON r.id = t.rol_id
        WHERE t.estado_origen = ? AND t.estado_destino = ? AND r.codigo = ?`,
      [bloqueado.estado, pedido.estadoDestino, usuario.rol],
    );
    if (!transicion) {
      throw errores.noPermitida(...(await nombresDeEstados(conexion, [bloqueado.estado, pedido.estadoDestino])));
    }
    if (transicion.requiere_comentario && !pedido.comentario) throw errores.comentarioRequerido();
    if (enviar) {
      const [[cierre]] = await conexion.query(
        'SELECT estado FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = ?',
        [reporte.periodo_id, reporte.ddriss_id],
      );
      if (!MESES_EDITABLES.includes(cierre?.estado)) throw errores.periodoCerrado();
    }
    if (bloqueado.version_fila !== pedido.versionFila) throw errores.desactualizado();

    let resumen = {};
    const cambios = [];
    if (asignar) {
      const revisor = await revisorDeLaDdriss(conexion, pedido.revisorId, reporte.ddriss_id);
      if (!revisor) throw errores.revisorInvalido();
      cambios.push(['revisor_id = ?', revisor.id], ['asignado_en = NOW()']);
      resumen = { revisorId: revisor.id };
    }
    if (enviar) {
      const validacion = await corridaEnTransaccion(conexion, reporte, reglas, contexto);
      if (validacion.errores > 0) return { mensaje: mensajeConErrores(validacion.errores), validacion };
      resumen = { errores: 0, advertencias: validacion.advertencias };
      cambios.push(['enviado_en = NOW()']);
    }

    await conexion.query(
      `UPDATE reporte_produccion
          SET ${['estado = ?', 'version_fila = version_fila + 1', ...cambios.map(([sql]) => sql)].join(', ')}
        WHERE id = ?`,
      [pedido.estadoDestino, ...cambios.flatMap(([, ...valores]) => valores), reporte.id],
    );
    await conexion.query(
      `INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, usuario_id, comentario)
       VALUES (?, ?, ?, ?, ?)`,
      [reporte.id, bloqueado.estado, pedido.estadoDestino, usuario.id, pedido.comentario],
    );
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.REVISION,
      accion: ACCIONES.CAMBIO_ESTADO,
      entidad: 'reporte_produccion',
      entidadId: reporte.id,
      valoresAnteriores: { estado: bloqueado.estado },
      valoresNuevos: { estado: pedido.estadoDestino, ...resumen },
    });
    return null;
  });

  if (rechazo) return { rechazo };
  return { reporte: await obtenerReporte(reporte.id, usuario) };
}
