import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  FORMATO_CANTIDAD, FORMATO_COBERTURA, libroDelAcumulado, libroDelInforme,
} from '../src/modulos/informes/informeExcel.service.js';
import {
  etiquetaDeDosis, fechaDeGeneracion, lineaDeVacunas, nombreDeHojaDelMes, textoRango, tituloDelInforme,
} from '../src/modulos/informes/textosInforme.js';
import { logoDeLaDdriss } from '../src/modulos/informes/logos.js';

// SPEC 78: la misma tabla que frontend/src/paginas/informes/informes.test.js.
const ETIQUETAS_DE_DOSIS = [
  ['D1', '1ra'], ['D2', '2da'], ['D3', '3ra'], ['D4', '4ta'], ['D5', '5ta'], ['D6', '6ta'], ['D7', '7ma'],
  ['D8', '8va'], ['D9', '9na'], ['D10', '10ma'], ['D11', 'D11'], ['D0', 'D0'], ['D01', 'D01'], ['R1', 'R1'],
  ['R2', 'R2'], ['UNICA', 'UNICA'], ['D1X', 'D1X'], ['d1', 'd1'],
];

describe('etiquetaDeDosis (SPEC 78)', () => {
  it.each(ETIQUETAS_DE_DOSIS)('%s se muestra como %s', (codigo, etiqueta) => {
    expect(etiquetaDeDosis(codigo)).toBe(etiqueta);
  });
});

// SPEC 64: el libro se arma con datos fijos y se vuelve a leer desde el archivo, como lo abriría Excel. Los textos
// esperados son los de frontend/src/paginas/informes/informes.js y TablaInforme.jsx.

const columna = (vacuna, seccion, dosis, valor = null) => ({
  vacuna: { codigo: vacuna, nombre: vacuna === 'HEXA' ? 'Hexavalente' : 'BCG' },
  seccion: seccion && { grupoEdad: seccion, titulo: seccion === 'MENOR_1' ? '< 1 año' : 'De 1 a < 6 años' },
  valor,
  dosis: { id: dosis.length, codigo: dosis },
});

const informeBase = (cambios = {}) => ({
  informe: 'poblacion-propia',
  nivel: 'municipio',
  desde: { anio: 2026, mes: 1 },
  hasta: { anio: 2026, mes: 8 },
  incluirAprobados: false,
  agrupacion: null,
  columnas: [
    columna('HEXA', 'MENOR_1', 'D1'), columna('HEXA', 'MENOR_1', 'D2'), columna('HEXA', '1_A_5', 'R1'),
    columna('BCG', null, 'UNICA'),
  ],
  filas: [
    { id: 1, codigo: '1201', nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: [1200, 35, 0, 7] },
    { id: 4, codigo: '1202', nombre: 'San Pedro', fueraDelConsolidado: false, cantidades: [800, 12, 3, 0] },
  ],
  total: { cantidades: [2000, 47, 3, 7] },
  dosisFueraDelConsolidado: 0,
  mesesSinCerrar: [],
  preliminar: false,
  ...cambios,
});

const datosBase = (cambios = {}) => ({
  ddriss: 'DDRISS San Marcos',
  vacunas: [],
  red: null,
  municipios: [],
  generadoPor: 'Ana López',
  generadoEn: new Date('2026-11-12T20:05:00Z'),
  ...cambios,
});

async function leerHoja(informe, datos = datosBase()) {
  const bytes = await libroDelInforme(informe, datos).xlsx.writeBuffer();
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes);
  return libro.worksheets.at(-1);
}

// El libro tiene dos hojas (plantillaExcel.js): «Información» y la de los datos, con la tabla desde la fila 1. Las
// pruebas reciben la de los datos (o «Información» si no hay tabla) y leen el encabezado con info(hoja): marca e
// institución, rótulo en A5, título en A6, subtítulo en A7, la DDRISS y el periodo en la última celda con texto de
// las filas 3 y 6, y el recuadro de filtros desde la fila 9.
const info = (hoja) => hoja.workbook.getWorksheet('Información');
const PRIMERA_DEL_RECUADRO = 9;
const ultimoTexto = (hoja, n) => {
  let texto = null;
  info(hoja).getRow(n).eachCell((celda) => { if (celda.text) texto = celda.text; });
  return texto;
};
// La primera fila de la hoja cuya columna A tiene ese texto, o null.
const filaQueEmpieza = (hoja, texto) => {
  let encontrada = null;
  hoja.eachRow((fila) => { if (!encontrada && fila.getCell(1).value === texto) encontrada = fila; });
  return encontrada;
};
const valorDe = (hoja, etiqueta) => filaQueEmpieza(info(hoja), etiqueta)?.getCell(2).value;
const avisos = (hoja) => {
  const lista = [];
  info(hoja).eachRow((fila) => { if (fila.getCell(1).value === 'Aviso') lista.push(fila.getCell(2).value); });
  return lista;
};
const rangosCombinados = (hoja) => hoja.model.merges;

