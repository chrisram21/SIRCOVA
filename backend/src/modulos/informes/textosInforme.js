import { NOMBRES_MES } from '../produccion/validacion.service.js';

// SPEC 64 y 65 (HU-47, HU-48): los textos que comparten el Excel y el PDF de un informe de producción. Repiten los de
// frontend/src/paginas/informes/ (informes.js, TablaInforme.jsx y PaginaInformes.jsx): un cambio va en los dos lados.

export const NOMBRES_INFORME = {
  'poblacion-propia': 'Producción a la población propia',
  total: 'Producción total (incluye Migrantes)',
  residencia: 'Dosis por municipio de residencia',
};
export const NOMBRES_NIVEL = {
  departamento: 'Departamento', municipio: 'Municipio', distrito: 'Distrito', establecimiento: 'Establecimiento',
};
const NO_SUMA = ' (no suma en el consolidado)';
const ZONA_HORARIA = 'America/Guatemala';

const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const nombreDelMes = ({ anio, mes }) => `${NOMBRES_MES[mes - 1]} de ${anio}`;
const numero = ({ anio, mes }) => anio * 100 + mes;
const enumerar = (textos) => (textos.length === 1 ? textos[0] : `${textos.slice(0, -1).join(', ')} y ${textos.at(-1)}`);
const formatoEntero = new Intl.NumberFormat('es-GT');

export function textoRango(desde, hasta) {
  if (numero(desde) === numero(hasta)) return conMayuscula(nombreDelMes(hasta));
  return `De ${nombreDelMes(desde)} a ${nombreDelMes(hasta)}`;
}

function textoMesesSinCerrar(meses) {
  if (meses.every((m) => m.anio === meses[0].anio)) {
    return `${enumerar(meses.map((m) => NOMBRES_MES[m.mes - 1]))} de ${meses[0].anio}`;
  }
  return enumerar(meses.map(nombreDelMes));
}

function avisoDeMeses(mesesSinCerrar, preliminar) {
  if (mesesSinCerrar.length === 0) return null;
  const meses = textoMesesSinCerrar(mesesSinCerrar);
  const uno = mesesSinCerrar.length === 1;
  if (preliminar) return `Datos preliminares: ${meses} todavía no ${uno ? 'está cerrado' : 'están cerrados'}.`;
  return `${conMayuscula(meses)} todavía no ${uno ? 'está cerrado y no suma' : 'están cerrados y no suman'} `
    + 'en el informe. Marca «Incluir aprobados sin cerrar» para verlos como preliminares.';
}

function avisoDeAgrupacion({ agrupacion, columnas }, todasLasVacunas) {
  if (!agrupacion) return null;
  if (columnas.length === 0) return `Ninguna vacuna de este informe registra ${agrupacion.nombre}.`;
  if (!todasLasVacunas) return null;
  const nombres = [...new Set(columnas.map((c) => c.vacuna.nombre))];
  return `Solo se muestran las vacunas que registran ${agrupacion.nombre}: ${enumerar(nombres)}.`;
}

export function avisosDelInforme(informe, todasLasVacunas) {
  return [avisoDeMeses(informe.mesesSinCerrar, informe.preliminar), avisoDeAgrupacion(informe, todasLasVacunas)]
    .filter(Boolean);
}

export function tituloDelInforme({ informe, nivel, agrupacion }) {
  const titulo = `${NOMBRES_INFORME[informe]} · ${NOMBRES_NIVEL[nivel]}`;
  return agrupacion ? `${titulo} · por ${agrupacion.nombre}` : titulo;
}

// El título de la columna de los nombres de las filas.
export function tituloDeLaFila(nivel, informe) {
  if (nivel === 'municipio') return informe === 'residencia' ? 'Municipio de residencia' : 'Municipio de aplicación';
  return NOMBRES_NIVEL[nivel];
}

// Por establecimiento y por distrito, cada fila lleva además su municipio.
export const llevaMunicipio = (nivel) => nivel === 'establecimiento' || nivel === 'distrito';

export const nombreDeFila = (fila) => (fila.fueraDelConsolidado ? `${fila.nombre}${NO_SUMA}` : fila.nombre);

export const textoFueraDelConsolidado = (dosis) =>
  `Además, ${formatoEntero.format(dosis)} dosis de establecimientos que no suman en el consolidado.`;

// DD/MM/AAAA HH:mm en Guatemala; no se lee de MySQL (sale 6 h corrida con Aiven).
export function fechaDeGeneracion(fecha) {
  const partes = Object.fromEntries(new Intl.DateTimeFormat('es-GT', {
    timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha).map((p) => [p.type, p.value]));
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`;
}

function textoTerritorio({ red, municipios }) {
  if (red) return `Red ${red.nombre}`;
  if (municipios.length) return municipios.join(', ');
  return 'Todos los municipios';
}

/**
 * Las líneas [etiqueta, valor] del encabezado, después del título y de «PRELIMINAR». datos: { ddriss, vacuna
 * (nombre o null), red ({ nombre } o null), municipios (nombres), generadoPor, generadoEn (Date) }.
 */
export function lineasDelEncabezado(informe, datos) {
  return [
    ['DDRISS', datos.ddriss],
    ['Periodo', textoRango(informe.desde, informe.hasta)],
    ['Vacuna', datos.vacuna ?? 'Todas las vacunas'],
    ['Territorio', textoTerritorio(datos)],
    ['Agrupación', informe.agrupacion?.nombre ?? 'Sección del 5C'],
    ['Incluye aprobados sin cerrar', informe.incluirAprobados ? 'Sí' : 'No'],
    ['Generado', `${fechaDeGeneracion(datos.generadoEn)} por ${datos.generadoPor}`],
    ...avisosDelInforme(informe, !datos.vacuna).map((aviso) => ['Aviso', aviso]),
  ];
}

// Los tramos de las dos primeras filas del encabezado (como encabezadosDeTabla del frontend): vacuna, y sección o
// valor de la dimensión, cada uno con las columnas seguidas que abarca.
export function tramosDelEncabezado(columnas) {
  const vacunas = [];
  const secciones = [];
  let ultima = null;
  columnas.forEach((columna, i) => {
    if (vacunas.at(-1)?.codigo === columna.vacuna.codigo) vacunas.at(-1).abarca += 1;
    else vacunas.push({ codigo: columna.vacuna.codigo, nombre: columna.vacuna.nombre, desde: i, abarca: 1 });
    const titulo = columna.valor?.etiqueta ?? columna.seccion?.titulo ?? '';
    const grupo = columna.valor ? `valor:${columna.valor.codigo}` : columna.seccion?.grupoEdad ?? null;
    const identidad = `${columna.vacuna.codigo}|${grupo}|${titulo}`;
    if (identidad === ultima) secciones.at(-1).abarca += 1;
    else secciones.push({ titulo, desde: i, abarca: 1 });
    ultima = identidad;
  });
  return { vacunas, secciones };
}
