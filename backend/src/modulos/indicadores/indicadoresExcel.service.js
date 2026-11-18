import ExcelJS from 'exceljs';
import {
  VISTAS, columnasDeLaRed, dosisFinales, esperadoDeLaTabla, filasDeLaRed, filasDeLaTabla, gruposDeColumnas,
  nombreDeFila, sinCoberturaAnual,
} from './tablaIndicadores.js';
import {
  COLORES, NOMBRES_VISTA, NO_SUMA, TEXTO_DESERCION_NEGATIVA, TEXTO_MAYOR_A_CIEN, avisoMayorACien,
  avisoSinCoberturaAnual, lineasDeProduccion, lineasDelEncabezado, motivoNoCalculable, notaDelMetodo, simboloDeMeta,
  textoEsperado, textoFueraDelConsolidado, textoSumaDeBrechas, tituloDeLaVista, tituloDeProduccion,
} from './textosIndicadores.js';

// SPEC 72 (HU-64): el libro .xlsx de una pestaña de «Indicadores». Recibe lo mismo que ve la pantalla (la corrida y sus
// resultados, o la producción) y no consulta nada; recorta y ordena con tablaIndicadores.js.

export const FORMATO_CANTIDAD = '#,##0';
export const FORMATO_DECIMAL = '#,##0.0';
export const FORMATO_PORCENTAJE = '0.0%';

const argb = (hex) => `FF${hex.slice(1).toUpperCase()}`;
// Como fracción, para el formato de porcentaje de Excel; toPrecision quita el resto de la división (57.35 / 100).
const porcentaje = (valor) => (valor === null || valor === undefined ? null : Number((valor / 100).toPrecision(12)));
const siNo = (valor) => (valor === null || valor === undefined ? null : valor ? 'Sí' : 'No');
const positivo = (valor, tono) => (valor > 0 ? tono : null);

// Una columna: titulo, formato (numFmt o null para texto), valor(fila) y, opcionales, tono(fila) (clave de COLORES),
// estimada (fondo gris en su encabezado, como la proyección) y ancho.
const col = (titulo, valor, formato = null, extra = {}) => ({ titulo, valor, formato, ...extra });
const MUNICIPIO = col('Municipio', nombreDeFila, null, { ancho: 28 });
const MAYOR_A_CIEN = col('Más del 100 %', (r) => (r.mayorACien ? 'Sí' : null), null, { ancho: 14 });
const cumple = (titulo = 'Cumple', extra = {}) => col(titulo, (r) => siNo(r.cumpleMeta), null, {
  tono: (r) => (r.cumpleMeta === null || r.cumpleMeta === undefined ? null : r.cumpleMeta ? 'verde' : 'rojo'),
  ...extra,
});
const valorConColor = (titulo, sinValor) => col(titulo, (r) => (r.calculable ? porcentaje(r.valor) : sinValor),
  FORMATO_PORCENTAJE, { tono: (r) => (r.calculable ? r.color ?? null : null) });

// Las de TablaResultados de PaginaIndicadores.jsx, con el excedente aparte (en pantalla, «0 (+N de excedente)»).
const columnasContraMeta = (tipo) => [
  MUNICIPIO,
  col('Dosis acumuladas', (r) => r.numerador ?? 0, FORMATO_CANTIDAD),
  col(tipo === 'COBERTURA' ? 'Población' : 'Meta del mes', (r) => r.denominador, FORMATO_CANTIDAD),
  col('Dosis que faltan', (r) => r.brechaDosis, FORMATO_CANTIDAD),
  col('Excedente', (r) => (r.brechaDosis === null ? null : r.excedenteDosis ?? null), FORMATO_CANTIDAD),
  col('Meta', (r) => porcentaje(r.meta), FORMATO_PORCENTAJE),
  valorConColor(tipo === 'COBERTURA' ? 'Cobertura' : 'Avance', 'Sin población'),
  cumple(),
  MAYOR_A_CIEN,
];

