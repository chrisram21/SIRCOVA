import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarParametros } from '../catalogos/catalogos.service.js';
import { buscarRed } from '../catalogos/redes.service.js';
import { ddrissDeLaConsulta, leerRedDeLaDdriss, resultadosVigentes } from './corridas.service.js';
import { leerConsulta as leerConsultaDeProduccion, leerIds, produccionPorFila } from './produccion.service.js';
import { libroDeIndicador, libroDeProduccion, libroDeRed } from './indicadoresExcel.service.js';
import { VISTAS, municipiosDeLaCorrida, municipiosVisibles } from './tablaIndicadores.js';

// SPEC 72 (HU-64): las pestañas de «Indicadores» como .xlsx. Los datos salen de las mismas funciones que la pantalla
// (resultadosVigentes y produccionPorFila); el libro se arma en indicadoresExcel.service.js y después se deja la fila
// EXPORTAR: si la bitácora falla, no se entrega el archivo.

const FORMATO_CODIGO = /^[A-Z0-9_]{1,40}$/;
const noEncontrado = (mensaje) => new ErrorApi(404, 'NO_ENCONTRADO', mensaje);
const dosDigitos = (mes) => String(mes).padStart(2, '0');

function leerId(valor, nombre) {
  if (valor === undefined) return null;
  if (!/^[1-9]\d*$/.test(valor)) throw entradaInvalida(`${nombre} debe ser un número entero positivo.`);
  return Number(valor);
}

async function libroEnBytes(libro) {
  return Buffer.from(await libro.xlsx.writeBuffer());
}

// El nombre y el código de la DDRISS (el código elige el logo, SPEC 78) y el nombre de quien exporta.
async function nombresDelEncabezado(usuario, ddrissId) {
  const [[[ddriss]], [[empleado]]] = await Promise.all([
    pool.query('SELECT codigo, nombre FROM ddriss WHERE id = ?', [ddrissId]),
    pool.query(
      `SELECT CONCAT(e.nombres, ' ', e.apellidos) AS nombre FROM usuario u JOIN empleado e ON e.id = u.empleado_id
        WHERE u.id = ?`,
      [usuario.id],
    ),
  ]);
  return { ddriss: ddriss.nombre, ddrissCodigo: ddriss.codigo, generadoPor: empleado.nombre };
}

async function leerDistrito(distritoId, ddrissId) {
  const [[distrito]] = await pool.query(
    'SELECT id, nombre, municipio_id FROM distrito_salud WHERE id = ? AND ddriss_id = ? AND activo = TRUE',
    [distritoId, ddrissId],
  );
  if (!distrito) throw noEncontrado('El distrito de salud no existe.');
  return distrito;
}

// La red activa de la DDRISS con sus municipios y trazadoras, como la recibe la pantalla (GET /redes).
async function leerRedCompleta(redId, ddrissId) {
  const red = await buscarRed(pool, redId);
  if (!red || !red.activo || red.ddriss.id !== ddrissId) throw noEncontrado('La red no existe.');
  return red;
}

function registrarExportacion(contexto, entidadId, valoresNuevos) {
  return enTransaccion((conexion) => registrarBitacora(conexion, {
    ...contexto,
    modulo: MODULOS.INDICADORES,
    accion: ACCIONES.EXPORTAR,
    entidad: 'indicador',
    entidadId,
    valoresNuevos,
  }));
}

function leerConsultaDeResultados(query) {
  revisarParametros(query, ['anio', 'mes', 'vista', 'indicador', 'redId', 'distritoId', 'municipioIds', 'ddrissId']);
  if (query.vista === undefined) throw entradaInvalida('La vista es obligatoria.');
  if (!Object.hasOwn(VISTAS, query.vista)) {
    throw entradaInvalida(`La vista debe ser una de: ${Object.keys(VISTAS).join(', ')}.`);
  }
  const enRedes = query.vista === 'redes';
  if (enRedes && query.indicador !== undefined) throw entradaInvalida('Parámetro no permitido en redes: indicador.');
  if (!enRedes && query.indicador === undefined) throw entradaInvalida('El indicador es obligatorio.');
  if (query.indicador !== undefined && !FORMATO_CODIGO.test(query.indicador)) {
    throw entradaInvalida('indicador debe ser un código en mayúsculas, dígitos y guion bajo.');
  }
  const redId = leerId(query.redId, 'redId');
  if (enRedes && redId === null) throw entradaInvalida('La red es obligatoria en redes.');
  // La red manda sobre el distrito y los municipios, como en la pantalla: con red no se leen.
  return {
    vista: query.vista,
    indicador: query.indicador ?? null,
    redId,
    distritoId: redId === null ? leerId(query.distritoId, 'distritoId') : null,
    municipioIds: redId === null ? leerIds(query.municipioIds, 'municipioIds') ?? [] : [],
  };
}

