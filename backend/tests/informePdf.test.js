import { describe, it, expect } from 'vitest';
import { libroDelInforme } from '../src/modulos/informes/informeExcel.service.js';
import {
  ANCHO_NOMBRE_ANUAL, COLUMNAS_POR_TRAMO, COLUMNAS_POR_TRAMO_ANUAL, documentoDelAcumulado, documentoDelInforme, pdfDelAcumulado,
  pdfDelInforme, saltarAntesDelTramo, tramosDeColumnas,
} from '../src/modulos/informes/informePdf.service.js';

// SPEC 65: el PDF se prueba sobre su definición de pdfmake (textos y cantidades de las celdas) y sobre los bytes
// (que sean un PDF). El encabezado se compara con el del Excel, que sale del mismo textosInforme.js.

const VACUNAS = { HEXA: 'Hexavalente', POLIO: 'Polio', BCG: 'BCG', SPR: 'SPR' };
const columna = (vacuna, dosis, seccion = null, valor = null) => ({
  vacuna: { codigo: vacuna, nombre: VACUNAS[vacuna] },
  seccion: seccion && { grupoEdad: seccion, titulo: seccion === 'MENOR_1' ? '< 1 año' : 'De 1 a < 6 años' },
  valor,
  dosis: { id: dosis.length, codigo: dosis },
});
// n columnas de una vacuna, D1…Dn, en la sección < 1 año.
const deVacuna = (vacuna, n) => Array.from({ length: n }, (_, i) => columna(vacuna, `D${i + 1}`, 'MENOR_1'));

const informeBase = (cambios = {}) => {
  const columnas = cambios.columnas ?? [columna('HEXA', 'D1', 'MENOR_1'), columna('HEXA', 'R1', '1_A_5'),
    columna('BCG', 'UNICA')];
  const cantidades = (base) => columnas.map((_, i) => base + i);
  return {
    informe: 'poblacion-propia',
    nivel: 'municipio',
    desde: { anio: 2026, mes: 1 },
    hasta: { anio: 2026, mes: 8 },
    incluirAprobados: false,
    agrupacion: null,
    columnas,
    filas: [
      { id: 1, nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: cantidades(1200) },
      { id: 4, nombre: 'San Pedro', fueraDelConsolidado: false, cantidades: cantidades(7) },
    ],
    total: { cantidades: cantidades(1207).map((n, i) => n + 7 + i) },
    dosisFueraDelConsolidado: 0,
    mesesSinCerrar: [],
    preliminar: false,
    ...cambios,
  };
};

const datos = {
  ddriss: 'DDRISS San Marcos', vacuna: null, red: null, municipios: [], generadoPor: 'Ana López',
  generadoEn: new Date('2026-11-12T20:05:00Z'),
};

const texto = (celda) => (typeof celda === 'string' ? celda : celda.text ?? null);
const tablas = (doc) => doc.content.filter((n) => n.id?.startsWith('tramo-'));
const encabezadoDe = (doc) => doc.content.find((n) => n.layout === 'noBorders').table.body.map((f) => f.map(texto));
// Las filas de datos de un tramo (sin las tres del encabezado), como textos.
const filasDe = (tabla) => tabla.table.body.slice(3).map((f) => f.map(texto));

