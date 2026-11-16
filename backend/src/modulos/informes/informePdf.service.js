import path from 'node:path';
import pdfmake from 'pdfmake';
import {
  CIFRAS, COLORES, lineasDelAcumulado, lineasDelEncabezado, llevaMunicipio, nombreDeFila, textoCifra, textoFueraDelConsolidado,
  textoMeta, tituloDeLaFila, tituloDelInforme, tonoDeCifra, tramosDelEncabezado,
} from './textosInforme.js';

// SPEC 65 (HU-48): el PDF de un informe de producción, en carta horizontal. Como el Excel, sale de la respuesta de
// informePorFila y no consulta nada. Con todas las vacunas no cabe una sola tabla: va en tramos de vacunas enteras.

const FUENTES = path.join(import.meta.dirname, 'fuentes');
const FUENTE = 'IBMPlexSans';
// pdfmake 0.3 es un objeto único para todo el proceso; solo lee la carpeta de las fuentes y nada de internet.
pdfmake.setFonts({
  [FUENTE]: {
    normal: path.join(FUENTES, 'IBMPlexSans-Regular.ttf'),
    bold: path.join(FUENTES, 'IBMPlexSans-SemiBold.ttf'),
    italics: path.join(FUENTES, 'IBMPlexSans-Regular.ttf'),
    bolditalics: path.join(FUENTES, 'IBMPlexSans-SemiBold.ttf'),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((ruta) => path.resolve(ruta).startsWith(FUENTES));

// Columnas de cantidades por tramo: con la columna «Municipio» caben menos.
export const COLUMNAS_POR_TRAMO = { conMunicipio: 10, sinMunicipio: 12 };
const ANCHO_CANTIDAD = 40;
const ANCHO_MUNICIPIO = 110;
const FONDO_ENCABEZADO = '#eeeeee';
const LINEA = '#999999';
const formatoEntero = new Intl.NumberFormat('es-GT');

// Los tramos de columnas [desde, hasta): vacunas seguidas mientras sumen hasta `limite` columnas, sin partir ninguna.
// Una vacuna con más columnas que el límite va sola en su tramo.
export function tramosDeColumnas(columnas, limite) {
  const tramos = [];
  for (const vacuna of tramosDelEncabezado(columnas).vacunas) {
    const actual = tramos.at(-1);
    if (actual && actual.hasta - actual.desde + vacuna.abarca <= limite) actual.hasta += vacuna.abarca;
    else tramos.push({ desde: vacuna.desde, hasta: vacuna.desde + vacuna.abarca });
  }
  return tramos;
}

// Un tramo que empezaría a media página y no cabe en ella pasa entero a la siguiente; uno que ya empieza arriba
// se deja partir (repite su encabezado), porque no cabe en ninguna página.
export function saltarAntesDelTramo(nodo) {
  const esTramo = Boolean(nodo.id?.startsWith('tramo-'));
  return esTramo && nodo.pageNumbers.length > 1 && nodo.startPosition.verticalRatio > 0.1;
}

// Una celda que abarca `n` columnas va seguida de n − 1 celdas vacías, como pide pdfmake. Cada vacía es un objeto
// propio: pdfmake anota en las celdas al armar la tabla.
const vacias = (n) => Array.from({ length: n }, () => ({}));
const abarcando = (celda, n) => [{ ...celda, colSpan: n }, ...vacias(n - 1)];

function tablaDelTramo(informe, { desde, hasta }, indice) {
  const conMunicipio = llevaMunicipio(informe.nivel);
  const columnas = informe.columnas.slice(desde, hasta);
  const { vacunas, secciones } = tramosDelEncabezado(columnas);
  const fijas = conMunicipio ? 2 : 1;
  const centrado = { bold: true, alignment: 'center' };

  const encabezado = [
    [
      { text: tituloDeLaFila(informe.nivel, informe.informe), bold: true, rowSpan: 3 },
      ...(conMunicipio ? [{ text: 'Municipio', bold: true, rowSpan: 3 }] : []),
      ...vacunas.flatMap((v) => abarcando({ ...centrado, text: v.nombre }, v.abarca)),
    ],
    [...vacias(fijas), ...secciones.flatMap((s) => abarcando({ ...centrado, text: s.titulo }, s.abarca))],
    [...vacias(fijas), ...columnas.map((c) => ({ ...centrado, text: c.dosis.codigo }))],
  ];
  const cantidades = (lista) =>
    lista.slice(desde, hasta).map((n) => ({ text: formatoEntero.format(n), alignment: 'right' }));
  const filas = informe.filas.map((fila) => [
    nombreDeFila(fila), ...(conMunicipio ? [fila.municipio?.nombre ?? ''] : []), ...cantidades(fila.cantidades),
  ]);
  const total = ['Total', ...(conMunicipio ? [''] : []), ...cantidades(informe.total.cantidades)]
    .map((celda) => (typeof celda === 'string' ? { text: celda, bold: true } : { ...celda, bold: true }));

  return {
    id: `tramo-${indice}`,
    margin: [0, 12, 0, 0],
    fontSize: 8,
    table: {
      headerRows: 3,
      dontBreakRows: true,
      widths: ['*', ...(conMunicipio ? [ANCHO_MUNICIPIO] : []), ...columnas.map(() => ANCHO_CANTIDAD)],
      body: [...encabezado, ...filas, total],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => LINEA,
      vLineColor: () => LINEA,
      fillColor: (fila) => (fila < 3 ? FONDO_ENCABEZADO : null),
    },
  };
}

// Lo común a los PDF de informes (SPEC 65 y 66): hoja, fuente, marca de agua, pie, título, «PRELIMINAR» y las líneas
// del encabezado antes de las tablas.
function documento({ titulo, preliminar, generadoEn, lineas, tablas }) {
  return {
    info: { title: titulo, creator: 'SIRCOVA', creationDate: generadoEn },
    pageSize: 'LETTER',
    pageOrientation: 'landscape',
    pageMargins: 30,
    defaultStyle: { font: FUENTE, fontSize: 9 },
    ...(preliminar
      ? { watermark: { text: 'PRELIMINAR', color: '#888888', opacity: 0.12, bold: true } }
      : {}),
    footer: (pagina, paginas) => ({
      text: `${titulo} · Página ${pagina} de ${paginas}`, fontSize: 8, color: '#555555', margin: [30, 10, 30, 0],
    }),
    pageBreakBefore: saltarAntesDelTramo,
    content: [
      { text: titulo, bold: true, fontSize: 14, margin: [0, 0, 0, 4] },
      ...(preliminar ? [{ text: 'PRELIMINAR', bold: true, margin: [0, 0, 0, 4] }] : []),
      {
        layout: 'noBorders',
        table: {
          widths: ['auto', '*'],
          body: lineas.map(([etiqueta, valor]) => [{ text: etiqueta, bold: true }, valor]),
        },
      },
      ...tablas,
    ],
  };
}

/** informe: la respuesta de informePorFila. datos: los de lineasDelEncabezado (textosInforme.js). */
export function documentoDelInforme(informe, datos) {
  const limite = llevaMunicipio(informe.nivel) ? COLUMNAS_POR_TRAMO.conMunicipio : COLUMNAS_POR_TRAMO.sinMunicipio;
  const tramos = tramosDeColumnas(informe.columnas, limite);
  return documento({
    titulo: tituloDelInforme(informe),
    preliminar: informe.preliminar,
    generadoEn: datos.generadoEn,
    lineas: lineasDelEncabezado(informe, datos),
    tablas: [
      ...tramos.map((tramo, i) => tablaDelTramo(informe, tramo, i)),
      ...(informe.columnas.length > 0 && informe.dosisFueraDelConsolidado > 0
        ? [{ text: textoFueraDelConsolidado(informe.dosisFueraDelConsolidado), margin: [0, 8, 0, 0] }]
        : []),
    ],
  });
}

// Los bytes del PDF.
export function pdfDelInforme(informe, datos) {
  return pdfmake.createPdf(documentoDelInforme(informe, datos)).getBuffer();
}

// ---------------------------------------------------------------- Acumulado anual (SPEC 66, HU-49)

// Anchos fijos (sin '*'): el nombre no se estira en un tramo con pocas columnas y el espacio va a las cantidades.
// Nombre 90 («Municipio de residencia» en negrita mide 87.5 a 8 pt), «Municipio» 76 y «Cifra» 48 («Cobertura %»,
// 46.9); un nombre más largo pasa a otra línea dentro de sus cuatro filas. Cada columna suma 8 de relleno y cada
// línea 0.5, contra 732 de ancho útil (carta horizontal, márgenes de 30):
// sin municipio, 98 + 56 + 11 × 48 + 14 × 0.5 = 689; con municipio, 98 + 84 + 56 + 10 × 48 + 14 × 0.5 = 725.
export const COLUMNAS_POR_TRAMO_ANUAL = { conMunicipio: 10, sinMunicipio: 11 };
export const ANCHO_NOMBRE_ANUAL = 90;
const ANCHO_MUNICIPIO_ANUAL = 76;
const ANCHO_CIFRA = 48;
const FILAS_DE_ENCABEZADO_ANUAL = 4;
// El fondo y el color de texto de una celda (claves de COLORES); pdfmake da prioridad al de la celda sobre el layout.
const tono = (fondo, texto) => ({ fillColor: COLORES[fondo], color: COLORES[texto] });

function tablaDelTramoAnual(informe, { desde, hasta }, indice) {
  const conMunicipio = llevaMunicipio(informe.nivel);
  const columnas = informe.columnas.slice(desde, hasta);
  const { vacunas, secciones } = tramosDelEncabezado(columnas);
  const fijas = conMunicipio ? 3 : 2;
  const centrado = { bold: true, alignment: 'center' };
  const fija = (text) => ({ text, bold: true, rowSpan: FILAS_DE_ENCABEZADO_ANUAL });

  const encabezado = [
    [
      fija(tituloDeLaFila(informe.nivel, informe.informe)),
      ...(conMunicipio ? [fija('Municipio')] : []),
      fija('Cifra'),
      ...vacunas.flatMap((v) => abarcando({ ...centrado, ...tono('accent', 'accentTexto'), text: v.nombre }, v.abarca)),
    ],
    [
      ...vacias(fijas),
      ...secciones.flatMap((s) => abarcando({ ...centrado, ...tono('accentSuave', 'accentTexto'), text: s.titulo }, s.abarca)),
    ],
    [...vacias(fijas), ...columnas.map((c) => ({ ...centrado, text: c.dosis.codigo }))],
    [...vacias(fijas), ...columnas.map((c) => ({ ...centrado, ...tono('muted', 'mutedTexto'), text: textoMeta(c.meta) }))],
  ];
  // Cuatro filas por unidad; el nombre (y el municipio) abarcan las cuatro. Cada cifra con su tono; la cobertura y la
  // brecha que alcanzan su meta (brecha 0), en verde.
  const deCifra = (clave, cumple) => {
    const t = tonoDeCifra(clave, cumple);
    return t ? tono(t.fondo, t.texto) : {};
  };
  const unidad = (nombre, municipio, cifras, negrita = false) => CIFRAS.map(([clave, etiqueta], n) => [
    ...(n === 0
      ? [{ text: nombre, rowSpan: CIFRAS.length }, ...(conMunicipio ? [{ text: municipio, rowSpan: CIFRAS.length }] : [])]
      : vacias(fijas - 1)),
    { text: etiqueta, ...deCifra(clave, false) },
    ...cifras[clave].slice(desde, hasta).map((v, i) => {
      const cumple = cifras.brecha[desde + i] === 0 && (clave === 'cobertura' || clave === 'brecha');
      return { text: textoCifra(clave, v), alignment: 'right', ...deCifra(clave, cumple), ...(cumple ? { bold: true } : {}) };
    }),
  ].map((celda) => {
    const objeto = typeof celda === 'string' ? { text: celda } : celda;
    return negrita && 'text' in objeto ? { ...objeto, bold: true } : objeto;
  }));
  const filas = informe.filas.flatMap((f) => unidad(f.nombre, f.municipio?.nombre ?? '', f));

  return {
    id: `tramo-${indice}`,
    margin: [0, 12, 0, 0],
    fontSize: 8,
    table: {
      headerRows: FILAS_DE_ENCABEZADO_ANUAL,
      dontBreakRows: true,
      widths: [
        ANCHO_NOMBRE_ANUAL, ...(conMunicipio ? [ANCHO_MUNICIPIO_ANUAL] : []), ANCHO_CIFRA,
        ...columnas.map(() => ANCHO_CANTIDAD),
      ],
      body: [...encabezado, ...filas, ...unidad('Total', '', informe.total, true)],
    },
    layout: {
      hLineWidth: () => 0.5,
      vLineWidth: () => 0.5,
      hLineColor: () => LINEA,
      vLineColor: () => LINEA,
      fillColor: (fila) => (fila < FILAS_DE_ENCABEZADO_ANUAL ? FONDO_ENCABEZADO : null),
    },
  };
}

/** informe: la respuesta de acumuladoAnual. datos: los de lineasDelAcumulado (textosInforme.js). */
export function documentoDelAcumulado(informe, datos) {
  const limite = llevaMunicipio(informe.nivel)
    ? COLUMNAS_POR_TRAMO_ANUAL.conMunicipio
    : COLUMNAS_POR_TRAMO_ANUAL.sinMunicipio;
  const tramos = tramosDeColumnas(informe.columnas, limite);
  return documento({
    titulo: tituloDelInforme(informe),
    preliminar: informe.preliminar,
    generadoEn: datos.generadoEn,
    lineas: lineasDelAcumulado(informe, datos),
    tablas: tramos.map((tramo, i) => tablaDelTramoAnual(informe, tramo, i)),
  });
}

export function pdfDelAcumulado(informe, datos) {
  return pdfmake.createPdf(documentoDelAcumulado(informe, datos)).getBuffer();
}
