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

// Carta horizontal: 792 × 612. SPEC 79: la página 1 lleva el encabezado completo como contenido y las demás uno
// reducido en el margen superior, que crece con los avisos (pdfmake no admite un margen distinto por página).
const MARGEN_LADO = 26;
const ANCHO_UTIL = 792 - 2 * MARGEN_LADO;
const ARRIBA_DEL_ENCABEZADO = 18;
// Donde empezaban las tablas con el encabezado completo en el margen: la página 1 queda igual que antes.
const MARGEN_ARRIBA_COMPLETO = 152;
// El reducido mide ~76 (con el logo o sin él) y deja ~12 antes del bloque.
const MARGEN_ARRIBA = 88;
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

// El encabezado completo de la página 1: marca, institución, título, periodo, filtros y avisos.
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

// La franja de arriba, igual en todas las páginas: la marca a la izquierda y la institución con el logo a la derecha.
const franjaDeMarca = (ddriss, logo) => ({
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
});

function encabezadoDePagina({
  rotuloDelInforme, nombre, subtitulo, periodo, preliminar, ddriss, logo, filtros, avisos,
}) {
  return {
    stack: [
      franjaDeMarca(ddriss, logo),
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

// El encabezado de la página 2 en adelante: la franja de marca (con el logo), el nombre del informe con el periodo
// en una línea y los avisos; sin la franja de filtros ni el subtítulo.
function encabezadoReducido({ nombre, periodo, ddriss, logo, avisos }) {
  return {
    margin: [MARGEN_LADO, ARRIBA_DEL_ENCABEZADO, MARGEN_LADO, 0],
    stack: [
      franjaDeMarca(ddriss, logo),
      regla([0, 6, 0, 0]),
      {
        margin: [0, 5, 0, 0],
        columns: [
          { width: '*', text: nombre, fontSize: 12, bold: true, color: TINTA.marino },
          { width: 'auto', text: periodo, fontSize: 9, bold: true, color: TINTA.marino, margin: [0, 2, 0, 0] },
        ],
      },
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
const altoDeAvisos = (avisos) => (avisos.length ? 6 + lineasDeAvisos(avisos) * ALTO_LINEA_AVISO : 0);
const margenArriba = (avisos) => MARGEN_ARRIBA + altoDeAvisos(avisos);

// Lo común a los PDF de informes: hoja, fuente, marca de agua, encabezados, pie y los bloques. logo: el de
// logoDeLaDdriss o null; va una sola vez en `images`.
function documento({ titulo, preliminar, generadoEn, lineas, cabecera, contenido, logo }) {
  const { ddriss, generado, avisos, filtros } = repartirLineas(lineas);
  const arriba = margenArriba(avisos);
  // El completo sube (margen negativo) hasta donde iba cuando era el `header`, y su alto mínimo hace que lo que
  // sigue empiece donde empezaba antes; si crece, empuja la tabla en lugar de taparla.
  const completo = {
    id: 'encabezado-completo',
    margin: [0, ARRIBA_DEL_ENCABEZADO - arriba, 0, 0],
    table: {
      widths: ['*'],
      heights: [MARGEN_ARRIBA_COMPLETO + altoDeAvisos(avisos) - ARRIBA_DEL_ENCABEZADO],
      body: [[encabezadoDePagina({ ...cabecera, preliminar, ddriss, logo, filtros, avisos })]],
    },
    layout: {
      hLineWidth: () => 0, vLineWidth: () => 0,
      paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0,
    },
  };
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
    header: (pagina) => (pagina === 1 ? null : encabezadoReducido({ ...cabecera, ddriss, logo, avisos })),
    footer: (pagina, paginas) => pieDePagina(generado, pagina, paginas),
    content: [completo, ...contenido],
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
          rotulo(rotuloDelBloque, { width: '*', fontSize: 7.5, id: `rotulo-${orden}` }),
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
      ...[tabla].flat(),
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
// rellenoDeFila: el relleno vertical de las filas de datos (el encabezado conserva el suyo), según la densidad.
function lineasDeTabla({
  fijas, inicios, filasEncabezado, relleno, dentroDelMarino = () => false, rellenoDeFila = RELLENO_VERTICAL,
}) {
  const vertical = (i) => (i < filasEncabezado ? RELLENO_VERTICAL : rellenoDeFila);
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
    paddingTop: vertical,
    paddingBottom: vertical,
  };
}

// SPEC 79: las densidades de las filas de datos, de la más holgada a la más apretada. Un bloque por departamento,
// municipio o distrito usa la primera con la que cabe en su página. La letra cambia en toda la fila: el alto lo pone
// la celda más alta, y achicar solo las cantidades no ahorraría nada.
const RELLENO_VERTICAL = 0.75;
export const DENSIDADES = {
  normal: { relleno: RELLENO_VERTICAL, celda: {} },
  compacta: { relleno: 0.25, celda: { lineHeight: 0.9 } },
  minima: { relleno: 0, celda: { lineHeight: 0.9, fontSize: 6.5 } },
};
const ORDEN_DE_DENSIDADES = Object.keys(DENSIDADES);
// Filas que una tabla de varias páginas lleva consigo a la última, además del TOTAL.
const FILAS_CON_EL_TOTAL = 3;

const cantidad = (n, extra = {}) => ({
  text: formatoEntero.format(n), alignment: 'right', ...(n === 0 ? { color: TINTA.cero } : {}), ...extra,
});

// orden: el del bloque, para los id que lee la pasada de prueba (fila-N-i y total-N). densidad: una de DENSIDADES.
// corte: la fila de datos desde la que la tabla sigue en otra página (con el encabezado repetido), o null.
function tablaDelTramo(informe, { desde, hasta }, { orden = 0, densidad = 'normal', corte = null } = {}) {
  const conMunicipio = llevaMunicipio(informe.nivel);
  const { relleno: rellenoDeFila, celda } = DENSIDADES[densidad];
  const columnas = informe.columnas.slice(desde, hasta);
  const { vacunas, secciones } = tramosDelEncabezado(columnas);
  const fijas = conMunicipio ? 2 : 1;

  const encabezadoDeTabla = () => [
    [
      enMarino(tituloDeLaFila(informe.nivel, informe.informe), FILAS_DE_ENCABEZADO),
      ...(conMunicipio ? [enMarino('Municipio', FILAS_DE_ENCABEZADO)] : []),
      ...vacunas.flatMap(deVacuna),
    ],
    [...vacias(fijas), ...secciones.flatMap((s) => abarcando({ ...subencabezado(s.titulo), fontSize: 7 }, s.abarca))],
    [...vacias(fijas), ...columnas.map((c) => subencabezado(etiquetaDeDosis(c.dosis.codigo)))],
  ];
  const filas = informe.filas.map((fila, i) => [
    { text: nombreDeFila(fila), id: `fila-${orden}-${i}`, ...celda },
    ...(conMunicipio ? [{ text: fila.municipio?.nombre ?? '', ...celda }] : []),
    ...fila.cantidades.slice(desde, hasta).map((n) => cantidad(n, celda)),
  ]);
  const enTotal = { bold: true, color: TINTA.blanco, ...celda };
  const total = [
    { text: 'TOTAL', id: `total-${orden}`, ...enTotal }, ...(conMunicipio ? [{ text: '', ...enTotal }] : []),
    ...informe.total.cantidades.slice(desde, hasta).map((n) => cantidad(n, enTotal)),
  ];

  // primera: el índice de la primera fila de datos de esta parte, para que la cebra siga igual después del corte.
  const parte = (cuerpo, primera, conTotal, extra = {}) => ({
    ...extra,
    fontSize: 7,
    table: {
      headerRows: FILAS_DE_ENCABEZADO,
      dontBreakRows: false,
      widths: [
        conMunicipio ? ANCHO_NOMBRE_CON_MUNICIPIO : ANCHO_NOMBRE, ...(conMunicipio ? [ANCHO_MUNICIPIO] : []),
        ...columnas.map(() => '*'),
      ],
      // Cada parte arma su propio encabezado: pdfmake anota en las celdas al maquetar.
      body: [...encabezadoDeTabla(), ...cuerpo, ...(conTotal ? [total] : [])],
    },
    layout: lineasDeTabla({
      fijas,
      inicios: iniciosDeVacuna(vacunas, fijas),
      filasEncabezado: FILAS_DE_ENCABEZADO,
      rellenoDeFila,
      relleno: (fila, nodo, columna) => {
        if (fila === 0 || (fila < FILAS_DE_ENCABEZADO && columna < fijas)) {
          return columna < fijas ? TINTA.marino : TINTA.marinoMedio;
        }
        if (fila < FILAS_DE_ENCABEZADO) return TINTA.subencabezado;
        if (conTotal && fila === FILAS_DE_ENCABEZADO + cuerpo.length) return TINTA.marino;
        return (fila - FILAS_DE_ENCABEZADO + primera) % 2 === 1 ? TINTA.cebra : null;
      },
    }),
  });

  if (corte === null || corte <= 0 || corte >= filas.length) return [parte(filas, 0, true)];
  return [
    parte(filas.slice(0, corte), 0, false),
    parte(filas.slice(corte), corte, true, { pageBreak: 'before' }),
  ];
}

const notaFinal = (text) => ({
  margin: [0, 10, 0, 0],
  columns: [
    { width: 9, ...barra(11) },
    { width: '*', text, id: 'nota-final', fontSize: 8, bold: true, color: TINTA.texto },
  ],
});

// SPEC 79: la pasada de prueba. Maqueta el documento sin quedarse con el PDF y devuelve, por cada nodo con id, las
// páginas donde cae y dónde empieza ({ paginas, arriba }). pdfmake pasa esa información a pageBreakBefore; aquí
// solo se lee y nunca pide un salto.
export async function maquetar(doc) {
  const nodos = new Map();
  await pdfmake.createPdf({
    ...doc,
    pageBreakBefore: (nodo) => {
      if (nodo.id) nodos.set(nodo.id, { paginas: nodo.pageNumbers, arriba: nodo.startPosition.top });
      return false;
    },
  }).getBuffer();
  return nodos;
}

const primeraPagina = (nodos, id) => nodos.get(id)?.paginas[0];
const ultimaPagina = (nodos, id) => nodos.get(id)?.paginas.at(-1);

// La densidad y el corte de cada bloque, según dónde cayó en la pasada anterior.
// - Por departamento, municipio o distrito, un bloque que ocupa más de una página, o cuya nota final queda sola en
//   otra, pasa a la densidad siguiente. Por establecimiento las filas no se compactan: la tabla sigue en otra página.
// - Si con eso la última página de una tabla lleva el TOTAL con menos de FILAS_CON_EL_TOTAL filas, o la nota final
//   queda sola en la suya, la tabla se corta para que esa página lleve las últimas FILAS_CON_EL_TOTAL filas. Un
//   bloque cortado no se compacta más: ocupar dos páginas es lo que se buscaba.
function ajustesDelInforme(informe, tramos, anteriores, paginas) {
  const filas = informe.filas.length;
  if (filas === 0) return anteriores;
  const compacta = informe.nivel !== 'establecimiento';
  const corteFinal = Math.max(1, filas - FILAS_CON_EL_TOTAL);
  const ajustar = ({ densidad, corte }, noCabe, quedaSolo) => {
    if (corte !== null) return { densidad, corte };
    const siguiente = ORDEN_DE_DENSIDADES[ORDEN_DE_DENSIDADES.indexOf(densidad) + 1];
    if (compacta && siguiente && (noCabe || quedaSolo)) return { densidad: siguiente, corte };
    return { densidad, corte: quedaSolo ? corteFinal : null };
  };
  const nota = primeraPagina(paginas, 'nota-final');
  return tramos.map((_, orden) => {
    const total = primeraPagina(paginas, `total-${orden}`);
    const noCabe = total > primeraPagina(paginas, `fila-${orden}-0`);
    let conElTotal = 0;
    while (conElTotal < Math.min(FILAS_CON_EL_TOTAL, filas)
      && ultimaPagina(paginas, `fila-${orden}-${filas - 1 - conElTotal}`) === total) conElTotal += 1;
    const totalCasiSolo = noCabe && conElTotal < FILAS_CON_EL_TOTAL;
    const notaSola = orden === tramos.length - 1 && nota !== undefined && nota > total;
    return ajustar(anteriores[orden], noCabe, totalCasiSolo || notaSola);
  });
}

const iguales = (a, b) => a.every((ajuste, i) => ajuste.densidad === b[i].densidad && ajuste.corte === b[i].corte);

/**
 * informe: la respuesta de informePorFila. datos: los de lineasDelEncabezado (textosInforme.js).
 * ajustes: la densidad y el corte de cada bloque (los de ajustarInforme); sin ellos, todos normales y sin corte.
 */
export function documentoDelInforme(informe, datos, ajustes = null) {
  const limite = llevaMunicipio(informe.nivel) ? COLUMNAS_POR_TRAMO.conMunicipio : COLUMNAS_POR_TRAMO.sinMunicipio;
  const tramos = tramosDeColumnas(informe.columnas, limite);
  const ajuste = (orden) => ajustes?.[orden] ?? { densidad: 'normal', corte: null };
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
        'DETALLE DE DOSIS', { orden: i, numero: i, total: tramos.length },
        tablaDelTramo(informe, tramo, { orden: i, ...ajuste(i) }),
      )),
      ...(informe.columnas.length > 0 && informe.dosisFueraDelConsolidado > 0
        ? [notaFinal(textoFueraDelConsolidado(informe.dosisFueraDelConsolidado))]
        : []),
    ],
  });
}

// Los ajustes de cada bloque: maqueta, corrige y vuelve a maquetar hasta que nada cambie. Cada vuelta solo puede
// subir una densidad o poner un corte, así que termina; el tope es por si acaso.
const VUELTAS = 6;
export async function ajustarInforme(informe, datos) {
  const limite = llevaMunicipio(informe.nivel) ? COLUMNAS_POR_TRAMO.conMunicipio : COLUMNAS_POR_TRAMO.sinMunicipio;
  const tramos = tramosDeColumnas(informe.columnas, limite);
  let ajustes = tramos.map(() => ({ densidad: 'normal', corte: null }));
  for (let vuelta = 0; vuelta < VUELTAS; vuelta += 1) {
    const paginas = await maquetar(documentoDelInforme(informe, datos, ajustes));
    const siguientes = ajustesDelInforme(informe, tramos, ajustes, paginas);
    if (iguales(siguientes, ajustes)) break;
    ajustes = siguientes;
  }
  return ajustes;
}

// Los bytes del PDF, con los ajustes de la pasada de prueba.
export async function pdfDelInforme(informe, datos) {
  const ajustes = await ajustarInforme(informe, datos);
  return pdfmake.createPdf(documentoDelInforme(informe, datos, ajustes)).getBuffer();
}

// ---------------------------------------------------------------- Acumulado anual (SPEC 66, HU-49)

// Cuatro filas por unidad (CIFRAS) y una columna «Cifra» más: caben menos cantidades por bloque.
export const COLUMNAS_POR_TRAMO_ANUAL = { conMunicipio: 10, sinMunicipio: 11 };
export const ANCHO_NOMBRE_ANUAL = 105;
const ANCHO_MUNICIPIO_ANUAL = 70;
const ANCHO_CIFRA = 54;
const FILAS_DE_ENCABEZADO_ANUAL = 4;
// Para que una unidad (sus cuatro filas) no quede partida entre dos páginas, cada página es una tabla propia con las
// unidades que caben (SPEC 79): desde donde empieza el bloque (inicio), menos lo que mide el rótulo con el encabezado
// de la tabla (encabezado) y dividido entre lo que mide una unidad (unidad). Las medidas salen de la pasada de prueba.
const FONDO_UTIL = 612 - MARGEN_ABAJO;
export function unidadesPorPagina({ inicio, encabezado, unidad }) {
  return Math.max(1, Math.floor((FONDO_UTIL - inicio - encabezado) / unidad));
}
// El fondo y el color de texto de una celda (claves de COLORES); pdfmake da prioridad al de la celda sobre el layout.
const tono = (fondo, texto) => ({ fillColor: COLORES[fondo], color: COLORES[texto] });

// unidades: las filas del informe (y el total) que van en esta página. orden: el del bloque, para los id que lee la
// pasada de prueba (unidad-N-i en la «Cifra» de la primera fila de cada unidad y fin-N en la de la última fila).
function tablaDelTramoAnual(informe, { desde, hasta }, unidades, orden = 0) {
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
  const idDeCifra = (i, n) => {
    if (n === 0) return { id: `unidad-${orden}-${i}` };
    return i === unidades.length - 1 && n === CIFRAS.length - 1 ? { id: `fin-${orden}` } : {};
  };
  const unidad = ({ nombre, municipio, cifras, esTotal }, i) => CIFRAS.map(([clave, etiqueta], n) => [
    ...(n === 0
      ? [
        {
          text: nombre, rowSpan: CIFRAS.length, verticalAlignment: 'middle',
          ...(esTotal ? { color: TINTA.blanco } : {}),
        },
        ...(conMunicipio ? [{ text: municipio, rowSpan: CIFRAS.length, verticalAlignment: 'middle' }] : []),
      ]
      : vacias(fijas - 1)),
    { text: etiqueta, ...deCifra(clave, false), ...idDeCifra(i, n) },
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

const tramosDelAcumulado = (informe) => tramosDeColumnas(informe.columnas, llevaMunicipio(informe.nivel)
  ? COLUMNAS_POR_TRAMO_ANUAL.conMunicipio
  : COLUMNAS_POR_TRAMO_ANUAL.sinMunicipio);
const unidadesDelAcumulado = (informe) => [
  ...informe.filas.map((f) => ({
    nombre: f.nombre, municipio: f.municipio?.nombre ?? '', cifras: f, esTotal: false,
  })),
  { nombre: 'TOTAL', municipio: '', cifras: informe.total, esTotal: true },
];

/**
 * informe: la respuesta de acumuladoAnual. datos: los de lineasDelAcumulado (textosInforme.js).
 * paginacion: por bloque de vacunas, cuántas unidades lleva cada página (la de paginarAcumulado); sin ella, cada
 * bloque lleva todas sus unidades en una sola tabla (lo que mide la pasada de prueba).
 */
export function documentoDelAcumulado(informe, datos, paginacion = null) {
  const tramos = tramosDelAcumulado(informe);
  const lineas = lineasDelAcumulado(informe, datos);
  const unidades = unidadesDelAcumulado(informe);
  const paginasDe = (numero) => {
    const tamanos = paginacion?.[numero] ?? [unidades.length];
    return tamanos.map((n, i) => {
      const desde = tamanos.slice(0, i).reduce((suma, t) => suma + t, 0);
      return unidades.slice(desde, desde + n);
    });
  };
  const bloques = tramos.flatMap((tramo, numero) => paginasDe(numero).map((pagina) => ({ tramo, numero, pagina })));
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
      tablaDelTramoAnual(informe, tramo, pagina, orden),
    )),
  });
}

