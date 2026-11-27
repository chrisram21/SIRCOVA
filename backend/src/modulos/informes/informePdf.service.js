import path from 'node:path';
import pdfmake from 'pdfmake';
import { NOMBRES_MES } from '../produccion/validacion.service.js';
import { logoDeLaDdriss } from './logos.js';
import {
  CIFRAS, COLORES, NOMBRES_INFORME, TINTA, etiquetaDeDosis, lineasDelAcumulado, lineasDelEncabezado, llevaMunicipio,
  nombreDeFila, textoCifra, textoFueraDelConsolidado, textoMeta, tituloDeLaFila, tituloDelInforme, tonoDeCifra,
  tramosDelEncabezado,
} from './textosInforme.js';

// SPEC 65 (HU-48) y 66 (HU-49): el PDF de un informe de producción y del acumulado anual, en carta horizontal, con
// el diseño de docs/mockups/SIRCOVA_informe_poblacion_propia_v2.pdf. Como el Excel, sale de la respuesta del informe
// y no consulta nada. Con todas las vacunas no cabe una sola tabla: va en bloques de vacunas enteras, uno por página.

const FUENTES = path.join(import.meta.dirname, 'fuentes');
const FUENTE = 'Lato';
// pdfmake 0.3 es un objeto único para todo el proceso; solo lee la carpeta de las fuentes y nada de internet.
pdfmake.setFonts({
  [FUENTE]: {
    normal: path.join(FUENTES, 'Lato-Regular.ttf'),
    bold: path.join(FUENTES, 'Lato-Bold.ttf'),
    italics: path.join(FUENTES, 'Lato-Regular.ttf'),
    bolditalics: path.join(FUENTES, 'Lato-Bold.ttf'),
  },
});
pdfmake.setUrlAccessPolicy(() => false);
pdfmake.setLocalAccessPolicy((ruta) => path.resolve(ruta).startsWith(FUENTES));

// Carta horizontal: 792 × 612. El encabezado de cada página ocupa el margen superior, que crece con los avisos.
const MARGEN_LADO = 26;
const ANCHO_UTIL = 792 - 2 * MARGEN_LADO;
const MARGEN_ARRIBA = 152;
const ALTO_LINEA_AVISO = 11;
const MARGEN_ABAJO = 40;
const CARACTERES_POR_LINEA_AVISO = 170;
const FILAS_DE_ENCABEZADO = 3;
// SPEC 78: el logo mide lo mismo que los tres renglones de texto que reemplaza, así que el encabezado no crece.
const ALTO_LOGO = 32;

// Columnas de cantidades por bloque: con la columna «Municipio» caben menos. Las cantidades reparten el ancho que
// dejan las columnas fijas.
export const COLUMNAS_POR_TRAMO = { conMunicipio: 10, sinMunicipio: 12 };
export const ANCHO_NOMBRE = 160;
const ANCHO_NOMBRE_CON_MUNICIPIO = 130;
const ANCHO_MUNICIPIO = 95;
const formatoEntero = new Intl.NumberFormat('es-GT');

// Los bloques de columnas [desde, hasta): vacunas seguidas mientras sumen hasta `limite` columnas, sin partir ninguna.
// Una vacuna con más columnas que el límite va sola en su bloque.
export function tramosDeColumnas(columnas, limite) {
  const tramos = [];
  for (const vacuna of tramosDelEncabezado(columnas).vacunas) {
    const actual = tramos.at(-1);
    if (actual && actual.hasta - actual.desde + vacuna.abarca <= limite) actual.hasta += vacuna.abarca;
    else tramos.push({ desde: vacuna.desde, hasta: vacuna.desde + vacuna.abarca });
  }
  return tramos;
}

const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);

// «Agosto de 2026», «Enero – agosto de 2026» o «Noviembre de 2025 – febrero de 2026». Solo el PDF lo escribe así;
// el Excel y la pantalla usan textoRango.
export function textoPeriodo(desde, hasta) {
  const mes = ({ mes: m }) => NOMBRES_MES[m - 1];
  if (desde.anio === hasta.anio && desde.mes === hasta.mes) return conMayuscula(`${mes(hasta)} de ${hasta.anio}`);
  if (desde.anio === hasta.anio) return conMayuscula(`${mes(desde)} – ${mes(hasta)} de ${hasta.anio}`);
  return conMayuscula(`${mes(desde)} de ${desde.anio} – ${mes(hasta)} de ${hasta.anio}`);
}

