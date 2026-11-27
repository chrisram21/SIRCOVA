import { logoDeLaDdriss } from './logos.js';
import { TINTA } from './textosInforme.js';

// El aspecto común de los Excel del sistema (informes, indicadores y bitácora), tomado de la plantilla
// docs/mockups/SIRCOVA_informe_poblacion_propia_v2.pdf. Cada libro lleva dos hojas: «Información» (marca, institución,
// título, periodo, filtros y avisos) y la de los datos, con la tabla desde la fila 1 (encabezado marino, filas
// alternadas) y solo su encabezado y la columna de nombres inmovilizados. Juntos en una hoja, el encabezado de la
// plantilla inmovilizado ocupaba casi toda la pantalla y no dejaba desplazarse por los datos.

const FUENTE = 'Calibri';
export const HOJA_DE_INFORMACION = 'Información';
// ExcelJS pide los colores como ARGB sin «#».
export const argb = (hex) => `FF${hex.slice(1).toUpperCase()}`;
const relleno = (hex) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: argb(hex) } });
const borde = (hex, style = 'thin') => ({ style, color: { argb: argb(hex) } });
const letra = (extra = {}) => ({ name: FUENTE, size: 10, color: { argb: argb(TINTA.texto) }, ...extra });
const ADVERTENCIA = { fondo: '#fff5dd', texto: '#7a4a06', barra: '#d9a23a' };
// Las columnas de «Información»: etiqueta y cuatro para el valor; los textos de la derecha van en la última.
const ANCHOS_INFORMACION = [30, 26, 26, 26, 26];
const DERECHA = ANCHOS_INFORMACION.length;
const sinAmpersand = (texto) => String(texto).replace(/&/g, '&&');

function escribir(hoja, fila, columna, valor, fuente, alineacion = {}) {
  const celda = hoja.getCell(fila, columna);
  celda.value = valor;
  celda.font = letra(fuente);
  celda.alignment = { vertical: 'middle', ...alineacion };
  return celda;
}

function piePara(hoja, generado) {
  const centro = generado ? `&C&8Generado: ${sinAmpersand(generado)}` : '';
  hoja.headerFooter.oddFooter = `&L&"${FUENTE},Bold"&9SIRCOVA${centro}&R&"${FUENTE},Bold"&9Página &P de &N`;
}

function paraImprimir(hoja, extra = {}) {
  hoja.pageSetup = {
    ...hoja.pageSetup,
    paperSize: 1,
    orientation: 'landscape',
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: { left: 0.4, right: 0.4, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 },
    ...extra,
  };
}

const valorDeLinea = (lineas, etiqueta) => lineas.find(([e]) => e === etiqueta)?.[1] ?? null;

// El logo (SPEC 78) ocupa las filas 1 a 3 de la última columna, pegado a su borde derecho, al alto de los tres
// renglones que había antes (26 + 15 + 15 pt). Excel mide una columna en
// caracteres (unos 7 px cada uno, más 5 de margen); el desplazamiento dentro de la celda va en EMU (9525 por px),
// porque ExcelJS convierte mal la parte fraccionaria de `col`.
const ALTO_DEL_LOGO_PX = 66;
const EMU_POR_PX = 9525;
function ponerLogo(libro, hoja, { bytes, ancho, alto }) {
  const anchoPx = Math.round((ALTO_DEL_LOGO_PX * ancho) / alto);
  const pxDeColumna = (c) => ANCHOS_INFORMACION[c] * 7 + 5;
  // La columna (desde 0) donde empieza el logo y cuánto de ella le queda a la derecha.
  let columna = DERECHA - 1;
  let falta = anchoPx;
  while (columna > 0 && falta > pxDeColumna(columna)) {
    falta -= pxDeColumna(columna);
    columna -= 1;
  }
  const id = libro.addImage({ buffer: bytes, extension: 'png' });
  hoja.addImage(id, {
    tl: {
      nativeCol: columna, nativeColOff: (pxDeColumna(columna) - falta) * EMU_POR_PX,
      nativeRow: 0, nativeRowOff: 3 * EMU_POR_PX,
    },
    ext: { width: anchoPx, height: ALTO_DEL_LOGO_PX },
    editAs: 'oneCell',
  });
}

