import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from './catalogos.service.js';

const ESTADOS = ['ABIERTO', 'EN_CIERRE', 'CERRADO'];
const PRIMER_ANIO = 2020;

const errores = {
  anioExistente: (anio) =>
    new ErrorApi(409, 'PERIODO_ANIO_EXISTENTE', `El año ${anio} ya tiene sus 12 meses en el calendario.`),
  anioFueraDeRango: (ultimo) =>
    new ErrorApi(422, 'ANIO_FUERA_DE_RANGO', `El año debe estar entre ${PRIMER_ANIO} y ${ultimo}.`),
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El periodo no existe.'),
  yaAbierto: () => new ErrorApi(409, 'PERIODO_YA_ABIERTO', 'El mes ya fue abierto en su DDRISS.'),
  noAbierto: () => new ErrorApi(409, 'PERIODO_NO_ABIERTO', 'El mes no está abierto en su DDRISS.'),
  cerrado: () => new ErrorApi(409, 'PERIODO_CERRADO', 'El mes está cerrado; solo admite rectificaciones.'),
  fechaLimiteInvalida: (fechaFin) =>
    new ErrorApi(422, 'FECHA_LIMITE_INVALIDA', `La fecha límite debe ser posterior al ${fechaFin}.`),
};

// "Hoy" en Guatemala como AAAA-MM-DD: el servidor de MySQL (Aiven) está en UTC.
export const hoyGuatemala = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date());

const dosDigitos = (numero) => String(numero).padStart(2, '0');
const finDeMes = (anio, mes) => `${anio}-${dosDigitos(mes)}-${dosDigitos(new Date(Date.UTC(anio, mes, 0)).getUTCDate())}`;

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

// Las columnas DATE salen como texto para no pasar por un Date de JavaScript y su zona horaria. El estado es el de
// la DDRISS del usuario: sin su fila en cierre_periodo, el mes no está abierto en ella.
const SELECT_PERIODO = `
  SELECT p.id, p.anio, p.mes,
         DATE_FORMAT(p.fecha_inicio, '%Y-%m-%d') AS fecha_inicio,
         DATE_FORMAT(p.fecha_fin, '%Y-%m-%d') AS fecha_fin,
         cp.estado,
         DATE_FORMAT(cp.fecha_limite_envio, '%Y-%m-%d') AS fecha_limite_envio,
         UNIX_TIMESTAMP(cp.cerrado_en) AS cerrado_en
    FROM periodo p
    LEFT JOIN cierre_periodo cp ON cp.periodo_id = p.id AND cp.ddriss_id = ?`;

const aPeriodo = (fila) => ({
  id: fila.id,
  anio: fila.anio,
  mes: fila.mes,
  fechaInicio: fila.fecha_inicio,
  fechaFin: fila.fecha_fin,
  estado: fila.estado ?? null,
  fechaLimiteEnvio: fila.fecha_limite_envio ?? null,
  cerradoEn: aFechaIso(fila.cerrado_en),
});

async function buscarPeriodos(ejecutor, usuario, { id, anio, estado } = {}) {
  const condiciones = ['1 = 1'];
  const parametros = [usuario.ddrissId ?? null];
  if (id !== undefined) {
    condiciones.push('p.id = ?');
    parametros.push(id);
  }
  if (anio !== undefined) {
    condiciones.push('p.anio = ?');
    parametros.push(anio);
  }
  if (estado !== undefined) {
    condiciones.push('cp.estado = ?');
    parametros.push(estado);
  }
  const [filas] = await ejecutor.query(
    `${SELECT_PERIODO} WHERE ${condiciones.join(' AND ')} ORDER BY p.anio, p.mes`,
    parametros,
  );
  return filas.map(aPeriodo);
}

function leerFiltrosPeriodos(query) {
  revisarParametros(query, ['anio', 'estado']);
  if (query.anio !== undefined && !/^\d+$/.test(query.anio)) throw entradaInvalida('anio debe ser un número entero.');
  if (query.estado !== undefined && !ESTADOS.includes(query.estado)) {
    throw entradaInvalida('estado debe ser ABIERTO, EN_CIERRE o CERRADO.');
  }
  return { anio: query.anio === undefined ? undefined : Number(query.anio), estado: query.estado };
}

export async function listarPeriodos(usuario, query) {
  return buscarPeriodos(pool, usuario, leerFiltrosPeriodos(query));
}

// El calendario es común a todas las DDRISS; crear el año no abre ningún mes.
export async function crearAnio(cuerpo, usuario, contexto) {
  revisarCampos(cuerpo, ['anio']);
  const { anio } = cuerpo;
  if (!Number.isInteger(anio)) throw entradaInvalida('anio debe ser un número entero.');
  const ultimo = Number(hoyGuatemala().slice(0, 4)) + 1;
  if (anio < PRIMER_ANIO || anio > ultimo) throw errores.anioFueraDeRango(ultimo);

  try {
    return await enTransaccion(async (conexion) => {
      const [existentes] = await conexion.query('SELECT mes FROM periodo WHERE anio = ? FOR UPDATE', [anio]);
      const ocupados = new Set(existentes.map((f) => f.mes));
      if (ocupados.size === 12) throw errores.anioExistente(anio);

      for (let mes = 1; mes <= 12; mes++) {
        if (ocupados.has(mes)) continue;
        const periodo = { anio, mes, fechaInicio: `${anio}-${dosDigitos(mes)}-01`, fechaFin: finDeMes(anio, mes) };
        const [resultado] = await conexion.query(
          'INSERT INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)',
          [anio, mes, periodo.fechaInicio, periodo.fechaFin],
        );
        await registrarBitacora(conexion, {
          ...contexto,
          modulo: MODULOS.CONFIGURACION,
          accion: ACCIONES.CREAR,
          entidad: 'periodo',
          entidadId: resultado.insertId,
          valoresNuevos: { id: resultado.insertId, ...periodo },
        });
      }
      return buscarPeriodos(conexion, usuario, { anio });
    });
  } catch (err) {
    // Otra alta del mismo año entró a la vez. El FOR UPDATE sobre meses que no existen bloquea el hueco del índice
    // en las dos transacciones, así que el choque puede llegar como deadlock en lugar de llave duplicada.
    if (err.code === 'ER_DUP_ENTRY' || err.code === 'ER_LOCK_DEADLOCK') throw errores.anioExistente(anio);
    throw err;
  }
}