// Las líneas [etiqueta, valor] de textosInforme.js, repartidas en el diseño: la DDRISS y el periodo van en el
// encabezado con su propio formato, «Generado» en el pie, los avisos en un recuadro y el resto en la franja de filtros.
export function repartirLineas(lineas) {
  const valor = (etiqueta) => lineas.find(([e]) => e === etiqueta)?.[1] ?? '';
  return {
    ddriss: valor('DDRISS').replace(/^DDRISS\s+/i, ''),
    generado: valor('Generado'),
    avisos: lineas.filter(([e]) => e === 'Aviso').map(([, v]) => v),
    filtros: lineas.filter(([e]) => !['DDRISS', 'Periodo', 'Generado', 'Aviso'].includes(e)),
  };
}

const barra = (alto, ancho = 3) => ({ canvas: [{ type: 'rect', x: 0, y: 0, w: ancho, h: alto, color: TINTA.acento }] });
const regla = (margen) => ({
  canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO_UTIL, y2: 0, lineWidth: 0.75, lineColor: TINTA.marino }],
  margin: margen,
});
const rotulo = (text, extra = {}) => ({
  text, fontSize: 7, bold: true, color: TINTA.acentoTexto, characterSpacing: 1.2, ...extra,
});

function franjaDeFiltros(filtros) {
  const celda = ([etiqueta, valor]) => ({
    stack: [
      { text: etiqueta, fontSize: 6.5, color: TINTA.gris },
      { text: valor, fontSize: 9, bold: true, color: TINTA.texto, margin: [0, 1, 0, 0] },
    ],
  });
  return {
    margin: [0, 8, 0, 0],
    table: {
      widths: [3, ...filtros.map(() => '*')],
      body: [[{ text: '', fillColor: TINTA.acento }, ...filtros.map(celda)]],
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: (i, nodo) => (i >= 2 && i < nodo.table.widths.length ? 0.5 : 0),
      vLineColor: () => TINTA.lineaFuerte,
      fillColor: (fila, nodo, columna) => (columna === 0 ? TINTA.acento : TINTA.banda),
      paddingLeft: (i) => (i === 0 ? 0 : 12),
      paddingRight: (i) => (i === 0 ? 0 : 8),
      paddingTop: () => 5,
      paddingBottom: () => 5,
    },
  };
}

function recuadroDeAvisos(avisos) {
  return {
    margin: [0, 6, 0, 0],
    table: {
      widths: [3, '*'],
      body: avisos.map((aviso) => [
        { text: '' },
        { text: aviso, fontSize: 7.5, bold: true, color: COLORES.advertenciaTexto },
      ]),
    },
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      fillColor: (fila, nodo, columna) => (columna === 0 ? '#d9a23a' : COLORES.advertencia),
      paddingLeft: (i) => (i === 0 ? 0 : 8),
      paddingRight: (i) => (i === 0 ? 0 : 8),
      paddingTop: () => 1.5,
      paddingBottom: () => 1.5,
    },
  };
}

// El encabezado que se repite en cada página: marca, institución, título, periodo, filtros y avisos.
// La esquina derecha: el Ministerio, la Dirección y la DDRISS; con logo (SPEC 78), el logo reemplaza al Ministerio y
// los otros dos renglones van a su izquierda.
const DIRECCION = {
  text: 'Dirección Departamental de Redes Integradas de Servicios de Salud', fontSize: 7.5, color: TINTA.gris,
};
const nombreDeLaDdriss = (ddriss) => ({ text: ddriss, fontSize: 8.5, bold: true, color: TINTA.texto });
function institucion(ddriss, logo) {
  if (logo) {
    const ancho = Math.round((ALTO_LOGO * logo.ancho) / logo.alto);
    return {
      width: '*',
      columns: [
        {
          width: '*', alignment: 'right', margin: [0, 7, 8, 0],
          stack: [DIRECCION, { ...nombreDeLaDdriss(ddriss), margin: [0, 1, 0, 0] }],
        },
        { width: ancho, image: 'logo', height: ALTO_LOGO },
      ],
    };
  }
  return {
    width: '*',
    alignment: 'right',
    stack: [
      { text: 'Ministerio de Salud Pública y Asistencia Social', fontSize: 8.5, bold: true, color: TINTA.texto },
      { ...DIRECCION, margin: [0, 2, 0, 0] },
      { ...nombreDeLaDdriss(ddriss), margin: [0, 1, 0, 0] },
    ],
  };
}