describe('libro de Excel de un informe (SPEC 64)', () => {
  it('pone el título, los filtros y la fecha de generación en el encabezado', async () => {
    const hoja = await leerHoja(informeBase());

    expect(hoja.workbook.worksheets.map((h) => h.name)).toEqual(['Información', 'Población propia']);
    expect(info(hoja).getCell('A1').value).toBe('SIRCOVA');
    expect(info(hoja).getCell('A2').value).toBe('Informes de vacunación');
    expect(info(hoja).getCell('A5').text).toBe('PRODUCCIÓN DE VACUNACIÓN');
    expect(info(hoja).getCell('A6').value).toBe('Producción a la población propia');
    expect(info(hoja).getCell('A6').font.bold).toBe(true);
    expect(info(hoja).getCell('A7').value).toBe('Municipio de aplicación');
    expect(ultimoTexto(hoja, 1)).toBe('Ministerio de Salud Pública y Asistencia Social');
    expect(ultimoTexto(hoja, 3)).toBe('San Marcos');
    expect(ultimoTexto(hoja, 6)).toBe('De enero de 2026 a agosto de 2026');
    // La DDRISS y el periodo van arriba, no en el recuadro.
    expect(valorDe(hoja, 'DDRISS')).toBeUndefined();
    expect(valorDe(hoja, 'Periodo')).toBeUndefined();
    expect(info(hoja).getCell(PRIMERA_DEL_RECUADRO, 1).value).toBe('Vacuna');
    // Dos filas debajo de las cinco del recuadro, el enlace a la hoja de los datos.
    expect(info(hoja).getCell(PRIMERA_DEL_RECUADRO + 6, 1).value)
      .toMatchObject({ text: 'Ver los datos en la hoja «Población propia»', hyperlink: "#'Población propia'!A1" });
    expect(valorDe(hoja, 'Vacuna')).toBe('Todas las vacunas');
    expect(valorDe(hoja, 'Territorio')).toBe('Todos los municipios');
    expect(valorDe(hoja, 'Agrupación')).toBe('Sección del 5C');
    expect(valorDe(hoja, 'Incluye aprobados sin cerrar')).toBe('No');
    expect(valorDe(hoja, 'Generado')).toBe('12/11/2026 14:05 por Ana López');
    expect(info(hoja).getCell('A5').text).not.toContain('PRELIMINAR');
    expect(avisos(hoja)).toEqual([]);
  });

  it('pinta la tabla como la plantilla desde la fila 1 y deja la hoja lista para imprimir', async () => {
    const hoja = await leerHoja(informeBase());
    const fondo = (celda) => celda.fill?.fgColor?.argb ?? null;
    const n = filaQueEmpieza(hoja, 'Municipio de aplicación').number;

    expect(n).toBe(1);
    expect(fondo(hoja.getCell(n, 1))).toBe('FF1F3B57');
    expect(fondo(hoja.getCell(n, 2))).toBe('FF2D5F86');
    expect(hoja.getCell(n, 2).font.color.argb).toBe('FFFFFFFF');
    expect(fondo(hoja.getCell(n + 2, 2))).toBe('FFDCE8F3');
    // Filas alternadas: la primera sin fondo, la segunda en gris azulado; el total en marino con letra blanca.
    expect(fondo(filaQueEmpieza(hoja, 'San Marcos').getCell(2))).toBeNull();
    expect(fondo(filaQueEmpieza(hoja, 'San Pedro').getCell(2))).toBe('FFF2F6FA');
    const total = filaQueEmpieza(hoja, 'Total');
    expect(fondo(total.getCell(3))).toBe('FF1F3B57');
    expect(total.getCell(3).font).toMatchObject({ bold: true, color: { argb: 'FFFFFFFF' } });
    // Un cero va en gris.
    expect(filaQueEmpieza(hoja, 'San Marcos').getCell(4).font.color.argb).toBe('FF8593A1');
    expect(fondo(info(hoja).getCell(PRIMERA_DEL_RECUADRO, 2))).toBe('FFE6EEF6');

    // Solo el encabezado de la tabla y la columna de nombres quedan fijos.
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false });
    expect(hoja.pageSetup).toMatchObject({ orientation: 'landscape', fitToWidth: 1, printTitlesRow: '1:3' });
    expect(hoja.headerFooter.oddHeader).toContain('SIRCOVA · Producción a la población propia · Municipio');
    expect(hoja.headerFooter.oddFooter).toContain('Página &P de &N');
    expect(info(hoja).views[0]).toMatchObject({ showGridLines: false });
  });

  it('nombra la vacuna, la red o los municipios del filtro y la agrupación', async () => {
    const conRed = await leerHoja(informeBase(), datosBase({ vacunas: ['Hexavalente'], red: { nombre: 'Red No. 1' } }));
    expect(valorDe(conRed, 'Vacuna')).toBe('Hexavalente');
    expect(valorDe(conRed, 'Territorio')).toBe('Red Red No. 1');

    const informe = informeBase({
      incluirAprobados: true,
      agrupacion: { codigo: 'sexo', nombre: 'Sexo' },
      columnas: [columna('HEXA', null, 'D1', { codigo: 'F', etiqueta: 'Femenino' })],
      filas: [{ id: 1, nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: [14] }],
      total: { cantidades: [14] },
    });
    const conMunicipios = await leerHoja(informe, datosBase({ municipios: ['San Marcos', 'San Pedro'] }));
    expect(info(conMunicipios).getCell('A7').value).toBe('Municipio de aplicación · por Sexo');
    expect(valorDe(conMunicipios, 'Territorio')).toBe('San Marcos, San Pedro');
    expect(valorDe(conMunicipios, 'Agrupación')).toBe('Sexo');
    expect(valorDe(conMunicipios, 'Incluye aprobados sin cerrar')).toBe('Sí');
    expect(avisos(conMunicipios)).toEqual(['Solo se muestran las vacunas que registran Sexo: Hexavalente.']);
  });

  it('lleva «PRELIMINAR» solo si el informe es preliminar, con los avisos de la pantalla', async () => {
    const preliminar = await leerHoja(informeBase({
      incluirAprobados: true,
      preliminar: true,
      mesesSinCerrar: [{ anio: 2026, mes: 7, estado: 'EN_CIERRE' }, { anio: 2026, mes: 8, estado: 'ABIERTO' }],
    }));
    expect(info(preliminar).getCell('A5').text).toBe('PRODUCCIÓN DE VACUNACIÓN    PRELIMINAR ');
    expect(info(preliminar).getCell('A5').value.richText.at(-1).font.bold).toBe(true);
    expect(avisos(preliminar)).toEqual(['Datos preliminares: julio y agosto de 2026 todavía no están cerrados.']);

    const sinCasilla = await leerHoja(informeBase({ mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }] }));
    expect(info(sinCasilla).getCell('A5').text).not.toContain('PRELIMINAR');
    expect(avisos(sinCasilla)).toEqual([
      'Agosto de 2026 todavía no está cerrado y no suma en el informe. '
        + 'Marca «Incluir aprobados sin cerrar» para verlos como preliminares.',
    ]);
  });

  it('combina las celdas de la vacuna y de la sección en el encabezado de la tabla', async () => {
    const hoja = await leerHoja(informeBase());
    const encabezado = filaQueEmpieza(hoja, 'Municipio de aplicación');
    const n = encabezado.number;

    const fila = (r) => [2, 3, 4, 5].map((c) => hoja.getCell(r, c).value);
    expect(fila(n)).toEqual(['Hexavalente', 'Hexavalente', 'Hexavalente', 'BCG']);
    expect(fila(n + 1)).toEqual(['< 1 año', '< 1 año', 'De 1 a < 6 años', null]);
    expect(fila(n + 2)).toEqual(['1ra', '2da', 'R1', 'UNICA']);
    expect(rangosCombinados(hoja))
      .toEqual(expect.arrayContaining([`A${n}:A${n + 2}`, `B${n}:D${n}`, `B${n + 1}:C${n + 1}`]));
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: n + 2 });
  });

  it('agrupado, la segunda fila del encabezado es el valor de la dimensión', async () => {
    const informe = informeBase({
      agrupacion: { codigo: 'sexo', nombre: 'Sexo' },
      columnas: [
        columna('HEXA', null, 'D1', { codigo: 'F', etiqueta: 'Femenino' }),
        columna('HEXA', null, 'D2', { codigo: 'F', etiqueta: 'Femenino' }),
        columna('HEXA', null, 'D1', { codigo: 'M', etiqueta: 'Masculino' }),
      ],
      filas: [{ id: 1, nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: [14, 2, 9] }],
      total: { cantidades: [14, 2, 9] },
    });
    const hoja = await leerHoja(informe, datosBase({ vacunas: ['Hexavalente'] }));
    const n = filaQueEmpieza(hoja, 'Municipio de aplicación').number;

    expect([2, 3, 4].map((c) => hoja.getCell(n + 1, c).value)).toEqual(['Femenino', 'Femenino', 'Masculino']);
    expect(rangosCombinados(hoja)).toEqual(expect.arrayContaining([`B${n + 1}:C${n + 1}`]));
    expect(avisos(hoja)).toEqual([]);

    // Con dos o más vacunas elegidas, el aviso nombra las que registran la dimensión (SPEC 73).
    const dos = await leerHoja(informe, datosBase({ vacunas: ['BCG', 'Hexavalente'] }));
    expect(avisos(dos)).toEqual(['Solo se muestran las vacunas que registran Sexo: Hexavalente.']);
  });

  it('la línea de las vacunas dice todas, el nombre de una o los nombres de varias (SPEC 73)', async () => {
    expect(lineaDeVacunas([])).toEqual(['Vacuna', 'Todas las vacunas']);
    expect(lineaDeVacunas(['Hexavalente'])).toEqual(['Vacuna', 'Hexavalente']);
    expect(lineaDeVacunas(['Hexavalente', 'Neumococo', 'Rotavirus']))
      .toEqual(['Vacunas', 'Hexavalente, Neumococo y Rotavirus']);

    const tres = await leerHoja(informeBase(), datosBase({ vacunas: ['Hexavalente', 'Neumococo', 'Rotavirus'] }));
    expect(info(tres).getCell(PRIMERA_DEL_RECUADRO, 1).value).toBe('Vacunas');
    expect(valorDe(tres, 'Vacunas')).toBe('Hexavalente, Neumococo y Rotavirus');
    expect(valorDe(tres, 'Vacuna')).toBeUndefined();
  });

  it('guarda las cantidades como números con separador de miles y agrega la fila «Total»', async () => {
    const hoja = await leerHoja(informeBase());
    const sanMarcos = filaQueEmpieza(hoja, 'San Marcos');
    const total = filaQueEmpieza(hoja, 'Total');

    expect([2, 3, 4, 5].map((c) => sanMarcos.getCell(c).value)).toEqual([1200, 35, 0, 7]);
    expect(typeof sanMarcos.getCell(2).value).toBe('number');
    expect(sanMarcos.getCell(2).numFmt).toBe(FORMATO_CANTIDAD);
    expect([2, 3, 4, 5].map((c) => total.getCell(c).value)).toEqual([2000, 47, 3, 7]);
    expect(total.getCell(2).numFmt).toBe(FORMATO_CANTIDAD);
    expect(total.font.bold).toBe(true);
    expect(total.number).toBe(filaQueEmpieza(hoja, 'San Pedro').number + 1);
  });

  it('por establecimiento, agrega «Municipio» y marca lo que no suma en el consolidado', async () => {
    const informe = informeBase({
      nivel: 'establecimiento',
      filas: [
        { id: 31, nombre: 'Hospital de San Marcos', municipio: { id: 1, nombre: 'San Marcos' },
          fueraDelConsolidado: true, cantidades: [120, 0, 0, 35] },
        { id: 7, nombre: 'CS San Pedro', municipio: { id: 4, nombre: 'San Pedro' }, fueraDelConsolidado: false,
          cantidades: [800, 12, 3, 0] },
      ],
      total: { cantidades: [800, 12, 3, 0] },
      dosisFueraDelConsolidado: 1155,
    });
    const hoja = await leerHoja(informe);
    const n = filaQueEmpieza(hoja, 'Establecimiento').number;

    expect(hoja.getCell(n, 2).value).toBe('Municipio');
    expect(hoja.getCell(n, 3).value).toBe('Hexavalente');
    const hospital = filaQueEmpieza(hoja, 'Hospital de San Marcos (no suma en el consolidado)');
    expect(hospital.getCell(2).value).toBe('San Marcos');
    expect(hospital.getCell(3).value).toBe(120);
    expect(filaQueEmpieza(hoja, 'CS San Pedro').getCell(2).value).toBe('San Pedro');
    expect(filaQueEmpieza(hoja, 'Total').getCell(3).value).toBe(800);
    expect(hoja.getCell(hoja.rowCount, 1).value)
      .toBe('Además, 1,155 dosis de establecimientos que no suman en el consolidado.');
    expect(rangosCombinados(hoja)).toEqual(expect.arrayContaining([`A${n}:A${n + 2}`, `B${n}:B${n + 2}`]));
    expect(hoja.views[0]).toMatchObject({ xSplit: 2 });
  });

  it('sin columnas, lleva solo el encabezado con su aviso', async () => {
    const hoja = await leerHoja(informeBase({
      agrupacion: { codigo: 'pueblo', nombre: 'Pueblo de pertenencia' },
      columnas: [],
      filas: [{ id: 1, nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: [] }],
      total: { cantidades: [] },
    }));

    expect(avisos(hoja)).toEqual(['Ninguna vacuna de este informe registra Pueblo de pertenencia.']);
    // Sin tabla, solo la hoja «Información», sin el enlace a los datos.
    expect(hoja.workbook.worksheets.map((h) => h.name)).toEqual(['Información']);
    expect(hoja.getCell(hoja.rowCount, 1).value).toBe('Aviso');
  });

  it('usa el nombre de hoja, el título y el rango de cada informe', () => {
    expect(tituloDelInforme({ informe: 'residencia', nivel: 'distrito', agrupacion: null }))
      .toBe('Dosis por municipio de residencia · Distrito');
    expect(textoRango({ anio: 2026, mes: 8 }, { anio: 2026, mes: 8 })).toBe('Agosto de 2026');
    expect(textoRango({ anio: 2025, mes: 12 }, { anio: 2026, mes: 1 })).toBe('De diciembre de 2025 a enero de 2026');
    expect(fechaDeGeneracion(new Date('2027-01-01T05:30:00Z'))).toBe('31/12/2026 23:30');
  });
});

