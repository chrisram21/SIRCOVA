import pool, { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, contextoAuditoria, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { filtroAlcance, verificarAlcance } from '../auth/alcance.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import {
  CANTIDAD_MAXIMA,
  celdasGuardadas,
  escribirCeldas,
  formularioDeVacuna,
  leerReporte,
  llaveDeCelda,
  nombreDeCelda,
  revisarCeldas,
  revisarContraActuales,
} from '../produccion/captura.service.js';
import { claveCombinacion } from '../produccion/celdas.service.js';
import { calcularSinFallar, mesesCerradosDesde } from '../indicadores/corridas.service.js';

const LARGO_MOTIVO = 1000; // solicitud_rectificacion.motivo
const LARGO_COMENTARIO = 500; // solicitud_rectificacion.comentario_resolucion
const MAXIMO_CAMBIOS = 500;
const GRUPO_EDAD = 'grupo_edad';
const CAMPO_TOTAL = 'total_dosis_declarado'; // el que compara la regla TOTAL_CUADRA
const ESTADOS = ['PENDIENTE', 'AUTORIZADA', 'RECHAZADA', 'APLICADA'];

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  noCerrado: () => new ErrorApi(409, 'REPORTE_NO_CERRADO', 'Solo se rectifican reportes cerrados.'),
  desactualizado: () =>
    new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'),
  vacunaNoEnReporte: () => new ErrorApi(422, 'CELDA_INVALIDA', 'Una celda es de una vacuna que no está en el reporte.'),
  sinDiferencia: (nombre) => new ErrorApi(422, 'CAMBIO_SIN_DIFERENCIA', `La celda ${nombre} ya tiene esa cantidad.`),
  resuelta: () => new ErrorApi(409, 'RECTIFICACION_RESUELTA', 'La solicitud ya fue resuelta.'),
  desactualizada: () =>
    new ErrorApi(
      409,
      'RECTIFICACION_DESACTUALIZADA',
      'Los datos del reporte cambiaron desde la solicitud; rechácela y pida otra.',
    ),
  sinCambios: () => new ErrorApi(422, 'RECTIFICACION_SIN_CAMBIOS', 'La solicitud no tiene cambios que aplicar.'),
  noPermitida: (origen, destino) =>
    new ErrorApi(422, 'TRANSICION_NO_PERMITIDA', `El reporte no puede pasar de ${origen} a ${destino}.`),
};

export const mensajePendiente = 'El reporte ya tiene una solicitud de rectificación pendiente.';

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

export const UMBRAL_RECTIFICACIONES_MES = 5;
export const RELOJ = { ahora: () => new Date() };
const DESFASE_GUATEMALA_HORAS = 6; // UTC−6, sin horario de verano

export function mesGuatemala(fecha) {
  const local = new Date(fecha.getTime() - DESFASE_GUATEMALA_HORAS * 3600 * 1000);
  return { anio: local.getUTCFullYear(), mes: local.getUTCMonth() + 1 };
}

// Límites del mes de Guatemala en segundos UTC, para FROM_UNIXTIME.
function limitesDelMes({ anio, mes }) {
  const inicio = Date.UTC(anio, mes - 1, 1, DESFASE_GUATEMALA_HORAS) / 1000;
  const fin = Date.UTC(anio, mes, 1, DESFASE_GUATEMALA_HORAS) / 1000;
  return [inicio, fin];
}

export async function contarSolicitudesDelMes(ejecutor, establecimientoId, mes) {
  const [[{ cantidad }]] = await ejecutor.query(
    `SELECT COUNT(*) AS cantidad
       FROM solicitud_rectificacion s
       JOIN reporte_produccion r ON r.id = s.reporte_id
      WHERE r.establecimiento_id = ?
        AND s.solicitado_en >= FROM_UNIXTIME(?) AND s.solicitado_en < FROM_UNIXTIME(?)`,
    [establecimientoId, ...limitesDelMes(mes)],
  );
  return Number(cantidad);
}

export async function conteoDelMes(id, usuario) {
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const reporte = await leerReporte(pool, id, usuario);
  const [[{ establecimiento_id: establecimientoId }]] = await pool.query(
    'SELECT establecimiento_id FROM reporte_produccion WHERE id = ?',
    [reporte.id],
  );
  const mes = mesGuatemala(RELOJ.ahora());
  const cantidad = await contarSolicitudesDelMes(pool, establecimientoId, mes);
  return { ...mes, cantidad, umbral: UMBRAL_RECTIFICACIONES_MES };
}

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

