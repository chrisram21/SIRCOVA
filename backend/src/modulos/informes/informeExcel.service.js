import ExcelJS from 'exceljs';
import {
  CIFRAS, COLORES, NOMBRES_INFORME, SIN_VALOR, lineasDelAcumulado, lineasDelEncabezado, llevaMunicipio, nombreDeFila,
  textoFueraDelConsolidado, textoMeta, tituloDeLaFila, tituloDelInforme, tonoDeCifra, tramosDelEncabezado,
} from './textosInforme.js';
import { argb, escribirNota, hojaDeInformacion, pintarTabla, prepararHojaDeDatos } from './plantillaExcel.js';

// SPEC 64 (HU-47): el libro .xlsx de un informe de producción. Recibe la respuesta de informePorFila, la misma que
// ve la pantalla, y no consulta nada. Los textos salen de textosInforme.js (SPEC 65), que comparte con el PDF, y el
// aspecto, de plantillaExcel.js: la hoja «Información» y la de los datos.

export const HOJAS = { 'poblacion-propia': 'Población propia', total: 'Producción total', residencia: 'Residencia' };
export const FORMATO_CANTIDAD = '#,##0';
const ANCHO_NOMBRE = 40;
const ANCHO_MUNICIPIO = 28;
const ANCHO_CANTIDAD = 10;

const valorDeLinea = (lineas, etiqueta) => lineas.find(([e]) => e === etiqueta)?.[1] ?? null;
const subtituloDe = (informe) => [
  tituloDeLaFila(informe.nivel, informe.informe), ...(informe.agrupacion ? [`por ${informe.agrupacion.nombre}`] : []),
].join(' · ');

function nuevoLibro(generadoEn) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRCOVA';
  libro.created = generadoEn;
  return libro;
}

// Las columnas donde empieza cada vacuna (con la línea más marcada).
const iniciosDeVacuna = (vacunas, fijas) => new Set(vacunas.map((v) => fijas + v.desde + 1));

// Las filas de encabezado de la tabla, desde la fila 1: vacuna, sección (o valor de la dimensión), dosis y, en el
// acumulado, la meta. Combina la vacuna y la sección y deja las columnas fijas abarcando todas.
function escribirEncabezadoDeTabla(hoja, informe, delanteras, extra = []) {
  const fijas = delanteras.length;
  const { vacunas, secciones } = tramosDelEncabezado(informe.columnas);
  const columna = (i) => fijas + i + 1;
  const vacio = Array(informe.columnas.length).fill(null);

  const primera = [...delanteras, ...vacio];
  vacunas.forEach((v) => { primera[fijas + v.desde] = v.nombre; });
  const segunda = [...Array(fijas).fill(null), ...vacio];
  secciones.forEach((s) => { segunda[fijas + s.desde] = s.titulo || null; });
  const tercera = [...Array(fijas).fill(null), ...informe.columnas.map((c) => c.dosis.codigo)];
  const filas = [primera, segunda, tercera, ...extra.map((f) => [...Array(fijas).fill(null), ...f])];
  for (const valores of filas) {
    const fila = hoja.addRow(valores);
    fila.font = { bold: true };
    fila.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  for (let c = 1; c <= fijas; c += 1) {
    hoja.mergeCells(1, c, filas.length, c);
    hoja.getCell(1, c).alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
  }
  const combinar = (fila, { desde, abarca }) => {
    if (abarca > 1) hoja.mergeCells(fila, columna(desde), fila, columna(desde + abarca - 1));
  };
  vacunas.forEach((v) => combinar(1, v));
  secciones.forEach((s) => combinar(2, s));
  return { filasEncabezado: filas.length, inicios: iniciosDeVacuna(vacunas, fijas), columna };
}

/**
 * informe: la respuesta de informePorFila. datos: los de lineasDelEncabezado (textosInforme.js).
 */
export function libroDelInforme(informe, datos) {
  const libro = nuevoLibro(datos.generadoEn);
  const conMunicipio = llevaMunicipio(informe.nivel);
  const fijas = conMunicipio ? 2 : 1;
  const columnas = fijas + informe.columnas.length;
  const lineas = lineasDelEncabezado(informe, datos);
  const nombreHoja = HOJAS[informe.informe];
  const hayTabla = informe.columnas.length > 0;

  hojaDeInformacion(libro, {
    rotulo: 'PRODUCCIÓN DE VACUNACIÓN',
    titulo: NOMBRES_INFORME[informe.informe],
    subtitulo: subtituloDe(informe),
    preliminar: informe.preliminar,
    lineas,
    periodo: 'Periodo',
    hojaDeDatos: hayTabla ? nombreHoja : null,
  });
  if (!hayTabla) return libro;

  const hoja = libro.addWorksheet(nombreHoja);
  hoja.getColumn(1).width = ANCHO_NOMBRE;
  if (conMunicipio) hoja.getColumn(2).width = ANCHO_MUNICIPIO;
  for (let c = fijas + 1; c <= columnas; c += 1) hoja.getColumn(c).width = ANCHO_CANTIDAD;
  const delanteras = [tituloDeLaFila(informe.nivel, informe.informe), ...(conMunicipio ? ['Municipio'] : [])];
  const { filasEncabezado, inicios, columna } = escribirEncabezadoDeTabla(hoja, informe, delanteras);

  const agregarCantidades = (valores, cantidades) => {
    const fila = hoja.addRow([...valores, ...cantidades]);
    cantidades.forEach((_, i) => { fila.getCell(columna(i)).numFmt = FORMATO_CANTIDAD; });
    return fila;
  };
  for (const fila of informe.filas) {
    agregarCantidades([nombreDeFila(fila), ...(conMunicipio ? [fila.municipio?.nombre ?? null] : [])], fila.cantidades);
  }
  const total = agregarCantidades(['Total', ...(conMunicipio ? [null] : [])], informe.total.cantidades);
  total.font = { bold: true };

  pintarTabla(hoja, {
    desde: 1, filasEncabezado, hasta: total.number, columnas, fijas, inicios,
    totales: new Set([total.number]), cerosEnGris: true,
  });
  const fuera = informe.dosisFueraDelConsolidado;
  if (fuera > 0) escribirNota(hoja, textoFueraDelConsolidado(fuera));
  prepararHojaDeDatos(hoja, {
    xSplit: fijas, filasEncabezado, titulo: tituloDelInforme(informe), generado: valorDeLinea(lineas, 'Generado'),
  });
  return libro;
}

// ---------------------------------------------------------------- Acumulado anual (SPEC 66, HU-49)

export const FORMATO_COBERTURA = '0.0';
export { argb };

function pintar(celda, fondo, texto, negrita = false) {
  if (fondo) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(COLORES[fondo]) } };
  celda.font = { ...celda.font, bold: negrita || celda.font?.bold, ...(texto ? { color: { argb: argb(COLORES[texto]) } } : {}) };
}