const COLUMNAS = {
  AVANCE_META_MES: columnasContraMeta('AVANCE_META_MES'),
  COBERTURA: columnasContraMeta('COBERTURA'),
  BRECHA: [
    MUNICIPIO,
    col('Dosis acumuladas', (r) => r.numerador ?? 0, FORMATO_CANTIDAD),
    col('Dosis para la meta', (r) => (r.calculable ? r.metaDosis : 'Sin población'), FORMATO_CANTIDAD),
    col('Excedente', (r) => (r.calculable ? r.excedenteDosis : null), FORMATO_CANTIDAD,
      { tono: (r) => (r.calculable ? positivo(r.excedenteDosis, 'verde') : null) }),
    col('Dosis que faltan', (r) => (r.calculable ? r.brechaDosis : null), FORMATO_CANTIDAD,
      { tono: (r) => (r.calculable ? positivo(r.brechaDosis, 'amarillo') : null) }),
    cumple(),
    MAYOR_A_CIEN,
  ],
  DESERCION: [
    MUNICIPIO,
    col('Dosis iniciales', (r) => r.denominador ?? 0, FORMATO_CANTIDAD),
    col('Dosis finales', dosisFinales, FORMATO_CANTIDAD),
    col('Pérdida', (r) => r.numerador ?? 0, FORMATO_CANTIDAD),
    col(`Meta (${simboloDeMeta('DESERCION')})`, (r) => porcentaje(r.meta), FORMATO_PORCENTAJE),
    valorConColor('Deserción', 'Sin primeras dosis'),
    cumple(),
  ],
  PROYECCION: [
    MUNICIPIO,
    col('Dosis acumuladas', (r) => r.proyeccion?.dosisAcumuladas ?? null, FORMATO_CANTIDAD),
    col('Ritmo mensual', (r) => r.proyeccion?.ritmoMensual ?? null, FORMATO_DECIMAL, { estimada: true }),
    col('Dosis proyectadas a diciembre', (r) => r.numerador, FORMATO_CANTIDAD, { estimada: true }),
    col('Población', (r) => r.denominador, FORMATO_CANTIDAD),
    col('Dosis que faltarían', (r) => r.brechaDosis, FORMATO_CANTIDAD, { estimada: true }),
    col(`Meta (${simboloDeMeta('PROYECCION')})`, (r) => porcentaje(r.meta), FORMATO_PORCENTAJE),
    col('Cobertura proyectada', (r) => motivoNoCalculable(r) ?? porcentaje(r.valor), FORMATO_PORCENTAJE,
      { estimada: true }),
    cumple('¿Llega a la meta?', { estimada: true }),
  ],
};

export const columnasDelTipo = (tipo) => COLUMNAS[tipo];

function pintar(celda, tono) {
  const { fondo, texto } = COLORES[tono];
  celda.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: argb(fondo) } };
  if (texto) celda.font = { ...celda.font, color: { argb: argb(texto) } };
}

function nuevoLibro(nombreHoja, generadoEn) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRCOVA';
  libro.created = generadoEn;
  return { libro, hoja: libro.addWorksheet(nombreHoja) };
}

function escribirEncabezado(hoja, titulo, preliminar, lineas) {
  hoja.addRow([titulo]).font = { bold: true, size: 14 };
  if (preliminar) hoja.addRow(['PRELIMINAR']).font = { bold: true };
  for (const [etiqueta, valor] of lineas) hoja.addRow([etiqueta, valor]).getCell(1).font = { bold: true };
  hoja.addRow([]);
}

// Una celda con su valor: un número lleva el formato de la columna; un texto en una columna de números (como «Sin
// población») va alineado a la derecha, como en la pantalla.
function escribirCelda(celda, valor, formato) {
  celda.value = valor ?? null;
  if (typeof valor === 'number' && formato) celda.numFmt = formato;
  else if (typeof valor === 'string' && formato) celda.alignment = { horizontal: 'right' };
}

