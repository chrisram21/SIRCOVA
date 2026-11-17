import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { entradaInvalida, revisarParametros } from '../catalogos/catalogos.service.js';
import { leerEntero } from '../revision/bandeja.service.js';
import { ACCIONES, MODULOS, registrarBitacora } from './auditoria.service.js';
import { libroDeBitacora } from './bitacoraExcel.service.js';
import { diaEnGuatemala, etiquetaAccion, etiquetaModulo, fechaCorta } from './textosBitacora.js';

const FILTROS = ['desde', 'hasta', 'usuarioId', 'modulo', 'accion', 'entidad', 'entidadId'];
const ACCIONES_FALLIDAS = ['LOGIN_FALLIDO', 'CUENTA_BLOQUEADA', 'ACCESO_DENEGADO'];

// Guatemala no tiene horario de verano: un día va de las 06:00 UTC a las 06:00 UTC del día siguiente.
// Aiven guarda bitacora.fecha en UTC (CURRENT_TIMESTAMP con la zona del servidor en UTC).
const HORAS_GUATEMALA = 6;

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

function leerFecha(query, nombre) {
  const valor = query[nombre];
  if (valor === undefined) return undefined;
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  // Una fecha que no existe (2026-02-30) cambia de mes al pasar por Date.UTC.
  const valida = partes && new Date(Date.UTC(partes[1], partes[2] - 1, partes[3])).toISOString().slice(0, 10) === valor;
  if (!valida) throw entradaInvalida(`${nombre} debe ser una fecha AAAA-MM-DD.`);
  return valor;
}

// El instante UTC en que empieza el día de Guatemala, como texto para comparar con un DATETIME sin conversiones.
function inicioDelDia(fecha, diasDespues = 0) {
  const [anio, mes, dia] = fecha.split('-').map(Number);
  const instante = new Date(Date.UTC(anio, mes - 1, dia + diasDespues, HORAS_GUATEMALA));
  return instante.toISOString().slice(0, 19).replace('T', ' ');
}

function leerPatron(query, nombre, patron, mensaje) {
  if (query[nombre] === undefined) return undefined;
  if (!patron.test(query[nombre])) throw entradaInvalida(mensaje);
  return query[nombre];
}

export function leerFiltros(query, { paginado = true } = {}) {
  revisarParametros(query, paginado ? [...FILTROS, 'pagina', 'porPagina'] : FILTROS);
  const desde = leerFecha(query, 'desde');
  const hasta = leerFecha(query, 'hasta');
  if (desde && hasta && desde > hasta) throw entradaInvalida('La fecha desde no puede ser posterior a la fecha hasta.');
  const modulo = query.modulo;
  if (modulo !== undefined && !Object.hasOwn(MODULOS, modulo)) {
    throw entradaInvalida(`El módulo debe ser ${Object.keys(MODULOS).join(', ')}.`);
  }
  const entidad = leerPatron(
    query,
    'entidad',
    /^[a-z_]{1,60}(,[a-z_]{1,60})*$/,
    'entidad debe ser una o varias tablas en minúsculas separadas por comas.',
  );
  return {
    desde,
    hasta,
    usuarioId: query.usuarioId === undefined ? undefined : leerEntero(query.usuarioId, 'usuarioId'),
    modulo,
    accion: leerPatron(query, 'accion', /^[A-Z_]{1,40}$/, 'accion debe tener solo mayúsculas y guiones bajos.'),
    entidades: entidad?.split(','),
    entidadId: leerPatron(query, 'entidadId', /^.{1,40}$/su, 'entidadId debe tener de 1 a 40 caracteres.'),
    ...(paginado && {
      pagina: query.pagina === undefined ? 1 : leerEntero(query.pagina, 'pagina'),
      porPagina: query.porPagina === undefined ? 20 : leerEntero(query.porPagina, 'porPagina', { maximo: 100 }),
    }),
  };
}

// La bitácora no guarda la DDRISS: se deduce del autor, o de la cuenta contra la que fue un intento fallido.
// Las filas automáticas (sin usuario ni intento) no son de ninguna DDRISS y no se ven.
const cuentasDeLaDdriss = (columna) =>
  `SELECT cu.${columna} FROM usuario cu JOIN empleado ce ON ce.id = cu.empleado_id WHERE ce.ddriss_id = ?`;

function filtroDelAlcance(usuario) {
  if (!Number.isInteger(usuario.ddrissId) || usuario.ddrissId <= 0) return { condicion: '1 = 0', valores: [] };
  return {
    condicion: `(b.usuario_id IN (${cuentasDeLaDdriss('id')})
                 OR (b.usuario_id IS NULL AND b.nombre_usuario_intento IN (${cuentasDeLaDdriss('nombre_usuario')})))`,
    valores: [usuario.ddrissId, usuario.ddrissId],
  };
}

