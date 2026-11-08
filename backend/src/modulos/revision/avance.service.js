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

async function mesPedido(condicion, valores, ddrissId) {
  const [[fila]] = await pool.query(`SELECT ${COLUMNAS_PERIODO} WHERE ${condicion} AND cp.ddriss_id = ?`, [
    ...valores,
    ddrissId,
  ]);
  if (!fila) throw new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.');
  return fila;
}

// SPEC 50: el mes por periodoId o por anio + mes (la Autoridad no tiene PERIODO_CONSULTAR); sin ninguno, null.
function leerMesPedido(query) {
  const conAnio = query.anio !== undefined;
  const conMes = query.mes !== undefined;
  if (query.periodoId !== undefined && (conAnio || conMes)) {
    throw entradaInvalida('Use periodoId o anio y mes, no los dos.');
  }
  if (conAnio !== conMes) throw entradaInvalida('anio y mes van juntos.');
  if (query.periodoId !== undefined) {
    return { condicion: 'cp.periodo_id = ?', valores: [leerEntero(query.periodoId, 'periodoId')] };
  }
  if (!conAnio) return null;
  return {
    condicion: 'p.anio = ? AND p.mes = ?',
    valores: [
      leerEntero(query.anio, 'anio', { minimo: 2000, maximo: 2100 }),
      leerEntero(query.mes, 'mes', { minimo: 1, maximo: 12 }),
    ],
  };
}

const columnasDeConteo = () => [...ESTADOS, 'TODOS'].map((codigo) => ({ codigo, ...GRUPOS[codigo]() }));
const sumas = (columnas) => columnas.map((c) => `COALESCE(SUM(${c.sql}), 0) AS ${c.codigo}`).join(', ');
const aConteos = (fila) => Object.fromEntries(ESTADOS.map((estado) => [estado, Number(fila[estado])]));

// El municipio es el del establecimiento: donde se reporta, no la procedencia de las dosis.
async function conteosPorMunicipio(base) {
  const columnas = columnasDeConteo();
  const [filas] = await pool.query(
    `SELECT m.id AS municipio_id, m.nombre AS municipio_nombre, m.codigo_ine, ${sumas(columnas)} ${base.desde}
      GROUP BY m.id, m.nombre, m.codigo_ine
      ORDER BY m.nombre`,
    [...columnas.flatMap((c) => c.parametros), ...base.parametros],
  );
  return filas.map((f) => ({
    municipio: { id: f.municipio_id, nombre: f.municipio_nombre, codigoIne: f.codigo_ine },
    esperados: Number(f.TODOS),
    conteos: aConteos(f),
  }));
}

export async function obtenerAvance(usuario, query = {}) {
  revisarParametros(query, ['periodoId', 'anio', 'mes', 'desglose', 'ddrissId']);
  const pedido = leerMesPedido(query);
  if (query.desglose !== undefined && query.desglose !== 'municipio') {
    throw entradaInvalida('desglose solo admite el valor municipio.');
  }
  const conDesglose = query.desglose === 'municipio';
  const ddrissId = ddrissDeLaConsulta(usuario, query);

  const periodo = pedido === null
    ? await mesQueSeCierra(ddrissId)
    : await mesPedido(pedido.condicion, pedido.valores, ddrissId);
  if (!periodo) {
    return {
      periodo: null,
      esperados: 0,
      conteos: Object.fromEntries(ESTADOS.map((estado) => [estado, 0])),
      ...(conDesglose ? { municipios: [] } : {}),
    };
  }

  const base = consultaBase({ periodoId: periodo.id, municipioId: null }, ddrissId);
  const columnas = columnasDeConteo();
  const parametros = [...columnas.flatMap((c) => c.parametros), ...base.parametros];
  const [[[fila]], municipios] = await Promise.all([
    pool.query(`SELECT ${sumas(columnas)} ${base.desde}`, parametros),
    conDesglose ? conteosPorMunicipio(base) : null,
  ]);
  return {
    periodo: {
      id: periodo.id,
      anio: periodo.anio,
      mes: periodo.mes,
      estado: periodo.estado,
      fechaLimiteEnvio: periodo.fecha_limite_envio,
    },
    esperados: Number(fila.TODOS),
    conteos: aConteos(fila),
    ...(conDesglose ? { municipios } : {}),
  };
}
