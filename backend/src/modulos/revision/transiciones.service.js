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
const PERMISO_POR_DESTINO = {
  ENVIADO: 'REPORTE_ENVIAR',
  EN_REVISION: 'REPORTE_ASIGNAR',
  CORRECCION_SOLICITADA: 'REPORTE_SOLICITAR_CORRECCION',
};
const LARGO_COMENTARIO = 1000;
const LARGO_OBSERVACION = 1000; // observacion_revision.texto

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
  noAsignado: () =>
    new ErrorApi(403, 'NO_ES_REVISOR_ASIGNADO', 'Solo el revisor asignado puede devolver el reporte.'),
  observacionRequerida: () =>
    new ErrorApi(422, 'OBSERVACION_REQUERIDA', 'Escriba al menos una observación para devolver el reporte.'),
  vacunaNoEnReporte: () =>
    new ErrorApi(422, 'VACUNA_NO_EN_REPORTE', 'Una observación es de una vacuna que no está en el reporte.'),
};

// Una general (vacunaId null) y una por vacuna como máximo; que haya al menos una se revisa después (422).
function leerObservaciones(observaciones) {
  if (observaciones === undefined) {
    throw entradaInvalida('El campo observaciones es obligatorio para solicitar la corrección.');
  }
  if (!Array.isArray(observaciones)) throw entradaInvalida('observaciones debe ser una lista.');
  const vistas = new Set();
  return observaciones.map((observacion) => {
    if (observacion === null || typeof observacion !== 'object' || Array.isArray(observacion)) {
      throw entradaInvalida('Cada observación debe ser un objeto con vacunaId y texto.');
    }
    revisarCampos(observacion, ['vacunaId', 'texto']);
    const { vacunaId, texto } = observacion;
    if (vacunaId === undefined) throw entradaInvalida('El campo vacunaId de cada observación es obligatorio.');
    if (vacunaId !== null && (!Number.isInteger(vacunaId) || vacunaId <= 0)) {
      throw entradaInvalida('vacunaId debe ser un número entero positivo o null.');
    }
    if (typeof texto !== 'string' || !texto.trim()) throw entradaInvalida('El texto de cada observación es obligatorio.');
    if (texto.trim().length > LARGO_OBSERVACION) {
      throw entradaInvalida(`El texto de una observación no puede tener más de ${LARGO_OBSERVACION} caracteres.`);
    }
    if (vistas.has(vacunaId)) {
      throw entradaInvalida(
        vacunaId === null ? 'Solo puede haber una observación general.' : 'Solo puede haber una observación por vacuna.',
      );
    }
    vistas.add(vacunaId);
    return { vacunaId, texto: texto.trim() };
  });
}

function leerPedido(id, cuerpo) {
  revisarCampos(cuerpo, ['estadoDestino', 'versionFila', 'comentario', 'revisorId', 'observaciones']);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const { estadoDestino, versionFila, comentario, revisorId, observaciones } = cuerpo;
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
  let leidas = null;
  if (estadoDestino === 'CORRECCION_SOLICITADA') {
    if (comentario !== undefined) {
      throw entradaInvalida('comentario no se usa al solicitar la corrección: escriba las observaciones.');
    }
    leidas = leerObservaciones(observaciones);
  } else if (observaciones !== undefined) {
    throw entradaInvalida('observaciones solo se usa al solicitar la corrección (CORRECCION_SOLICITADA).');
  }
  return {
    id: Number(id),
    estadoDestino,
    versionFila,
    comentario: texto,
    revisorId: revisorId ?? null,
    observaciones: leidas,
  };
}

// El comentario del historial (lo que muestra «Mis reportes»): la observación general o un resumen de las de vacuna.
function comentarioDeObservaciones(observaciones, nombres) {
  const general = observaciones.find((o) => o.vacunaId === null);
  if (general) return general.texto;
  const deVacuna = observaciones.map((o) => nombres.get(o.vacunaId));
  const cuantas = deVacuna.length === 1 ? '1 observación' : `${deVacuna.length} observaciones`;
  return `${cuantas} por vacuna: ${deVacuna.join(', ')}`.slice(0, LARGO_COMENTARIO);
}

// Valida las observaciones contra el reporte bloqueado y las inserta en un solo INSERT: así comparten creado_en,
// que es lo que agrupa cada devolución en GET /reportes/{id}/observaciones.
async function guardarObservaciones(conexion, reporteId, usuarioId, observaciones) {
  if (observaciones.length === 0) throw errores.observacionRequerida();
  const [filas] = await conexion.query(
    `SELECT rv.id, rv.vacuna_id, v.nombre
       FROM reporte_vacuna rv JOIN vacuna v ON v.id = rv.vacuna_id
      WHERE rv.reporte_id = ?
      ORDER BY v.orden_informe, v.nombre`,
    [reporteId],
  );
  const porVacuna = new Map(filas.map((f, i) => [f.vacuna_id, { ...f, orden: i }]));
  if (observaciones.some((o) => o.vacunaId !== null && !porVacuna.has(o.vacunaId))) throw errores.vacunaNoEnReporte();

  const posicion = (o) => (o.vacunaId === null ? -1 : porVacuna.get(o.vacunaId).orden);
  const ordenadas = [...observaciones].sort((a, b) => posicion(a) - posicion(b));
  await conexion.query('INSERT INTO observacion_revision (reporte_id, reporte_vacuna_id, usuario_id, texto) VALUES ?', [
    ordenadas.map((o) => [reporteId, o.vacunaId === null ? null : porVacuna.get(o.vacunaId).id, usuarioId, o.texto]),
  ]);
  const nombres = new Map(filas.map((f) => [f.vacuna_id, f.nombre]));
  return { ordenadas, comentario: comentarioDeObservaciones(ordenadas, nombres) };
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
  const devolver = pedido.estadoDestino === 'CORRECCION_SOLICITADA';
  // Las versiones publicadas no cambian (regla 5): se pueden leer antes del bloqueo.
  const reglas = enviar ? await reglasQueAplican(reporte.ddriss_codigo) : null;

  const rechazo = await enTransaccion(async (conexion) => {
    // Primera consulta de la transacción (nota del 2026-10-23): un guardado o un envío del mismo reporte se ordenan aquí.
    const [[bloqueado]] = await conexion.query(
      'SELECT estado, version_fila, revisor_id FROM reporte_produccion WHERE id = ? FOR UPDATE',
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
    // Al devolver, el comentario lo arman las observaciones.
    if (transicion.requiere_comentario && !devolver && !pedido.comentario) throw errores.comentarioRequerido();
    if (enviar) {
      const [[cierre]] = await conexion.query(
        'SELECT estado FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = ?',
        [reporte.periodo_id, reporte.ddriss_id],
      );
      if (!MESES_EDITABLES.includes(cierre?.estado)) throw errores.periodoCerrado();
    }
    if (bloqueado.version_fila !== pedido.versionFila) throw errores.desactualizado();

    let resumen = {};
    let comentario = pedido.comentario;
    const cambios = [];
    if (devolver) {
      if (bloqueado.revisor_id !== usuario.id) throw errores.noAsignado();
      const guardadas = await guardarObservaciones(conexion, reporte.id, usuario.id, pedido.observaciones);
      comentario = guardadas.comentario;
      resumen = { observaciones: guardadas.ordenadas };
    }
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
      [reporte.id, bloqueado.estado, pedido.estadoDestino, usuario.id, comentario],
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