function encabezadoDePagina({
  rotuloDelInforme, nombre, subtitulo, periodo, preliminar, ddriss, logo, filtros, avisos,
}) {
  return {
    margin: [MARGEN_LADO, 18, MARGEN_LADO, 0],
    stack: [
      {
        columns: [
          { width: 9, ...barra(30) },
          {
            width: 'auto',
            stack: [
              { text: 'SIRCOVA', fontSize: 19, bold: true, color: TINTA.marino, lineHeight: 0.95 },
              { text: 'Informes de vacunación', fontSize: 8, color: TINTA.gris },
            ],
          },
          institucion(ddriss, logo),
        ],
      },
      regla([0, 6, 0, 0]),
      {
        margin: [0, 6, 0, 0],
        columns: [
          {
            width: '*',
            stack: [
              {
                text: [
                  rotulo(rotuloDelInforme),
                  ...(preliminar
                    ? [{ text: '   ' }, rotulo(' PRELIMINAR ', {
                      color: COLORES.advertenciaTexto, background: COLORES.advertencia,
                    })]
                    : []),
                ],
              },
              { text: nombre, fontSize: 19, bold: true, color: TINTA.marino, lineHeight: 0.95 },
              { text: subtitulo, fontSize: 8, color: TINTA.gris },
            ],
          },
          {
            width: 'auto',
            alignment: 'right',
            stack: [
              {
                text: 'PERÍODO', fontSize: 6.5, bold: true, color: TINTA.gris, characterSpacing: 0.6,
                margin: [0, 2, 0, 0],
              },
              { text: periodo, fontSize: 14, bold: true, color: TINTA.marino, margin: [0, 2, 0, 0] },
            ],
          },
        ],
      },
      franjaDeFiltros(filtros),
      ...(avisos.length ? [recuadroDeAvisos(avisos)] : []),
    ],
  };
}

function pieDePagina(generado, pagina, paginas) {
  return {
    margin: [MARGEN_LADO, 6, MARGEN_LADO, 0],
    stack: [
      { canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO_UTIL, y2: 0, lineWidth: 0.5, lineColor: TINTA.lineaFuerte }] },
      {
        margin: [0, 8, 0, 0],
        columns: [
          { width: 8, ...barra(11) },
          { width: '*', text: 'SIRCOVA', fontSize: 8.5, bold: true, color: TINTA.marino },
          {
            width: 'auto',
            text: `Generado: ${generado}`,
            fontSize: 7.5, color: TINTA.gris, margin: [0, 1, 0, 0],
          },
          {
            width: 14, canvas: [{ type: 'line', x1: 7, y1: -1, x2: 7, y2: 12, lineWidth: 0.5, lineColor: TINTA.linea }],
          },
          { width: 'auto', text: `Página ${pagina} de ${paginas}`, fontSize: 8.5, bold: true, color: TINTA.texto },
        ],
      },
    ],
  };
}

// Las líneas de un aviso largo pasan a otra línea; el margen de arriba se estima con su largo.
const lineasDeAvisos = (avisos) =>
  avisos.reduce((suma, aviso) => suma + Math.ceil(aviso.length / CARACTERES_POR_LINEA_AVISO), 0);
const margenArriba = (avisos) => MARGEN_ARRIBA + (avisos.length ? 6 + lineasDeAvisos(avisos) * ALTO_LINEA_AVISO : 0);