export function filtroDeBitacora(usuario, filtros) {
  const alcance = filtroDelAlcance(usuario);
  const condiciones = [alcance.condicion];
  const valores = [...alcance.valores];
  const agregar = (condicion, ...nuevos) => {
    condiciones.push(condicion);
    valores.push(...nuevos);
  };
  if (filtros.desde) agregar('b.fecha >= ?', inicioDelDia(filtros.desde));
  if (filtros.hasta) agregar('b.fecha < ?', inicioDelDia(filtros.hasta, 1));
  if (filtros.usuarioId) {
    agregar(
      `(b.usuario_id = ? OR (b.usuario_id IS NULL
         AND b.nombre_usuario_intento = (SELECT nombre_usuario FROM usuario WHERE id = ?)))`,
      filtros.usuarioId,
      filtros.usuarioId,
    );
  }
  if (filtros.modulo) agregar('b.modulo = ?', filtros.modulo);
  if (filtros.accion) agregar('b.accion = ?', filtros.accion);
  if (filtros.entidades) agregar('b.entidad IN (?)', filtros.entidades);
  if (filtros.entidadId) agregar('b.entidad_id = ?', filtros.entidadId);
  return { condicion: condiciones.join(' AND '), valores };
}

export const COLUMNAS_REGISTRO = `b.id, UNIX_TIMESTAMP(b.fecha) AS fecha, b.usuario_id, b.nombre_usuario_intento,
       b.modulo, b.accion, b.entidad, b.entidad_id, b.valores_anteriores, b.valores_nuevos, b.ip_origen,
       b.agente_usuario, u.nombre_usuario, CONCAT(e.nombres, ' ', e.apellidos) AS nombre_empleado,
       r.codigo AS rol_codigo, r.nombre AS rol_nombre`;

export const UNIONES_REGISTRO = `LEFT JOIN usuario u ON u.id = b.usuario_id
  LEFT JOIN empleado e ON e.id = u.empleado_id
  LEFT JOIN rol r ON r.id = u.rol_id`;

export function aRegistro(f) {
  return {
    id: Number(f.id),
    fecha: aFechaIso(f.fecha),
    usuario:
      f.usuario_id == null
        ? null
        : {
            id: f.usuario_id,
            nombreUsuario: f.nombre_usuario,
            nombre: f.nombre_empleado,
            rol: { codigo: f.rol_codigo, nombre: f.rol_nombre },
          },
    nombreUsuarioIntento: f.nombre_usuario_intento,
    modulo: f.modulo,
    accion: f.accion,
    entidad: f.entidad,
    entidadId: f.entidad_id,
    valoresAnteriores: f.valores_anteriores,
    valoresNuevos: f.valores_nuevos,
    ipOrigen: f.ip_origen,
    agenteUsuario: f.agente_usuario,
  };
}

// Acciones y entidades salen de las filas del alcance: así aparecen también valores antiguos que ya no están en
// ACCIONES (CERRAR_PERIODO, AUTORIZAR de la semilla).
export async function opcionesBitacora(usuario, query) {
  revisarParametros(query, []);
  const { condicion, valores } = filtroDelAlcance(usuario);
  const ddrissId = Number.isInteger(usuario.ddrissId) ? usuario.ddrissId : 0;

  const [[cuentas], [acciones], [entidades]] = await Promise.all([
    pool.query(
      `SELECT u.id, u.nombre_usuario, CONCAT(e.nombres, ' ', e.apellidos) AS nombre_empleado,
              r.codigo AS rol_codigo, r.nombre AS rol_nombre, u.activo AND e.activo AS activo
         FROM usuario u JOIN empleado e ON e.id = u.empleado_id JOIN rol r ON r.id = u.rol_id
        WHERE e.ddriss_id = ?
        ORDER BY nombre_empleado, u.nombre_usuario`,
      [ddrissId],
    ),
    pool.query(`SELECT DISTINCT b.accion FROM bitacora b WHERE ${condicion} ORDER BY b.accion`, valores),
    pool.query(`SELECT DISTINCT b.entidad FROM bitacora b WHERE ${condicion} ORDER BY b.entidad`, valores),
  ]);

  return {
    usuarios: cuentas.map((f) => ({
      id: f.id,
      nombreUsuario: f.nombre_usuario,
      nombre: f.nombre_empleado,
      rol: { codigo: f.rol_codigo, nombre: f.rol_nombre },
      activo: Boolean(f.activo),
    })),
    modulos: Object.keys(MODULOS),
    acciones: acciones.map((f) => f.accion),
    entidades: entidades.map((f) => f.entidad),
  };
}