/**
 * Crea la hoja «Información», la primera del libro. opciones: { marca ('Informes de vacunación'), rotulo (PRODUCCIÓN
 * DE VACUNACIÓN…), titulo, subtitulo, preliminar, lineas ([[etiqueta, valor]], las del encabezado del libro), periodo
 * (la etiqueta de la línea que va como periodo arriba a la derecha), hojasDeDatos (las otras hojas en el orden del
 * libro, cada una como nombre o { nombre, texto }; [] si no hay tabla) }. La línea «DDRISS» y la del periodo van
 * arriba; las demás, en el recuadro de filtros desde la fila 9 («Aviso» en ámbar), y al final los enlaces: con una
 * hoja, «Ver los datos en la hoja «…»»; con varias, «Hojas de datos:» y un enlace por hoja (SPEC 78). ddrissCodigo:
 * con logo (logos.js), el logo va arriba a la derecha en lugar del Ministerio, con la Dirección y la DDRISS a su lado.
 */
export function hojaDeInformacion(libro, {
  marca = 'Informes de vacunación', rotulo, titulo, subtitulo = null, preliminar = false, lineas, periodo,
  hojasDeDatos = [], ddrissCodigo = null,
}) {
  const hoja = libro.addWorksheet(HOJA_DE_INFORMACION);
  ANCHOS_INFORMACION.forEach((ancho, i) => { hoja.getColumn(i + 1).width = ancho; });
  const ddriss = String(valorDeLinea(lineas, 'DDRISS') ?? '').replace(/^DDRISS\s+/i, '');
  const aDerecha = { horizontal: 'right' };
  const color = (hex) => ({ argb: argb(hex) });
  const logo = logoDeLaDdriss(ddrissCodigo);

  escribir(hoja, 1, 1, 'SIRCOVA', { size: 20, bold: true, color: color(TINTA.marino) });
  escribir(hoja, 2, 1, marca, { size: 10, color: color(TINTA.gris) });
  for (const n of [1, 2]) hoja.getCell(n, 1).border = { left: borde(TINTA.acento, 'thick') };
  // Con logo, la Dirección y la DDRISS van en la columna anterior, a la izquierda del logo, que reemplaza al Ministerio.
  const columnaDeTexto = logo ? DERECHA - 1 : DERECHA;
  if (logo) ponerLogo(libro, hoja, logo);
  else escribir(hoja, 1, DERECHA, 'Ministerio de Salud Pública y Asistencia Social', { size: 11, bold: true }, aDerecha);
  escribir(hoja, 2, columnaDeTexto, 'Dirección Departamental de Redes Integradas de Servicios de Salud',
    { size: 9, color: color(TINTA.gris) }, aDerecha);
  escribir(hoja, 3, columnaDeTexto, ddriss, { size: 11, bold: true }, aDerecha);
  hoja.getRow(1).height = 26;
  for (let c = 1; c <= DERECHA; c += 1) {
    hoja.getCell(3, c).border = { ...hoja.getCell(3, c).border, bottom: borde(TINTA.marino, 'medium') };
  }

  const rotuloTexto = { text: rotulo, font: letra({ size: 9, bold: true, color: color(TINTA.acentoTexto) }) };
  hoja.getCell(5, 1).value = preliminar
    ? {
      richText: [rotuloTexto, { text: '   ' }, {
        text: ' PRELIMINAR ', font: letra({ size: 9, bold: true, color: color(ADVERTENCIA.texto) }),
      }],
    }
    : { richText: [rotuloTexto] };
  escribir(hoja, 5, DERECHA, periodo.toUpperCase(), { size: 8, bold: true, color: color(TINTA.gris) }, aDerecha);
  escribir(hoja, 6, 1, titulo, { size: 20, bold: true, color: color(TINTA.marino) });
  escribir(hoja, 6, DERECHA, valorDeLinea(lineas, periodo), { size: 16, bold: true, color: color(TINTA.marino) },
    aDerecha);
  hoja.getRow(6).height = 28;
  if (subtitulo) escribir(hoja, 7, 1, subtitulo, { size: 10, color: color(TINTA.gris) });

  // El recuadro de filtros: etiqueta en A y valor de B a la derecha, en celeste con la barra azul a la izquierda.
  let n = 8;
  for (const [etiqueta, texto] of lineas) {
    if (etiqueta === 'DDRISS' || etiqueta === periodo) continue;
    n += 1;
    const esAviso = etiqueta === 'Aviso';
    const tono = color(esAviso ? ADVERTENCIA.texto : TINTA.gris);
    escribir(hoja, n, 1, etiqueta, { size: 9, color: tono, bold: esAviso }, { indent: 1 });
    escribir(hoja, n, 2, texto, { size: 10, bold: true, color: esAviso ? tono : color(TINTA.texto) },
      { horizontal: 'left', wrapText: esAviso });
    hoja.mergeCells(n, 2, n, DERECHA);
    for (let c = 1; c <= DERECHA; c += 1) hoja.getCell(n, c).fill = relleno(esAviso ? ADVERTENCIA.fondo : TINTA.banda);
    hoja.getCell(n, 1).border = { left: borde(esAviso ? ADVERTENCIA.barra : TINTA.acento, 'thick') };
    const ancho = ANCHOS_INFORMACION.slice(1).reduce((suma, a) => suma + a, 0) * 0.95;
    hoja.getRow(n).height = esAviso ? 15 * Math.max(1, Math.ceil(String(texto).length / ancho)) : 17;
  }

  const enlaces = hojasDeDatos.map((h) => (typeof h === 'string' ? { nombre: h, texto: h } : h));
  const enlazar = (fila, texto, nombre) => {
    const enlace = hoja.getCell(fila, 1);
    enlace.value = { text: texto, hyperlink: `#'${nombre}'!A1` };
    enlace.font = letra({ bold: true, underline: true, color: color(TINTA.acentoTexto) });
  };
  if (enlaces.length === 1) {
    enlazar(n + 2, `Ver los datos en la hoja «${enlaces[0].nombre}»`, enlaces[0].nombre);
  } else if (enlaces.length > 1) {
    escribir(hoja, n + 2, 1, 'Hojas de datos:', { size: 9, bold: true, color: color(TINTA.gris) });
    enlaces.forEach(({ nombre, texto }, i) => enlazar(n + 3 + i, texto, nombre));
  }

  hoja.views = [{ state: 'normal', showGridLines: false }];
  paraImprimir(hoja);
  piePara(hoja, valorDeLinea(lineas, 'Generado'));
  return hoja;
}

