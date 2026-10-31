import { ObjectId } from 'mongodb';
import pool, { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { filtroAlcance, verificarAlcance } from '../auth/alcance.service.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import { esquemasDelPeriodo } from '../configuracion/esquemas.service.js';

export const ESTADOS_REPORTE = [
  'BORRADOR', 'ENVIADO', 'EN_REVISION', 'CORRECCION_SOLICITADA', 'APROBADO', 'CERRADO', 'RECTIFICACION',
];

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
         DATE_FORMAT(cp.fecha_limite_envio, '%Y-%m-%d') AS fecha_limite_envio,
         r.revisor_id, CONCAT(em.nombres, ' ', em.apellidos) AS revisor_nombre
    FROM reporte_produccion r
    JOIN establecimiento e ON e.id = r.establecimiento_id
    JOIN periodo p ON p.id = r.periodo_id
    LEFT JOIN cierre_periodo cp ON cp.periodo_id = p.id AND cp.ddriss_id = e.ddriss_id
    LEFT JOIN usuario ur ON ur.id = r.revisor_id
    LEFT JOIN empleado em ON em.id = ur.empleado_id`;

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

const GRUPO_EDAD = 'grupo_edad';

// Las dimensiones que usa un esquema (general, por dosis y secciones), con los valores que usa de cada una y la
// etiqueta que les da; si dos desagregaciones dan etiquetas distintas, gana la general.
function dimensionesDelEsquema(doc) {
  const usadas = new Map();
  const anotar = (dimension, valores, etiqueta) => {
    const actual = usadas.get(dimension) ?? { valores: new Set(), etiqueta: null };
    for (const valor of valores) actual.valores.add(valor);
    actual.etiqueta ??= etiqueta ?? null;
    usadas.set(dimension, actual);
  };
  for (const d of doc.dimensiones.desagregacion) anotar(d.dimension, d.valores, d.etiqueta);
  for (const dosis of doc.dimensiones.dosis) {
    for (const d of dosis.desagregacion ?? []) anotar(d.dimension, d.valores, d.etiqueta);
  }
  for (const seccion of doc.secciones ?? []) if (seccion.grupo_edad) anotar(GRUPO_EDAD, [seccion.grupo_edad]);
  return usadas;
}

// Las etiquetas salen de la versión fijada en el reporte, con las dosis y los valores inactivos incluidos: el
// formulario (HU-20) decide qué ocultar. Así el Personal no necesita los permisos del catálogo de configuración.
async function conEtiquetas(vacunas) {
  if (vacunas.length === 0) return vacunas;
  const db = await obtenerDb();
  const ids = vacunas.map((v) => v.esquema.id).filter((id) => /^[0-9a-f]{24}$/i.test(id)).map((id) => new ObjectId(id));
  const [documentos, [dosis]] = await Promise.all([
    db.collection('esquemas_captura')
      .find({ _id: { $in: ids } }, { projection: { dimensiones: 1, secciones: 1, incluir_por_defecto: 1 } })
      .toArray(),
    pool.query('SELECT vacuna_id, codigo, nombre, orden, activa FROM dosis WHERE vacuna_id IN (?) ORDER BY orden', [
      vacunas.map((v) => v.vacuna.id),
    ]),
  ]);
  const usadasPorEsquema = new Map(documentos.map((doc) => [doc._id.toString(), { doc, usadas: dimensionesDelEsquema(doc) }]));
  const codigos = [...new Set([...usadasPorEsquema.values()].flatMap(({ usadas }) => [...usadas.keys()]))];
  const catalogo = new Map(
    (await db.collection('catalogo_dimensiones').find({ codigo: { $in: codigos } }).toArray()).map((d) => [d.codigo, d]),
  );

  return vacunas.map((v) => {
    const esquema = usadasPorEsquema.get(v.esquema.id);
    // Base (SPEC 31): la versión fijada está marcada, o es anterior a la v0.8 o ya no está; no se quita del reporte.
    if (!esquema) return { ...v, base: true, dosis: [], dimensiones: [] };
    const delEsquema = new Set(esquema.doc.dimensiones.dosis.map((d) => d.codigo));
    const dimensiones = [...esquema.usadas]
      .filter(([codigo]) => catalogo.has(codigo))
      .map(([codigo, { valores, etiqueta }]) => {
        const dimension = catalogo.get(codigo);
        return {
          codigo,
          nombre: dimension.nombre,
          etiqueta,
          valores: dimension.valores
            .filter((valor) => valores.has(valor.codigo))
            .sort((a, b) => a.orden - b.orden)
            .map((valor) => ({ codigo: valor.codigo, etiqueta: valor.etiqueta, orden: valor.orden, activo: valor.activo })),
        };
      })
      // Como en el formulario: el grupo de edad primero y las demás en el orden del catálogo (por nombre).
      .sort((a, b) => (b.codigo === GRUPO_EDAD) - (a.codigo === GRUPO_EDAD) || a.nombre.localeCompare(b.nombre, 'es'));
    return {
      ...v,
      base: esquema.doc.incluir_por_defecto ?? true,
      dosis: dosis
        .filter((d) => d.vacuna_id === v.vacuna.id && delEsquema.has(d.codigo))
        .map((d) => ({ codigo: d.codigo, nombre: d.nombre, orden: d.orden, activa: Boolean(d.activa) })),
      dimensiones,
    };
  });
}

async function buscarReporte(ejecutor, id, usuario, { etiquetas = true } = {}) {
  const [[fila]] = await ejecutor.query(`${SELECT_REPORTE} WHERE r.id = ?`, [aId(id)]);
  if (!fila) throw errores.noEncontrado();
  verificarAlcance(usuario, { establecimientoId: fila.establecimiento_id, ddrissId: fila.ddriss_id });
  const reporte = {
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
    revisor: fila.revisor_id === null ? null : { id: fila.revisor_id, nombre: fila.revisor_nombre },
    creadoEn: aFechaIso(fila.creado_en),
    actualizadoEn: aFechaIso(fila.actualizado_en),
  };
  const vacunas = await vacunasDelReporte(ejecutor, fila.id);
  return { ...reporte, vacunas: etiquetas ? await conEtiquetas(vacunas) : vacunas };
}

export async function obtenerReporte(id, usuario) {
  return buscarReporte(pool, id, usuario);
}

function leerEntero(valor, { minimo, maximo = Number.MAX_SAFE_INTEGER }) {
  if (!/^\d+$/.test(valor)) return null;
  const numero = Number(valor);
  return numero >= minimo && numero <= maximo ? numero : null;
}

function leerFiltros(query) {
  revisarParametros(query, ['periodoId', 'anio', 'estado', 'pagina', 'porPagina']);
  const filtros = { pagina: 1, porPagina: 20 };
  if (query.periodoId !== undefined) {
    filtros.periodoId = leerEntero(query.periodoId, { minimo: 1 });
    if (filtros.periodoId === null) throw entradaInvalida('periodoId debe ser un número entero positivo.');
  }
  if (query.anio !== undefined) {
    filtros.anio = leerEntero(query.anio, { minimo: 2000, maximo: 2100 });
    if (filtros.anio === null) throw entradaInvalida('anio debe ser un número entero entre 2000 y 2100.');
  }
  if (query.estado !== undefined) {
    if (!ESTADOS_REPORTE.includes(query.estado)) {
      throw entradaInvalida(`estado debe ser ${ESTADOS_REPORTE.slice(0, -1).join(', ')} o ${ESTADOS_REPORTE.at(-1)}.`);
    }
    filtros.estado = query.estado;
  }
  if (query.pagina !== undefined) {
    filtros.pagina = leerEntero(query.pagina, { minimo: 1 });
    if (filtros.pagina === null) throw entradaInvalida('pagina debe ser un número entero mayor o igual a 1.');
  }
  if (query.porPagina !== undefined) {
    filtros.porPagina = leerEntero(query.porPagina, { minimo: 1, maximo: 100 });
    if (filtros.porPagina === null) throw entradaInvalida('porPagina debe ser un número entero entre 1 y 100.');
  }
  return filtros;
}

// La corrección vigente es la fila más reciente que pasó el reporte a CORRECCION_SOLICITADA.
async function correccionesDe(reporteIds) {
  const correcciones = new Map();
  if (reporteIds.length === 0) return correcciones;
  const [filas] = await pool.query(
    `SELECT reporte_id, comentario, UNIX_TIMESTAMP(fecha) AS fecha FROM historial_estado_reporte
      WHERE reporte_id IN (?) AND estado_nuevo = 'CORRECCION_SOLICITADA'
      ORDER BY fecha DESC, id DESC`,
    [reporteIds],
  );
  for (const f of filas) {
    if (!correcciones.has(f.reporte_id)) {
      correcciones.set(f.reporte_id, { comentario: f.comentario, fecha: aFechaIso(f.fecha) });
    }
  }
  return correcciones;
}

// El mismo WHERE sirve para el COUNT y para la página, así total y elementos no se separan.
export async function listarReportes(usuario, query = {}) {
  const filtros = leerFiltros(query);
  const alcance = filtroAlcance(usuario, { establecimiento: 'r.establecimiento_id', ddriss: 'e.ddriss_id' });
  const condiciones = [alcance.condicion];
  const parametros = [...alcance.parametros];
  if (filtros.periodoId) {
    condiciones.push('r.periodo_id = ?');
    parametros.push(filtros.periodoId);
  }
  if (filtros.anio) {
    condiciones.push('p.anio = ?');
    parametros.push(filtros.anio);
  }
  if (filtros.estado) {
    condiciones.push('r.estado = ?');
    parametros.push(filtros.estado);
  }
  const desde = `FROM reporte_produccion r
    JOIN establecimiento e ON e.id = r.establecimiento_id
    JOIN periodo p ON p.id = r.periodo_id
   WHERE ${condiciones.join(' AND ')}`;

  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${desde}`, parametros);
  const [filas] = await pool.query(
    `SELECT r.id, r.estado, UNIX_TIMESTAMP(r.actualizado_en) AS actualizado_en,
            e.id AS establecimiento_id, e.codigo AS establecimiento_codigo, e.nombre AS establecimiento_nombre,
            p.id AS periodo_id, p.anio, p.mes,
            (SELECT cp.estado FROM cierre_periodo cp WHERE cp.periodo_id = p.id AND cp.ddriss_id = e.ddriss_id)
              AS periodo_estado,
            (SELECT UNIX_TIMESTAMP(MAX(h.fecha)) FROM historial_estado_reporte h WHERE h.reporte_id = r.id)
              AS estado_desde
       ${desde}
      ORDER BY p.anio DESC, p.mes DESC, e.nombre, r.id
      LIMIT ? OFFSET ?`,
    [...parametros, filtros.porPagina, (filtros.pagina - 1) * filtros.porPagina],
  );
  const correcciones = await correccionesDe(filas.filter((f) => f.estado === 'CORRECCION_SOLICITADA').map((f) => f.id));
  return {
    elementos: filas.map((f) => ({
      id: f.id,
      establecimiento: { id: f.establecimiento_id, codigo: f.establecimiento_codigo, nombre: f.establecimiento_nombre },
      periodo: { id: f.periodo_id, anio: f.anio, mes: f.mes, estado: f.periodo_estado ?? null },
      estado: f.estado,
      actualizadoEn: aFechaIso(f.actualizado_en),
      estadoDesde: aFechaIso(f.estado_desde ?? f.actualizado_en),
      correccion: correcciones.get(f.id) ?? null,
    })),
    total: Number(total),
    pagina: filtros.pagina,
    porPagina: filtros.porPagina,
  };
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