// Lo común a los PDF de informes: hoja, fuente, marca de agua, encabezado, pie y los bloques. logo: el de
// logoDeLaDdriss o null; va una sola vez en `images` aunque se repita en cada página.
function documento({ titulo, preliminar, generadoEn, lineas, cabecera, contenido, logo }) {
  const { ddriss, generado, avisos, filtros } = repartirLineas(lineas);
  const arriba = margenArriba(avisos);
  return {
    info: { title: titulo, creator: 'SIRCOVA', creationDate: generadoEn },
    pageSize: 'LETTER',
    pageOrientation: 'landscape',
    pageMargins: [MARGEN_LADO, arriba, MARGEN_LADO, MARGEN_ABAJO],
    defaultStyle: { font: FUENTE, fontSize: 8, color: TINTA.texto },
    ...(preliminar
      ? { watermark: { text: 'PRELIMINAR', color: '#888888', opacity: 0.1, bold: true } }
      : {}),
    ...(logo ? { images: { logo: `data:image/png;base64,${logo.bytes.toString('base64')}` } } : {}),
    header: () => encabezadoDePagina({ ...cabecera, preliminar, ddriss, logo, filtros, avisos }),
    footer: (pagina, paginas) => pieDePagina(generado, pagina, paginas),
    content: contenido,
  };
}

// El rótulo y la línea sobre cada bloque, que empieza en página nueva (menos el primero). orden: su lugar en el
// documento; numero y total: el bloque de vacunas (el acumulado parte uno en varias páginas).
function bloque(rotuloDelBloque, { orden, numero: indice, total }, tabla) {
  const numero = (n) => String(n).padStart(2, '0');
  return {
    id: `tramo-${orden}`,
    ...(orden > 0 ? { pageBreak: 'before' } : {}),
    stack: [
      {
        columns: [
          rotulo(rotuloDelBloque, { width: '*', fontSize: 7.5 }),
          {
            width: 'auto',
            text: `Bloque de vacunas ${numero(indice + 1)} / ${numero(total)}`,
            fontSize: 7.5,
            color: TINTA.gris,
          },
        ],
      },
      {
        canvas: [{ type: 'line', x1: 0, y1: 0, x2: ANCHO_UTIL, y2: 0, lineWidth: 0.5, lineColor: TINTA.lineaFuerte }],
        margin: [0, 3, 0, 8],
      },
      tabla,
    ],
  };
}

// Una celda que abarca `n` columnas va seguida de n − 1 celdas vacías, como pide pdfmake. Cada vacía es un objeto
// propio: pdfmake anota en las celdas al armar la tabla.
const vacias = (n) => Array.from({ length: n }, () => ({}));
const abarcando = (celda, n) => [{ ...celda, colSpan: n }, ...vacias(n - 1)];

const enMarino = (text, filas) => ({
  text, bold: true, color: TINTA.blanco, fontSize: 8, rowSpan: filas, verticalAlignment: 'middle', margin: [5, 0, 0, 0],
});
const deVacuna = (v) => abarcando({
  text: v.nombre, bold: true, color: TINTA.blanco, alignment: 'center', verticalAlignment: 'middle',
  margin: [0, 3, 0, 3],
}, v.abarca);
const subencabezado = (text) => ({ text, bold: true, alignment: 'center', color: TINTA.marino });

// Las columnas de la tabla donde empieza una vacuna (la línea vertical más marcada).
const iniciosDeVacuna = (vacunas, fijas) => new Set(vacunas.map((v) => fijas + v.desde - vacunas[0].desde));

// Las líneas de la tabla: blancas en el encabezado y más marcadas donde empieza una vacuna.
// dentroDelMarino(i, columna): la línea i cruza una celda marino de varias filas y va del mismo color para no verse.
function lineasDeTabla({ fijas, inicios, filasEncabezado, relleno, dentroDelMarino = () => false }) {
  return {
    hLineWidth: (i, nodo) => (i === 0 || i === nodo.table.body.length ? 0 : 0.5),
    vLineWidth: (i, nodo) => (i === 0 || i === nodo.table.widths.length ? 0 : 0.5),
    hLineColor: (i, nodo, columna) => {
      if ((i < filasEncabezado && columna < fijas) || dentroDelMarino(i, columna)) return TINTA.marino;
      return i <= filasEncabezado ? TINTA.blanco : TINTA.linea;
    },
    vLineColor: (i, nodo, fila) => {
      if (fila < filasEncabezado) return fila === 0 || i <= fijas ? TINTA.lineaEncabezado : TINTA.blanco;
      return i === fijas || inicios.has(i) ? TINTA.lineaFuerte : TINTA.linea;
    },
    fillColor: relleno,
    paddingLeft: () => 4,
    paddingRight: () => 4,
    paddingTop: () => 0.75,
    paddingBottom: () => 0.75,
  };
}

