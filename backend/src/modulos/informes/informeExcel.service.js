import ExcelJS from 'exceljs';
import {
  CIFRAS, COLORES, SIN_VALOR, lineasDelAcumulado, lineasDelEncabezado, llevaMunicipio, nombreDeFila, textoFueraDelConsolidado,
  textoMeta, tituloDeLaFila, tituloDelInforme, tonoDeCifra, tramosDelEncabezado,
} from './textosInforme.js';

// SPEC 64 (HU-47): el libro .xlsx de un informe de producción. Recibe la respuesta de informePorFila, la misma que
// ve la pantalla, y no consulta nada. Los textos salen de textosInforme.js (SPEC 65), que comparte con el PDF.

export const HOJAS = { 'poblacion-propia': 'Población propia', total: 'Producción total', residencia: 'Residencia' };
export const FORMATO_CANTIDAD = '#,##0';

/**
 * informe: la respuesta de informePorFila. datos: los de lineasDelEncabezado (textosInforme.js).
 */
export function libroDelInforme(informe, datos) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRCOVA';
  libro.created = datos.generadoEn;
  const conMunicipio = llevaMunicipio(informe.nivel);
  const fijas = conMunicipio ? 2 : 1;
  const hoja = libro.addWorksheet(HOJAS[informe.informe]);

  hoja.addRow([tituloDelInforme(informe)]).font = { bold: true, size: 14 };
  if (informe.preliminar) hoja.addRow(['PRELIMINAR']).font = { bold: true };
  for (const [etiqueta, valor] of lineasDelEncabezado(informe, datos)) {
    hoja.addRow([etiqueta, valor]).getCell(1).font = { bold: true };
  }

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
    agregarCantidades([nombreDeFila(fila), ...(conMunicipio ? [fila.municipio?.nombre ?? null] : [])], fila.cantidades);
  }
  agregarCantidades(['Total', ...(conMunicipio ? [null] : [])], informe.total.cantidades).font = { bold: true };
  if (informe.dosisFueraDelConsolidado > 0) {
    hoja.addRow([textoFueraDelConsolidado(informe.dosisFueraDelConsolidado)]);
  }

  for (let i = 0; i < informe.columnas.length; i += 1) hoja.getColumn(columna(i)).width = 10;
  hoja.views = [{ state: 'frozen', xSplit: fijas, ySplit: filaVacuna + 2 }];
  return libro;
}

// ---------------------------------------------------------------- Acumulado anual (SPEC 66, HU-49)

export const FORMATO_COBERTURA = '0.0';

// ExcelJS pide los colores como ARGB sin «#».
export const argb = (hex) => `FF${hex.slice(1).toUpperCase()}`;
function pintar(celda, fondo, texto, negrita = false) {
  if (fondo) celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(COLORES[fondo]) } };
  celda.font = { ...celda.font, bold: negrita || celda.font?.bold, ...(texto ? { color: { argb: argb(COLORES[texto]) } } : {}) };
}

/**
 * El libro del acumulado anual: la respuesta de acumuladoAnual, con cuatro filas por unidad (Dosis, Población,
 * Cobertura %, Brecha) y una cuarta fila de encabezado con la meta de cada columna. datos: los de lineasDelAcumulado.
 */