describe('documento PDF de un informe (SPEC 65)', () => {
  it('es carta horizontal en IBM Plex Sans, con el título y las mismas líneas de encabezado que el Excel', () => {
    const informe = informeBase({ mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }] });
    const doc = documentoDelInforme(informe, datos);

    expect(doc).toMatchObject({ pageSize: 'LETTER', pageOrientation: 'landscape', pageMargins: 30 });
    expect(doc.defaultStyle.font).toBe('IBMPlexSans');
    expect(doc.content[0]).toMatchObject({ text: 'Producción a la población propia · Municipio', bold: true });

    // Las líneas del Excel van de la fila 2 a la fila vacía que separa la tabla.
    const hoja = libroDelInforme(informe, datos).worksheets[0];
    const delExcel = [];
    for (let n = 2; hoja.getCell(n, 1).value !== null; n += 1) {
      delExcel.push([hoja.getCell(n, 1).value, hoja.getCell(n, 2).value]);
    }
    expect(encabezadoDe(doc)).toEqual(delExcel);
    expect(encabezadoDe(doc)).toContainEqual(['Generado', '12/11/2026 14:05 por Ana López']);
    expect(encabezadoDe(doc).at(-1)[0]).toBe('Aviso');
  });

  it('lleva la marca de agua y la línea «PRELIMINAR» solo si el informe es preliminar', () => {
    const preliminar = documentoDelInforme(informeBase({
      incluirAprobados: true, preliminar: true, mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'ABIERTO' }],
    }), datos);
    expect(preliminar.watermark).toMatchObject({ text: 'PRELIMINAR' });
    expect(preliminar.content[1]).toMatchObject({ text: 'PRELIMINAR', bold: true });
    expect(encabezadoDe(preliminar)).toContainEqual([
      'Aviso', 'Datos preliminares: agosto de 2026 todavía no está cerrado.',
    ]);

    const normal = documentoDelInforme(informeBase(), datos);
    expect(normal.watermark).toBeUndefined();
    expect(normal.content.some((n) => n.text === 'PRELIMINAR')).toBe(false);
  });

  it('el pie lleva el título y la página', () => {
    const doc = documentoDelInforme(informeBase(), datos);
    expect(doc.footer(2, 5).text).toBe('Producción a la población propia · Municipio · Página 2 de 5');
  });

  it('los tramos juntan vacunas hasta el límite sin partir ninguna', () => {
    const columnas = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 10), ...deVacuna('BCG', 1), ...deVacuna('SPR', 4)];
    expect(tramosDeColumnas(columnas, 12)).toEqual([
      { desde: 0, hasta: 6 }, { desde: 6, hasta: 17 }, { desde: 17, hasta: 21 },
    ]);
    // Una vacuna más ancha que el límite va sola.
    expect(tramosDeColumnas([...deVacuna('POLIO', 10), ...deVacuna('BCG', 1)], 8)).toEqual([
      { desde: 0, hasta: 10 }, { desde: 10, hasta: 11 },
    ]);
    expect(COLUMNAS_POR_TRAMO).toEqual({ conMunicipio: 10, sinMunicipio: 12 });
  });

  it('cada tramo tiene sus vacunas, todas las filas y su «Total», con las cantidades del informe', () => {
    const columnas = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 10), ...deVacuna('BCG', 1)];
    const informe = informeBase({ columnas });
    const [primero, segundo] = tablas(documentoDelInforme(informe, datos));
    const fmt = (lista, desde, hasta) => lista.slice(desde, hasta).map((n) => new Intl.NumberFormat('es-GT').format(n));

    expect(tablas(documentoDelInforme(informe, datos))).toHaveLength(2);
    expect(primero.table.headerRows).toBe(3);
    expect(primero.table.body[0].map(texto).filter(Boolean)).toEqual(['Municipio de aplicación', 'Hexavalente']);
    expect(primero.table.body[0][1]).toMatchObject({ text: 'Hexavalente', colSpan: 6 });
    expect(primero.table.body[2].map(texto).slice(1)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);
    expect(filasDe(primero)).toEqual([
      ['San Marcos', ...fmt(informe.filas[0].cantidades, 0, 6)],
      ['San Pedro', ...fmt(informe.filas[1].cantidades, 0, 6)],
      ['Total', ...fmt(informe.total.cantidades, 0, 6)],
    ]);
    expect(segundo.table.body[0].map(texto).filter(Boolean)).toEqual(['Municipio de aplicación', 'Polio', 'BCG']);
    expect(filasDe(segundo).at(-1)).toEqual(['Total', ...fmt(informe.total.cantidades, 6, 17)]);
    expect(segundo.table.body.at(-1).every((c) => c.bold)).toBe(true);
    expect(segundo.table.body[3][1]).toMatchObject({ alignment: 'right' });
  });

  it('agrupado, la segunda fila del encabezado es el valor de la dimensión', () => {
    const valor = (codigo, etiqueta) => ({ codigo, etiqueta });
    const informe = informeBase({
      agrupacion: { codigo: 'sexo', nombre: 'Sexo' },
      columnas: [
        columna('HEXA', 'D1', null, valor('F', 'Femenino')), columna('HEXA', 'D2', null, valor('F', 'Femenino')),
        columna('HEXA', 'D1', null, valor('M', 'Masculino')),
      ],
    });
    const [tramo] = tablas(documentoDelInforme(informe, datos));
    expect(tramo.table.body[1].map(texto).filter(Boolean)).toEqual(['Femenino', 'Masculino']);
    expect(tramo.table.body[1][1]).toMatchObject({ colSpan: 2 });
  });

  it('por establecimiento, 10 columnas por tramo con «Municipio» y la marca de lo que no suma', () => {
    const columnas = [...deVacuna('HEXA', 6), ...deVacuna('SPR', 4), ...deVacuna('BCG', 1)];
    const informe = informeBase({
      nivel: 'establecimiento',
      columnas,
      filas: [{
        id: 31, nombre: 'Hospital de San Marcos', municipio: { id: 1, nombre: 'San Marcos' }, fueraDelConsolidado: true,
        cantidades: columnas.map(() => 1),
      }],
      total: { cantidades: columnas.map(() => 0) },
      dosisFueraDelConsolidado: 1155,
    });
    const doc = documentoDelInforme(informe, datos);
    const [primero, segundo] = tablas(doc);

    expect(tablas(doc)).toHaveLength(2);
    expect(primero.table.body[2]).toHaveLength(12);
    expect(primero.table.body[0].slice(0, 2).map(texto)).toEqual(['Establecimiento', 'Municipio']);
    expect(filasDe(primero)[0].slice(0, 2))
      .toEqual(['Hospital de San Marcos (no suma en el consolidado)', 'San Marcos']);
    expect(segundo.table.body[0].map(texto).filter(Boolean)).toEqual(['Establecimiento', 'Municipio', 'BCG']);
    expect(doc.content.at(-1).text).toBe('Además, 1,155 dosis de establecimientos que no suman en el consolidado.');
  });

  it('sin columnas lleva solo el encabezado con su aviso', () => {
    const doc = documentoDelInforme(informeBase({
      agrupacion: { codigo: 'pueblo', nombre: 'Pueblo de pertenencia' },
      columnas: [],
      filas: [{ id: 1, nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: [] }],
      total: { cantidades: [] },
      dosisFueraDelConsolidado: 3,
    }), datos);
    expect(tablas(doc)).toEqual([]);
    expect(encabezadoDe(doc).at(-1))
      .toEqual(['Aviso', 'Ninguna vacuna de este informe registra Pueblo de pertenencia.']);
    expect(doc.content.at(-1).layout).toBe('noBorders');
  });

  it('un tramo que no cabe a media página pasa entero a la siguiente', () => {
    const nodo = (id, paginas, verticalRatio) => ({ id, pageNumbers: paginas, startPosition: { verticalRatio } });
    expect(saltarAntesDelTramo(nodo('tramo-1', [1, 2], 0.6))).toBe(true);
    expect(saltarAntesDelTramo(nodo('tramo-1', [2], 0.6))).toBe(false);
    expect(saltarAntesDelTramo(nodo('tramo-1', [2, 3], 0.02))).toBe(false);
    expect(saltarAntesDelTramo(nodo(undefined, [1, 2], 0.6))).toBe(false);
  });

  it('devuelve un PDF', async () => {
    const columnas = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 10)];
    const bytes = await pdfDelInforme(informeBase({ columnas, preliminar: true }), datos);
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).toMatch(/IBMPlexSans/);
  });
});