const cantidad = (n, extra = {}) => ({
  text: formatoEntero.format(n), alignment: 'right', ...(n === 0 ? { color: TINTA.cero } : {}), ...extra,
});

function tablaDelTramo(informe, { desde, hasta }) {
  const conMunicipio = llevaMunicipio(informe.nivel);
  const columnas = informe.columnas.slice(desde, hasta);
  const { vacunas, secciones } = tramosDelEncabezado(columnas);
  const fijas = conMunicipio ? 2 : 1;

  const encabezado = [
    [
      enMarino(tituloDeLaFila(informe.nivel, informe.informe), FILAS_DE_ENCABEZADO),
      ...(conMunicipio ? [enMarino('Municipio', FILAS_DE_ENCABEZADO)] : []),
      ...vacunas.flatMap(deVacuna),
    ],
    [...vacias(fijas), ...secciones.flatMap((s) => abarcando({ ...subencabezado(s.titulo), fontSize: 7 }, s.abarca))],
    [...vacias(fijas), ...columnas.map((c) => subencabezado(etiquetaDeDosis(c.dosis.codigo)))],
  ];
  const filas = informe.filas.map((fila) => [
    nombreDeFila(fila), ...(conMunicipio ? [fila.municipio?.nombre ?? ''] : []),
    ...fila.cantidades.slice(desde, hasta).map((n) => cantidad(n)),
  ]);
  const enTotal = { bold: true, color: TINTA.blanco };
  const total = [
    { text: 'TOTAL', ...enTotal }, ...(conMunicipio ? [{ text: '', ...enTotal }] : []),
    ...informe.total.cantidades.slice(desde, hasta).map((n) => cantidad(n, enTotal)),
  ];
  const ultima = FILAS_DE_ENCABEZADO + filas.length;

  return {
    fontSize: 7,
    table: {
      headerRows: FILAS_DE_ENCABEZADO,
      dontBreakRows: false,
      widths: [
        conMunicipio ? ANCHO_NOMBRE_CON_MUNICIPIO : ANCHO_NOMBRE, ...(conMunicipio ? [ANCHO_MUNICIPIO] : []),
        ...columnas.map(() => '*'),
      ],
      body: [...encabezado, ...filas, total],
    },
    layout: lineasDeTabla({
      fijas,
      inicios: iniciosDeVacuna(vacunas, fijas),
      filasEncabezado: FILAS_DE_ENCABEZADO,
      relleno: (fila, nodo, columna) => {
        if (fila === 0 || (fila < FILAS_DE_ENCABEZADO && columna < fijas)) {
          return columna < fijas ? TINTA.marino : TINTA.marinoMedio;
        }
        if (fila < FILAS_DE_ENCABEZADO) return TINTA.subencabezado;
        if (fila === ultima) return TINTA.marino;
        return (fila - FILAS_DE_ENCABEZADO) % 2 === 1 ? TINTA.cebra : null;
      },
    }),
  };
}

const notaFinal = (text) => ({
  margin: [0, 10, 0, 0],
  columns: [{ width: 9, ...barra(11) }, { width: '*', text, fontSize: 8, bold: true, color: TINTA.texto }],
});

/** informe: la respuesta de informePorFila. datos: los de lineasDelEncabezado (textosInforme.js). */
export function documentoDelInforme(informe, datos) {
  const limite = llevaMunicipio(informe.nivel) ? COLUMNAS_POR_TRAMO.conMunicipio : COLUMNAS_POR_TRAMO.sinMunicipio;
  const tramos = tramosDeColumnas(informe.columnas, limite);
  return documento({
    logo: logoDeLaDdriss(datos.ddrissCodigo),
    titulo: tituloDelInforme(informe),
    preliminar: informe.preliminar,
    generadoEn: datos.generadoEn,
    lineas: lineasDelEncabezado(informe, datos),
    cabecera: {
      rotuloDelInforme: 'PRODUCCIÓN DE VACUNACIÓN',
      nombre: NOMBRES_INFORME[informe.informe],
      subtitulo: tituloDeLaFila(informe.nivel, informe.informe),
      periodo: textoPeriodo(informe.desde, informe.hasta),
    },
    contenido: [
      ...tramos.map((tramo, i) => bloque(
        'DETALLE DE DOSIS', { orden: i, numero: i, total: tramos.length }, tablaDelTramo(informe, tramo),
      )),
      ...(informe.columnas.length > 0 && informe.dosisFueraDelConsolidado > 0
        ? [notaFinal(textoFueraDelConsolidado(informe.dosisFueraDelConsolidado))]
        : []),
    ],
  });
}

