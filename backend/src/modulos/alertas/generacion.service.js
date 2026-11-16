import { enTransaccion } from '../../config/mysql.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { hoyGuatemala } from '../catalogos/periodos.service.js';
import { NOMBRES_MES } from '../produccion/validacion.service.js';

export const DIAS_AVISO_FECHA_LIMITE = 3;
export const DIAS_SIN_REVISAR = 3;

// El título identifica la clase de alerta: no hay columna para la subclase y PROCESO también lo usa
// «Rectificaciones frecuentes» (SPEC 57).
export const TITULOS = {
  FECHA_PROXIMA: 'Fecha límite próxima',
  SIN_ENVIAR: 'Reporte sin enviar',
  SIN_REVISAR: 'Reporte sin revisar',
};

const UN_DIA_MS = 24 * 60 * 60 * 1000;
const INTERVALO_MS = 60 * 60 * 1000;

// Sobre establecimiento e y cierre_periodo cp: el establecimiento obligado del mes no tiene un reporte enviado alguna
// vez (un borrador nunca enviado cuenta como sin enviar; uno devuelto, no).
const OBLIGADO = 'e.activo = TRUE AND e.reporta_5c = TRUE AND e.ddriss_id = cp.ddriss_id';
const SIN_ENVIAR = `NOT EXISTS (SELECT 1 FROM reporte_produccion rx
                                 WHERE rx.establecimiento_id = e.id AND rx.periodo_id = cp.periodo_id
                                   AND rx.enviado_en IS NOT NULL)`;
const EN_VENTANA = `cp.estado = 'ABIERTO'
  AND ? BETWEEN DATE_SUB(cp.fecha_limite_envio, INTERVAL ? DAY) AND cp.fecha_limite_envio`;

const aSegundos = (fecha) => Math.floor(fecha.getTime() / 1000);
const nombreMes = (mes) => NOMBRES_MES[mes - 1];
const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

const mensajes = {
  fechaProximaDdriss: ({ anio, mes, fecha, faltan }) =>
    `${conMayuscula(nombreMes(mes))} de ${anio} vence el ${fecha}; ` +
    `${faltan === 1 ? 'falta 1 reporte' : `faltan ${faltan} reportes`} por enviar.`,
  fechaProximaEstablecimiento: ({ anio, mes, fecha }) =>
    `El reporte de ${nombreMes(mes)} de ${anio} vence el ${fecha} y todavía no se ha enviado.`,
  sinEnviar: ({ anio, mes, fecha, codigo, nombre }) =>
    `${codigo} ${nombre} no envió el reporte de ${nombreMes(mes)} de ${anio}; la fecha límite fue el ${fecha}.`,
  sinRevisar: ({ anio, mes, codigo, nombre, dias }) =>
    `El reporte de ${nombreMes(mes)} de ${anio} de ${codigo} ${nombre} lleva ${dias} días enviado ` +
    'sin que nadie lo tome.',
};

// Descarta y después genera, en una transacción, para todas las DDRISS. hoy (fecha de Guatemala) y ahora son
// parámetros para que las pruebas usen fechas fijas y solo alcancen sus propios meses y reportes.
export async function generarAlertas({ hoy = hoyGuatemala(), ahora = new Date() } = {}) {
  return enTransaccion(async (conexion) => {
    // Primera consulta: otra corrida (o un cierre del mes) espera aquí.
    await conexion.query(
      `SELECT id FROM cierre_periodo
        WHERE estado <> 'CERRADO' AND fecha_limite_envio <= DATE_ADD(?, INTERVAL ? DAY) FOR UPDATE`,
      [hoy, DIAS_AVISO_FECHA_LIMITE],
    );
    const roles = await idsDeRoles(conexion);
    const descartadas = await descartar(conexion, { hoy, roles });
    const creadas =
      (await generarFechaProxima(conexion, { hoy, ahora, roles })) +
      (await generarSinEnviar(conexion, { hoy, ahora, roles })) +
      (await generarSinRevisar(conexion, { ahora, roles }));
    return { creadas, descartadas };
  });
}