// SPEC 78: una hoja por mes del rango antes de la acumulada, con las filas y columnas del informe.
const mesDe = (anio, mes, estado, factor = 1, dosisFueraDelConsolidado = 0) => ({
  anio, mes, estado,
  filas: informeBase().filas.map((f) => ({ ...f, cantidades: f.cantidades.map((c) => c * factor) })),
  total: { cantidades: informeBase().total.cantidades.map((c) => c * factor) },
  dosisFueraDelConsolidado,
});

async function leerLibro(informe, datos = datosBase()) {
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(await libroDelInforme(informe, datos).xlsx.writeBuffer());
  return libro;
}
const celdasDe = (hoja) => {
  const filas = [];
  hoja.eachRow((fila) => filas.push(fila.values.map((v) => (typeof v === 'object' && v !== null ? v.text : v))));
  return filas;
};

describe('hojas por mes en el libro de un informe (SPEC 78)', () => {
  const RANGO = { desde: { anio: 2025, mes: 12 }, hasta: { anio: 2026, mes: 2 } };

  it('ordena «Información», un mes por hoja con su año y al final la acumulada', async () => {
    const libro = await leerLibro(informeBase({
      ...RANGO,
      meses: [mesDe(2025, 12, 'CERRADO', 0), mesDe(2026, 1, 'CERRADO', 1), mesDe(2026, 2, 'CERRADO', 0)],
    }));
    expect(libro.worksheets.map((h) => h.name)).toEqual([
      'Información', 'Diciembre 2025', 'Enero 2026', 'Febrero 2026', 'Población propia',
    ]);
    expect(nombreDeHojaDelMes({ anio: 2026, mes: 9 })).toBe('Septiembre 2026');
  });

  it('cada hoja mensual tiene el encabezado, las filas y el total de la acumulada, con lo del mes', async () => {
    const libro = await leerLibro(informeBase({ ...RANGO, meses: [mesDe(2025, 12, 'CERRADO', 2)] }));
    const mes = libro.getWorksheet('Diciembre 2025');
    const acumulada = libro.getWorksheet('Población propia');
    const nombres = (hoja) => celdasDe(hoja).map((f) => f[1]);

    expect(nombres(mes)).toEqual(nombres(acumulada));
    expect(celdasDe(mes).slice(0, 3)).toEqual(celdasDe(acumulada).slice(0, 3));
    expect(mes.model.merges).toEqual(acumulada.model.merges);
    expect([2, 3, 4, 5].map((c) => filaQueEmpieza(mes, 'San Marcos').getCell(c).value)).toEqual([2400, 70, 0, 14]);
    expect([2, 3, 4, 5].map((c) => filaQueEmpieza(mes, 'Total').getCell(c).value)).toEqual([4000, 94, 6, 14]);
    expect(filaQueEmpieza(mes, 'San Marcos').getCell(2).numFmt).toBe(FORMATO_CANTIDAD);
    expect(mes.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 3, showGridLines: false });
    expect(mes.headerFooter.oddHeader)
      .toContain('SIRCOVA · Producción a la población propia · Municipio · Diciembre 2025');
    // Un mes cerrado sin dosis fuera del consolidado no lleva nota.
    expect(mes.rowCount).toBe(filaQueEmpieza(mes, 'Total').number);
  });

  it('un rango de un solo mes trae también la hoja de ese mes', async () => {
    const agosto = { anio: 2026, mes: 8 };
    const libro = await leerLibro(informeBase({ desde: agosto, hasta: agosto, meses: [mesDe(2026, 8, 'CERRADO')] }));
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Información', 'Agosto 2026', 'Población propia']);
  });

  it('pone debajo de la tabla de un mes la nota de su estado y la de las dosis fuera del consolidado', async () => {
    const notas = async (mes, incluirAprobados = false) => {
      const libro = await leerLibro(informeBase({ incluirAprobados, meses: [mes] }));
      const hoja = libro.worksheets[1];
      const total = filaQueEmpieza(hoja, 'Total').number;
      return celdasDe(hoja).slice(total).map((f) => f[1]).filter(Boolean);
    };
    expect(await notas(mesDe(2026, 3, null, 0)))
      .toEqual(['Marzo de 2026 no está habilitado en la DDRISS: no tiene datos.']);
    expect(await notas(mesDe(2026, 7, 'EN_CIERRE')))
      .toEqual(['Julio de 2026 todavía no está cerrado y no suma en esta hoja.']);
    expect(await notas(mesDe(2026, 8, 'ABIERTO'), true))
      .toEqual(['Datos preliminares: agosto de 2026 todavía no está cerrado.']);
    expect(await notas(mesDe(2026, 1, 'CERRADO'))).toEqual([]);
    expect(await notas(mesDe(2026, 2, 'EN_CIERRE', 1, 1155), true)).toEqual([
      'Datos preliminares: febrero de 2026 todavía no está cerrado.',
      'Además, 1,155 dosis de establecimientos que no suman en el consolidado.',
    ]);
  });

  it('la hoja acumulada conserva su nota y «Información», sus avisos', async () => {
    const informe = informeBase({
      dosisFueraDelConsolidado: 20,
      mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }],
      meses: [mesDe(2026, 8, 'EN_CIERRE')],
    });
    const libro = await leerLibro(informe);
    const acumulada = libro.getWorksheet('Población propia');
    expect(acumulada.getCell(acumulada.rowCount, 1).value)
      .toBe('Además, 20 dosis de establecimientos que no suman en el consolidado.');
    expect(avisos(acumulada)).toEqual([
      'Agosto de 2026 todavía no está cerrado y no suma en el informe. '
        + 'Marca «Incluir aprobados sin cerrar» para verlos como preliminares.',
    ]);
  });

  it('«Información» enlaza cada hoja de datos en el orden del libro', async () => {
    const libro = await leerLibro(informeBase({
      ...RANGO, meses: [mesDe(2025, 12, 'CERRADO'), mesDe(2026, 1, 'CERRADO'), mesDe(2026, 2, 'CERRADO')],
    }));
    const hoja = libro.getWorksheet('Información');
    const titulo = filaQueEmpieza(hoja, 'Hojas de datos:').number;
    const enlaces = [1, 2, 3, 4].map((i) => hoja.getCell(titulo + i, 1).value);
    expect(enlaces).toEqual([
      { text: 'Diciembre 2025', hyperlink: "#'Diciembre 2025'!A1" },
      { text: 'Enero 2026', hyperlink: "#'Enero 2026'!A1" },
      { text: 'Febrero 2026', hyperlink: "#'Febrero 2026'!A1" },
      { text: 'Población propia (acumulado del rango)', hyperlink: "#'Población propia'!A1" },
    ]);
    expect(hoja.getCell(titulo + 5, 1).value).toBeNull();
  });

  it('sin columnas, el libro solo trae «Información», sin hojas mensuales', async () => {
    const libro = await leerLibro(informeBase({
      agrupacion: { codigo: 'pueblo', nombre: 'Pueblo de pertenencia' },
      columnas: [],
      filas: [{ id: 1, nombre: 'San Marcos', fueraDelConsolidado: false, cantidades: [] }],
      total: { cantidades: [] },
      meses: [{ ...mesDe(2026, 8, 'CERRADO'), filas: [], total: { cantidades: [] } }],
    }));
    expect(libro.worksheets.map((h) => h.name)).toEqual(['Información']);
    expect(filaQueEmpieza(libro.getWorksheet('Información'), 'Hojas de datos:')).toBeNull();
  });
});