// Los bytes del PDF.
export function pdfDelInforme(informe, datos) {
  return pdfmake.createPdf(documentoDelInforme(informe, datos)).getBuffer();
}

// ---------------------------------------------------------------- Acumulado anual (SPEC 66, HU-49)

// Cuatro filas por unidad (CIFRAS) y una columna «Cifra» más: caben menos cantidades por bloque.
export const COLUMNAS_POR_TRAMO_ANUAL = { conMunicipio: 10, sinMunicipio: 11 };
export const ANCHO_NOMBRE_ANUAL = 105;
const ANCHO_MUNICIPIO_ANUAL = 70;
const ANCHO_CIFRA = 54;
const FILAS_DE_ENCABEZADO_ANUAL = 4;
// Para que una unidad (sus cuatro filas) no quede partida entre dos páginas, cada página lleva las unidades que caben,
// estimadas con lo que miden: una fila de cifras, el encabezado de la tabla (con nombres de vacuna en tres líneas) y
// el rótulo del bloque.
const ALTO_FILA_ANUAL = 11.2;
const ALTO_ENCABEZADO_ANUAL = 72;
const ALTO_ROTULO = 24;
export function unidadesPorPagina(avisos) {
  const disponible = 612 - margenArriba(avisos) - MARGEN_ABAJO - ALTO_ROTULO - ALTO_ENCABEZADO_ANUAL;
  return Math.max(1, Math.floor(disponible / (CIFRAS.length * ALTO_FILA_ANUAL)));
}
// El fondo y el color de texto de una celda (claves de COLORES); pdfmake da prioridad al de la celda sobre el layout.
const tono = (fondo, texto) => ({ fillColor: COLORES[fondo], color: COLORES[texto] });

// unidades: las filas del informe (y el total) que van en esta página.
function tablaDelTramoAnual(informe, { desde, hasta }, unidades) {
  const conMunicipio = llevaMunicipio(informe.nivel);
  const columnas = informe.columnas.slice(desde, hasta);
  const { vacunas, secciones } = tramosDelEncabezado(columnas);
  const fijas = conMunicipio ? 3 : 2;
  const filasEncabezado = FILAS_DE_ENCABEZADO_ANUAL;

  const encabezado = [
    [
      enMarino(tituloDeLaFila(informe.nivel, informe.informe), filasEncabezado),
      ...(conMunicipio ? [enMarino('Municipio', filasEncabezado)] : []),
      enMarino('Cifra', filasEncabezado),
      ...vacunas.flatMap(deVacuna),
    ],
    [...vacias(fijas), ...secciones.flatMap((s) => abarcando({ ...subencabezado(s.titulo), fontSize: 7 }, s.abarca))],
    [...vacias(fijas), ...columnas.map((c) => subencabezado(etiquetaDeDosis(c.dosis.codigo)))],
    [...vacias(fijas), ...columnas.map((c) => ({
      text: textoMeta(c.meta), alignment: 'center', fontSize: 6.5, ...tono('muted', 'mutedTexto'),
    }))],
  ];
  // Cuatro filas por unidad; el nombre (y el municipio) abarcan las cuatro. Cada cifra con su tono; la cobertura y la
  // brecha que alcanzan su meta (brecha 0), en verde.
  const deCifra = (clave, cumple) => {
    const t = tonoDeCifra(clave, cumple);
    return t ? tono(t.fondo, t.texto) : {};
  };
  const unidad = ({ nombre, municipio, cifras, esTotal }) => CIFRAS.map(([clave, etiqueta], n) => [
    ...(n === 0
      ? [
        {
          text: nombre, rowSpan: CIFRAS.length, verticalAlignment: 'middle',
          ...(esTotal ? { color: TINTA.blanco } : {}),
        },
        ...(conMunicipio ? [{ text: municipio, rowSpan: CIFRAS.length, verticalAlignment: 'middle' }] : []),
      ]
      : vacias(fijas - 1)),
    { text: etiqueta, ...deCifra(clave, false) },
    ...cifras[clave].slice(desde, hasta).map((v, i) => {
      const cumple = cifras.brecha[desde + i] === 0 && (clave === 'cobertura' || clave === 'brecha');
      return {
        text: textoCifra(clave, v), alignment: 'right', ...deCifra(clave, cumple), ...(cumple ? { bold: true } : {}),
      };
    }),
  ].map((celda) => (esTotal && 'text' in celda ? { ...celda, bold: true } : celda)));
  const filas = unidades.flatMap(unidad);
  const inicioDelTotal = unidades.at(-1).esTotal ? filasEncabezado + filas.length - CIFRAS.length : Infinity;

  return {
    fontSize: 7,
    table: {
      headerRows: filasEncabezado,
      dontBreakRows: false,
      widths: [
        ANCHO_NOMBRE_ANUAL, ...(conMunicipio ? [ANCHO_MUNICIPIO_ANUAL] : []), ANCHO_CIFRA,
        ...columnas.map(() => '*'),
      ],
      body: [...encabezado, ...filas],
    },
    layout: lineasDeTabla({
      fijas,
      inicios: iniciosDeVacuna(vacunas, fijas),
      filasEncabezado,
      dentroDelMarino: (i, columna) => i > inicioDelTotal && columna < fijas - 1,
      relleno: (fila, nodo, columna) => {
        if (fila === 0 || (fila < filasEncabezado && columna < fijas)) {
          return columna < fijas ? TINTA.marino : TINTA.marinoMedio;
        }
        if (fila < filasEncabezado) return TINTA.subencabezado;
        if (fila >= inicioDelTotal && columna < fijas - 1) return TINTA.marino;
        return Math.floor((fila - filasEncabezado) / CIFRAS.length) % 2 === 1 ? TINTA.cebra : null;
      },
    }),
  };
}

