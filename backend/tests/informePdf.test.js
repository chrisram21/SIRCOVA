import { describe, it, expect } from 'vitest';
import { libroDelInforme } from '../src/modulos/informes/informeExcel.service.js';
import {
  ANCHO_NOMBRE_ANUAL, COLUMNAS_POR_TRAMO, COLUMNAS_POR_TRAMO_ANUAL, documentoDelAcumulado, documentoDelInforme, pdfDelAcumulado,
  ajustarInforme, maquetar, paginarAcumulado, pdfDelInforme, textoPeriodo, tramosDeColumnas, unidadesPorPagina,
} from '../src/modulos/informes/informePdf.service.js';

// SPEC 65: el PDF se prueba sobre su definición de pdfmake (textos y cantidades de las celdas) y sobre los bytes
// (que sean un PDF). El encabezado se compara con el del Excel, que sale del mismo textosInforme.js. El diseño sigue
// docs/mockups/SIRCOVA_informe_poblacion_propia_v2.pdf: encabezado y pie en cada página y un bloque por página.

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
  ddriss: 'DDRISS San Marcos', vacunas: [], red: null, municipios: [], generadoPor: 'Ana López',
  generadoEn: new Date('2026-11-12T20:05:00Z'),
};

const texto = (celda) => (typeof celda === 'string' ? celda : celda.text ?? null);
// Todos los textos de un nodo de pdfmake (encabezado, pie o un bloque), en orden y sin espacios a los lados.
const textosDe = (nodo) => {
  if (typeof nodo === 'string') return nodo.trim() ? [nodo.trim()] : [];
  if (Array.isArray(nodo)) return nodo.flatMap(textosDe);
  if (!nodo || typeof nodo !== 'object') return [];
  return [nodo.text, nodo.stack, nodo.columns, nodo.table?.body].flatMap(textosDe);
};
// SPEC 79: el encabezado completo es el primer nodo del contenido (solo la página 1), en una tabla de una celda.
const encabezadoCompleto = (doc) => {
  const [primero] = doc.content;
  expect(primero.id).toBe('encabezado-completo');
  return primero.table.body[0][0];
};
const bloques = (doc) => doc.content.filter((n) => n.id?.startsWith('tramo-'));
const tablas = (doc) => bloques(doc).map((b) => b.stack.at(-1));
const rotuloDe = (bloque) => bloque.stack[0].columns.map((c) => c.text);
// Las filas de datos de un tramo (sin las tres del encabezado), como textos.
const filasDe = (tabla) => tabla.table.body.slice(3).map((f) => f.map(texto));

// Lo que le queda a cada columna de cantidades ('*'): el ancho útil (carta horizontal, márgenes de 26) menos las
// columnas fijas, 8 de relleno por columna y una línea de 0.5 entre columnas.
const ANCHO_UTIL = 792 - 2 * 26;
const anchoDeCantidad = (tabla) => {
  const { widths } = tabla.table;
  const fijas = widths.filter((w) => typeof w === 'number');
  const cantidades = widths.length - fijas.length;
  const ocupado = fijas.reduce((suma, w) => suma + w, 0) + widths.length * 8 + (widths.length - 1) * 0.5;
  return (ANCHO_UTIL - ocupado) / cantidades;
};
// Una cantidad de siete cifras («1,234,567») mide unos 30 a 7 pt.
const ANCHO_MINIMO = 36;