// La arranca server.js y no app.js, así las pruebas no la corren. Un fallo (una base apagada) no detiene la API.
export function iniciarTareaDeAlertas() {
  const correr = () => generarAlertas().catch((err) => console.error('No se pudieron generar las alertas:', err));
  correr();
  return setInterval(correr, INTERVALO_MS);
}

async function idsDeRoles(conexion) {
  const [filas] = await conexion.query("SELECT id, codigo FROM rol WHERE codigo IN ('REVISOR', 'ESTABLECIMIENTO')");
  return Object.fromEntries(filas.map((f) => [f.codigo, f.id]));
}

async function descartar(conexion, { hoy, roles }) {
  const enviado = `EXISTS (SELECT 1 FROM reporte_produccion rx
                            WHERE rx.establecimiento_id = a.establecimiento_id AND rx.periodo_id = a.periodo_id
                              AND rx.enviado_en IS NOT NULL)`;
  const consultas = [
    // Fecha próxima de la DDRISS: venció o ya no falta nadie.
    [
      `SELECT a.id FROM alerta a
         JOIN cierre_periodo cp ON cp.periodo_id = a.periodo_id AND cp.ddriss_id = a.ddriss_id
        WHERE a.estado = 'ACTIVA' AND a.titulo = ? AND a.rol_destino_id = ? AND a.establecimiento_id IS NULL
          AND (? > cp.fecha_limite_envio
               OR NOT EXISTS (SELECT 1 FROM establecimiento e WHERE ${OBLIGADO} AND ${SIN_ENVIAR}))`,
      [TITULOS.FECHA_PROXIMA, roles.REVISOR, hoy],
    ],
    // Fecha próxima del establecimiento: envió o venció.
    [
      `SELECT a.id FROM alerta a
         JOIN cierre_periodo cp ON cp.periodo_id = a.periodo_id AND cp.ddriss_id = a.ddriss_id
        WHERE a.estado = 'ACTIVA' AND a.titulo = ? AND a.rol_destino_id = ?
          AND (? > cp.fecha_limite_envio OR ${enviado})`,
      [TITULOS.FECHA_PROXIMA, roles.ESTABLECIMIENTO, hoy],
    ],
    // Sin enviar (las dos copias): envió o el mes se cerró.
    [
      `SELECT a.id FROM alerta a
         JOIN cierre_periodo cp ON cp.periodo_id = a.periodo_id AND cp.ddriss_id = a.ddriss_id
        WHERE a.estado = 'ACTIVA' AND a.titulo = ? AND a.rol_destino_id IN (?, ?)
          AND (cp.estado = 'CERRADO' OR ${enviado})`,
      [TITULOS.SIN_ENVIAR, roles.REVISOR, roles.ESTABLECIMIENTO],
    ],
    // Sin revisar: ya no está en ENVIADO o se reenvió después de la alerta.
    [
      `SELECT a.id FROM alerta a JOIN reporte_produccion r ON r.id = a.reporte_id
        WHERE a.estado = 'ACTIVA' AND a.titulo = ? AND a.rol_destino_id = ?
          AND (r.estado <> 'ENVIADO' OR r.enviado_en > a.generada_en)`,
      [TITULOS.SIN_REVISAR, roles.REVISOR],
    ],
  ];

  const ids = [];
  for (const [sql, valores] of consultas) {
    const [filas] = await conexion.query(sql, valores);
    ids.push(...filas.map((f) => f.id));
  }
  if (ids.length === 0) return 0;
  await conexion.query("UPDATE alerta SET estado = 'DESCARTADA' WHERE id IN (?)", [ids]);
  for (const id of ids) {
    await registrarBitacora(conexion, {
      usuarioId: null,
      modulo: MODULOS.REVISION,
      accion: ACCIONES.ACTUALIZAR,
      entidad: 'alerta',
      entidadId: id,
      valoresAnteriores: { estado: 'ACTIVA' },
      valoresNuevos: { estado: 'DESCARTADA' },
    });
  }
  return ids.length;
}

