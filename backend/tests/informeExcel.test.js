import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import {
  FORMATO_CANTIDAD, fechaDeGeneracion, libroDelInforme, textoRango, tituloDelInforme,
} from '../src/modulos/informes/informeExcel.service.js';

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
  vacuna: null,
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
  return libro.worksheets[0];
}

// La primera fila de la hoja cuya columna A tiene ese texto, o null.
const filaQueEmpieza = (hoja, texto) => {
  let encontrada = null;
  hoja.eachRow((fila) => { if (!encontrada && fila.getCell(1).value === texto) encontrada = fila; });
  return encontrada;
};
const valorDe = (hoja, etiqueta) => filaQueEmpieza(hoja, etiqueta)?.getCell(2).value;
const avisos = (hoja) => {
  const lista = [];
  hoja.eachRow((fila) => { if (fila.getCell(1).value === 'Aviso') lista.push(fila.getCell(2).value); });
  return lista;
};
const rangosCombinados = (hoja) => hoja.model.merges;

describe('libro de Excel de un informe (SPEC 64)', () => {
  it('pone el título, los filtros y la fecha de generación en el encabezado', async () => {
    const hoja = await leerHoja(informeBase());

    expect(hoja.name).toBe('Población propia');
    expect(hoja.getCell('A1').value).toBe('Producción a la población propia · Municipio');
    expect(hoja.getCell('A1').font.bold).toBe(true);
    expect(valorDe(hoja, 'DDRISS')).toBe('DDRISS San Marcos');
    expect(valorDe(hoja, 'Periodo')).toBe('De enero de 2026 a agosto de 2026');
    expect(valorDe(hoja, 'Vacuna')).toBe('Todas las vacunas');
    expect(valorDe(hoja, 'Territorio')).toBe('Todos los municipios');
    expect(valorDe(hoja, 'Agrupación')).toBe('Sección del 5C');
    expect(valorDe(hoja, 'Incluye aprobados sin cerrar')).toBe('No');
    expect(valorDe(hoja, 'Generado')).toBe('12/11/2026 14:05 por Ana López');
    expect(filaQueEmpieza(hoja, 'PRELIMINAR')).toBeNull();
    expect(avisos(hoja)).toEqual([]);
  });

  it('nombra la vacuna, la red o los municipios del filtro y la agrupación', async () => {
    const conRed = await leerHoja(informeBase(), datosBase({ vacuna: 'Hexavalente', red: { nombre: 'Red No. 1' } }));
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
    expect(conMunicipios.getCell('A1').value).toBe('Producción a la población propia · Municipio · por Sexo');
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
    expect(preliminar.getCell('A2').value).toBe('PRELIMINAR');
    expect(preliminar.getCell('A2').font.bold).toBe(true);
    expect(avisos(preliminar)).toEqual(['Datos preliminares: julio y agosto de 2026 todavía no están cerrados.']);

    const sinCasilla = await leerHoja(informeBase({ mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }] }));
    expect(filaQueEmpieza(sinCasilla, 'PRELIMINAR')).toBeNull();
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
    expect(fila(n + 2)).toEqual(['D1', 'D2', 'R1', 'UNICA']);
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
    const hoja = await leerHoja(informe, datosBase({ vacuna: 'Hexavalente' }));
    const n = filaQueEmpieza(hoja, 'Municipio de aplicación').number;

    expect([2, 3, 4].map((c) => hoja.getCell(n + 1, c).value)).toEqual(['Femenino', 'Femenino', 'Masculino']);
    expect(rangosCombinados(hoja)).toEqual(expect.arrayContaining([`B${n + 1}:C${n + 1}`]));
    expect(avisos(hoja)).toEqual([]);
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
    expect(filaQueEmpieza(hoja, 'Municipio de aplicación')).toBeNull();
    expect(filaQueEmpieza(hoja, 'Total')).toBeNull();
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