export async function listarBitacora(usuario, query) {
  const filtros = leerFiltros(query);
  const { condicion, valores } = filtroDeBitacora(usuario, filtros);

  const [[filas], [[conteo]]] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNAS_REGISTRO} FROM bitacora b ${UNIONES_REGISTRO}
        WHERE ${condicion}
        ORDER BY b.fecha DESC, b.id DESC
        LIMIT ? OFFSET ?`,
      [...valores, filtros.porPagina, (filtros.pagina - 1) * filtros.porPagina],
    ),
    pool.query(
      `SELECT COUNT(*) AS total, COUNT(DISTINCT b.usuario_id) AS usuarios,
              COALESCE(SUM(b.modulo = 'RECTIFICACION'), 0) AS rectificaciones,
              COALESCE(SUM(b.accion IN (?)), 0) AS fallidos
         FROM bitacora b
        WHERE ${condicion}`,
      [ACCIONES_FALLIDAS, ...valores],
    ),
  ]);

  return {
    elementos: filas.map(aRegistro),
    total: Number(conteo.total),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
    resumen: {
      usuarios: Number(conteo.usuarios),
      rectificaciones: Number(conteo.rectificaciones),
      accesosFallidos: Number(conteo.fallidos),
    },
  };
}

export const TOPE_EXCEL = 10000;
const formatoEntero = new Intl.NumberFormat('es-GT');

function textoDeFechas({ desde, hasta }) {
  if (desde && hasta) return `Del ${fechaCorta(desde)} al ${fechaCorta(hasta)}`;
  if (desde) return `Desde el ${fechaCorta(desde)}`;
  if (hasta) return `Hasta el ${fechaCorta(hasta)}`;
  return 'Todo el historial';
}

// Las líneas [etiqueta, valor] del encabezado del Excel: las fechas siempre, los demás filtros solo si se aplicaron.
async function datosDelExcel(usuario, filtros) {
  const [[[ddriss]], [[autor]], [[cuenta]]] = await Promise.all([
    pool.query('SELECT nombre FROM ddriss WHERE id = ?', [usuario.ddrissId ?? 0]),
    pool.query(
      `SELECT CONCAT(e.nombres, ' ', e.apellidos) AS nombre FROM usuario u JOIN empleado e ON e.id = u.empleado_id
        WHERE u.id = ?`,
      [usuario.id],
    ),
    filtros.usuarioId
      ? pool.query(
          `SELECT CONCAT(e.nombres, ' ', e.apellidos) AS nombre FROM usuario u JOIN empleado e ON e.id = u.empleado_id
            WHERE u.id = ? AND e.ddriss_id = ?`,
          [filtros.usuarioId, usuario.ddrissId ?? 0],
        )
      : [[]],
  ]);
  const elemento = [filtros.entidades?.join(', '), filtros.entidadId && `#${filtros.entidadId}`].filter(Boolean);
  return {
    ddriss: ddriss?.nombre ?? '',
    generadoPor: autor?.nombre ?? '',
    filtros: [
      ['Fechas', textoDeFechas(filtros)],
      filtros.usuarioId && ['Usuario', cuenta?.nombre ?? `Cuenta #${filtros.usuarioId} (fuera de la DDRISS)`],
      filtros.modulo && ['Módulo', etiquetaModulo(filtros.modulo)],
      filtros.accion && ['Acción', etiquetaAccion(filtros.accion)],
      elemento.length > 0 && ['Elemento', elemento.join(' ')],
    ].filter(Boolean),
  };
}

// Las mismas filas de listarBitacora, todas, como .xlsx. Deja la fila EXPORTAR después de armarlo: si la bitácora
// falla, no se entrega el archivo. contexto: contextoAuditoria(req). tope: solo las pruebas lo cambian.
export async function exportarBitacora(usuario, query, contexto, { ahora = new Date(), tope = TOPE_EXCEL } = {}) {
  const filtros = leerFiltros(query, { paginado: false });
  const { condicion, valores } = filtroDeBitacora(usuario, filtros);

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM bitacora b WHERE ${condicion}`, valores);
  if (total > tope) {
    throw new ErrorApi(
      422,
      'DEMASIADAS_FILAS',
      `El resultado tiene ${formatoEntero.format(total)} registros; acote los filtros para exportar `
        + `${formatoEntero.format(tope)} o menos.`,
    );
  }

  const [[filas], datos] = await Promise.all([
    pool.query(
      `SELECT ${COLUMNAS_REGISTRO} FROM bitacora b ${UNIONES_REGISTRO}
        WHERE ${condicion}
        ORDER BY b.fecha DESC, b.id DESC`,
      valores,
    ),
    datosDelExcel(usuario, filtros),
  ]);
  const registros = filas.map(aRegistro);
  const libro = libroDeBitacora(registros, { ...datos, generadoEn: ahora });
  const bytes = Buffer.from(await libro.xlsx.writeBuffer());

  await enTransaccion((conexion) => registrarBitacora(conexion, {
    ...contexto,
    modulo: MODULOS.SISTEMA,
    accion: ACCIONES.EXPORTAR,
    entidad: 'bitacora',
    valoresNuevos: {
      formato: 'xlsx',
      filas: registros.length,
      filtros: {
        desde: filtros.desde,
        hasta: filtros.hasta,
        usuarioId: filtros.usuarioId,
        modulo: filtros.modulo,
        accion: filtros.accion,
        entidad: filtros.entidades?.join(','),
        entidadId: filtros.entidadId,
      },
    },
  }));

  return { bytes, nombre: `bitacora-${diaEnGuatemala(ahora)}.xlsx` };
}
