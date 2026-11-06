import pool from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { esAlcanceNacional } from '../auth/alcance.service.js';
import { entradaInvalida, revisarParametros } from '../catalogos/catalogos.service.js';
import { GRUPOS, consultaBase, leerEntero } from './bandeja.service.js';

// SPEC 48: cuántos reportes de un mes hay en cada estado, para el resumen del Inicio.

const ESTADOS = ['SIN_ENVIAR', 'ENVIADO', 'EN_REVISION', 'CORRECCION_SOLICITADA', 'APROBADO', 'CERRADO'];

// La Autoridad nacional elige la DDRISS (obligatorio); los demás roles consultan la suya y no pueden mandarla.
function ddrissDeLaConsulta(usuario, query) {
  if (esAlcanceNacional(usuario)) {
    if (query.ddrissId === undefined) throw entradaInvalida('ddrissId es obligatorio para consultar todo el país.');
    return leerEntero(query.ddrissId, 'ddrissId');
  }
  if (query.ddrissId !== undefined) throw entradaInvalida('Parámetro no permitido: ddrissId.');
  return usuario.ddrissId;
}

const COLUMNAS_PERIODO = `p.id, p.anio, p.mes, cp.estado, DATE_FORMAT(cp.fecha_limite_envio, '%Y-%m-%d') AS fecha_limite_envio
       FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id`;

// El mes que se está cerrando: el EN_CIERRE más antiguo, si no el ABIERTO más antiguo, si no el último CERRADO.
async function mesQueSeCierra(ddrissId) {
  const [[fila]] = await pool.query(
    `SELECT ${COLUMNAS_PERIODO}
      WHERE cp.ddriss_id = ?
      ORDER BY FIELD(cp.estado, 'EN_CIERRE', 'ABIERTO', 'CERRADO'),
               CASE WHEN cp.estado = 'CERRADO' THEN -(p.anio * 12 + p.mes) ELSE p.anio * 12 + p.mes END
      LIMIT 1`,
    [ddrissId],
  );
  return fila ?? null;
}

async function mesPedido(periodoId, ddrissId) {
  const [[fila]] = await pool.query(`SELECT ${COLUMNAS_PERIODO} WHERE cp.periodo_id = ? AND cp.ddriss_id = ?`, [
    periodoId,
    ddrissId,
  ]);
  if (!fila) throw new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.');
  return fila;
}

export async function obtenerAvance(usuario, query = {}) {
  revisarParametros(query, ['periodoId', 'ddrissId']);
  const periodoId = query.periodoId === undefined ? null : leerEntero(query.periodoId, 'periodoId');
  const ddrissId = ddrissDeLaConsulta(usuario, query);

  const periodo = periodoId === null ? await mesQueSeCierra(ddrissId) : await mesPedido(periodoId, ddrissId);
  if (!periodo) {
    return { periodo: null, esperados: 0, conteos: Object.fromEntries(ESTADOS.map((estado) => [estado, 0])) };
  }

  const base = consultaBase({ periodoId: periodo.id, municipioId: null }, ddrissId);
  const columnas = [...ESTADOS, 'TODOS'].map((codigo) => ({ codigo, ...GRUPOS[codigo]() }));
  const [[fila]] = await pool.query(
    `SELECT ${columnas.map((c) => `COALESCE(SUM(${c.sql}), 0) AS ${c.codigo}`).join(', ')} ${base.desde}`,
    [...columnas.flatMap((c) => c.parametros), ...base.parametros],
  );
  return {
    periodo: {
      id: periodo.id,
      anio: periodo.anio,
      mes: periodo.mes,
      estado: periodo.estado,
      fechaLimiteEnvio: periodo.fecha_limite_envio,
    },
    esperados: Number(fila.TODOS),
    conteos: Object.fromEntries(ESTADOS.map((estado) => [estado, Number(fila[estado])])),
  };
}