// SPEC 66: el acumulado anual, con las mismas columnas y cuatro cifras por unidad.
const acumuladoBase = (cambios = {}) => ({
  informe: 'acumulado-anual',
  nivel: 'municipio',
  anio: 2026,
  incluirAprobados: false,
  columnas: [
    { ...columna('HEXA', 'MENOR_1', 'D3'), meta: { valor: 95, indicador: 'COB_HEXA3' } },
    { ...columna('HEXA', '1_A_5', 'R1'), meta: { valor: 90.5, indicador: null } },
  ].map(({ valor, ...c }) => c),
  filas: [
    { id: 1, codigo: '1201', nombre: 'San Marcos', municipio: null,
      dosis: [1300, 7], poblacion: [1450, null], cobertura: [89.7, null], brecha: [78, null] },
  ],
  total: { dosis: [1300, 7], poblacion: [1450, null], cobertura: [89.7, null], brecha: [78, null] },
  mesesSinCerrar: [{ anio: 2026, mes: 11, estado: 'ABIERTO' }, { anio: 2026, mes: 12, estado: null }],
  preliminar: false,
  ...cambios,
});

async function leerAcumulado(informe, datos = datosBase()) {
  const bytes = await libroDelAcumulado(informe, datos).xlsx.writeBuffer();
  const libro = new ExcelJS.Workbook();
  await libro.xlsx.load(bytes);
  return libro.worksheets.at(-1);
}