// Las vacunas activas con el esquema que cubre el día 1 del mes, cada una con su incluirPorDefecto; las que no
// tienen uno se omiten. También dice qué vacunas se pueden agregar a un reporte (SPEC 31).
export async function vacunasConEsquema(periodo, ddrissCodigo) {
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
  const conEsquema = await vacunasConEsquema(periodo, establecimiento.ddriss_codigo);
  // Solo las marcadas (SPEC 31); las demás las agrega el establecimiento con POST /reportes/{id}/vacunas.
  const vacunas = conEsquema.filter((v) => v.incluirPorDefecto);

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
      if (conEsquema.length === 0) throw errores.sinEsquemas();

      const [resultado] = await conexion.query(
        'INSERT INTO reporte_produccion (establecimiento_id, periodo_id, creado_por) VALUES (?, ?, ?)',
        [establecimiento.id, periodo.id, contexto.usuarioId],
      );
      const id = resultado.insertId;
      // Si ninguna está marcada, el reporte nace sin vacunas.
      if (vacunas.length > 0) {
        await conexion.query(
          'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES ?',
          [vacunas.map((v) => [id, v.vacunaId, v.id, v.version])],
        );
      }
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
        // Sin las etiquetas: son del catálogo, no del reporte, y leerlas iría a MongoDB dentro de la transacción.
        valoresNuevos: await buscarReporte(conexion, id, usuario, { etiquetas: false }),
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