/** informe: la respuesta de acumuladoAnual. datos: los de lineasDelAcumulado (textosInforme.js). */
export function documentoDelAcumulado(informe, datos) {
  const limite = llevaMunicipio(informe.nivel)
    ? COLUMNAS_POR_TRAMO_ANUAL.conMunicipio
    : COLUMNAS_POR_TRAMO_ANUAL.sinMunicipio;
  const tramos = tramosDeColumnas(informe.columnas, limite);
  const lineas = lineasDelAcumulado(informe, datos);
  const unidades = [
    ...informe.filas.map((f) => ({
      nombre: f.nombre, municipio: f.municipio?.nombre ?? '', cifras: f, esTotal: false,
    })),
    { nombre: 'TOTAL', municipio: '', cifras: informe.total, esTotal: true },
  ];
  const porPagina = unidadesPorPagina(repartirLineas(lineas).avisos);
  const paginas = Array.from({ length: Math.ceil(unidades.length / porPagina) },
    (_, i) => unidades.slice(i * porPagina, (i + 1) * porPagina));
  const bloques = tramos.flatMap((tramo, numero) => paginas.map((pagina) => ({ tramo, numero, pagina })));
  return documento({
    logo: logoDeLaDdriss(datos.ddrissCodigo),
    titulo: tituloDelInforme(informe),
    preliminar: informe.preliminar,
    generadoEn: datos.generadoEn,
    lineas,
    cabecera: {
      rotuloDelInforme: 'COBERTURA DE VACUNACIÓN',
      nombre: NOMBRES_INFORME['acumulado-anual'],
      subtitulo: tituloDeLaFila(informe.nivel, informe.informe),
      periodo: textoPeriodo({ anio: informe.anio, mes: 1 }, { anio: informe.anio, mes: 12 }),
    },
    contenido: bloques.map(({ tramo, numero, pagina }, orden) => bloque(
      'DOSIS, POBLACIÓN, COBERTURA Y BRECHA', { orden, numero, total: tramos.length },
      tablaDelTramoAnual(informe, tramo, pagina),
    )),
  });
}

export function pdfDelAcumulado(informe, datos) {
  return pdfmake.createPdf(documentoDelAcumulado(informe, datos)).getBuffer();
}
