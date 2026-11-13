import ExcelJS from 'exceljs';
import { NOMBRES_MES } from '../produccion/validacion.service.js';

// SPEC 64 (HU-47): el libro .xlsx de un informe de producción. Recibe la respuesta de informePorFila, la misma que
// ve la pantalla, y no consulta nada. Los textos repiten los de frontend/src/paginas/informes/ (informes.js,
// TablaInforme.jsx y PaginaInformes.jsx): un cambio va en los dos lados.

export const NOMBRES_INFORME = {
  'poblacion-propia': 'Producción a la población propia',
  total: 'Producción total (incluye Migrantes)',
  residencia: 'Dosis por municipio de residencia',
};
export const HOJAS = { 'poblacion-propia': 'Población propia', total: 'Producción total', residencia: 'Residencia' };
export const NOMBRES_NIVEL = {
  departamento: 'Departamento', municipio: 'Municipio', distrito: 'Distrito', establecimiento: 'Establecimiento',
};
export const FORMATO_CANTIDAD = '#,##0';
const NO_SUMA = ' (no suma en el consolidado)';
const ZONA_HORARIA = 'America/Guatemala';

const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
const nombreDelMes = ({ anio, mes }) => `${NOMBRES_MES[mes - 1]} de ${anio}`;
const numero = ({ anio, mes }) => anio * 100 + mes;
const enumerar = (textos) => (textos.length === 1 ? textos[0] : `${textos.slice(0, -1).join(', ')} y ${textos.at(-1)}`);

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

function tituloDeLaFila(nivel, informe) {
  if (nivel === 'municipio') return informe === 'residencia' ? 'Municipio de residencia' : 'Municipio de aplicación';
  return NOMBRES_NIVEL[nivel];
}

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

/**
 * informe: la respuesta de informePorFila. datos: { ddriss, vacuna (nombre o null), red ({ nombre } o null),
 * municipios (nombres), generadoPor, generadoEn (Date) }.
 */
export function libroDelInforme(informe, datos) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRCOVA';
  libro.created = datos.generadoEn;
  const conMunicipio = informe.nivel === 'establecimiento' || informe.nivel === 'distrito';
  const fijas = conMunicipio ? 2 : 1;
  const hoja = libro.addWorksheet(HOJAS[informe.informe]);

  hoja.addRow([tituloDelInforme(informe)]).font = { bold: true, size: 14 };
  if (informe.preliminar) hoja.addRow(['PRELIMINAR']).font = { bold: true };
  const encabezado = [
    ['DDRISS', datos.ddriss],
    ['Periodo', textoRango(informe.desde, informe.hasta)],
    ['Vacuna', datos.vacuna ?? 'Todas las vacunas'],
    ['Territorio', textoTerritorio(datos)],
    ['Agrupación', informe.agrupacion?.nombre ?? 'Sección del 5C'],
    ['Incluye aprobados sin cerrar', informe.incluirAprobados ? 'Sí' : 'No'],
    ['Generado', `${fechaDeGeneracion(datos.generadoEn)} por ${datos.generadoPor}`],
    ...avisosDelInforme(informe, !datos.vacuna).map((aviso) => ['Aviso', aviso]),
  ];
  for (const [etiqueta, valor] of encabezado) hoja.addRow([etiqueta, valor]).getCell(1).font = { bold: true };

  hoja.getColumn(1).width = 40;
  if (conMunicipio) hoja.getColumn(2).width = 28;
  if (informe.columnas.length === 0) return libro;

  hoja.addRow([]);
  const filaVacuna = hoja.rowCount + 1;
  const { vacunas, secciones } = tramosDelEncabezado(informe.columnas);
  const columna = (i) => fijas + i + 1;
  const vacio = Array(informe.columnas.length).fill(null);

  const primera = [tituloDeLaFila(informe.nivel, informe.informe), ...(conMunicipio ? ['Municipio'] : []), ...vacio];
  vacunas.forEach((v) => { primera[fijas + v.desde] = v.nombre; });
  const segunda = [...Array(fijas).fill(null), ...vacio];
  secciones.forEach((s) => { segunda[fijas + s.desde] = s.titulo || null; });
  const tercera = [...Array(fijas).fill(null), ...informe.columnas.map((c) => c.dosis.codigo)];
  for (const valores of [primera, segunda, tercera]) {
    const fila = hoja.addRow(valores);
    fila.font = { bold: true };
    fila.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  for (let c = 1; c <= fijas; c += 1) {
    hoja.mergeCells(filaVacuna, c, filaVacuna + 2, c);
    hoja.getCell(filaVacuna, c).alignment = { horizontal: 'left', vertical: 'bottom' };
  }
  const combinar = (fila, { desde, abarca }) => {
    if (abarca > 1) hoja.mergeCells(fila, columna(desde), fila, columna(desde + abarca - 1));
  };
  vacunas.forEach((v) => combinar(filaVacuna, v));
  secciones.forEach((s) => combinar(filaVacuna + 1, s));

  const agregarCantidades = (valores, cantidades) => {
    const fila = hoja.addRow([...valores, ...cantidades]);
    cantidades.forEach((_, i) => { fila.getCell(columna(i)).numFmt = FORMATO_CANTIDAD; });
    return fila;
  };
  for (const fila of informe.filas) {
    const nombre = fila.fueraDelConsolidado ? `${fila.nombre}${NO_SUMA}` : fila.nombre;
    agregarCantidades([nombre, ...(conMunicipio ? [fila.municipio?.nombre ?? null] : [])], fila.cantidades);
  }
  agregarCantidades(['Total', ...(conMunicipio ? [null] : [])], informe.total.cantidades).font = { bold: true };
  if (informe.dosisFueraDelConsolidado > 0) {
    const n = new Intl.NumberFormat('es-GT').format(informe.dosisFueraDelConsolidado);
    hoja.addRow([`Además, ${n} dosis de establecimientos que no suman en el consolidado.`]);
  }

  for (let i = 0; i < informe.columnas.length; i += 1) hoja.getColumn(columna(i)).width = 10;
  hoja.views = [{ state: 'frozen', xSplit: fijas, ySplit: filaVacuna + 2 }];
  return libro;
}
