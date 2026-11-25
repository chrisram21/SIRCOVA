import pool from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { entradaInvalida, leerBooleano, revisarParametros } from '../catalogos/catalogos.service.js';
import { codigoDdriss } from '../configuracion/esquemas.service.js';
import { indicadoresQueAplican } from '../configuracion/indicadores.service.js';
import { dosisQueFaltan } from '../indicadores/calculadores.js';
import { ddrissDeLaConsulta } from '../indicadores/corridas.service.js';
import { libroDelAcumulado } from './informeExcel.service.js';
import { pdfDelAcumulado } from './informePdf.service.js';
import {
  columnasDelInforme,
  datosDelEncabezado,
  departamentoDeLaDdriss,
  registrarExportacion,
  filasDelNivel,
  leerIds,
  leerProduccion,
  leerRedId,
  leerVacunas,
  llave,
  llaveDeColumna,
  municipiosDelRecorte,
  universoDeMunicipios,
  vacunasElegidas,
} from './informes.service.js';

const noEncontrado = (mensaje) => new ErrorApi(404, 'NO_ENCONTRADO', mensaje);

const NIVELES = ['departamento', 'municipio', 'distrito'];

export function leerConsultaAnual(query) {
  revisarParametros(query, ['anio', 'nivel', 'vacuna', 'redId', 'municipioIds', 'incluirAprobados', 'ddrissId']);
  if (query.anio === undefined) throw entradaInvalida('anio es obligatorio.');
  if (!/^(20\d{2}|2100)$/.test(query.anio)) throw entradaInvalida('anio debe ser un año entre 2000 y 2100.');
  const nivel = query.nivel ?? 'municipio';
  if (!NIVELES.includes(nivel)) throw entradaInvalida(`nivel debe ser ${NIVELES.join(', ')}.`);
  return {
    anio: Number(query.anio),
    nivel,
    vacunas: leerVacunas(query),
    redId: leerRedId(query),
    municipioIds: leerIds(query.municipioIds, 'municipioIds'),
    incluirAprobados: leerBooleano(query, 'incluirAprobados') ?? false,
  };
}

async function mesesDelAnio(ddrissId, anio) {
  const [meses] = await pool.query(
    `SELECT p.mes, cp.estado FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
      WHERE cp.ddriss_id = ? AND p.anio = ? ORDER BY p.mes`,
    [ddrissId, anio],
  );
  if (meses.length === 0) throw noEncontrado('El año no tiene meses habilitados en la DDRISS.');
  return meses;
}

// Población del año por municipio del departamento y código de clasificacion_poblacion (= grupo de edad del 5C).
async function poblacionDelAnio(departamentoId, anio) {
  const [filas] = await pool.query(
    `SELECT po.municipio_id, cp.codigo, po.cantidad
       FROM poblacion_objetivo po
       JOIN clasificacion_poblacion cp ON cp.id = po.clasificacion_poblacion_id
       JOIN municipio m ON m.id = po.municipio_id
      WHERE po.anio = ? AND m.departamento_id = ?`,
    [anio, departamentoId],
  );
  const porMunicipio = new Map();
  for (const f of filas) {
    if (!porMunicipio.has(f.municipio_id)) porMunicipio.set(f.municipio_id, new Map());
    porMunicipio.get(f.municipio_id).set(f.codigo, f.cantidad);
  }
  return porMunicipio;
}

// La población de una columna para varios municipios: null si la columna no tiene grupo de edad, si no hay municipios
// o si a alguno le falta (como la fila departamental del motor).
function poblacionDeLaColumna(columna, municipioIds, poblacion) {
  const grupo = columna.seccion?.grupoEdad ?? null;
  if (grupo === null || municipioIds.length === 0) return null;
  let suma = 0;
  for (const id of municipioIds) {
    const cantidad = poblacion.get(id)?.get(grupo);
    if (cantidad === undefined) return null;
    suma += cantidad;
  }
  return suma;
}

const META_POR_DEFECTO = 95;
const PREFERENCIA = ['COBERTURA', 'BRECHA'];

// Un indicador mide la columna entera si no filtra dimensiones o si su único filtro es grupo_edad con justo el grupo
// de la columna (como COB_HEXA3 con grupo_edad: [MENOR_1]); uno de un sexo u otros grupos mide solo una parte.
function mideLaColumna(aplica, grupo) {
  const filtros = Object.entries(aplica.filtros_dimension ?? {}).filter(([, v]) => Array.isArray(v) && v.length > 0);
  if (filtros.length === 0) return true;
  const [[dimension, valores]] = filtros;
  return filtros.length === 1 && dimension === 'grupo_edad' && valores.length === 1 && valores[0] === grupo;
}

// La meta de cada columna: la del indicador COBERTURA que aplica hoy a la DDRISS con su vacuna, dosis y grupo de
// población; si no hay, la del BRECHA; sin ninguno, 95. Con varios del mismo tipo, el primero por código.
function metasDeLasColumnas(columnas, versiones) {
  return columnas.map((c) => {
    const grupo = c.seccion?.grupoEdad ?? null;
    const candidatas = versiones.filter((v) => {
      const aplica = v.aplica_a?.[0] ?? {};
      return grupo !== null && aplica.vacuna === c.vacuna.codigo && aplica.dosis === c.dosis.codigo
        && aplica.clasificacion_poblacion === grupo && mideLaColumna(aplica, grupo);
    });
    for (const tipo of PREFERENCIA) {
      const version = candidatas.find((v) => v.tipo_calculo === tipo && typeof v.meta?.valor === 'number');
      if (version) return { valor: version.meta.valor, indicador: version.codigo };
    }
    return { valor: META_POR_DEFECTO, indicador: null };
  });
}