// SPEC 66: el PDF del acumulado anual.
const acumulado = (cambios = {}) => {
  const columnas = (cambios.columnas ?? [columna('HEXA', 'D3', 'MENOR_1'), columna('BCG', 'UNICA')])
    .map(({ valor, ...c }, i) => ({ ...c, meta: { valor: i === 0 ? 95 : 90, indicador: null } }));
  const cifras = (base) => ({
    dosis: columnas.map((_, i) => base + i),
    poblacion: columnas.map((_, i) => (i === 0 ? 1450 : null)),
    cobertura: columnas.map((_, i) => (i === 0 ? 89.7 : null)),
    brecha: columnas.map((_, i) => (i === 0 ? 78 : null)),
  });
  return {
    informe: 'acumulado-anual',
    nivel: 'municipio',
    anio: 2026,
    incluirAprobados: false,
    columnas,
    filas: [{ id: 1, codigo: '1201', nombre: 'San Marcos', municipio: null, ...cifras(1300) }],
    total: cifras(1300),
    mesesSinCerrar: [],
    preliminar: false,
    ...cambios,
    ...(cambios.columnas ? { columnas } : {}),
  };
};

describe('documento PDF del acumulado anual (SPEC 66)', () => {
  it('lleva el título, el año y cuatro filas de encabezado con la meta', () => {
    const doc = documentoDelAcumulado(acumulado(), datos);
    expect(doc).toMatchObject({ pageSize: 'LETTER', pageOrientation: 'landscape' });
    expect(doc.content[0].text).toBe('Acumulado anual · Municipio');
    expect(encabezadoDe(doc)).toContainEqual(['Periodo', 'Enero a diciembre de 2026']);
    const [tabla] = tablas(doc);
    expect(tabla.table.headerRows).toBe(4);
    const cuerpo = tabla.table.body.map((f) => f.map(texto));
    expect(cuerpo[0].slice(0, 3)).toEqual(['Municipio de residencia', 'Cifra', 'Hexavalente']);
    expect(cuerpo[2].slice(2)).toEqual(['D3', 'UNICA']);
    expect(cuerpo[3].slice(2)).toEqual(['Meta 95 %', 'Meta 90 %']);
  });

  it('cuatro filas por unidad, con el nombre abarcándolas, «—» sin valor y el total en negrita', () => {
    const [tabla] = tablas(documentoDelAcumulado(acumulado(), datos));
    const cuerpo = tabla.table.body.slice(4);
    expect(cuerpo.map((f) => f.map(texto))).toEqual([
      ['San Marcos', 'Dosis', '1,300', '1,301'],
      [null, 'Población', '1,450', '—'],
      [null, 'Cobertura %', '89.7 %', '—'],
      [null, 'Brecha', '78', '—'],
      ['Total', 'Dosis', '1,300', '1,301'],
      [null, 'Población', '1,450', '—'],
      [null, 'Cobertura %', '89.7 %', '—'],
      [null, 'Brecha', '78', '—'],
    ]);
    expect(cuerpo[0][0].rowSpan).toBe(4);
    expect(cuerpo[4].every((celda) => !('text' in celda) || celda.bold)).toBe(true);
  });

  // Lo que ocupa la tabla en la hoja: cada columna con 8 de relleno y una línea de 0.5 entre columnas y a los lados.
  const anchoTotal = (tabla) =>
    tabla.table.widths.reduce((suma, w) => suma + w + 8, 0) + (tabla.table.widths.length + 1) * 0.5;
  const ANCHO_UTIL = 792 - 2 * 30;

  it('parte las columnas en tramos de hasta 11 (10 con «Municipio»), y con preliminar lleva la marca', () => {
    expect(COLUMNAS_POR_TRAMO_ANUAL).toEqual({ conMunicipio: 10, sinMunicipio: 11 });
    const once = [...deVacuna('HEXA', 5), ...deVacuna('POLIO', 6)];
    expect(tablas(documentoDelAcumulado(acumulado({ columnas: once }), datos)).map((t) => t.table.widths.length))
      .toEqual([2 + 11]);

    const doce = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 6)];
    const doc = documentoDelAcumulado(acumulado({ columnas: doce, preliminar: true }), datos);
    expect(tablas(doc).map((t) => t.table.widths.length)).toEqual([2 + 6, 2 + 6]);
    expect(doc.watermark).toMatchObject({ text: 'PRELIMINAR' });

    const porDistrito = documentoDelAcumulado(acumulado({ columnas: doce, nivel: 'distrito' }), datos);
    expect(tablas(porDistrito).map((t) => t.table.widths.length)).toEqual([3 + 6, 3 + 6]);
  });

  it('las columnas tienen ancho fijo (el nombre no se estira) y el tramo más ancho cabe en la hoja', () => {
    const lleno = (nivel, n) => tablas(documentoDelAcumulado(acumulado({ nivel, columnas: deVacuna('HEXA', n) }), datos))[0];
    const sinMunicipio = lleno('municipio', COLUMNAS_POR_TRAMO_ANUAL.sinMunicipio);
    const conMunicipio = lleno('distrito', COLUMNAS_POR_TRAMO_ANUAL.conMunicipio);
    for (const tabla of [sinMunicipio, conMunicipio]) {
      expect(tabla.table.widths.every((w) => typeof w === 'number')).toBe(true);
      expect(anchoTotal(tabla)).toBeLessThanOrEqual(ANCHO_UTIL);
    }
    expect(sinMunicipio.table.widths[0]).toBe(ANCHO_NOMBRE_ANUAL);
    expect(lleno('municipio', 2).table.widths[0]).toBe(ANCHO_NOMBRE_ANUAL);
    // Con una columna más ya no cabría: el límite aprovecha la hoja.
    const unaMas = (tabla) => anchoTotal(tabla) + 40 + 8 + 0.5;
    expect(unaMas(sinMunicipio)).toBeGreaterThan(ANCHO_UTIL);
    expect(unaMas(conMunicipio)).toBeGreaterThan(ANCHO_UTIL);
  });

  it('pinta el encabezado de la vacuna y, en verde, la cobertura con brecha 0', () => {
    const columnas = [columna('HEXA', 'D3', 'MENOR_1'), columna('BCG', 'UNICA')];
    const cifras = {
      dosis: [1450, 3], poblacion: [1450, null], cobertura: [100, null], brecha: [0, null],
    };
    const [tabla] = tablas(documentoDelAcumulado(acumulado({
      columnas, filas: [{ id: 1, codigo: '1201', nombre: 'San Marcos', municipio: null, ...cifras }], total: cifras,
    }), datos));
    const [vacunas] = tabla.table.body;
    expect(vacunas.find((c) => c.text === 'Hexavalente').fillColor).toBe('#dbeaf6');
    const cobertura = tabla.table.body.slice(4).find((fila) => fila.some((c) => c.text === 'Cobertura %'));
    expect(cobertura.find((c) => c.text === '100.0 %').fillColor).toBe('#e3f3e8');
  });

  it('se convierte en un PDF', async () => {
    const bytes = await pdfDelAcumulado(acumulado({ nivel: 'distrito', filas: [{
      ...acumulado().filas[0], nombre: 'Distrito 1', municipio: { id: 1, nombre: 'San Marcos' },
    }] }), datos);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});