// Las vacunas cuyo total declarado por el establecimiento (campo adicional) ya no cuadraría con la suma de sus celdas
// después de aplicar. reporte_vacuna.total_declarado no sirve: la captura lo guarda como esa misma suma.
async function totalesQueNoCuadran(ejecutor, cambios) {
  if (cambios.length === 0) return [];
  const diferencias = new Map();
  for (const c of cambios) {
    const previa = diferencias.get(c.reporte_vacuna_id) ?? 0;
    diferencias.set(c.reporte_vacuna_id, previa + c.cantidad_nueva - c.cantidad_anterior);
  }
  const [filas] = await ejecutor.query(
    `SELECT rv.id, v.id AS vacuna_id, v.nombre AS vacuna_nombre, rv.datos_adicionales,
            (SELECT COALESCE(SUM(dp.cantidad), 0) FROM detalle_produccion dp WHERE dp.reporte_vacuna_id = rv.id) AS suma
       FROM reporte_vacuna rv
       JOIN vacuna v ON v.id = rv.vacuna_id
      WHERE rv.id IN (?)
      ORDER BY v.orden_informe, v.nombre`,
    [[...diferencias.keys()]],
  );
  return filas
    .map((f) => {
      const sumaActual = Number(f.suma);
      return {
        vacunaId: f.vacuna_id,
        vacuna: f.vacuna_nombre,
        totalDeclarado: f.datos_adicionales?.[CAMPO_TOTAL],
        sumaActual,
        sumaConCambios: sumaActual + diferencias.get(f.id),
      };
    })
    .filter((t) => typeof t.totalDeclarado === 'number' && t.totalDeclarado !== t.sumaConCambios);
}

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
    `SELECT rd.detalle_id, rd.reporte_vacuna_id, rd.municipio_procedencia_id, m.nombre AS municipio_nombre, rd.clave_combinacion,
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
  if (fila.estado === 'PENDIENTE') solicitud.totales = await totalesQueNoCuadran(ejecutor, cambios);
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

function leerResolucion(id, cuerpo, obligatorio) {
  revisarCampos(cuerpo ?? {}, ['comentario']);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  const comentario = cuerpo?.comentario;
  if (comentario !== undefined && comentario !== null && typeof comentario !== 'string') {
    throw entradaInvalida('comentario debe ser un texto.');
  }
  const texto = comentario?.trim() || null;
  if (obligatorio && !texto) throw entradaInvalida('El motivo del rechazo es obligatorio.');
  if (texto?.length > LARGO_COMENTARIO) {
    const nombre = obligatorio ? 'El motivo del rechazo' : 'El comentario';
    throw entradaInvalida(`${nombre} no puede tener más de ${LARGO_COMENTARIO} caracteres.`);
  }
  return { id: Number(id), comentario: texto };
}

// Fuera de la transacción, para bloquear después el reporte antes que la solicitud.
async function reporteDeSolicitud(id, usuario) {
  const [[fila]] = await pool.query(
    `SELECT s.reporte_id, r.establecimiento_id, e.ddriss_id
       FROM solicitud_rectificacion s
       JOIN reporte_produccion r ON r.id = s.reporte_id
       JOIN establecimiento e ON e.id = r.establecimiento_id
      WHERE s.id = ?`,
    [id],
  );
  if (!fila) throw errores.noEncontrado();
  verificarAlcance(usuario, { establecimientoId: fila.establecimiento_id, ddrissId: fila.ddriss_id });
  return fila.reporte_id;
}

// Primera consulta de la transacción, en el mismo orden que solicitarRectificacion: el reporte y luego la solicitud.
async function bloquear(conexion, reporteId, solicitudId) {
  const [[reporte]] = await conexion.query(
    'SELECT estado, numero_rectificacion FROM reporte_produccion WHERE id = ? FOR UPDATE',
    [reporteId],
  );
  const [[solicitud]] = await conexion.query('SELECT estado FROM solicitud_rectificacion WHERE id = ? FOR UPDATE', [
    solicitudId,
  ]);
  if (solicitud.estado !== 'PENDIENTE') throw errores.resuelta();
  return reporte;
}

const TRANSICIONES = [
  ['CERRADO', 'RECTIFICACION', 'Cerrado', 'Rectificación'],
  ['RECTIFICACION', 'CERRADO', 'Rectificación', 'Cerrado'],
];

async function revisarTransiciones(conexion, rol) {
  for (const [origen, destino, nombreOrigen, nombreDestino] of TRANSICIONES) {
    const [[transicion]] = await conexion.query(
      `SELECT 1 AS hay FROM transicion_estado t JOIN rol r ON r.id = t.rol_id
        WHERE t.estado_origen = ? AND t.estado_destino = ? AND r.codigo = ?`,
      [origen, destino, rol],
    );
    if (!transicion) throw errores.noPermitida(nombreOrigen, nombreDestino);
  }
}

// Las celdas de una vacuna con sus cantidades nuevas, escritas como en la captura. Cada una debe seguir con la
// cantidad anterior que vio el solicitante (0 si no existía); si no, no se aplica nada.
async function aplicarCambiosDeVacuna(conexion, repVacId, cambios, usuarioId) {
  const actuales = await celdasGuardadas(conexion, [repVacId]);
  const porLlave = new Map(actuales.map((a) => [llaveDeCelda(a), a]));
  const nuevas = new Map();
  const dosis = new Map();
  for (const c of cambios) {
    const celda = {
      dosisCodigo: c.dosis_codigo,
      municipioProcedenciaId: c.municipio_procedencia_id,
      claveCombinacion: c.clave_combinacion,
      dimensiones: Object.fromEntries(paresDeClave(c.clave_combinacion)),
      cantidad: c.cantidad_nueva,
    };
    if ((porLlave.get(llaveDeCelda(celda))?.cantidad ?? 0) !== c.cantidad_anterior) throw errores.desactualizada();
    nuevas.set(llaveDeCelda(celda), celda);
    dosis.set(c.dosis_codigo, { id: c.dosis_id });
  }
  // escribirCeldas borra lo que no viene: van todas las actuales, con las cantidades nuevas donde cambian.
  const pedidas = [
    ...actuales.map((a) => nuevas.get(llaveDeCelda(a)) ?? a),
    ...[...nuevas.values()].filter((n) => !porLlave.has(llaveDeCelda(n))),
  ];
  await escribirCeldas(conexion, { repVacId, actuales, pedidas, dosis, usuarioId });

  const [[antes]] = await conexion.query('SELECT total_declarado FROM reporte_vacuna WHERE id = ?', [repVacId]);
  const totalDeclarado = pedidas.reduce((suma, c) => suma + c.cantidad, 0);
  await conexion.query('UPDATE reporte_vacuna SET total_declarado = ? WHERE id = ?', [totalDeclarado, repVacId]);
  return { anterior: antes.total_declarado ?? null, nuevo: totalDeclarado };
}

// Autoriza y aplica de una vez: el reporte pasa por RECTIFICACION dentro de la transacción y la solicitud queda
// APLICADA sin pasar por AUTORIZADA.
export async function aprobarRectificacion(id, cuerpo, req) {
  const pedido = leerResolucion(id, cuerpo, false);
  const reporteId = await reporteDeSolicitud(pedido.id, req.usuario);
  const contexto = contextoAuditoria(req);

  await enTransaccion(async (conexion) => {
    const reporte = await bloquear(conexion, reporteId, pedido.id);
    if (reporte.estado !== 'CERRADO') throw errores.noCerrado();
    const [cambios] = await conexion.query(
      `SELECT rd.reporte_vacuna_id, rv.vacuna_id, rd.dosis_id, d.codigo AS dosis_codigo, rd.municipio_procedencia_id,
              rd.clave_combinacion, rd.cantidad_anterior, rd.cantidad_nueva
         FROM rectificacion_detalle rd
         JOIN reporte_vacuna rv ON rv.id = rd.reporte_vacuna_id
         JOIN dosis d ON d.id = rd.dosis_id
        WHERE rd.solicitud_id = ?
        ORDER BY rd.id`,
      [pedido.id],
    );
    if (cambios.length === 0) throw errores.sinCambios();
    await revisarTransiciones(conexion, req.usuario.rol);

    const numero = reporte.numero_rectificacion + 1;
    await conexion.query("UPDATE reporte_produccion SET estado = 'RECTIFICACION' WHERE id = ?", [reporteId]);
    const totales = [];
    for (const repVacId of new Set(cambios.map((c) => c.reporte_vacuna_id))) {
      const deLaVacuna = cambios.filter((c) => c.reporte_vacuna_id === repVacId);
      const total = await aplicarCambiosDeVacuna(conexion, repVacId, deLaVacuna, contexto.usuarioId);
      totales.push({
        vacunaId: deLaVacuna[0].vacuna_id,
        totalDeclaradoAnterior: total.anterior,
        totalDeclarado: total.nuevo,
      });
    }
    await conexion.query(
      `UPDATE reporte_produccion SET estado = 'CERRADO', numero_rectificacion = ?, version_fila = version_fila + 1
        WHERE id = ?`,
      [numero, reporteId],
    );

    const autorizada = [`Rectificación ${numero} autorizada (solicitud ${pedido.id}).`, pedido.comentario]
      .filter(Boolean)
      .join(' ');
    const aplicada = `Rectificación ${numero} aplicada: ${cambios.length} celdas.`;
    await conexion.query(
      'INSERT INTO historial_estado_reporte (reporte_id, estado_anterior, estado_nuevo, usuario_id, comentario) VALUES ?',
      [
        [
          [reporteId, 'CERRADO', 'RECTIFICACION', contexto.usuarioId, autorizada],
          [reporteId, 'RECTIFICACION', 'CERRADO', contexto.usuarioId, aplicada],
        ],
      ],
    );
    await conexion.query(
      `UPDATE solicitud_rectificacion
          SET estado = 'APLICADA', resuelto_por = ?, comentario_resolucion = ?, resuelto_en = NOW(), aplicado_en = NOW()
        WHERE id = ?`,
      [contexto.usuarioId, pedido.comentario, pedido.id],
    );

    for (const [origen, destino] of TRANSICIONES) {
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.RECTIFICACION,
        accion: ACCIONES.CAMBIO_ESTADO,
        entidad: 'reporte_produccion',
        entidadId: reporteId,
        valoresAnteriores: { estado: origen },
        valoresNuevos: { estado: destino, solicitudId: pedido.id },
      });
    }
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.RECTIFICACION,
      accion: ACCIONES.APLICAR_RECTIFICACION,
      entidad: 'solicitud_rectificacion',
      entidadId: pedido.id,
      valoresAnteriores: { estado: 'PENDIENTE' },
      valoresNuevos: {
        estado: 'APLICADA',
        comentario: pedido.comentario,
        reporteId,
        numeroRectificacion: numero,
        cambios: cambios.map((c) => ({
          vacunaId: c.vacuna_id,
          dosisCodigo: c.dosis_codigo,
          municipioProcedenciaId: c.municipio_procedencia_id,
          claveCombinacion: c.clave_combinacion,
          cantidadAnterior: c.cantidad_anterior,
          cantidadNueva: c.cantidad_nueva,
        })),
        totales,
      },
    });
  });

  return { ...(await leerSolicitud(pool, pedido.id)).solicitud, corridas: await recalcularIndicadores(reporteId, contexto) };
}

// Después de confirmar: el mes del reporte y cada mes cerrado siguiente del año, porque el acumulado cambia (SPEC 44).
// Un fallo deja su corrida FALLIDA y la rectificación sigue aplicada.
async function recalcularIndicadores(reporteId, contexto) {
  const [[reporte]] = await pool.query(
    `SELECT e.ddriss_id, p.anio, p.mes FROM reporte_produccion r
       JOIN establecimiento e ON e.id = r.establecimiento_id
       JOIN periodo p ON p.id = r.periodo_id
      WHERE r.id = ?`,
    [reporteId],
  );
  const corridas = [];
  for (const mes of await mesesCerradosDesde(reporte.ddriss_id, reporte.anio, reporte.mes)) {
    corridas.push(
      await calcularSinFallar(
        { ddrissId: reporte.ddriss_id, anio: reporte.anio, mesHasta: mes, motivo: 'RECTIFICACION', usuarioId: contexto.usuarioId },
        contexto,
      ),
    );
  }
  return corridas;
}

// El estado del reporte no se revisa: también se rechaza una solicitud sin detalle (de la semilla).
export async function rechazarRectificacion(id, cuerpo, req) {
  const pedido = leerResolucion(id, cuerpo, true);
  const reporteId = await reporteDeSolicitud(pedido.id, req.usuario);
  const contexto = contextoAuditoria(req);

  await enTransaccion(async (conexion) => {
    await bloquear(conexion, reporteId, pedido.id);
    await conexion.query(
      `UPDATE solicitud_rectificacion
          SET estado = 'RECHAZADA', resuelto_por = ?, comentario_resolucion = ?, resuelto_en = NOW()
        WHERE id = ?`,
      [contexto.usuarioId, pedido.comentario, pedido.id],
    );
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.RECTIFICACION,
      accion: ACCIONES.RECHAZAR_RECTIFICACION,
      entidad: 'solicitud_rectificacion',
      entidadId: pedido.id,
      valoresAnteriores: { estado: 'PENDIENTE' },
      valoresNuevos: { estado: 'RECHAZADA', comentario: pedido.comentario },
    });
  });

  return (await leerSolicitud(pool, pedido.id)).solicitud;
}