// Obligados sin enviar de los meses que cumplen condicion (sobre cierre_periodo cp), con el reporte si lo crearon.
async function obligadosSinEnviar(conexion, condicion, valores) {
  const [filas] = await conexion.query(
    `SELECT cp.ddriss_id, cp.periodo_id, p.anio, p.mes, DATE_FORMAT(cp.fecha_limite_envio, '%d/%m/%Y') AS fecha,
            e.id AS establecimiento_id, e.codigo, e.nombre, e.municipio_id,
            (SELECT rx.id FROM reporte_produccion rx
              WHERE rx.establecimiento_id = e.id AND rx.periodo_id = cp.periodo_id) AS reporte_id
       FROM cierre_periodo cp
       JOIN periodo p ON p.id = cp.periodo_id
       JOIN establecimiento e ON ${OBLIGADO}
      WHERE ${condicion} AND ${SIN_ENVIAR}
      ORDER BY cp.id, e.codigo`,
    valores,
  );
  return filas;
}

async function generarFechaProxima(conexion, { hoy, ahora, roles }) {
  const filas = await obligadosSinEnviar(conexion, EN_VENTANA, [hoy, DIAS_AVISO_FECHA_LIMITE]);
  const existentes = await clavesExistentes(conexion, TITULOS.FECHA_PROXIMA, filas);
  let creadas = 0;

  const meses = new Map();
  for (const f of filas) {
    const clave = `${f.ddriss_id}-${f.periodo_id}`;
    meses.set(clave, { ...f, faltan: (meses.get(clave)?.faltan ?? 0) + 1 });
  }
  for (const m of meses.values()) {
    if (existentes.has(claveDe({ rolDestinoId: roles.REVISOR, periodoId: m.periodo_id, ddrissId: m.ddriss_id }))) {
      continue;
    }
    await crearAlerta(conexion, ahora, {
      tipo: 'REPORTE_PENDIENTE',
      severidad: 'INFO',
      titulo: TITULOS.FECHA_PROXIMA,
      mensaje: mensajes.fechaProximaDdriss(m),
      ddrissId: m.ddriss_id,
      periodoId: m.periodo_id,
      municipioId: null,
      establecimientoId: null,
      reporteId: null,
      rolDestinoId: roles.REVISOR,
    });
    creadas += 1;
  }

  for (const f of filas) {
    creadas += await crearDelEstablecimiento(conexion, ahora, existentes, f, {
      tipo: 'REPORTE_PENDIENTE',
      severidad: 'INFO',
      titulo: TITULOS.FECHA_PROXIMA,
      mensaje: mensajes.fechaProximaEstablecimiento(f),
      rolDestinoId: roles.ESTABLECIMIENTO,
    });
  }
  return creadas;
}

async function generarSinEnviar(conexion, { hoy, ahora, roles }) {
  const filas = await obligadosSinEnviar(conexion, "cp.fecha_limite_envio < ? AND cp.estado <> 'CERRADO'", [hoy]);
  const existentes = await clavesExistentes(conexion, TITULOS.SIN_ENVIAR, filas);
  let creadas = 0;
  for (const f of filas) {
    for (const rolDestinoId of [roles.REVISOR, roles.ESTABLECIMIENTO]) {
      creadas += await crearDelEstablecimiento(conexion, ahora, existentes, f, {
        tipo: 'REPORTE_PENDIENTE',
        severidad: 'CRITICA',
        titulo: TITULOS.SIN_ENVIAR,
        mensaje: mensajes.sinEnviar(f),
        rolDestinoId,
      });
    }
  }
  return creadas;
}

async function crearDelEstablecimiento(conexion, ahora, existentes, f, datos) {
  const clave = { rolDestinoId: datos.rolDestinoId, periodoId: f.periodo_id, establecimientoId: f.establecimiento_id };
  if (existentes.has(claveDe(clave))) return 0;
  await crearAlerta(conexion, ahora, {
    ...datos,
    ddrissId: f.ddriss_id,
    periodoId: f.periodo_id,
    municipioId: f.municipio_id,
    establecimientoId: f.establecimiento_id,
    reporteId: f.reporte_id,
  });
  return 1;
}