function escribirTabla(hoja, columnas, filas, { esTotal = (r) => r.municipio === null } = {}) {
  const filaTitulos = hoja.addRow(columnas.map((c) => c.titulo));
  filaTitulos.font = { bold: true };
  filaTitulos.alignment = { vertical: 'middle', wrapText: true };
  columnas.forEach((c, i) => {
    if (c.estimada) pintar(filaTitulos.getCell(i + 1), 'estimada');
    hoja.getColumn(i + 1).width = c.ancho ?? Math.max(12, Math.min(c.titulo.length + 2, 22));
  });
  for (const r of filas) {
    const fila = hoja.addRow([]);
    const negrita = esTotal(r);
    columnas.forEach((c, i) => {
      const celda = fila.getCell(i + 1);
      escribirCelda(celda, c.valor(r), c.formato);
      if (negrita) celda.font = { bold: true };
      const tono = c.tono?.(r);
      if (tono) pintar(celda, tono);
    });
  }
  hoja.views = [{ state: 'frozen', xSplit: 1, ySplit: filaTitulos.number }];
}

/**
 * El libro de una pestaña de indicadores (avance, brecha, cobertura, desercion o proyeccion).
 * consulta: { vista, corrida, resultados (todos los de la corrida), indicador (de corrida.indicadores), red (la del
 * filtro, con municipios) o null, municipioDelDistrito (id) o null, municipioIds }.
 * datos: { ddriss, territorio, generadoPor, generadoEn }.
 */
export function libroDeIndicador(consulta, datos) {
  const { vista, corrida, resultados, indicador } = consulta;
  const tipo = VISTAS[vista];
  const filas = filasDeLaTabla(resultados, consulta);
  const { libro, hoja } = nuevoLibro(NOMBRES_VISTA[vista], datos.generadoEn);

  const avisos = [];
  if (['AVANCE_META_MES', 'COBERTURA', 'BRECHA'].includes(tipo)) avisos.push(avisoMayorACien(filas, nombreDeFila));
  if (tipo === 'BRECHA') {
    const suma = filas.find((r) => r.municipio === null)?.sumaBrechasMunicipales ?? null;
    if (suma !== null) avisos.push(textoSumaDeBrechas(suma));
  }
  if (tipo === 'DESERCION' && filas.some((r) => r.calculable && r.valor < 0)) avisos.push(TEXTO_DESERCION_NEGATIVA);
  if (tipo === 'PROYECCION') {
    const referencia = filas.find((r) => r.proyeccion) ?? filas[0];
    if (referencia?.proyeccion) avisos.push(notaDelMetodo({ mes: referencia.mes, ...referencia.proyeccion }));
  }

  const vacunaNombre = resultados.find((r) => r.indicadorCodigo === indicador.codigo)?.vacuna.nombre;
  escribirEncabezado(hoja, tituloDeLaVista(vista, { vacunaNombre }), corrida.parcial,
    lineasDelEncabezado({ corrida, indicador }, datos, avisos));
  escribirTabla(hoja, COLUMNAS[tipo], filas);
  return libro;
}

/**
 * El libro de la pestaña «Redes»: municipios de la red × trazadoras, con su cobertura anual.
 * consulta: { corrida, resultados (los de la corrida con el total de la red), red (con municipios y trazadoras) }.
 */