describe('libro de Excel del acumulado anual (SPEC 66)', () => {
  it('lleva el título, el año y el aviso de los meses sin cerrar', async () => {
    const hoja = await leerAcumulado(acumuladoBase());
    expect(hoja.name).toBe('Acumulado anual');
    expect(info(hoja).getCell('A5').text).toBe('COBERTURA DE VACUNACIÓN');
    expect(info(hoja).getCell('A6').value).toBe('Acumulado anual');
    expect(info(hoja).getCell('A7').value).toBe('Municipio de residencia');
    expect(ultimoTexto(hoja, 6)).toBe('Enero a diciembre de 2026');
    expect(valorDe(hoja, 'Agrupación')).toBeUndefined();
    expect(avisos(hoja)).toEqual([
      'Noviembre y diciembre de 2026 todavía no están cerrados y no suman en el acumulado. Marca «Incluir aprobados '
        + 'sin cerrar» para verlos como preliminares.',
    ]);
  });

  it('tiene cuatro filas de encabezado (la última con la meta) y cuatro filas por unidad', async () => {
    const hoja = await leerAcumulado(acumuladoBase());
    const encabezado = filaQueEmpieza(hoja, 'Municipio de residencia');
    const n = encabezado.number;
    expect(encabezado.getCell(2).value).toBe('Cifra');
    expect(hoja.getRow(n + 2).getCell(3).value).toBe('3ra');
    expect([hoja.getRow(n + 3).getCell(3).value, hoja.getRow(n + 3).getCell(4).value]).toEqual(['Meta 95 %', 'Meta 90.5 %']);

    const unidad = filaQueEmpieza(hoja, 'San Marcos').number;
    const fila = (i) => [2, 3, 4].map((c) => hoja.getRow(unidad + i).getCell(c).value);
    expect([0, 1, 2, 3].map(fila)).toEqual([
      ['Dosis', 1300, 7], ['Población', 1450, '—'], ['Cobertura %', 89.7, '—'], ['Brecha', 78, '—'],
    ]);
    expect(hoja.getRow(unidad + 2).getCell(3).numFmt).toBe(FORMATO_COBERTURA);
    expect(hoja.getRow(unidad).getCell(3).numFmt).toBe(FORMATO_CANTIDAD);
    expect(hoja.model.merges).toEqual(expect.arrayContaining([`A${n}:A${n + 3}`, `A${unidad}:A${unidad + 3}`]));
    expect(filaQueEmpieza(hoja, 'Total').getCell(2).value).toBe('Dosis');
    expect(hoja.views[0]).toMatchObject({ xSplit: 2, ySplit: n + 3 });
  });

  it('pinta el encabezado como la plantilla, las cifras con los colores del tema y en verde la meta', async () => {
    const hoja = await leerAcumulado(acumuladoBase({
      filas: [{ ...acumuladoBase().filas[0], brecha: [0, null], cobertura: [96.6, null] }],
    }));
    const fondo = (celda) => celda.fill?.fgColor?.argb ?? null;
    const n = filaQueEmpieza(hoja, 'Municipio de residencia').number;
    expect(fondo(hoja.getRow(n).getCell(1))).toBe('FF1F3B57');
    expect(fondo(hoja.getRow(n).getCell(3))).toBe('FF2D5F86');
    expect(fondo(hoja.getRow(n + 1).getCell(3))).toBe('FFDCE8F3');
    expect(fondo(hoja.getRow(n + 3).getCell(3))).toBe('FFF0F4F8');

    const unidad = filaQueEmpieza(hoja, 'San Marcos').number;
    const tonos = (i) => [2, 3, 4].map((c) => fondo(hoja.getRow(unidad + i).getCell(c)));
    expect(tonos(0)).toEqual([null, null, null]);
    expect(tonos(1)).toEqual(['FFF0F4F8', 'FFF0F4F8', 'FFF0F4F8']);
    expect(tonos(2)).toEqual(['FFEDF4FB', 'FFE3F3E8', 'FFEDF4FB']);
    expect(tonos(3)).toEqual(['FFFFF5DD', 'FFE3F3E8', 'FFFFF5DD']);
    expect(hoja.getRow(unidad + 2).getCell(3).font).toMatchObject({ bold: true, color: { argb: 'FF1E5B34' } });
    const total = filaQueEmpieza(hoja, 'Total');
    expect(total.getCell(1).font).toMatchObject({ bold: true, color: { argb: 'FFFFFFFF' } });
    expect(fondo(total.getCell(1))).toBe('FF1F3B57');
    expect(hoja.getRow(total.number + 3).getCell(2).font).toMatchObject({ bold: true, color: { argb: 'FF7A4A06' } });
  });

  it('por distrito lleva la columna Municipio, y con preliminar su marca', async () => {
    const hoja = await leerAcumulado(acumuladoBase({
      nivel: 'distrito',
      preliminar: true,
      incluirAprobados: true,
      filas: [{ ...acumuladoBase().filas[0], nombre: 'Distrito 1', municipio: { id: 1, nombre: 'San Marcos' } }],
    }));
    expect(info(hoja).getCell('A5').text).toContain('PRELIMINAR');
    const unidad = filaQueEmpieza(hoja, 'Distrito 1');
    expect([unidad.getCell(2).value, unidad.getCell(3).value, unidad.getCell(4).value]).toEqual(['San Marcos', 'Dosis', 1300]);
    expect(filaQueEmpieza(hoja, 'Distrito').getCell(3).value).toBe('Cifra');
  });
});