describe('documento PDF de un informe (SPEC 65)', () => {
  it('es carta horizontal en Lato, con el encabezado de la plantilla y las líneas del Excel', () => {
    const informe = informeBase({ mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }] });
    const doc = documentoDelInforme(informe, datos);

    expect(doc).toMatchObject({ pageSize: 'LETTER', pageOrientation: 'landscape' });
    expect(doc.defaultStyle.font).toBe('Lato');
    expect(doc.info.title).toBe('Producción a la población propia · Municipio');
    const encabezado = textosDe(encabezadoCompleto(doc));
    expect(encabezado).toEqual(expect.arrayContaining([
      'SIRCOVA', 'Ministerio de Salud Pública y Asistencia Social', 'San Marcos', 'PRODUCCIÓN DE VACUNACIÓN',
      'Producción a la población propia', 'Municipio de aplicación', 'PERÍODO', 'Enero – agosto de 2026',
    ]));

    // Las líneas del recuadro del Excel van de la fila 9 a la fila vacía que separa la tabla (la DDRISS y el periodo
    // van arriba, con su formato, en los dos). En el PDF, «Generado» va en el pie y las demás (filtros y avisos) en el
    // encabezado de cada página.
    const hoja = libroDelInforme(informe, datos).worksheets[0];
    const delExcel = [];
    for (let n = 9; hoja.getCell(n, 1).value !== null; n += 1) {
      delExcel.push([hoja.getCell(n, 1).value, hoja.getCell(n, 2).value]);
    }
    const pie = textosDe(doc.footer(1, 1));
    for (const [etiqueta, valor] of delExcel) {
      if (etiqueta === 'Generado') expect(pie).toContain(`Generado: ${valor}`);
      else if (etiqueta === 'Aviso') expect(encabezado).toContain(valor);
      else if (!['DDRISS', 'Periodo'].includes(etiqueta)) {
        expect(encabezado).toEqual(expect.arrayContaining([etiqueta, valor]));
      }
    }
    expect(pie).toContain('Generado: 12/11/2026 14:05 por Ana López');
    expect(delExcel.at(-1)[0]).toBe('Aviso');
    // Con un aviso, el margen de arriba crece para que el encabezado no tape la tabla.
    expect(doc.pageMargins[1]).toBeGreaterThan(documentoDelInforme(informeBase(), datos).pageMargins[1]);
  });

  it('la franja de filtros nombra todas, una o varias vacunas (SPEC 73)', () => {
    const franja = (vacunas) => textosDe(
      encabezadoCompleto(documentoDelInforme(informeBase(), { ...datos, vacunas })),
    );
    expect(franja([])).toEqual(expect.arrayContaining(['Vacuna', 'Todas las vacunas']));
    expect(franja(['Hexavalente'])).toEqual(expect.arrayContaining(['Vacuna', 'Hexavalente']));
    const tres = franja(['Hexavalente', 'Neumococo', 'Rotavirus']);
    expect(tres).toEqual(expect.arrayContaining(['Vacunas', 'Hexavalente, Neumococo y Rotavirus']));
    expect(tres).not.toContain('Vacuna');
  });

  it('escribe el periodo como la plantilla', () => {
    expect(textoPeriodo({ anio: 2026, mes: 1 }, { anio: 2026, mes: 8 })).toBe('Enero – agosto de 2026');
    expect(textoPeriodo({ anio: 2026, mes: 8 }, { anio: 2026, mes: 8 })).toBe('Agosto de 2026');
    expect(textoPeriodo({ anio: 2025, mes: 11 }, { anio: 2026, mes: 2 })).toBe('Noviembre de 2025 – febrero de 2026');
  });

  it('lleva la marca de agua y la etiqueta «PRELIMINAR» solo si el informe es preliminar', () => {
    const preliminar = documentoDelInforme(informeBase({
      incluirAprobados: true, preliminar: true, mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'ABIERTO' }],
    }), datos);
    expect(preliminar.watermark).toMatchObject({ text: 'PRELIMINAR' });
    expect(textosDe(encabezadoCompleto(preliminar))).toEqual(expect.arrayContaining([
      'PRELIMINAR', 'Datos preliminares: agosto de 2026 todavía no está cerrado.',
    ]));

    const normal = documentoDelInforme(informeBase(), datos);
    expect(normal.watermark).toBeUndefined();
    expect(textosDe(encabezadoCompleto(normal))).not.toContain('PRELIMINAR');
  });

  it('el pie lleva SIRCOVA y la página', () => {
    const pie = textosDe(documentoDelInforme(informeBase(), datos).footer(2, 5));
    expect(pie).toEqual(expect.arrayContaining(['SIRCOVA', 'Página 2 de 5']));
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

  it('cada tramo tiene sus vacunas, todas las filas y su «TOTAL», con las cantidades del informe', () => {
    const columnas = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 10), ...deVacuna('BCG', 1)];
    const informe = informeBase({ columnas });
    const [primero, segundo] = tablas(documentoDelInforme(informe, datos));
    const fmt = (lista, desde, hasta) => lista.slice(desde, hasta).map((n) => new Intl.NumberFormat('es-GT').format(n));

    expect(tablas(documentoDelInforme(informe, datos))).toHaveLength(2);
    expect(primero.table.headerRows).toBe(3);
    expect(primero.table.body[0].map(texto).filter(Boolean)).toEqual(['Municipio de aplicación', 'Hexavalente']);
    expect(primero.table.body[0][1]).toMatchObject({ text: 'Hexavalente', colSpan: 6 });
    expect(primero.table.body[2].map(texto).slice(1)).toEqual(['1ra', '2da', '3ra', '4ta', '5ta', '6ta']);
    expect(filasDe(primero)).toEqual([
      ['San Marcos', ...fmt(informe.filas[0].cantidades, 0, 6)],
      ['San Pedro', ...fmt(informe.filas[1].cantidades, 0, 6)],
      ['TOTAL', ...fmt(informe.total.cantidades, 0, 6)],
    ]);
    expect(segundo.table.body[0].map(texto).filter(Boolean)).toEqual(['Municipio de aplicación', 'Polio', 'BCG']);
    expect(filasDe(segundo).at(-1)).toEqual(['TOTAL', ...fmt(informe.total.cantidades, 6, 17)]);
    expect(segundo.table.body.at(-1).every((c) => c.bold)).toBe(true);
    expect(segundo.table.body[3][1]).toMatchObject({ alignment: 'right' });
  });

  it('cada bloque empieza en página nueva con su rótulo y su número', () => {
    const columnas = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 10), ...deVacuna('BCG', 1)];
    const [primero, segundo] = bloques(documentoDelInforme(informeBase({ columnas }), datos));
    expect(primero.pageBreak).toBeUndefined();
    expect(segundo.pageBreak).toBe('before');
    expect(rotuloDe(primero)).toEqual(['DETALLE DE DOSIS', 'Bloque de vacunas 01 / 02']);
    expect(rotuloDe(segundo)).toEqual(['DETALLE DE DOSIS', 'Bloque de vacunas 02 / 02']);
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
    expect(textosDe(doc.content.at(-1))).toEqual([
      'Además, 1,155 dosis de establecimientos que no suman en el consolidado.',
    ]);
  });

  it('sin columnas no lleva tablas y el aviso queda en el encabezado', () => {
    const doc = documentoDelInforme(informeBase({
      agrupacion: { codigo: 'pueblo', nombre: 'Pueblo de pertenencia' },
      columnas: [],
      filas: [{ id: 1, nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: [] }],
      total: { cantidades: [] },
      dosisFueraDelConsolidado: 3,
    }), datos);
    expect(doc.content.map((n) => n.id)).toEqual(['encabezado-completo']);
    expect(textosDe(encabezadoCompleto(doc)))
      .toContain('Ninguna vacuna de este informe registra Pueblo de pertenencia.');
  });

  it('las cantidades reparten el ancho de la hoja y caben en el tramo más ancho', () => {
    const lleno = (nivel, n) =>
      tablas(documentoDelInforme(informeBase({ nivel, columnas: deVacuna('HEXA', n) }), datos))[0];
    const sinMunicipio = lleno('municipio', COLUMNAS_POR_TRAMO.sinMunicipio);
    const conMunicipio = lleno('establecimiento', COLUMNAS_POR_TRAMO.conMunicipio);
    expect(sinMunicipio.table.widths.filter((w) => w === '*')).toHaveLength(COLUMNAS_POR_TRAMO.sinMunicipio);
    expect(conMunicipio.table.widths.filter((w) => w === '*')).toHaveLength(COLUMNAS_POR_TRAMO.conMunicipio);
    expect(anchoDeCantidad(sinMunicipio)).toBeGreaterThanOrEqual(ANCHO_MINIMO);
    expect(anchoDeCantidad(conMunicipio)).toBeGreaterThanOrEqual(ANCHO_MINIMO);
  });

  it('devuelve un PDF', async () => {
    const columnas = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 10)];
    const bytes = await pdfDelInforme(informeBase({ columnas, preliminar: true }), datos);
    expect(Buffer.isBuffer(bytes)).toBe(true);
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.toString('latin1')).toMatch(/Lato/);
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
    expect(doc.info.title).toBe('Acumulado anual · Municipio');
    expect(textosDe(encabezadoCompleto(doc))).toEqual(expect.arrayContaining([
      'COBERTURA DE VACUNACIÓN', 'Acumulado anual', 'Municipio de residencia', 'Enero – diciembre de 2026',
    ]));
    const [tabla] = tablas(doc);
    expect(tabla.table.headerRows).toBe(4);
    const cuerpo = tabla.table.body.map((f) => f.map(texto));
    expect(cuerpo[0].slice(0, 3)).toEqual(['Municipio de residencia', 'Cifra', 'Hexavalente']);
    expect(cuerpo[2].slice(2)).toEqual(['3ra', 'UNICA']);
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
      ['TOTAL', 'Dosis', '1,300', '1,301'],
      [null, 'Población', '1,450', '—'],
      [null, 'Cobertura %', '89.7 %', '—'],
      [null, 'Brecha', '78', '—'],
    ]);
    expect(cuerpo[0][0].rowSpan).toBe(4);
    expect(cuerpo[4].every((celda) => !('text' in celda) || celda.bold)).toBe(true);
  });

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

  it('las columnas fijas no se estiran y las cantidades caben en el tramo más ancho', () => {
    const lleno = (nivel, n) =>
      tablas(documentoDelAcumulado(acumulado({ nivel, columnas: deVacuna('HEXA', n) }), datos))[0];
    const sinMunicipio = lleno('municipio', COLUMNAS_POR_TRAMO_ANUAL.sinMunicipio);
    const conMunicipio = lleno('distrito', COLUMNAS_POR_TRAMO_ANUAL.conMunicipio);
    expect(sinMunicipio.table.widths.slice(0, 2).every((w) => typeof w === 'number')).toBe(true);
    expect(conMunicipio.table.widths.slice(0, 3).every((w) => typeof w === 'number')).toBe(true);
    expect(sinMunicipio.table.widths[0]).toBe(ANCHO_NOMBRE_ANUAL);
    expect(lleno('municipio', 2).table.widths[0]).toBe(ANCHO_NOMBRE_ANUAL);
    expect(anchoDeCantidad(sinMunicipio)).toBeGreaterThanOrEqual(ANCHO_MINIMO);
    expect(anchoDeCantidad(conMunicipio)).toBeGreaterThanOrEqual(ANCHO_MINIMO);
  });

  it('reparte las unidades por página sin partir ninguna y el total va al final', async () => {
    const doce = [...deVacuna('HEXA', 6), ...deVacuna('POLIO', 6)];
    // Las cifras de cada fila, con las doce columnas: la pasada de prueba maqueta la tabla de verdad.
    const [fila] = acumulado({ columnas: doce }).filas;
    const filas = Array.from({ length: 20 }, (_, i) => ({ ...fila, id: i, nombre: `Municipio ${i}` }));
    const informe = acumulado({ columnas: doce, filas });
    // SPEC 79: cuántas caben en cada página sale de la pasada de prueba (paginarAcumulado).
    const paginacion = await paginarAcumulado(informe, datos);
    const doc = documentoDelAcumulado(informe, datos, paginacion);
    const paginas = paginacion[0].length;

    expect(paginacion).toHaveLength(2);
    expect(paginacion.every((t) => t.reduce((suma, n) => suma + n, 0) === filas.length + 1)).toBe(true);
    expect(tablas(doc)).toHaveLength(paginacion.flat().length);
    tablas(doc).forEach((tabla, i) => expect((tabla.table.body.length - 4) / 4).toBe(paginacion.flat()[i]));
    const nombres = (tabla) => tabla.table.body.slice(4).map((f) => texto(f[0])).filter(Boolean);
    expect(tablas(doc).slice(0, paginas).flatMap(nombres)).toEqual([...filas.map((f) => f.nombre), 'TOTAL']);
    expect(nombres(tablas(doc)[0])).not.toContain('TOTAL');
    expect(rotuloDe(bloques(doc)[paginas])).toEqual(['DOSIS, POBLACIÓN, COBERTURA Y BRECHA', 'Bloque de vacunas 02 / 02']);
  });

  it('unidadesPorPagina: caben menos cuanto más abajo empieza el bloque, y por lo menos una', () => {
    const medidas = { encabezado: 60, unidad: 40 };
    expect(unidadesPorPagina({ ...medidas, inicio: 88 })).toBe(Math.floor((572 - 88 - 60) / 40));
    expect(unidadesPorPagina({ ...medidas, inicio: 152 })).toBeLessThan(unidadesPorPagina({ ...medidas, inicio: 88 }));
    expect(unidadesPorPagina({ ...medidas, inicio: 560 })).toBe(1);
  });

  it('pinta las vacunas de marino y, en verde, la cobertura con brecha 0', () => {
    const columnas = [columna('HEXA', 'D3', 'MENOR_1'), columna('BCG', 'UNICA')];
    const cifras = {
      dosis: [1450, 3], poblacion: [1450, null], cobertura: [100, null], brecha: [0, null],
    };
    const [tabla] = tablas(documentoDelAcumulado(acumulado({
      columnas, filas: [{ id: 1, codigo: '1201', nombre: 'San Marcos', municipio: null, ...cifras }], total: cifras,
    }), datos));
    const [vacunas] = tabla.table.body;
    expect(vacunas.find((c) => c.text === 'Hexavalente').color).toBe('#ffffff');
    expect(tabla.layout.fillColor(0, tabla, 2)).toBe('#2d5f86');
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

// SPEC 78: el logo del MSPAS en el encabezado de cada página, por código de DDRISS.
describe('logo de la DDRISS en el PDF (SPEC 78)', () => {
  const MINISTERIO = 'Ministerio de Salud Pública y Asistencia Social';
  // Los nodos de imagen de un nodo de pdfmake.
  const imagenesDe = (nodo) => {
    if (Array.isArray(nodo)) return nodo.flatMap(imagenesDe);
    if (!nodo || typeof nodo !== 'object') return [];
    return [...(nodo.image ? [nodo] : []), ...[nodo.stack, nodo.columns].flatMap(imagenesDe)];
  };
  const conLogo = { ...datos, ddrissCodigo: 'DDRISS_SM' };

  it('con logo, lo lleva en lugar del Ministerio, con la Dirección y la DDRISS a su izquierda', () => {
    const doc = documentoDelInforme(informeBase(), conLogo);
    expect(doc.images.logo.startsWith('data:image/png;base64,')).toBe(true);
    const [imagen] = imagenesDe(encabezadoCompleto(doc));
    expect(imagen).toMatchObject({ image: 'logo', height: 32, width: Math.round((32 * 463) / 166) });
    const encabezado = textosDe(encabezadoCompleto(doc));
    expect(encabezado).toEqual(expect.arrayContaining([
      'Dirección Departamental de Redes Integradas de Servicios de Salud', 'San Marcos',
    ]));
    expect(encabezado).not.toContain(MINISTERIO);
    // El logo mide lo que los renglones que reemplaza: el margen de arriba no cambia y las tablas no se corren.
    expect(doc.pageMargins).toEqual(documentoDelInforme(informeBase(), datos).pageMargins);
  });

  it('sin logo (otra DDRISS o sin código), conserva los tres renglones y no lleva imagen', () => {
    for (const ddrissCodigo of [undefined, 'ZVT_SIN_LOGO']) {
      const doc = documentoDelInforme(informeBase(), { ...datos, ddrissCodigo });
      expect(doc.images, String(ddrissCodigo)).toBeUndefined();
      expect(imagenesDe(encabezadoCompleto(doc))).toEqual([]);
      expect(textosDe(encabezadoCompleto(doc))).toEqual(expect.arrayContaining([MINISTERIO, 'San Marcos']));
    }
  });

  it('el acumulado anual también lo lleva, con las mismas páginas que sin logo', async () => {
    const doc = documentoDelAcumulado(acumulado(), conLogo);
    expect(imagenesDe(encabezadoCompleto(doc))).toHaveLength(1);
    expect(doc.content.length).toBe(documentoDelAcumulado(acumulado(), datos).content.length);
    const bytes = await pdfDelInforme(informeBase(), conLogo);
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  });
});

// SPEC 79: encabezado completo solo en la página 1 y reducido en las demás, y la pasada de prueba (maquetar) que
// compacta las filas, corta las tablas y reparte el acumulado. Estas pruebas maquetan de verdad con pdfmake.
describe('páginas del PDF (SPEC 79)', () => {
  const ONCE = ['Hexavalente', 'BCG', 'Polio', 'Rotavirus', 'Neumococo', 'SPR', 'Td', 'VPH', 'Varicela', 'COVID-19',
    'Hepatitis B'];
  // Cuatro dosis por vacuna; la sección de las dos últimas, «De 1 a < 2 años», se parte en dos líneas.
  const columnasLargas = ONCE.flatMap((nombre, v) => ['D1', 'D2', 'D3', 'R1'].map((codigo, i) => ({
    vacuna: { codigo: `V${v}`, nombre },
    seccion: i < 2 ? { grupoEdad: 'MENOR_1', titulo: '< 1 año' } : { grupoEdad: '1_A_2', titulo: 'De 1 a < 2 años' },
    valor: null,
    dosis: { id: v * 10 + i, codigo },
  })));
  const CON_AVISOS = {
    incluirAprobados: true,
    preliminar: true,
    mesesSinCerrar: [{ anio: 2026, mes: 9, estado: 'APROBADO' }, { anio: 2026, mes: 10, estado: 'ABIERTO' }],
  };
  const conFilas = (nivel, n, cambios = {}) => informeBase({
    nivel,
    hasta: { anio: 2026, mes: 10 },
    columnas: columnasLargas,
    filas: Array.from({ length: n }, (_, i) => ({
      id: i, nombre: `${nivel === 'establecimiento' ? 'Puesto de Salud' : 'Municipio'} ${i + 1}`,
      municipio: { nombre: 'San Marcos' }, fueraDelConsolidado: false,
      cantidades: columnasLargas.map((_, c) => (i * 7 + c) % 300),
    })),
    total: { cantidades: columnasLargas.map(() => 999) },
    dosisFueraDelConsolidado: 78,
    ...CON_AVISOS,
    ...cambios,
  });
  const conLogo = { ...datos, ddrissCodigo: 'DDRISS_SM' };
  const pagina = (nodos, id) => nodos.get(id).paginas;
  const tieneImagen = (nodo) => {
    if (Array.isArray(nodo)) return nodo.some(tieneImagen);
    if (!nodo || typeof nodo !== 'object') return false;
    return Boolean(nodo.image) || [nodo.stack, nodo.columns].some(tieneImagen);
  };
  // Los ajustes de la pasada de prueba y dónde cae cada nodo con ellos.
  const ajustado = async (informe) => {
    const ajustes = await ajustarInforme(informe, conLogo);
    return { ajustes, nodos: await maquetar(documentoDelInforme(informe, conLogo, ajustes)) };
  };

  it('el encabezado completo va solo en la página 1; las demás llevan el reducido, con logo y avisos', async () => {
    const informe = conFilas('municipio', 30);
    const doc = documentoDelInforme(informe, conLogo);
    expect(doc.header(1, 4)).toBeNull();
    const reducido = doc.header(2, 4);
    const textos = textosDe(reducido);
    expect(textos).toEqual(expect.arrayContaining([
      'SIRCOVA', 'Informes de vacunación', 'Dirección Departamental de Redes Integradas de Servicios de Salud',
      'San Marcos', 'Producción a la población propia', 'Enero – octubre de 2026',
    ]));
    expect(tieneImagen(reducido)).toBe(true);
    // Los avisos van en todas las páginas; el rótulo y la franja de filtros, solo en la primera.
    const completo = textosDe(encabezadoCompleto(doc));
    const avisos = completo.filter((t) => t.includes('todavía no'));
    expect(avisos.length).toBeGreaterThan(0);
    expect(textos).toEqual(expect.arrayContaining(avisos));
    expect(completo).toContain('PRODUCCIÓN DE VACUNACIÓN');
    expect(textos).not.toContain('PRODUCCIÓN DE VACUNACIÓN');
    expect(textos.length).toBeLessThan(completo.length);
    // El completo sube hasta arriba de la página 1 y no se repite.
    const nodos = await maquetar(doc);
    expect(nodos.get('encabezado-completo')).toEqual({ paginas: [1], arriba: 18 });
    expect(doc.content.filter((n) => n.id === 'encabezado-completo')).toHaveLength(1);
  });

  it('por municipio, 30 filas con avisos y secciones de dos líneas caben en una página por bloque', async () => {
    const { ajustes, nodos } = await ajustado(conFilas('municipio', 30));
    ajustes.forEach((_, orden) => {
      expect(pagina(nodos, `fila-${orden}-0`), `bloque ${orden}`).toEqual([orden + 1]);
      expect(pagina(nodos, `total-${orden}`), `bloque ${orden}`).toEqual([orden + 1]);
    });
    expect(pagina(nodos, 'nota-final')).toEqual([ajustes.length]);
    expect(ajustes.every((a) => a.corte === null)).toBe(true);
  });

  it('por municipio, un bloque que no cabe se compacta en lugar de pasar a otra página', async () => {
    const informe = conFilas('municipio', 38);
    const antes = await maquetar(documentoDelInforme(informe, conLogo));
    expect(pagina(antes, 'total-0')).not.toEqual(pagina(antes, 'fila-0-0'));
    const { ajustes, nodos } = await ajustado(informe);
    expect(ajustes[0].densidad).not.toBe('normal');
    ajustes.forEach((_, orden) => expect(pagina(nodos, `total-${orden}`)).toEqual([orden + 1]));
    expect(pagina(nodos, 'nota-final')).toEqual([ajustes.length]);
  });

  it('por establecimiento, ninguna página queda con solo el TOTAL ni con solo la nota final', async () => {
    let totalSolo = 0;
    let notaSola = 0;
    for (let n = 28; n <= 45; n += 1) {
      const informe = conFilas('establecimiento', n);
      const antes = await maquetar(documentoDelInforme(informe, conLogo));
      const ultimo = tramosDeColumnas(informe.columnas, COLUMNAS_POR_TRAMO.conMunicipio).length - 1;
      if (pagina(antes, 'total-0')[0] > pagina(antes, `fila-0-${n - 1}`)[0]) totalSolo += 1;
      if (pagina(antes, 'nota-final')[0] > pagina(antes, `total-${ultimo}`)[0]) notaSola += 1;

      const { ajustes, nodos } = await ajustado(informe);
      expect(ajustes.every((a) => a.densidad === 'normal'), `${n} filas`).toBe(true);
      ajustes.forEach((_, orden) => {
        const total = pagina(nodos, `total-${orden}`)[0];
        const conElTotal = Array.from({ length: n }, (_, i) => pagina(nodos, `fila-${orden}-${i}`).at(-1))
          .filter((p) => p === total).length;
        expect(conElTotal, `${n} filas, bloque ${orden}`).toBeGreaterThanOrEqual(3);
      });
      expect(pagina(nodos, 'nota-final')[0], `${n} filas`).toBe(pagina(nodos, `total-${ultimo}`)[0]);
    }
    // Sin los ajustes, los dos casos sí ocurren en este rango.
    expect(totalSolo).toBeGreaterThan(0);
    expect(notaSola).toBeGreaterThan(0);
  });

  it('un corte parte la tabla en dos con el encabezado repetido y la cebra seguida', () => {
    const informe = conFilas('establecimiento', 10);
    const doc = documentoDelInforme(informe, conLogo, [{ densidad: 'normal', corte: 7 }]);
    const [primera, segunda] = bloques(doc)[0].stack.slice(2);
    expect(filasDe(primera).map((f) => f[0])).toEqual(informe.filas.slice(0, 7).map((f) => f.nombre));
    expect(filasDe(segunda).map((f) => f[0])).toEqual([...informe.filas.slice(7).map((f) => f.nombre), 'TOTAL']);
    expect(segunda.pageBreak).toBe('before');
    expect(segunda.table.headerRows).toBe(3);
    expect(textosDe(segunda.table.body.slice(0, 3))).toEqual(textosDe(primera.table.body.slice(0, 3)));
    // La primera fila de la segunda tabla (la 8) lleva el fondo que tendría sin el corte.
    const [entera] = tablas(documentoDelInforme(informe, conLogo));
    const fondo = (tabla, fila) => tabla.layout.fillColor(fila, tabla, 3);
    expect([fondo(segunda, 3), fondo(segunda, 4)]).toEqual([fondo(entera, 3 + 7), fondo(entera, 4 + 7)]);
  });

  it('la densidad mínima usa letra 6.5 en toda la fila de datos y no cambia el encabezado de la tabla', () => {
    const minima = [{ densidad: 'minima', corte: null }];
    const [tabla] = tablas(documentoDelInforme(conFilas('municipio', 3), conLogo, minima));
    expect(tabla.table.body[3].every((celda) => celda.fontSize === 6.5)).toBe(true);
    expect(tabla.table.body.slice(0, 3).flat().some((celda) => celda.fontSize === 6.5)).toBe(false);
    expect(tabla.layout.paddingTop(3)).toBe(0);
    expect(tabla.layout.paddingTop(1)).toBe(0.75);
  });

  it('en el acumulado, ninguna unidad queda partida, también con avisos y secciones de dos líneas', async () => {
    const tres = columnasLargas.filter((c) => c.dosis.codigo !== 'R1');
    const [fila] = acumulado({ columnas: tres }).filas;
    for (const cambios of [{}, CON_AVISOS]) {
      const informe = acumulado({
        columnas: tres,
        filas: Array.from({ length: 30 }, (_, i) => ({ ...fila, id: i, nombre: `Municipio ${i + 1}` })),
        ...cambios,
      });
      const paginacion = await paginarAcumulado(informe, conLogo);
      const nodos = await maquetar(documentoDelAcumulado(informe, conLogo, paginacion));
      const ordenes = paginacion.flat().map((_, orden) => orden);
      for (const orden of ordenes) {
        expect(pagina(nodos, `fin-${orden}`), `bloque ${orden}`).toEqual(pagina(nodos, `unidad-${orden}-0`));
      }
      // Una página por tabla, y la segunda página del primer bloque lleva más unidades que la primera.
      expect(new Set(ordenes.map((orden) => pagina(nodos, `unidad-${orden}-0`)[0])).size).toBe(ordenes.length);
      expect(paginacion[0][1]).toBeGreaterThan(paginacion[0][0]);
    }
  });
});