async function generarSinRevisar(conexion, { ahora, roles }) {
  const limite = aSegundos(new Date(ahora.getTime() - DIAS_SIN_REVISAR * UN_DIA_MS));
  // Una por envío: una alerta anterior al último envío (atendida, descartada o no) no impide la nueva.
  const [filas] = await conexion.query(
    `SELECT r.id, r.periodo_id, UNIX_TIMESTAMP(r.enviado_en) AS enviado, p.anio, p.mes,
            e.id AS establecimiento_id, e.codigo, e.nombre, e.ddriss_id, e.municipio_id
       FROM reporte_produccion r
       JOIN establecimiento e ON e.id = r.establecimiento_id
       JOIN periodo p ON p.id = r.periodo_id
      WHERE r.estado = 'ENVIADO' AND r.enviado_en <= FROM_UNIXTIME(?)
        AND NOT EXISTS (SELECT 1 FROM alerta a
                         WHERE a.titulo = ? AND a.rol_destino_id = ? AND a.reporte_id = r.id
                           AND a.generada_en >= r.enviado_en)
      ORDER BY r.id`,
    [limite, TITULOS.SIN_REVISAR, roles.REVISOR],
  );
  for (const f of filas) {
    const dias = Math.floor((ahora.getTime() - Number(f.enviado) * 1000) / UN_DIA_MS);
    await crearAlerta(conexion, ahora, {
      tipo: 'PROCESO',
      severidad: 'ADVERTENCIA',
      titulo: TITULOS.SIN_REVISAR,
      mensaje: mensajes.sinRevisar({ ...f, dias }),
      ddrissId: f.ddriss_id,
      periodoId: f.periodo_id,
      municipioId: f.municipio_id,
      establecimientoId: f.establecimiento_id,
      reporteId: f.id,
      rolDestinoId: roles.REVISOR,
    });
  }
  return filas.length;
}

const claveDe = ({ rolDestinoId, periodoId, establecimientoId, ddrissId }) =>
  establecimientoId != null
    ? `${rolDestinoId}|${periodoId}|E${establecimientoId}`
    : `${rolDestinoId}|${periodoId}|D${ddrissId}`;

// En cualquier estado: una alerta atendida a mano (HU-52) no se vuelve a crear en la corrida siguiente. Una sola
// consulta por clase, porque la corrida mantiene bloqueados los meses mientras dura.
async function clavesExistentes(conexion, titulo, filas) {
  const periodos = [...new Set(filas.map((f) => f.periodo_id))];
  if (periodos.length === 0) return new Set();
  const [existentes] = await conexion.query(
    `SELECT rol_destino_id, periodo_id, establecimiento_id, ddriss_id FROM alerta
      WHERE titulo = ? AND periodo_id IN (?)`,
    [titulo, periodos],
  );
  return new Set(
    existentes.map((a) =>
      claveDe({
        rolDestinoId: a.rol_destino_id,
        periodoId: a.periodo_id,
        establecimientoId: a.establecimiento_id,
        ddrissId: a.ddriss_id,
      }),
    ),
  );
}

async function crearAlerta(conexion, ahora, fila) {
  const [creada] = await conexion.query(
    `INSERT INTO alerta
       (tipo, severidad, titulo, mensaje, ddriss_id, periodo_id, municipio_id, establecimiento_id, reporte_id,
        rol_destino_id, generada_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?))`,
    [
      fila.tipo,
      fila.severidad,
      fila.titulo,
      fila.mensaje,
      fila.ddrissId,
      fila.periodoId,
      fila.municipioId,
      fila.establecimientoId,
      fila.reporteId,
      fila.rolDestinoId,
      aSegundos(ahora),
    ],
  );
  await registrarBitacora(conexion, {
    usuarioId: null,
    modulo: MODULOS.REVISION,
    accion: ACCIONES.CREAR,
    entidad: 'alerta',
    entidadId: creada.insertId,
    valoresNuevos: { ...fila, estado: 'ACTIVA', generadaEn: ahora.toISOString() },
  });
}