export function libroDelAcumulado(informe, datos) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRCOVA';
  libro.created = datos.generadoEn;
  const conMunicipio = llevaMunicipio(informe.nivel);
  const fijas = conMunicipio ? 3 : 2;
  const hoja = libro.addWorksheet('Acumulado anual');

  hoja.addRow([tituloDelInforme(informe)]).font = { bold: true, size: 14 };
  if (informe.preliminar) hoja.addRow(['PRELIMINAR']).font = { bold: true };
  for (const [etiqueta, valor] of lineasDelAcumulado(informe, datos)) {
    hoja.addRow([etiqueta, valor]).getCell(1).font = { bold: true };
  }

  hoja.getColumn(1).width = 40;
  if (conMunicipio) hoja.getColumn(2).width = 28;
  hoja.getColumn(fijas).width = 14;
  if (informe.columnas.length === 0) return libro;

  hoja.addRow([]);
  const filaVacuna = hoja.rowCount + 1;
  const { vacunas, secciones } = tramosDelEncabezado(informe.columnas);
  const columna = (i) => fijas + i + 1;
  const vacio = Array(informe.columnas.length).fill(null);
  const delanteras = [tituloDeLaFila(informe.nivel, informe.informe), ...(conMunicipio ? ['Municipio'] : []), 'Cifra'];

  const primera = [...delanteras, ...vacio];
  vacunas.forEach((v) => { primera[fijas + v.desde] = v.nombre; });
  const segunda = [...Array(fijas).fill(null), ...vacio];
  secciones.forEach((s) => { segunda[fijas + s.desde] = s.titulo || null; });
  const tercera = [...Array(fijas).fill(null), ...informe.columnas.map((c) => c.dosis.codigo)];
  const cuarta = [...Array(fijas).fill(null), ...informe.columnas.map((c) => textoMeta(c.meta))];
  for (const valores of [primera, segunda, tercera, cuarta]) {
    const fila = hoja.addRow(valores);
    fila.font = { bold: true };
    fila.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  for (let c = 1; c <= fijas; c += 1) {
    hoja.mergeCells(filaVacuna, c, filaVacuna + 3, c);
    hoja.getCell(filaVacuna, c).alignment = { horizontal: 'left', vertical: 'bottom' };
  }
  const combinar = (fila, { desde, abarca }) => {
    if (abarca > 1) hoja.mergeCells(fila, columna(desde), fila, columna(desde + abarca - 1));
  };
  vacunas.forEach((v) => combinar(filaVacuna, v));
  secciones.forEach((s) => combinar(filaVacuna + 1, s));
  informe.columnas.forEach((_, i) => {
    pintar(hoja.getCell(filaVacuna, columna(i)), 'accent', 'accentTexto');
    pintar(hoja.getCell(filaVacuna + 1, columna(i)), 'accentSuave', 'accentTexto');
    pintar(hoja.getCell(filaVacuna + 3, columna(i)), 'muted', 'mutedTexto');
  });

  const agregarUnidad = (nombre, municipio, cifras, negrita = false) => {
    const primeraFila = hoja.rowCount + 1;
    const filas = CIFRAS.map(([clave, etiqueta], n) => {
      const valores = cifras[clave].map((v) => (v === null ? SIN_VALOR : v));
      const delante = n === 0 ? [nombre, ...(conMunicipio ? [municipio] : [])] : Array(fijas - 1).fill(null);
      const fila = hoja.addRow([...delante, etiqueta, ...valores]);
      if (negrita) fila.font = { bold: true };
      const tono = tonoDeCifra(clave, false);
      if (tono) pintar(fila.getCell(fijas), tono.fondo, tono.texto);
      cifras[clave].forEach((v, i) => {
        const celda = fila.getCell(columna(i));
        if (v === null) celda.alignment = { horizontal: 'right' };
        else celda.numFmt = clave === 'cobertura' ? FORMATO_COBERTURA : FORMATO_CANTIDAD;
        const tonoCelda = tonoDeCifra(clave, cifras.brecha[i] === 0);
        if (tonoCelda) pintar(celda, tonoCelda.fondo, tonoCelda.texto, tonoCelda.fondo === 'exito');
      });
      return fila;
    });
    for (let c = 1; c < fijas; c += 1) {
      hoja.mergeCells(primeraFila, c, primeraFila + CIFRAS.length - 1, c);
      hoja.getCell(primeraFila, c).alignment = { vertical: 'top' };
    }
    return filas;
  };
  for (const fila of informe.filas) agregarUnidad(fila.nombre, fila.municipio?.nombre ?? null, fila);
  agregarUnidad('Total', null, informe.total, true);

  for (let i = 0; i < informe.columnas.length; i += 1) hoja.getColumn(columna(i)).width = 10;
  hoja.views = [{ state: 'frozen', xSplit: fijas, ySplit: filaVacuna + 3 }];
  return libro;
}