/**
 * El libro del acumulado anual: la respuesta de acumuladoAnual, con cuatro filas por unidad (Dosis, Población,
 * Cobertura %, Brecha) y una cuarta fila de encabezado con la meta de cada columna. datos: los de lineasDelAcumulado.
 */
export function libroDelAcumulado(informe, datos) {
  const libro = nuevoLibro(datos.generadoEn);
  const conMunicipio = llevaMunicipio(informe.nivel);
  const fijas = conMunicipio ? 3 : 2;
  const columnas = fijas + informe.columnas.length;
  const lineas = lineasDelAcumulado(informe, datos);
  const nombreHoja = 'Acumulado anual';
  const hayTabla = informe.columnas.length > 0;

  hojaDeInformacion(libro, {
    rotulo: 'COBERTURA DE VACUNACIÓN',
    titulo: NOMBRES_INFORME['acumulado-anual'],
    subtitulo: tituloDeLaFila(informe.nivel, informe.informe),
    preliminar: informe.preliminar,
    lineas,
    periodo: 'Periodo',
    hojaDeDatos: hayTabla ? nombreHoja : null,
  });
  if (!hayTabla) return libro;

  const hoja = libro.addWorksheet(nombreHoja);
  hoja.getColumn(1).width = ANCHO_NOMBRE;
  if (conMunicipio) hoja.getColumn(2).width = ANCHO_MUNICIPIO;
  hoja.getColumn(fijas).width = 14;
  for (let c = fijas + 1; c <= columnas; c += 1) hoja.getColumn(c).width = ANCHO_CANTIDAD;
  const delanteras = [tituloDeLaFila(informe.nivel, informe.informe), ...(conMunicipio ? ['Municipio'] : []), 'Cifra'];
  const { filasEncabezado, inicios, columna } = escribirEncabezadoDeTabla(
    hoja, informe, delanteras, [informe.columnas.map((c) => textoMeta(c.meta))],
  );
  informe.columnas.forEach((_, i) => pintar(hoja.getCell(filasEncabezado, columna(i)), 'muted', 'mutedTexto'));

  const totales = new Set();
  const agregarUnidad = (nombre, municipio, cifras, esTotal = false) => {
    const primeraFila = hoja.rowCount + 1;
    CIFRAS.forEach(([clave, etiqueta], n) => {
      const valores = cifras[clave].map((v) => (v === null ? SIN_VALOR : v));
      const delante = n === 0 ? [nombre, ...(conMunicipio ? [municipio] : [])] : Array(fijas - 1).fill(null);
      const fila = hoja.addRow([...delante, etiqueta, ...valores]);
      if (esTotal) {
        fila.font = { bold: true };
        totales.add(fila.number);
      }
      const tono = tonoDeCifra(clave, false);
      if (tono) pintar(fila.getCell(fijas), tono.fondo, tono.texto);
      cifras[clave].forEach((v, i) => {
        const celda = fila.getCell(columna(i));
        if (v === null) celda.alignment = { horizontal: 'right' };
        else celda.numFmt = clave === 'cobertura' ? FORMATO_COBERTURA : FORMATO_CANTIDAD;
        const tonoCelda = tonoDeCifra(clave, cifras.brecha[i] === 0);
        if (tonoCelda) pintar(celda, tonoCelda.fondo, tonoCelda.texto, tonoCelda.fondo === 'exito');
      });
    });
    for (let c = 1; c < fijas; c += 1) {
      hoja.mergeCells(primeraFila, c, primeraFila + CIFRAS.length - 1, c);
      hoja.getCell(primeraFila, c).alignment = { vertical: 'middle', wrapText: true };
    }
  };
  for (const fila of informe.filas) agregarUnidad(fila.nombre, fila.municipio?.nombre ?? null, fila);
  agregarUnidad('Total', null, informe.total, true);

  pintarTabla(hoja, {
    desde: 1, filasEncabezado, hasta: hoja.rowCount, columnas, fijas, inicios, totales,
    soloFijasEnTotal: true, cebraCada: CIFRAS.length,
  });
  prepararHojaDeDatos(hoja, {
    xSplit: fijas, filasEncabezado, titulo: tituloDelInforme(informe), generado: valorDeLinea(lineas, 'Generado'),
  });
  return libro;
}
