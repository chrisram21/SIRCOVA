import pool, { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, contextoAuditoria, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { filtroAlcance, verificarAlcance } from '../auth/alcance.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import {
  CANTIDAD_MAXIMA,
  celdasGuardadas,
  formularioDeVacuna,
  leerReporte,
  llaveDeCelda,
  nombreDeCelda,
  revisarCeldas,
  revisarContraActuales,
} from '../produccion/captura.service.js';
import { claveCombinacion } from '../produccion/celdas.service.js';

const LARGO_MOTIVO = 1000; // solicitud_rectificacion.motivo
const MAXIMO_CAMBIOS = 500;
const GRUPO_EDAD = 'grupo_edad';
const ESTADOS = ['PENDIENTE', 'AUTORIZADA', 'RECHAZADA', 'APLICADA'];

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  noCerrado: () => new ErrorApi(409, 'REPORTE_NO_CERRADO', 'Solo se rectifican reportes cerrados.'),
  desactualizado: () =>
    new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'),
  vacunaNoEnReporte: () => new ErrorApi(422, 'CELDA_INVALIDA', 'Una celda es de una vacuna que no está en el reporte.'),
  sinDiferencia: (nombre) => new ErrorApi(422, 'CAMBIO_SIN_DIFERENCIA', `La celda ${nombre} ya tiene esa cantidad.`),
};

export const mensajePendiente = 'El reporte ya tiene una solicitud de rectificación pendiente.';

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());
const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

function leerCambio(cambio) {
  if (!esObjeto(cambio)) throw entradaInvalida('Cada cambio debe ser un objeto.');
  revisarCampos(cambio, ['vacunaId', 'dosisCodigo', 'municipioProcedenciaId', 'dimensiones', 'cantidadNueva']);
  const { vacunaId, dosisCodigo, municipioProcedenciaId, dimensiones, cantidadNueva } = cambio;
  if (!Number.isInteger(vacunaId) || vacunaId <= 0) throw entradaInvalida('vacunaId debe ser un número entero positivo.');
  if (typeof dosisCodigo !== 'string' || dosisCodigo === '') throw entradaInvalida('dosisCodigo debe ser un texto.');
  if (!Number.isInteger(municipioProcedenciaId) || municipioProcedenciaId <= 0) {
    throw entradaInvalida('municipioProcedenciaId debe ser un número entero positivo.');
  }
  if (!esObjeto(dimensiones) || Object.values(dimensiones).some((v) => typeof v !== 'string' || v === '')) {
    throw entradaInvalida('dimensiones debe ser un objeto con un código de valor por dimensión.');
  }
  if (!Number.isInteger(cantidadNueva) || cantidadNueva < 0 || cantidadNueva > CANTIDAD_MAXIMA) {
    throw entradaInvalida('La cantidad nueva de cada celda debe ser un número entero mayor o igual a 0.');
  }
  return { vacunaId, dosisCodigo, municipioProcedenciaId, dimensiones, cantidadNueva };
}

function leerPedido(id, cuerpo) {
  revisarCampos(cuerpo, ['motivo', 'versionFila', 'cambios']);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const { motivo, versionFila, cambios } = cuerpo;
  if (motivo !== undefined && typeof motivo !== 'string') throw entradaInvalida('motivo debe ser un texto.');
  const texto = motivo?.trim();
  if (!texto) throw entradaInvalida('La justificación es obligatoria.');
  if (texto.length > LARGO_MOTIVO) {
    throw entradaInvalida(`La justificación no puede tener más de ${LARGO_MOTIVO} caracteres.`);
  }
  if (!Number.isInteger(versionFila) || versionFila <= 0) throw entradaInvalida('versionFila debe ser un número entero positivo.');
  if (!Array.isArray(cambios) || cambios.length === 0 || cambios.length > MAXIMO_CAMBIOS) {
    throw entradaInvalida(`cambios debe tener entre 1 y ${MAXIMO_CAMBIOS} celdas.`);
  }
  const leidos = cambios.map(leerCambio);
  const vistas = new Set();
  for (const c of leidos) {
    const llave = `${c.vacunaId}|${c.dosisCodigo}|${c.municipioProcedenciaId}|${claveCombinacion(c.dimensiones)}`;
    if (vistas.has(llave)) throw entradaInvalida('Una celda está repetida en los cambios.');
    vistas.add(llave);
  }
  return { id: Number(id), motivo: texto, versionFila, cambios: leidos };
}