// Las cuatro cifras de una fila: la cobertura (1 decimal) y la brecha salen de sus propias dosis y población.
function cifras(dosis, poblacion, metas) {
  const calculable = (i) => poblacion[i] !== null && poblacion[i] > 0;
  return {
    dosis,
    poblacion,
    cobertura: dosis.map((d, i) => (calculable(i) ? Math.round((d / poblacion[i]) * 1000) / 10 : null)),
    brecha: dosis.map((d, i) => (calculable(i) ? dosisQueFaltan(metas[i].valor, poblacion[i], d) : null)),
  };
}

// Las dosis atribuidas por residencia de enero a diciembre de `anio` (las del informe `residencia`), contra la
// población del año, por columna vacuna × sección × dosis (SPEC 66, HU-49).
export async function acumuladoAnual(usuario, query = {}) {
  const consulta = leerConsultaAnual(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const { anio, nivel, incluirAprobados } = consulta;

  const departamento = await departamentoDeLaDdriss(ddrissId);
  const [meses, vacunas, recorte, poblacion, versiones] = await Promise.all([
    mesesDelAnio(ddrissId, anio),
    vacunasElegidas(consulta.vacunas),
    municipiosDelRecorte(consulta, ddrissId),
    poblacionDelAnio(departamento.id, anio),
    codigoDdriss(ddrissId).then(indicadoresQueAplican),
  ]);

  const produccion = await leerProduccion({
    ddrissId, informe: 'residencia', desde: { anio, mes: 1 }, hasta: { anio, mes: 12 }, incluirAprobados,
    vacunaIds: consulta.vacunas === null ? null : vacunas.map((v) => v.id), agrupacion: null,
  });
  const ultimo = { anio, mes: meses.at(-1).mes };
  const enRecorte = (municipioId) => recorte === null || recorte.includes(municipioId);
  const ceros = () => columnas.map(() => 0);
  const conDatos = [...new Set(produccion.map((p) => p.municipioId))];
  const [columnas, municipios] = await Promise.all([
    columnasDelInforme({ ddrissId, vacunaCodigos: consulta.vacunas, hasta: ultimo, conDatos: produccion }),
    universoDeMunicipios(ddrissId, conDatos),
  ]);
  const { filas, destinos } = await filasDelNivel(nivel, { ddrissId, departamento, produccion, enRecorte, ceros });

  const indice = new Map(columnas.map((c, i) => [llaveDeColumna(c), i]));
  const dosisTotal = ceros();
  for (const p of produccion) {
    if (!enRecorte(p.municipioId)) continue;
    const posicion = indice.get(llave(p.dosisId, p.grupoEdad));
    dosisTotal[posicion] += p.cantidad;
    for (const destino of destinos(p)) destino.cantidades[posicion] += p.cantidad;
  }

  // Los municipios de cada fila salen de los mismos destinos que reparten las dosis (por distrito, «Sin distrito»).
  const delRecorte = municipios.filter((m) => enRecorte(m.id)).map((m) => m.id);
  const municipiosDe = new Map(filas.map((f) => [f, []]));
  for (const id of delRecorte) for (const f of destinos({ municipioId: id })) municipiosDe.get(f).push(id);
  const poblacionDe = (ids) => columnas.map((c) => poblacionDeLaColumna(c, ids, poblacion));
  const metas = metasDeLasColumnas(columnas, versiones);

  const mesesSinCerrar = [];
  for (let mes = 1; mes <= 12; mes += 1) {
    const estado = meses.find((m) => m.mes === mes)?.estado ?? null;
    if (estado !== 'CERRADO') mesesSinCerrar.push({ anio, mes, estado });
  }
  return {
    informe: 'acumulado-anual',
    nivel,
    anio,
    incluirAprobados,
    columnas: columnas.map(({ vacuna, seccion, dosis }, i) => ({ vacuna, seccion, dosis, meta: metas[i] })),
    filas: filas.map((f) => ({
      id: f.id, codigo: f.codigo, nombre: f.nombre, municipio: f.municipio,
      ...cifras(f.cantidades, poblacionDe(municipiosDe.get(f)), metas),
    })),
    total: cifras(dosisTotal, poblacionDe(delRecorte), metas),
    mesesSinCerrar,
    preliminar: incluirAprobados && meses.some((m) => m.estado !== 'CERRADO'),
  };
}

const ARCHIVOS = {
  xlsx: async (informe, datos) => Buffer.from(await libroDelAcumulado(informe, datos).xlsx.writeBuffer()),
  pdf: (informe, datos) => pdfDelAcumulado(informe, datos),
};

// El acumulado como archivo (formato: xlsx o pdf), con su fila EXPORTAR después de armarlo, como exportarInforme.
export async function exportarAcumuladoAnual(usuario, query, contexto, formato, ahora = new Date()) {
  const informe = await acumuladoAnual(usuario, query);
  const consulta = leerConsultaAnual(query);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  const datos = await datosDelEncabezado(usuario, consulta, ddrissId);
  const bytes = await ARCHIVOS[formato](informe, { ...datos, generadoEn: ahora });

  await registrarExportacion(contexto, 'acumulado-anual', {
    formato,
    anio: consulta.anio,
    nivel: consulta.nivel,
    vacuna: datos.codigosDeVacunas,
    redId: consulta.redId,
    municipioIds: consulta.municipioIds ?? [],
    incluirAprobados: consulta.incluirAprobados,
    ddrissId,
  });
  return { bytes, nombre: `informe-acumulado-anual-${consulta.anio}.${formato}` };
}