// Cuántas unidades caben en cada página de cada bloque. Una pasada con cada bloque en una sola tabla mide el
// encabezado de cada uno (del rótulo a la primera unidad: el nombre de una vacuna o una sección de varias líneas lo
// agranda) y lo que mide una unidad; solo el primer bloque empieza en la página 1, debajo del encabezado completo.
// Después se comprueba: si una página no cupo, lleva una unidad menos y se reparte de nuevo.
export async function paginarAcumulado(informe, datos) {
  const tramos = tramosDelAcumulado(informe);
  const total = unidadesDelAcumulado(informe).length;
  const medidas = await maquetar(documentoDelAcumulado(informe, datos));
  const arriba = (id) => medidas.get(id)?.arriba;
  const despuesDeLaPrimera = margenArriba(repartirLineas(lineasDelAcumulado(informe, datos)).avisos);

  const capacidades = tramos.map((_, t) => {
    const encabezado = arriba(`unidad-${t}-0`) - arriba(`rotulo-${t}`);
    let unidad = 0;
    for (let i = 1; i < total; i += 1) {
      const mismaPagina = medidas.get(`unidad-${t}-${i}`).paginas[0] === medidas.get(`unidad-${t}-${i - 1}`).paginas[0];
      if (mismaPagina) unidad = Math.max(unidad, arriba(`unidad-${t}-${i}`) - arriba(`unidad-${t}-${i - 1}`));
    }
    const cabe = (inicio) => (unidad > 0 ? unidadesPorPagina({ inicio, encabezado, unidad }) : total);
    return { primera: cabe(t === 0 ? arriba('rotulo-0') : despuesDeLaPrimera), siguientes: cabe(despuesDeLaPrimera) };
  });

  // menos[t][p]: unidades que se le quitan a la página p del bloque t porque no cupieron.
  const menos = tramos.map(() => []);
  const repartir = () => capacidades.map(({ primera, siguientes }, t) => {
    const tamanos = [];
    for (let quedan = total; quedan > 0;) {
      const p = tamanos.length;
      const n = Math.min(quedan, Math.max(1, (p === 0 ? primera : siguientes) - (menos[t][p] ?? 0)));
      tamanos.push(n);
      quedan -= n;
    }
    return tamanos;
  });

  let paginacion = repartir();
  for (let vuelta = 0; vuelta < VUELTAS; vuelta += 1) {
    const nodos = await maquetar(documentoDelAcumulado(informe, datos, paginacion));
    let orden = 0;
    let cambio = false;
    paginacion.forEach((tamanos, t) => tamanos.forEach((n, p) => {
      const partida = primeraPagina(nodos, `unidad-${orden}-0`) !== ultimaPagina(nodos, `fin-${orden}`);
      if (partida && n > 1) {
        menos[t][p] = (menos[t][p] ?? 0) + 1;
        cambio = true;
      }
      orden += 1;
    }));
    if (!cambio) break;
    paginacion = repartir();
  }
  return paginacion;
}

export async function pdfDelAcumulado(informe, datos) {
  const paginacion = await paginarAcumulado(informe, datos);
  return pdfmake.createPdf(documentoDelAcumulado(informe, datos, paginacion)).getBuffer();
}