// Las celdas de cada vacuna se revisan con las reglas del guardado; la cantidad anterior sale de la base, nunca del
// cliente, y una celda que no existe vale 0.
async function revisarCambios(conexion, reporte, cambios) {
  const [repVacs] = await conexion.query('SELECT id, vacuna_id, esquema_mongo_id FROM reporte_vacuna WHERE reporte_id = ?', [
    reporte.id,
  ]);
  const porVacuna = new Map(repVacs.map((rv) => [rv.vacuna_id, rv]));
  if (cambios.some((c) => !porVacuna.has(c.vacunaId))) throw errores.vacunaNoEnReporte();

  const filas = [];
  for (const repVac of repVacs) {
    const deLaVacuna = cambios.filter((c) => c.vacunaId === repVac.vacuna_id);
    if (deLaVacuna.length === 0) continue;
    const formulario = await formularioDeVacuna(reporte, repVac);
    const { pedidas, heredadas } = revisarCeldas(
      deLaVacuna.map((c) => ({ ...c, cantidad: c.cantidadNueva })),
      formulario,
    );
    const actuales = await celdasGuardadas(conexion, [repVac.id]);
    revisarContraActuales({ pedidas, heredadas, actuales, dosis: formulario.dosis, catalogo: formulario.catalogo });
    const porLlave = new Map(actuales.map((c) => [llaveDeCelda(c), c]));
    for (const celda of pedidas) {
      const actual = porLlave.get(llaveDeCelda(celda));
      const cantidadAnterior = actual?.cantidad ?? 0;
      if (cantidadAnterior === celda.cantidadNueva) {
        throw errores.sinDiferencia(nombreDeCelda(celda, formulario.dosis, formulario.catalogo));
      }
      filas.push({
        detalleId: actual?.id ?? null,
        reporteVacunaId: repVac.id,
        vacunaId: repVac.vacuna_id,
        dosisId: formulario.dosis.get(celda.dosisCodigo).id,
        dosisCodigo: celda.dosisCodigo,
        municipioProcedenciaId: celda.municipioProcedenciaId,
        claveCombinacion: celda.claveCombinacion,
        cantidadAnterior,
        cantidadNueva: celda.cantidadNueva,
      });
    }
  }
  return filas;
}

// Un reporte con una solicitud PENDIENTE devuelve { pendiente } y el controlador arma el 409 con su id.
export async function solicitarRectificacion(id, cuerpo, req) {
  const pedido = leerPedido(id, cuerpo);
  const reporte = await leerReporte(pool, pedido.id, req.usuario);
  const contexto = contextoAuditoria(req);

  return enTransaccion(async (conexion) => {
    // Primera consulta de la transacción: dos solicitudes del mismo reporte se ordenan aquí.
    const [[bloqueado]] = await conexion.query(
      'SELECT estado, version_fila FROM reporte_produccion WHERE id = ? FOR UPDATE',
      [reporte.id],
    );
    if (bloqueado.estado !== 'CERRADO') throw errores.noCerrado();
    const [[pendiente]] = await conexion.query(
      "SELECT id FROM solicitud_rectificacion WHERE reporte_id = ? AND estado = 'PENDIENTE' ORDER BY id LIMIT 1",
      [reporte.id],
    );
    if (pendiente) return { pendiente: pendiente.id };
    if (bloqueado.version_fila !== pedido.versionFila) throw errores.desactualizado();

    const filas = await revisarCambios(conexion, reporte, pedido.cambios);
    const [solicitud] = await conexion.query(
      "INSERT INTO solicitud_rectificacion (reporte_id, solicitado_por, motivo, estado) VALUES (?, ?, ?, 'PENDIENTE')",
      [reporte.id, contexto.usuarioId, pedido.motivo],
    );
    await conexion.query(
      `INSERT INTO rectificacion_detalle
         (solicitud_id, detalle_id, reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion,
          cantidad_anterior, cantidad_nueva)
       VALUES ?`,
      [
        filas.map((f) => [
          solicitud.insertId,
          f.detalleId,
          f.reporteVacunaId,
          f.dosisId,
          f.municipioProcedenciaId,
          f.claveCombinacion,
          f.cantidadAnterior,
          f.cantidadNueva,
        ]),
      ],
    );
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.RECTIFICACION,
      accion: ACCIONES.CREAR,
      entidad: 'solicitud_rectificacion',
      entidadId: solicitud.insertId,
      valoresNuevos: {
        reporteId: reporte.id,
        motivo: pedido.motivo,
        estado: 'PENDIENTE',
        cambios: filas.map((f) => ({
          vacunaId: f.vacunaId,
          dosisCodigo: f.dosisCodigo,
          municipioProcedenciaId: f.municipioProcedenciaId,
          claveCombinacion: f.claveCombinacion,
          cantidadAnterior: f.cantidadAnterior,
          cantidadNueva: f.cantidadNueva,
        })),
      },
    });
    return { solicitud: (await leerSolicitud(conexion, solicitud.insertId)).solicitud };
  });
}