export function libroDeRed({ corrida, resultados, red }, datos) {
  const columnas = columnasDeLaRed(red, corrida.indicadores, resultados);
  const { municipios, total } = filasDeLaRed(red, columnas, resultados);
  const esperado = esperadoDeLaTabla({ municipios, total });
  const faltan = sinCoberturaAnual(columnas);
  const avisos = [
    faltan.length > 0 ? avisoSinCoberturaAnual(faltan) : null,
    esperado == null ? null : textoEsperado(esperado, corrida.mesHasta),
  ];
  const { libro, hoja } = nuevoLibro(NOMBRES_VISTA.redes, datos.generadoEn);
  escribirEncabezado(hoja, tituloDeLaVista('redes', { red }), corrida.parcial,
    lineasDelEncabezado({ corrida, indicador: null }, datos, avisos));

  const filaGrupos = hoja.rowCount + 1;
  const grupos = ['Municipio', ...columnas.map(() => null)];
  let desde = 2;
  const tramos = gruposDeColumnas(columnas).map((g) => {
    grupos[desde - 1] = g.grupo;
    const tramo = { desde, hasta: desde + g.columnas - 1 };
    desde += g.columnas;
    return tramo;
  });
  for (const valores of [grupos, [null, ...columnas.map((c) => c.etiqueta)]]) {
    const fila = hoja.addRow(valores);
    fila.font = { bold: true };
    fila.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }
  hoja.mergeCells(filaGrupos, 1, filaGrupos + 1, 1);
  hoja.getCell(filaGrupos, 1).alignment = { horizontal: 'left', vertical: 'bottom' };
  for (const { desde: d, hasta } of tramos) if (hasta > d) hoja.mergeCells(filaGrupos, d, filaGrupos, hasta);

  const escribirFila = (nombre, celdas, negrita) => {
    const fila = hoja.addRow([nombre]);
    if (negrita) fila.getCell(1).font = { bold: true };
    celdas.forEach((r, i) => {
      if (!r) return;
      const celda = fila.getCell(i + 2);
      escribirCelda(celda, r.calculable ? porcentaje(r.valor) : 'Sin población', FORMATO_PORCENTAJE);
      if (negrita) celda.font = { bold: true };
      if (r.calculable && r.color) pintar(celda, r.color);
      if (r.mayorACien) celda.note = TEXTO_MAYOR_A_CIEN;
    });
  };
  for (const { municipio, celdas } of municipios) escribirFila(municipio.nombre, celdas, false);
  escribirFila('Total de la red', total, true);

  hoja.getColumn(1).width = 28;
  columnas.forEach((_, i) => { hoja.getColumn(i + 2).width = 14; });
  hoja.views = [{ state: 'frozen', xSplit: 1, ySplit: filaGrupos + 1 }];
  return libro;
}

/**
 * El libro de la pestaña «Producción»: la respuesta de GET /indicadores/produccion, como TablaProduccion.jsx.
 * datos: los de libroDeIndicador, más establecimientos (nombres de los elegidos).
 */
export function libroDeProduccion(produccion, datos) {
  const porEstablecimiento = produccion.agrupar === 'establecimiento';
  const { libro, hoja } = nuevoLibro(NOMBRES_VISTA.produccion, datos.generadoEn);
  escribirEncabezado(hoja, tituloDeProduccion(produccion.vacuna), produccion.preliminar,
    lineasDeProduccion(produccion, datos));

  const cantidad = (titulo, valor) => col(titulo, valor, FORMATO_CANTIDAD);
  const dosisDe = (fila, id) => fila.porDosis.find((d) => d.dosisId === id)?.dosisTotal ?? 0;
  const nombre = (f) => `${(f.establecimiento ?? f.municipio).nombre}${f.fueraDelConsolidado ? NO_SUMA : ''}`;
  const columnas = [
    col(porEstablecimiento ? 'Establecimiento' : 'Municipio de aplicación',
      (f) => (f.total ? 'Total' : nombre(f)),
      null, { ancho: 36 }),
    ...(porEstablecimiento ? [col('Municipio', (f) => f.municipio?.nombre ?? null, null, { ancho: 24 })] : []),
    ...(produccion.vacuna?.dosis ?? []).map((d) => cantidad(d.codigo, (f) => dosisDe(f, d.id))),
    cantidad('Población propia', (f) => f.dosisPoblacionPropia),
    cantidad('Otros municipios', (f) => f.dosisOtrosMunicipios),
    cantidad('Total', (f) => f.dosisTotal),
  ];
  const filas = [...produccion.filas, { ...produccion.total, total: true }];
  escribirTabla(hoja, columnas, filas, { esTotal: (f) => f.total === true });
  if (porEstablecimiento) hoja.views = [{ ...hoja.views[0], xSplit: 2 }];
  const fuera = produccion.dosisFueraDelConsolidado;
  if (fuera > 0) hoja.addRow([textoFueraDelConsolidado(fuera)]);
  return libro;
}