function leerFechaLimite(cuerpo) {
  revisarCampos(cuerpo, ['fechaLimiteEnvio']);
  const fecha = cuerpo.fechaLimiteEnvio;
  const partes = typeof fecha === 'string' ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha) : null;
  // Una fecha que no existe (2020-02-30) cambia de mes al pasar por Date.UTC.
  const valida =
    partes && new Date(Date.UTC(partes[1], partes[2] - 1, partes[3])).toISOString().slice(0, 10) === fecha;
  if (!valida) throw entradaInvalida('fechaLimiteEnvio debe ser una fecha AAAA-MM-DD.');
  return fecha;
}

const aId = (id) => (/^\d+$/.test(id) ? Number(id) : 0);

// Primera consulta de la transacción: con el mes bloqueado, una segunda apertura espera y después ve la fila nueva.
async function bloquearPeriodo(conexion, id) {
  const [[fila]] = await conexion.query(
    `SELECT id, DATE_FORMAT(fecha_fin, '%Y-%m-%d') AS fecha_fin FROM periodo WHERE id = ? FOR UPDATE`,
    [aId(id)],
  );
  if (!fila) throw errores.noEncontrado();
  return fila;
}

// Regla 10: el mes se abre solo en la DDRISS de quien lo abre.
export async function abrirPeriodo(id, cuerpo, usuario, contexto) {
  const fechaLimiteEnvio = leerFechaLimite(cuerpo);
  const { ddrissId } = usuario;
  if (!Number.isInteger(ddrissId)) throw new Error('El usuario que abre el periodo no tiene DDRISS.');

  try {
    return await enTransaccion(async (conexion) => {
      const periodo = await bloquearPeriodo(conexion, id);
      if (fechaLimiteEnvio <= periodo.fecha_fin) throw errores.fechaLimiteInvalida(periodo.fecha_fin);
      const [[cierre]] = await conexion.query(
        'SELECT id FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = ?',
        [periodo.id, ddrissId],
      );
      if (cierre) throw errores.yaAbierto();

      const [resultado] = await conexion.query(
        `INSERT INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado) VALUES (?, ?, ?, 'ABIERTO')`,
        [periodo.id, ddrissId, fechaLimiteEnvio],
      );
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.CONFIGURACION,
        accion: ACCIONES.CREAR,
        entidad: 'cierre_periodo',
        entidadId: resultado.insertId,
        valoresNuevos: {
          id: resultado.insertId,
          periodoId: periodo.id,
          ddrissId,
          fechaLimiteEnvio,
          estado: 'ABIERTO',
        },
      });
      const [abierto] = await buscarPeriodos(conexion, usuario, { id: periodo.id });
      return abierto;
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw errores.yaAbierto();
    throw err;
  }
}

// En EN_CIERRE, ampliar el plazo a hoy o después reabre la entrega; en ABIERTO, el paso a EN_CIERRE es de HU-31.
export async function cambiarFechaLimite(id, cuerpo, usuario, contexto) {
  const fechaLimiteEnvio = leerFechaLimite(cuerpo);

  return enTransaccion(async (conexion) => {
    const [[fila]] = await conexion.query(
      `SELECT p.id, DATE_FORMAT(p.fecha_fin, '%Y-%m-%d') AS fecha_fin, cp.id AS cierre_id, cp.estado,
              DATE_FORMAT(cp.fecha_limite_envio, '%Y-%m-%d') AS fecha_limite_envio
         FROM periodo p
         LEFT JOIN cierre_periodo cp ON cp.periodo_id = p.id AND cp.ddriss_id = ?
        WHERE p.id = ?
        FOR UPDATE`,
      [usuario.ddrissId ?? null, aId(id)],
    );
    if (!fila) throw errores.noEncontrado();
    if (!fila.cierre_id) throw errores.noAbierto();
    if (fila.estado === 'CERRADO') throw errores.cerrado();
    if (fechaLimiteEnvio <= fila.fecha_fin) throw errores.fechaLimiteInvalida(fila.fecha_fin);

    const reabre = fila.estado === 'EN_CIERRE' && fechaLimiteEnvio >= hoyGuatemala();
    const antes = { fechaLimiteEnvio: fila.fecha_limite_envio, estado: fila.estado };
    const despues = { fechaLimiteEnvio, estado: reabre ? 'ABIERTO' : fila.estado };
    const cambios = diferencias(antes, despues);
    if (cambios) {
      await conexion.query('UPDATE cierre_periodo SET fecha_limite_envio = ?, estado = ? WHERE id = ?', [
        despues.fechaLimiteEnvio,
        despues.estado,
        fila.cierre_id,
      ]);
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.CONFIGURACION,
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'cierre_periodo',
        entidadId: fila.cierre_id,
        valoresAnteriores: cambios.anteriores,
        valoresNuevos: cambios.nuevos,
      });
    }
    const [periodo] = await buscarPeriodos(conexion, usuario, { id: fila.id });
    return periodo;
  });
}