// "grupo_edad=MENOR_1|sexo=F" → [['grupo_edad', 'MENOR_1'], ['sexo', 'F']]
const paresDeClave = (clave) => (clave === '' ? [] : clave.split('|').map((par) => par.split('=')));

async function etiquetasDeDimensiones(claves) {
  const codigos = [...new Set(claves.flatMap((clave) => paresDeClave(clave).map(([codigo]) => codigo)))];
  if (codigos.length === 0) return new Map();
  const db = await obtenerDb();
  const documentos = await db.collection('catalogo_dimensiones').find({ codigo: { $in: codigos } }).toArray();
  return new Map(documentos.map((d) => [d.codigo, d]));
}

// Como en el formulario: el grupo de edad primero y las demás por código.
function dimensionesDeClave(clave, catalogo) {
  return paresDeClave(clave)
    .sort(([a], [b]) => (b === GRUPO_EDAD) - (a === GRUPO_EDAD) || a.localeCompare(b))
    .map(([codigo, valor]) => {
      const dimension = catalogo.get(codigo);
      return {
        codigo,
        nombre: dimension?.nombre ?? codigo,
        valor,
        etiqueta: dimension?.valores.find((v) => v.codigo === valor)?.etiqueta ?? valor,
      };
    });
}

const aPersona = (id, nombre) => (id == null ? null : { id, nombre });

const DESDE_SOLICITUD = `FROM solicitud_rectificacion s
       JOIN reporte_produccion r ON r.id = s.reporte_id
       JOIN establecimiento e ON e.id = r.establecimiento_id
       JOIN periodo p ON p.id = r.periodo_id
       JOIN usuario us ON us.id = s.solicitado_por
       JOIN empleado es ON es.id = us.empleado_id
       LEFT JOIN usuario ur ON ur.id = s.resuelto_por
       LEFT JOIN empleado er ON er.id = ur.empleado_id`;

const aReporte = (f) => ({
  id: f.reporte_id,
  establecimiento: { id: f.establecimiento_id, codigo: f.establecimiento_codigo, nombre: f.establecimiento_nombre },
  periodo: { id: f.periodo_id, anio: f.anio, mes: f.mes },
  estado: f.reporte_estado,
});

// La solicitud completa y, aparte, su ámbito: el ámbito lo revisa quien la pide.
async function leerSolicitud(ejecutor, id) {
  const [[fila]] = await ejecutor.query(
    `SELECT s.id, s.estado, s.motivo, s.comentario_resolucion, s.solicitado_por, s.resuelto_por,
            UNIX_TIMESTAMP(s.solicitado_en) AS solicitado_en, UNIX_TIMESTAMP(s.resuelto_en) AS resuelto_en,
            UNIX_TIMESTAMP(s.aplicado_en) AS aplicado_en,
            CONCAT(es.nombres, ' ', es.apellidos) AS solicitado_nombre,
            CONCAT(er.nombres, ' ', er.apellidos) AS resuelto_nombre,
            r.id AS reporte_id, r.estado AS reporte_estado, e.id AS establecimiento_id, e.codigo AS establecimiento_codigo,
            e.nombre AS establecimiento_nombre, e.ddriss_id, p.id AS periodo_id, p.anio, p.mes
       ${DESDE_SOLICITUD}
      WHERE s.id = ?`,
    [id],
  );
  if (!fila) return null;
  const [cambios] = await ejecutor.query(
    `SELECT rd.detalle_id, rd.municipio_procedencia_id, m.nombre AS municipio_nombre, rd.clave_combinacion,
            rd.cantidad_anterior, rd.cantidad_nueva, v.id AS vacuna_id, v.codigo AS vacuna_codigo,
            v.nombre AS vacuna_nombre, d.codigo AS dosis_codigo, d.nombre AS dosis_nombre
       FROM rectificacion_detalle rd
       JOIN reporte_vacuna rv ON rv.id = rd.reporte_vacuna_id
       JOIN vacuna v ON v.id = rv.vacuna_id
       JOIN dosis d ON d.id = rd.dosis_id
       JOIN municipio m ON m.id = rd.municipio_procedencia_id
      WHERE rd.solicitud_id = ?
      ORDER BY v.orden_informe, v.nombre, d.orden, rd.municipio_procedencia_id, rd.clave_combinacion`,
    [id],
  );
  const catalogo = await etiquetasDeDimensiones(cambios.map((c) => c.clave_combinacion));
  const solicitud = {
    id: fila.id,
    reporte: aReporte(fila),
    estado: fila.estado,
    motivo: fila.motivo,
    solicitadoPor: aPersona(fila.solicitado_por, fila.solicitado_nombre),
    solicitadoEn: aFechaIso(fila.solicitado_en),
    resueltoPor: aPersona(fila.resuelto_por, fila.resuelto_nombre),
    comentarioResolucion: fila.comentario_resolucion ?? null,
    resueltoEn: aFechaIso(fila.resuelto_en),
    aplicadoEn: aFechaIso(fila.aplicado_en),
    cambios: cambios.map((c) => ({
      vacuna: { id: c.vacuna_id, codigo: c.vacuna_codigo, nombre: c.vacuna_nombre },
      dosis: { codigo: c.dosis_codigo, nombre: c.dosis_nombre },
      municipioProcedencia: { id: c.municipio_procedencia_id, nombre: c.municipio_nombre },
      dimensiones: dimensionesDeClave(c.clave_combinacion, catalogo),
      claveCombinacion: c.clave_combinacion,
      celdaNueva: c.detalle_id === null,
      cantidadAnterior: c.cantidad_anterior,
      cantidadNueva: c.cantidad_nueva,
    })),
  };
  return { ambito: { establecimientoId: fila.establecimiento_id, ddrissId: fila.ddriss_id }, solicitud };
}