/**
 * Pinta una tabla ya escrita. opciones: { desde (su primera fila de encabezado), filasEncabezado, hasta (su última
 * fila), columnas, fijas (las columnas de nombres, marino en el encabezado), inicios (columnas donde empieza una
 * vacuna, con la línea más marcada), totales (Set de filas de total), soloFijasEnTotal (true: en el total solo las
 * fijas van en marino, como en el acumulado), cebraCada (filas por franja), cerosEnGris }.
 * Una celda que ya tiene fondo (un tono del semáforo, la meta, una columna estimada) lo conserva.
 */
export function pintarTabla(hoja, {
  desde, filasEncabezado, hasta, columnas, fijas = 1, inicios = new Set(), totales = new Set(),
  soloFijasEnTotal = false, cebraCada = 1, cerosEnGris = false,
}) {
  const tieneFondo = (celda) => Boolean(celda.fill?.fgColor);
  for (let f = desde; f <= hasta; f += 1) {
    const enEncabezado = f < desde + filasEncabezado;
    const esTotal = totales.has(f);
    const franja = Math.floor((f - desde - filasEncabezado) / cebraCada) % 2 === 1;
    for (let c = 1; c <= columnas; c += 1) {
      const celda = hoja.getCell(f, c);
      const propio = tieneFondo(celda);
      const izquierda = inicios.has(c) || c === fijas + 1 ? TINTA.lineaFuerte : TINTA.linea;
      const negrita = celda.font?.bold ?? false;
      if (enEncabezado) {
        const marino = c <= fijas || f === desde;
        const fondo = c <= fijas ? TINTA.marino : TINTA.marinoMedio;
        if (!propio) celda.fill = relleno(marino ? fondo : TINTA.subencabezado);
        celda.font = letra({
          bold: true, size: f === desde || c <= fijas ? 10 : 9,
          color: propio ? celda.font?.color ?? { argb: argb(TINTA.marino) }
            : { argb: argb(marino ? TINTA.blanco : TINTA.marino) },
        });
        // Las fijas abarcan todas las filas del encabezado: sin líneas por dentro.
        const ultimaDelEncabezado = f === desde + filasEncabezado - 1;
        celda.border = {
          ...(c > fijas || f === desde ? { top: borde(TINTA.lineaEncabezado) } : {}),
          ...(c > fijas || ultimaDelEncabezado ? { bottom: borde(TINTA.lineaEncabezado) } : {}),
          left: borde(TINTA.lineaEncabezado), right: borde(TINTA.lineaEncabezado),
        };
        continue;
      }
      const enMarino = esTotal && !propio && (!soloFijasEnTotal || c < fijas);
      if (enMarino) celda.fill = relleno(TINTA.marino);
      else if (!propio && franja) celda.fill = relleno(TINTA.cebra);
      const gris = cerosEnGris && !esTotal && celda.value === 0;
      const colorPropio = celda.font?.color;
      celda.font = letra({
        bold: negrita || esTotal,
        color: enMarino ? { argb: argb(TINTA.blanco) } : colorPropio ?? { argb: argb(gris ? TINTA.cero : TINTA.texto) },
      });
      celda.border = {
        top: borde(TINTA.linea), bottom: borde(TINTA.linea), left: borde(izquierda), right: borde(TINTA.linea),
      };
    }
  }
  for (let f = desde + 1; f < desde + filasEncabezado; f += 1) hoja.getRow(f).height = 16;
  hoja.getRow(desde).height = altoDeEncabezado(hoja, desde, columnas, fijas);
}