/** La tabla de una pestaña de indicadores (o de Redes) como .xlsx. contexto: contextoAuditoria(req). */
export async function exportarResultados(usuario, query, contexto, ahora = new Date()) {
  const consulta = leerConsultaDeResultados(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  // resultadosVigentes revisa anio, mes y ddrissId, y con redId agrega la fila «Total de la red».
  const pedido = { anio: query.anio, mes: query.mes };
  if (query.ddrissId !== undefined) pedido.ddrissId = query.ddrissId;
  if (consulta.redId !== null) pedido.redId = String(consulta.redId);
  const [{ corrida, resultados }, red, distrito, nombres] = await Promise.all([
    resultadosVigentes(usuario, pedido),
    consulta.redId === null ? null : leerRedCompleta(consulta.redId, ddrissId),
    consulta.distritoId === null ? null : leerDistrito(consulta.distritoId, ddrissId),
    nombresDelEncabezado(usuario, ddrissId),
  ]);
  if (!corrida) throw noEncontrado('No hay indicadores calculados para ese mes.');

  let indicador = null;
  if (consulta.vista !== 'redes') {
    indicador = corrida.indicadores.find((i) => i.codigo === consulta.indicador);
    if (!indicador || !resultados.some((r) => r.indicadorCodigo === indicador.codigo)) {
      throw entradaInvalida('El indicador no está en la corrida.');
    }
    if (indicador.tipoCalculo !== VISTAS[consulta.vista]) {
      throw entradaInvalida('El indicador no es de la pestaña elegida.');
    }
  }

  // Los municipios elegidos que la pantalla acepta: los de la corrida dentro del distrito.
  const elegidos = red ? [] : municipiosVisibles(municipiosDeLaCorrida(resultados), {
    delDistrito: distrito ? [distrito.municipio_id] : null,
    elegidos: consulta.municipioIds,
  }).filter((m) => consulta.municipioIds.includes(m.id));
  const datos = {
    ...nombres,
    generadoEn: ahora,
    territorio: {
      red: red && { nombre: red.nombre },
      distrito: distrito && { nombre: distrito.nombre },
      municipios: elegidos.map((m) => m.nombre),
    },
  };
  const libro = consulta.vista === 'redes'
    ? libroDeRed({ corrida, resultados, red }, datos)
    : libroDeIndicador({
      vista: consulta.vista,
      corrida,
      resultados,
      indicador,
      red,
      municipioDelDistrito: distrito?.municipio_id ?? null,
      municipioIds: consulta.municipioIds,
    }, datos);
  const bytes = await libroEnBytes(libro);

  const entidadId = consulta.vista === 'redes' ? `red-${red.id}` : indicador.codigo;
  await registrarExportacion(contexto, entidadId, {
    formato: 'xlsx',
    vista: consulta.vista,
    anio: corrida.anio,
    mes: corrida.mesHasta,
    corridaId: corrida.id,
    ddrissId,
    redId: consulta.redId,
    distritoId: consulta.distritoId,
    municipioIds: consulta.municipioIds,
  });

  const periodo = `${corrida.anio}-${dosDigitos(corrida.mesHasta)}`;
  const nombre = consulta.vista === 'redes'
    ? `indicadores-redes-red-${red.id}-${periodo}.xlsx`
    : `indicadores-${consulta.vista}-${indicador.codigo}-${periodo}.xlsx`;
  return { bytes, nombre };
}

/** La pestaña «Producción» como .xlsx, con los mismos parámetros que GET /indicadores/produccion. */
export async function exportarProduccion(usuario, query, contexto, ahora = new Date()) {
  const produccion = await produccionPorFila(usuario, query);
  const consulta = leerConsultaDeProduccion(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const nombresDe = (tabla, ids) => (ids === null
    ? [[]]
    : pool.query(`SELECT nombre FROM ${tabla} WHERE id IN (?) ORDER BY nombre`, [ids]));
  const [nombres, red, distrito, [municipios], [establecimientos]] = await Promise.all([
    nombresDelEncabezado(usuario, ddrissId),
    consulta.redId === null ? null : leerRedDeLaDdriss(consulta.redId, ddrissId),
    consulta.distritoId === null ? null : leerDistrito(consulta.distritoId, ddrissId),
    nombresDe('municipio', consulta.municipioIds),
    nombresDe('establecimiento', consulta.establecimientoIds),
  ]);
  const libro = libroDeProduccion(produccion, {
    ...nombres,
    generadoEn: ahora,
    territorio: {
      red: red && { nombre: red.nombre },
      distrito: distrito && { nombre: distrito.nombre },
      municipios: municipios.map((m) => m.nombre),
    },
    establecimientos: establecimientos.map((e) => e.nombre),
  });
  const bytes = await libroEnBytes(libro);

  await registrarExportacion(contexto, 'produccion', {
    formato: 'xlsx',
    anio: consulta.anio,
    mes: consulta.mes,
    acumulado: consulta.acumulado,
    agrupar: consulta.agrupar,
    vacuna: consulta.vacuna,
    ddrissId,
    redId: consulta.redId,
    distritoId: consulta.distritoId,
    municipioIds: consulta.municipioIds ?? [],
    establecimientoIds: consulta.establecimientoIds ?? [],
  });

  const acumulado = consulta.acumulado ? '-acumulado' : '';
  return { bytes, nombre: `indicadores-produccion-${consulta.anio}-${dosDigitos(consulta.mes)}${acumulado}.xlsx` };
}