// SPEC 78: el logo del MSPAS, por código de DDRISS (logos/DDRISS_SM.png).
describe('logo de la DDRISS en «Información» (SPEC 78)', () => {
  const MINISTERIO = 'Ministerio de Salud Pública y Asistencia Social';
  const textos = (hoja) => {
    const lista = [];
    hoja.eachRow((fila) => fila.eachCell((celda) => { if (celda.text) lista.push(celda.text); }));
    return lista;
  };

  it('logoDeLaDdriss da el logo de DDRISS_SM con su tamaño, y null para otro código', () => {
    const logo = logoDeLaDdriss('DDRISS_SM');
    expect(logo).toMatchObject({ ancho: 463, alto: 166 });
    expect(logo.bytes.subarray(1, 4).toString()).toBe('PNG');
    for (const codigo of ['ZVT_SIN_LOGO', null, undefined, '', '../DDRISS_SM', 'ddriss_sm']) {
      expect(logoDeLaDdriss(codigo), String(codigo)).toBeNull();
    }
  });

  it('con logo, lo pone arriba a la derecha en lugar del Ministerio, con la Dirección y la DDRISS a su lado', async () => {
    const hoja = await leerHoja(informeBase(), datosBase({ ddrissCodigo: 'DDRISS_SM' }));
    const imagenes = info(hoja).getImages();
    expect(imagenes).toHaveLength(1);
    expect(imagenes[0].range.tl.nativeRow).toBe(0);
    expect(imagenes[0].range.tl.nativeCol).toBeGreaterThanOrEqual(3);
    expect(textos(info(hoja))).not.toContain(MINISTERIO);
    // La Dirección y la DDRISS, en la columna D (a la izquierda del logo, que está en la E), alineadas a la derecha.
    expect(info(hoja).getCell(2, 4).value).toBe('Dirección Departamental de Redes Integradas de Servicios de Salud');
    expect(info(hoja).getCell(3, 4).value).toBe('San Marcos');
    expect(info(hoja).getCell(3, 4).alignment.horizontal).toBe('right');
    expect(info(hoja).getCell(3, 5).value).toBeNull();
    expect(hoja.getImages()).toHaveLength(0);
  });

  it('sin logo (otra DDRISS o sin código), conserva los tres renglones y no lleva imagen', async () => {
    for (const ddrissCodigo of [undefined, 'ZVT_SIN_LOGO']) {
      const hoja = await leerHoja(informeBase(), datosBase({ ddrissCodigo }));
      expect(info(hoja).getImages(), String(ddrissCodigo)).toHaveLength(0);
      expect(ultimoTexto(hoja, 1)).toBe(MINISTERIO);
      expect(ultimoTexto(hoja, 3)).toBe('San Marcos');
    }
  });

  it('el acumulado anual también lleva el logo', async () => {
    const hoja = await leerAcumulado(acumuladoBase(), datosBase({ ddrissCodigo: 'DDRISS_SM' }));
    expect(info(hoja).getImages()).toHaveLength(1);
    expect(textos(info(hoja))).not.toContain(MINISTERIO);
  });
});