function leerEntero(valor, nombre, { minimo, maximo = Number.MAX_SAFE_INTEGER }) {
  const numero = /^\d+$/.test(valor) ? Number(valor) : NaN;
  if (!(numero >= minimo && numero <= maximo)) {
    throw entradaInvalida(
      maximo === Number.MAX_SAFE_INTEGER
        ? `${nombre} debe ser un número entero mayor o igual a ${minimo}.`
        : `${nombre} debe ser un número entero entre ${minimo} y ${maximo}.`,
    );
  }
  return numero;
}

function leerFiltros(query) {
  revisarParametros(query, ['estado', 'pagina', 'porPagina']);
  const filtros = { pagina: 1, porPagina: 20 };
  if (query.estado !== undefined) {
    if (!ESTADOS.includes(query.estado)) {
      throw entradaInvalida(`estado debe ser ${ESTADOS.slice(0, -1).join(', ')} o ${ESTADOS.at(-1)}.`);
    }
    filtros.estado = query.estado;
  }
  if (query.pagina !== undefined) filtros.pagina = leerEntero(query.pagina, 'pagina', { minimo: 1 });
  if (query.porPagina !== undefined) filtros.porPagina = leerEntero(query.porPagina, 'porPagina', { minimo: 1, maximo: 100 });
  return filtros;
}

// El mismo WHERE sirve para el COUNT y para la página, así total y elementos no se separan.
export async function listarRectificaciones(usuario, query = {}) {
  const filtros = leerFiltros(query);
  const alcance = filtroAlcance(usuario, { establecimiento: 'r.establecimiento_id', ddriss: 'e.ddriss_id' });
  const condiciones = [alcance.condicion];
  const parametros = [...alcance.parametros];
  if (filtros.estado) {
    condiciones.push('s.estado = ?');
    parametros.push(filtros.estado);
  }
  const donde = `WHERE ${condiciones.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${DESDE_SOLICITUD} ${donde}`, parametros);
  const [filas] = await pool.query(
    `SELECT s.id, s.estado, s.motivo, s.solicitado_por, UNIX_TIMESTAMP(s.solicitado_en) AS solicitado_en,
            CONCAT(es.nombres, ' ', es.apellidos) AS solicitado_nombre,
            (SELECT COUNT(*) FROM rectificacion_detalle rd WHERE rd.solicitud_id = s.id) AS cambios,
            r.id AS reporte_id, r.estado AS reporte_estado, e.id AS establecimiento_id,
            e.codigo AS establecimiento_codigo, e.nombre AS establecimiento_nombre, p.id AS periodo_id, p.anio, p.mes
       ${DESDE_SOLICITUD}
       ${donde}
      ORDER BY s.solicitado_en DESC, s.id DESC
      LIMIT ? OFFSET ?`,
    [...parametros, filtros.porPagina, (filtros.pagina - 1) * filtros.porPagina],
  );
  return {
    elementos: filas.map((f) => ({
      id: f.id,
      reporte: aReporte(f),
      estado: f.estado,
      motivo: f.motivo,
      solicitadoPor: aPersona(f.solicitado_por, f.solicitado_nombre),
      solicitadoEn: aFechaIso(f.solicitado_en),
      cambios: Number(f.cambios),
    })),
    total: Number(total),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
  };
}

// Uno que no existe o está fuera del ámbito responde el mismo 404.
export async function obtenerRectificacion(id, usuario) {
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const leida = await leerSolicitud(pool, Number(id));
  if (!leida) throw errores.noEncontrado();
  verificarAlcance(usuario, leida.ambito);
  return leida.solicitud;
}