// La primera fila del encabezado crece con el nombre más largo (en Excel, el alto no se ajusta solo a un texto que
// pasa a otra línea dentro de celdas combinadas). Cada línea de 10 pt ocupa unos 13 puntos.
function altoDeEncabezado(hoja, fila, columnas, fijas) {
  let lineas = 1;
  for (let c = fijas + 1; c <= columnas; c += 1) {
    const celda = hoja.getCell(fila, c);
    const esMaestra = !celda.isMerged || celda.master.address === celda.address;
    if (celda.value === null || celda.value === undefined || !esMaestra) continue;
    let ancho = hoja.getColumn(c).width ?? 9;
    const dentro = (d) => hoja.getCell(fila, d).isMerged && hoja.getCell(fila, d).master.address === celda.address;
    for (let d = c + 1; d <= columnas && dentro(d); d += 1) ancho += hoja.getColumn(d).width ?? 9;
    lineas = Math.max(lineas, Math.ceil(String(celda.value).length / Math.max(ancho * 0.85, 1)));
  }
  return Math.max(30, lineas * 13 + 6);
}

// Una línea al final con la barra azul (las dosis que no suman en el consolidado).
export function escribirNota(hoja, texto) {
  hoja.addRow([]);
  const fila = hoja.addRow([texto]);
  fila.getCell(1).font = letra({ bold: true });
  fila.getCell(1).border = { left: borde(TINTA.acento, 'thick') };
  return fila;
}

/**
 * La hoja de datos, con la tabla desde la fila 1: sin cuadrícula, con el encabezado de la tabla (filasEncabezado) y
 * las xSplit columnas de nombres inmovilizados, carta horizontal ajustada al ancho, el encabezado repetido en cada
 * página y, al imprimir, «SIRCOVA · titulo» arriba y el pie con «Generado» y la página.
 */
export function prepararHojaDeDatos(hoja, { xSplit = 0, filasEncabezado, titulo, generado = null }) {
  hoja.views = [{ state: 'frozen', xSplit, ySplit: filasEncabezado, showGridLines: false }];
  paraImprimir(hoja, { printTitlesRow: `1:${filasEncabezado}` });
  hoja.headerFooter.oddHeader = `&L&"${FUENTE},Bold"&10SIRCOVA · ${sinAmpersand(titulo)}`;
  piePara(hoja, generado);
}
