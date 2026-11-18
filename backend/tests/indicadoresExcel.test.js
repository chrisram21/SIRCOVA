import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import ExcelJS from 'exceljs';
import { Int32, ObjectId } from 'mongodb';
import app from '../src/app.js';
import pool from '../src/config/mysql.js';
import { obtenerDb } from '../src/config/mongodb.js';
import { tokenDePrueba } from './sesionDePrueba.js';
import {
  FORMATO_CANTIDAD, FORMATO_DECIMAL, FORMATO_PORCENTAJE, libroDeIndicador, libroDeProduccion, libroDeRed,
} from '../src/modulos/indicadores/indicadoresExcel.service.js';
import { COLORES, TEXTO_MAYOR_A_CIEN } from '../src/modulos/indicadores/textosIndicadores.js';
import {
  columnasDeLaRed, dosisFinales, esperadoDeLaTabla, etiquetaTrazadora, filasDeLaRed, filasDeLaTabla,
  gruposDeColumnas, municipiosDeLaCorrida, municipiosVisibles, nombreDeFila, sinCoberturaAnual,
} from '../src/modulos/indicadores/tablaIndicadores.js';
// Las funciones de la pantalla que el backend repite (SPEC 72). Son puras y sin imports, así que se comparan directo.
import * as pantalla from '../../frontend/src/paginas/indicadores/panelIndicadores.js';
import * as pantallaRed from '../../frontend/src/paginas/indicadores/tablaRed.js';

const SAN_MARCOS = { id: 1, codigoIne: '1201', nombre: 'San Marcos' };
const SAN_PEDRO = { id: 2, codigoIne: '1202', nombre: 'San Pedro Sacatepéquez' };
const TACANA = { id: 7, codigoIne: '1207', nombre: 'Tacaná' };
const SIBINAL = { id: 8, codigoIne: '1208', nombre: 'Sibinal' };
const RED = {
  id: 3,
  nombre: 'Red No. 1',
  municipios: [TACANA, SIBINAL],
  trazadoras: [
    { codigo: 'UNICA', vacuna: { codigo: 'BCG' } },
    { codigo: 'D3', vacuna: { codigo: 'HEXA' } },
    { codigo: 'R2', vacuna: { codigo: 'OPV' } },
  ],
};

const vacuna = (codigo) => ({ codigo, nombre: codigo });
const fila = (indicadorCodigo, municipio, cambios = {}) => ({
  indicadorCodigo, vacuna: vacuna('HEXA'), dosis: 'D3', municipio, red: null, calculable: true, valor: 50,
  numerador: 10, denominador: 20, brechaDosis: 5, esperado: null, ...cambios,
});

// Como los devuelve la API: total de la DDRISS, total de la red y municipios por nombre.
const filasDe = (codigo, valores) => [
  fila(codigo, null, { valor: 60 }),
  fila(codigo, null, { red: { id: 3, nombre: 'Red No. 1' }, valor: 55 }),
  ...[SAN_MARCOS, SAN_PEDRO, SIBINAL, TACANA].map((m, i) => fila(codigo, m, valores[i])),
];
const RESULTADOS = [
  ...filasDe('COB_HEXA3', [{ valor: 80 }, { valor: 40 }, { valor: 95 }, { valor: 70 }]),
  ...filasDe('BRE_HEXA3', [{ brechaDosis: 3 }, { brechaDosis: 9 }, { calculable: false }, { brechaDosis: 9 }]),
  ...filasDe('DES_HEXA', [{ valor: 2 }, { valor: 12 }, { valor: -4 }, { calculable: false }]),
  ...filasDe('PRO_HEXA3', [{ valor: 90 }, { valor: 60 }, { valor: 60 }, { calculable: false }]),
];
const COBERTURA = { codigo: 'COB_HEXA3', tipoCalculo: 'COBERTURA' };
const nombres = (filas) => filas.map(nombreDeFila);

// Lo que arma la pantalla (PaginaIndicadores.jsx) con los mismos filtros, antes de que la tabla ordene.
function comoLaPantalla(codigo, { red = null, municipioDelDistrito = null, municipioIds = [] } = {}) {
  const visibles = pantalla.municipiosVisibles(pantalla.municipiosDeLaCorrida(RESULTADOS), {
    delDistrito: red || municipioDelDistrito === null ? null : [municipioDelDistrito],
    deLaRed: red ? red.municipios.map((m) => m.id) : null,
    elegidos: red ? [] : municipioIds,
  });
  return pantalla.filasVisibles(pantalla.filasDe(RESULTADOS, codigo), visibles, red);
}

describe('recorte de las filas (SPEC 72)', () => {
  const casos = [
    ['sin filtro', {}],
    ['con distrito', { municipioDelDistrito: SAN_PEDRO.id }],
    ['con municipios', { municipioIds: [TACANA.id, SAN_MARCOS.id] }],
    ['con municipios fuera de la corrida', { municipioIds: [99] }],
    ['con red', { red: RED }],
    ['con red y distrito: manda la red', { red: RED, municipioDelDistrito: SAN_PEDRO.id, municipioIds: [1] }],
  ];

  it.each(casos)('%s da las mismas filas que la pantalla', (_, filtros) => {
    expect(filasDeLaTabla(RESULTADOS, { indicador: COBERTURA, ...filtros }))
      .toEqual(comoLaPantalla('COB_HEXA3', filtros));
  });

  it('sin filtro: el total de la DDRISS y todos los municipios por nombre', () => {
    expect(nombres(filasDeLaTabla(RESULTADOS, { indicador: COBERTURA }))).toEqual([
      'Total de la DDRISS', 'San Marcos', 'San Pedro Sacatepéquez', 'Sibinal', 'Tacaná',
    ]);
  });

  it('con red: el total de la red y sus municipios', () => {
    const filas = filasDeLaTabla(RESULTADOS, { indicador: COBERTURA, red: RED });
    expect(nombres(filas)).toEqual(['Total de la red', 'Sibinal', 'Tacaná']);
    expect(filas[0].valor).toBe(55);
  });

  it('con distrito o municipios: el total de la DDRISS y los elegidos', () => {
    expect(nombres(filasDeLaTabla(RESULTADOS, { indicador: COBERTURA, municipioDelDistrito: SAN_PEDRO.id })))
      .toEqual(['Total de la DDRISS', 'San Pedro Sacatepéquez']);
    expect(nombres(filasDeLaTabla(RESULTADOS, { indicador: COBERTURA, municipioIds: [7, 1] })))
      .toEqual(['Total de la DDRISS', 'San Marcos', 'Tacaná']);
  });

  it('los municipios de la corrida y los visibles son los de la pantalla', () => {
    const municipios = municipiosDeLaCorrida(RESULTADOS);
    expect(municipios).toEqual(pantalla.municipiosDeLaCorrida(RESULTADOS));
    const filtros = { delDistrito: [2], deLaRed: null, elegidos: [2, 7] };
    expect(municipiosVisibles(municipios, filtros)).toEqual(pantalla.municipiosVisibles(municipios, filtros));
  });
});

describe('orden de las tablas (TablaBrecha, TablaDesercion y TablaProyeccion)', () => {
  it('brecha: el total, de mayor a menor brecha (por nombre si empatan) y al final las no calculables', () => {
    const filas = filasDeLaTabla(RESULTADOS, { indicador: { codigo: 'BRE_HEXA3', tipoCalculo: 'BRECHA' } });
    expect(nombres(filas)).toEqual(['Total de la DDRISS', 'San Pedro Sacatepéquez', 'Tacaná', 'San Marcos', 'Sibinal']);
  });

  it('deserción: el total, de mayor a menor deserción y al final las no calculables', () => {
    const filas = filasDeLaTabla(RESULTADOS, { indicador: { codigo: 'DES_HEXA', tipoCalculo: 'DESERCION' } });
    expect(nombres(filas)).toEqual(['Total de la DDRISS', 'San Pedro Sacatepéquez', 'San Marcos', 'Sibinal', 'Tacaná']);
  });

  it('proyección: el total, de menor a mayor cobertura proyectada y al final las no calculables', () => {
    const filas = filasDeLaTabla(RESULTADOS, { indicador: { codigo: 'PRO_HEXA3', tipoCalculo: 'PROYECCION' } });
    expect(nombres(filas)).toEqual(['Total de la DDRISS', 'San Pedro Sacatepéquez', 'Sibinal', 'San Marcos', 'Tacaná']);
  });

  it('avance y cobertura conservan el orden de la API', () => {
    const avance = { codigo: 'COB_HEXA3', tipoCalculo: 'AVANCE_META_MES' };
    expect(filasDeLaTabla(RESULTADOS, { indicador: avance })).toEqual(comoLaPantalla('COB_HEXA3'));
  });

  it('las dosis finales de la deserción son las iniciales menos la pérdida', () => {
    expect(dosisFinales({ numerador: 12, denominador: 100 })).toBe(88);
    expect(dosisFinales({ numerador: -4, denominador: 50 })).toBe(54);
  });
});

describe('tabla de Redes (tablaRed.js)', () => {
  const anual = (codigo, descripcionPoblacion) => ({
    codigo, tipoCalculo: 'COBERTURA', prorrateo: 'NINGUNO', clasificacionPoblacion: 'X', descripcionPoblacion,
  });
  const INDICADORES = [
    anual('COB_ANUAL_HEXA3', 'Menores de 1 año'),
    anual('COB_ANUAL_BCGU', 'Nacidos vivos'),
    // Una cobertura mensual no cuenta: la tabla solo usa las anuales.
    { codigo: 'COB_OPVR2', tipoCalculo: 'COBERTURA', prorrateo: 'MENSUAL_LINEAL' },
  ];
  const deRed = (indicadorCodigo, vacunaCodigo, dosis, municipio, cambios = {}) => ({
    indicadorCodigo, vacuna: vacuna(vacunaCodigo), dosis, municipio, red: null, valor: 50, esperado: 66.67, ...cambios,
  });
  const RESULTADOS_RED = [
    deRed('COB_ANUAL_BCGU', 'BCG', 'UNICA', null, { red: { id: 3, nombre: 'Red No. 1' }, valor: 61 }),
    deRed('COB_ANUAL_BCGU', 'BCG', 'UNICA', TACANA, { valor: 70 }),
    deRed('COB_ANUAL_BCGU', 'BCG', 'UNICA', SAN_MARCOS, { valor: 99 }),
    deRed('COB_ANUAL_HEXA3', 'HEXA', 'D3', null, { red: { id: 3, nombre: 'Red No. 1' }, valor: 45 }),
    deRed('COB_ANUAL_HEXA3', 'HEXA', 'D3', SIBINAL, { valor: 30 }),
    deRed('COB_OPVR2', 'OPV', 'R2', TACANA, { valor: 88, esperado: null }),
  ];

  it('las columnas, sus grupos y las filas son las de la pantalla', () => {
    const columnas = columnasDeLaRed(RED, INDICADORES, RESULTADOS_RED);
    expect(columnas).toEqual(pantallaRed.columnasDeLaRed(RED, INDICADORES, RESULTADOS_RED));
    expect(gruposDeColumnas(columnas)).toEqual(pantallaRed.gruposDeColumnas(columnas));
    const filas = filasDeLaRed(RED, columnas, RESULTADOS_RED);
    expect(filas).toEqual(pantallaRed.filasDeLaRed(RED, columnas, RESULTADOS_RED));
    expect(esperadoDeLaTabla(filas)).toBe(pantallaRed.esperadoDeLaTabla(filas));
    expect(sinCoberturaAnual(columnas)).toEqual(pantallaRed.sinCoberturaAnual(columnas));
  });

  it('agrupa por población, deja al final la trazadora sin cobertura anual y ordena los municipios por nombre', () => {
    const columnas = columnasDeLaRed(RED, INDICADORES, RESULTADOS_RED);
    expect(columnas.map((c) => [c.etiqueta, c.grupo])).toEqual([
      ['BCG', 'Nacidos vivos'], ['HEXA 3', 'Menores de 1 año'], ['OPV R2', 'Sin indicador'],
    ]);
    expect(sinCoberturaAnual(columnas)).toEqual(['OPV R2']);
    const { municipios, total } = filasDeLaRed(RED, columnas, RESULTADOS_RED);
    expect(municipios.map((m) => m.municipio.nombre)).toEqual(['Sibinal', 'Tacaná']);
    expect(municipios[1].celdas.map((c) => c?.valor ?? null)).toEqual([70, null, null]);
    expect(total.map((c) => c?.valor ?? null)).toEqual([61, 45, null]);
    expect(esperadoDeLaTabla({ municipios, total })).toBe(66.67);
  });

  it('las etiquetas de las trazadoras son las de la pantalla', () => {
    for (const codigo of ['UNICA', 'D3', 'R1', 'R2']) {
      const trazadora = { codigo, vacuna: { codigo: 'DPT' } };
      expect(etiquetaTrazadora(trazadora)).toBe(pantallaRed.etiquetaTrazadora(trazadora));
    }
  });
});

// ---------------------------------------------------------------- Libro

const DATOS = {
  ddriss: 'DDRISS San Marcos',
  territorio: { red: null, distrito: null, municipios: [] },
  generadoPor: 'Ana López',
  generadoEn: new Date('2026-11-17T20:05:00Z'),
};
const CORRIDA = { id: 181, anio: 2026, mesHasta: 8, parcial: false, mesesSinCerrar: [], indicadores: [] };
const HEXA = { codigo: 'HEXA', nombre: 'Hexavalente' };
const resultado = (indicadorCodigo, municipio, cambios = {}) => ({
  indicadorCodigo, vacuna: HEXA, dosis: 'D3', municipio, red: null, calculable: true, valor: 85.3, color: 'verde',
  numerador: 853, denominador: 1000, brechaDosis: 97, excedenteDosis: 0, metaDosis: 950, meta: 95, cumpleMeta: false,
  mayorACien: false, proyeccion: null, mes: 8, esperado: null, ...cambios,
});

// El libro se escribe y se vuelve a leer, como lo abriría Excel.
async function releer(libro) {
  const otro = new ExcelJS.Workbook();
  await otro.xlsx.load(await libro.xlsx.writeBuffer());
  return otro.worksheets[0];
}
// La n-ésima fila cuya columna A tiene ese texto, o null.
const filaQueEmpieza = (hoja, texto, n = 1) => {
  const encontradas = [];
  hoja.eachRow((fila) => { if (fila.getCell(1).value === texto) encontradas.push(fila); });
  return encontradas[n - 1] ?? null;
};
const valorDe = (hoja, etiqueta) => filaQueEmpieza(hoja, etiqueta)?.getCell(2).value;
const avisosDe = (hoja) => {
  const lista = [];
  hoja.eachRow((fila) => { if (fila.getCell(1).value === 'Aviso') lista.push(fila.getCell(2).value); });
  return lista;
};
const valores = (fila) => fila.values.slice(1);
const fondo = (celda) => celda.fill?.fgColor?.argb ?? null;
const argbDe = (tono) => `FF${COLORES[tono].fondo.slice(1).toUpperCase()}`;
const indicadorDe = (codigo, tipoCalculo, nombre = codigo) => ({ codigo, nombre, tipoCalculo });

describe('libro de Excel de una pestaña de indicadores (SPEC 72)', () => {
  const FILAS = [
    resultado('COB_HEXA3', null, {
      valor: 102.4, numerador: 1024, brechaDosis: 0, excedenteDosis: 74, cumpleMeta: true, mayorACien: true,
    }),
    resultado('COB_HEXA3', SAN_MARCOS),
    resultado('COB_HEXA3', SAN_PEDRO, {
      calculable: false, valor: null, color: null, denominador: null, brechaDosis: null, excedenteDosis: null,
      cumpleMeta: null,
    }),
    resultado('OTRO', TACANA),
  ];
  const cobertura = (cambios = {}, datos = DATOS) => libroDeIndicador({
    vista: 'cobertura', corrida: CORRIDA, resultados: FILAS,
    indicador: indicadorDe('COB_HEXA3', 'COBERTURA', 'Cobertura HEXA 3'), ...cambios,
  }, datos);

  it('pone el título, el mes de corte, el indicador, el territorio y la fecha en el encabezado', async () => {
    const hoja = await releer(cobertura());
    expect(hoja.name).toBe('Cobertura');
    expect(hoja.getCell('A1').value).toBe('Cobertura de Hexavalente');
    expect(hoja.getCell('A1').font.bold).toBe(true);
    expect(filaQueEmpieza(hoja, 'PRELIMINAR')).toBeNull();
    expect(valorDe(hoja, 'DDRISS')).toBe('DDRISS San Marcos');
    expect(valorDe(hoja, 'Mes de corte')).toBe('Agosto de 2026');
    expect(valorDe(hoja, 'Indicador')).toBe('Cobertura HEXA 3 (COB_HEXA3)');
    expect(valorDe(hoja, 'Territorio')).toBe('Todos los municipios');
    expect(valorDe(hoja, 'Generado')).toBe('17/11/2026 14:05 por Ana López');
    expect(avisosDe(hoja)).toEqual([
      'Cobertura mayor al 100 %: Total de la DDRISS. Revise la población (denominador) o los registros.',
    ]);
  });

  it('con una corrida parcial lleva «PRELIMINAR» y el aviso de los meses sin cerrar', async () => {
    const hoja = await releer(cobertura({ corrida: { ...CORRIDA, parcial: true, mesesSinCerrar: [7, 8] } }));
    expect(hoja.getCell('A2').value).toBe('PRELIMINAR');
    expect(avisosDe(hoja)[0])
      .toBe('Cálculo parcial. Julio y agosto no están cerrados: solo se cuentan los reportes ya cerrados.');
  });

  it('el territorio dice la red, el distrito o los municipios', async () => {
    const conTerritorio = async (territorio) =>
      valorDe(await releer(cobertura({}, { ...DATOS, territorio })), 'Territorio');
    expect(await conTerritorio({ distrito: { nombre: 'Distrito de Salud Malacatán' } })).toBe('Distrito de Salud Malacatán');
    expect(await conTerritorio({ municipios: ['San Marcos', 'Tacaná'] })).toBe('San Marcos, Tacaná');
    expect(await conTerritorio({ red: { nombre: 'Red No. 1' }, distrito: { nombre: 'X' } })).toBe('Red No. 1');
  });

  it('las columnas van en el orden de la pantalla, con números, porcentajes, Sí/No y colores', async () => {
    const hoja = await releer(cobertura());
    const titulos = filaQueEmpieza(hoja, 'Municipio');
    expect(valores(titulos)).toEqual(['Municipio', 'Dosis acumuladas', 'Población', 'Dosis que faltan', 'Excedente',
      'Meta', 'Cobertura', 'Cumple', 'Más del 100 %']);

    const total = hoja.getRow(titulos.number + 1);
    expect(valores(total)).toEqual(['Total de la DDRISS', 1024, 1000, 0, 74, 0.95, 1.024, 'Sí', 'Sí']);
    expect(total.getCell(1).font.bold).toBe(true);
    expect(total.getCell(2).numFmt).toBe(FORMATO_CANTIDAD);
    expect(total.getCell(7).numFmt).toBe(FORMATO_PORCENTAJE);
    expect(fondo(total.getCell(7))).toBe(argbDe('verde'));
    expect(total.getCell(7).font.bold).toBe(true);
    expect(fondo(total.getCell(8))).toBe(argbDe('verde'));

    const sanMarcos = hoja.getRow(titulos.number + 2);
    expect(valores(sanMarcos)).toEqual(['San Marcos', 853, 1000, 97, 0, 0.95, 0.853, 'No']);
    expect(typeof sanMarcos.getCell(2).value).toBe('number');
    expect(fondo(sanMarcos.getCell(8))).toBe(argbDe('rojo'));

    // Lo que la pantalla pone como «—» queda vacío; sin población, el mismo texto de la pantalla.
    const sanPedro = hoja.getRow(titulos.number + 3);
    expect(sanPedro.getCell(3).value).toBeNull();
    expect(sanPedro.getCell(4).value).toBeNull();
    expect(sanPedro.getCell(7).value).toBe('Sin población');
    expect(sanPedro.getCell(8).value).toBeNull();
    expect(hoja.rowCount).toBe(titulos.number + 3);
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: titulos.number });
  });

  it('avance: «Meta del mes» y «Avance»', async () => {
    const filas = FILAS.map((r) => ({
      ...r, indicadorCodigo: r.indicadorCodigo === 'COB_HEXA3' ? 'AV_HEXA3' : 'OTRO',
    }));
    const hoja = await releer(libroDeIndicador({
      vista: 'avance', corrida: CORRIDA, resultados: filas, indicador: indicadorDe('AV_HEXA3', 'AVANCE_META_MES', null),
    }, DATOS));
    expect(hoja.getCell('A1').value).toBe('Avance de Hexavalente');
    expect(valorDe(hoja, 'Indicador')).toBe('AV_HEXA3 (AV_HEXA3)');
    expect(valores(filaQueEmpieza(hoja, 'Municipio'))).toEqual(['Municipio', 'Dosis acumuladas', 'Meta del mes',
      'Dosis que faltan', 'Excedente', 'Meta', 'Avance', 'Cumple', 'Más del 100 %']);
  });

  it('con red, la tabla trae el total de la red y sus municipios', async () => {
    const filas = [
      resultado('COB_HEXA3', null),
      resultado('COB_HEXA3', null, { red: { id: 3, nombre: 'Red No. 1' }, valor: 70 }),
      resultado('COB_HEXA3', SAN_MARCOS),
      resultado('COB_HEXA3', TACANA),
    ];
    const hoja = await releer(libroDeIndicador({
      vista: 'cobertura', corrida: CORRIDA, resultados: filas, red: RED,
      indicador: indicadorDe('COB_HEXA3', 'COBERTURA'),
    }, DATOS));
    const titulos = filaQueEmpieza(hoja, 'Municipio');
    expect(hoja.getRow(titulos.number + 1).getCell(1).value).toBe('Total de la red');
    expect(hoja.getRow(titulos.number + 1).getCell(7).value).toBe(0.7);
    expect(hoja.getRow(titulos.number + 2).getCell(1).value).toBe('Tacaná');
    expect(hoja.rowCount).toBe(titulos.number + 2);
  });

  it('brecha: el excedente y lo que falta con su color, y la suma de los municipios', async () => {
    const filas = [
      resultado('BRE', null, { sumaBrechasMunicipales: 120, brechaDosis: 40 }),
      resultado('BRE', SAN_MARCOS, { brechaDosis: 0, excedenteDosis: 15, cumpleMeta: true }),
      resultado('BRE', SAN_PEDRO, { calculable: false, metaDosis: null, brechaDosis: null, excedenteDosis: null }),
    ];
    const hoja = await releer(libroDeIndicador({
      vista: 'brecha', corrida: CORRIDA, resultados: filas, indicador: indicadorDe('BRE', 'BRECHA'),
    }, DATOS));
    const titulos = filaQueEmpieza(hoja, 'Municipio');
    expect(valores(titulos)).toEqual(['Municipio', 'Dosis acumuladas', 'Dosis para la meta', 'Excedente',
      'Dosis que faltan', 'Cumple', 'Más del 100 %']);
    expect(valores(hoja.getRow(titulos.number + 1))).toEqual(['Total de la DDRISS', 853, 950, 0, 40, 'No']);
    expect(fondo(hoja.getRow(titulos.number + 1).getCell(5))).toBe(argbDe('amarillo'));
    expect(fondo(hoja.getRow(titulos.number + 1).getCell(4))).toBeNull();
    expect(fondo(hoja.getRow(titulos.number + 2).getCell(4))).toBe(argbDe('verde'));
    expect(hoja.getRow(titulos.number + 3).getCell(3).value).toBe('Sin población');
    expect(avisosDe(hoja)).toContain(
      'Suma de lo que falta en los municipios: 120 dosis. Los municipios que pasaron la meta no compensan a los demás.',
    );
  });

  it('deserción: las dosis finales, la meta con su comparador y la nota de la deserción negativa', async () => {
    const filas = [
      resultado('DES', null, { numerador: 30, denominador: 300, valor: 10, meta: 10 }),
      resultado('DES', SAN_MARCOS, { numerador: -4, denominador: 50, valor: -8 }),
      resultado('DES', SAN_PEDRO, { calculable: false, numerador: 0, denominador: 0, valor: null }),
    ];
    const hoja = await releer(libroDeIndicador({
      vista: 'desercion', corrida: CORRIDA, resultados: filas, indicador: indicadorDe('DES', 'DESERCION'),
    }, DATOS));
    const titulos = filaQueEmpieza(hoja, 'Municipio');
    expect(valores(titulos)).toEqual(['Municipio', 'Dosis iniciales', 'Dosis finales', 'Pérdida', 'Meta (≤)',
      'Deserción', 'Cumple']);
    expect(valores(hoja.getRow(titulos.number + 1))).toEqual(['Total de la DDRISS', 300, 270, 30, 0.1, 0.1, 'No']);
    expect(valores(hoja.getRow(titulos.number + 2)).slice(0, 4)).toEqual(['San Marcos', 50, 54, -4]);
    expect(hoja.getRow(titulos.number + 3).getCell(6).value).toBe('Sin primeras dosis');
    expect(avisosDe(hoja).some((a) => a.startsWith('Una deserción negativa'))).toBe(true);
  });

  it('proyección: el ritmo con un decimal, las columnas estimadas en gris y la nota del método', async () => {
    const proyeccion = { dosisAcumuladas: 600, ritmoMensual: 75.5, mesesVentana: 3, mesesUsados: [5, 6, 7] };
    const filas = [
      resultado('PRO', null, { proyeccion, numerador: 902, valor: 90.2 }),
      resultado('PRO', SAN_MARCOS, { calculable: false, proyeccion: { ...proyeccion, mesesUsados: [] }, valor: null }),
    ];
    const hoja = await releer(libroDeIndicador({
      vista: 'proyeccion', corrida: CORRIDA, resultados: filas, indicador: indicadorDe('PRO', 'PROYECCION'),
    }, DATOS));
    const titulos = filaQueEmpieza(hoja, 'Municipio');
    expect(valores(titulos)).toEqual(['Municipio', 'Dosis acumuladas', 'Ritmo mensual', 'Dosis proyectadas a diciembre',
      'Población', 'Dosis que faltarían', 'Meta (>)', 'Cobertura proyectada', '¿Llega a la meta?']);
    expect(fondo(titulos.getCell(3))).toBe(argbDe('estimada'));
    expect(fondo(titulos.getCell(2))).toBeNull();
    const total = hoja.getRow(titulos.number + 1);
    expect(valores(total)).toEqual(['Total de la DDRISS', 600, 75.5, 902, 1000, 97, 0.95, 0.902, 'No']);
    expect(total.getCell(3).numFmt).toBe(FORMATO_DECIMAL);
    expect(hoja.getRow(titulos.number + 2).getCell(8).value).toBe('Sin meses cerrados');
    expect(avisosDe(hoja).at(-1)).toBe('La proyección suma a las dosis acumuladas el promedio de los últimos 3 meses '
      + 'cerrados (mayo, junio y julio) por cada mes que falta hasta diciembre. Es una estimación, no un dato '
      + 'registrado.');
  });
});

describe('libro de Excel de Redes y de Producción (SPEC 72)', () => {
  it('redes: dos filas de encabezado, la cobertura anual, la nota de más del 100 % y el total', async () => {
    const indicadores = [
      {
        codigo: 'COB_ANUAL_BCGU', tipoCalculo: 'COBERTURA', prorrateo: 'NINGUNO',
        descripcionPoblacion: 'Nacidos vivos',
      },
      {
        codigo: 'COB_ANUAL_HEXA3', tipoCalculo: 'COBERTURA', prorrateo: 'NINGUNO',
        descripcionPoblacion: 'Menores de 1 año',
      },
    ];
    const red3 = { id: 3, nombre: 'Red No. 1' };
    const celda = (codigo, vacunaCodigo, dosis, municipio, cambios) => resultado(codigo, municipio, {
      vacuna: { codigo: vacunaCodigo, nombre: vacunaCodigo }, dosis, esperado: 66.67, ...cambios,
    });
    const resultados = [
      celda('COB_ANUAL_BCGU', 'BCG', 'UNICA', null, { red: red3, valor: 61 }),
      celda('COB_ANUAL_BCGU', 'BCG', 'UNICA', TACANA, { valor: 104, mayorACien: true }),
      celda('COB_ANUAL_HEXA3', 'HEXA', 'D3', null, { red: red3, valor: 45, color: 'rojo' }),
      celda('COB_ANUAL_HEXA3', 'HEXA', 'D3', SIBINAL, { valor: 30, color: 'rojo' }),
    ];
    const hoja = await releer(libroDeRed({ corrida: { ...CORRIDA, indicadores }, resultados, red: RED },
      { ...DATOS, territorio: { red: red3 } }));

    expect(hoja.name).toBe('Redes');
    expect(hoja.getCell('A1').value).toBe('Cobertura de la Red No. 1');
    expect(valorDe(hoja, 'Indicador')).toBeUndefined();
    expect(avisosDe(hoja)).toEqual([
      'Sin indicador de cobertura anual para: OPV R2. Se configuran en Administración · Indicadores.',
      'Lo esperado a agosto es 66.7 % de la población anual (8.33 % por mes).',
    ]);
    const grupos = filaQueEmpieza(hoja, 'Municipio');
    expect(valores(grupos)).toEqual(['Municipio', 'Nacidos vivos', 'Menores de 1 año', 'Sin indicador']);
    expect(valores(hoja.getRow(grupos.number + 1)).slice(1)).toEqual(['BCG', 'HEXA 3', 'OPV R2']);
    expect(hoja.model.merges).toContain(`A${grupos.number}:A${grupos.number + 1}`);

    const sibinal = hoja.getRow(grupos.number + 2);
    expect(sibinal.getCell(1).value).toBe('Sibinal');
    expect(sibinal.getCell(2).value).toBeNull();
    expect(sibinal.getCell(3).value).toBe(0.3);
    expect(fondo(sibinal.getCell(3))).toBe(argbDe('rojo'));
    const tacana = hoja.getRow(grupos.number + 3);
    expect(tacana.getCell(2).value).toBe(1.04);
    expect(tacana.getCell(2).numFmt).toBe(FORMATO_PORCENTAJE);
    expect(tacana.getCell(2).note).toBe(TEXTO_MAYOR_A_CIEN);
    const total = hoja.getRow(grupos.number + 4);
    expect(valores(total)).toEqual(['Total de la red', 0.61, 0.45]);
    expect(total.getCell(1).font.bold).toBe(true);
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: grupos.number + 1 });
  });

  const PRODUCCION = {
    anio: 2026,
    mes: 8,
    acumulado: true,
    agrupar: 'establecimiento',
    vacuna: { codigo: 'HEXA', nombre: 'Hexavalente', dosis: [{ id: 11, codigo: 'D1' }, { id: 12, codigo: 'D2' }] },
    filas: [
      {
        municipio: SAN_MARCOS, establecimiento: { id: 31, nombre: 'CAP San Marcos' }, fueraDelConsolidado: false,
        porDosis: [{ dosisId: 11, dosisTotal: 40 }, { dosisId: 12, dosisTotal: 35 }],
        dosisPoblacionPropia: 70, dosisOtrosMunicipios: 5, dosisTotal: 75,
      },
      {
        municipio: SAN_MARCOS, establecimiento: { id: 32, nombre: 'Hospital de San Marcos' }, fueraDelConsolidado: true,
        porDosis: [{ dosisId: 11, dosisTotal: 9 }], dosisPoblacionPropia: 6, dosisOtrosMunicipios: 3, dosisTotal: 9,
      },
    ],
    total: {
      porDosis: [{ dosisId: 11, dosisTotal: 40 }, { dosisId: 12, dosisTotal: 35 }],
      dosisPoblacionPropia: 70, dosisOtrosMunicipios: 5, dosisTotal: 75,
    },
    dosisFueraDelConsolidado: 9,
    preliminar: true,
    mesesSinCerrar: [{ anio: 2026, mes: 8, estado: 'EN_CIERRE' }],
  };

  it('producción: las columnas de la tabla, el municipio aparte, la marca de lo que no suma y el total', async () => {
    const hoja = await releer(libroDeProduccion(PRODUCCION, { ...DATOS, establecimientos: ['CAP San Marcos'] }));
    expect(hoja.name).toBe('Producción');
    expect(hoja.getCell('A1').value).toBe('Producción de Hexavalente');
    expect(hoja.getCell('A2').value).toBe('PRELIMINAR');
    expect(valorDe(hoja, 'Periodo')).toBe('De enero a agosto de 2026');
    expect(valorDe(hoja, 'Vacuna')).toBe('Hexavalente');
    expect(valorDe(hoja, 'Establecimiento')).toBe('CAP San Marcos');
    expect(avisosDe(hoja)).toEqual(['Datos preliminares: agosto de 2026 todavía no está cerrado.']);

    // La primera fila «Establecimiento» es la del encabezado; la segunda, la de los títulos de la tabla.
    const titulos = filaQueEmpieza(hoja, 'Establecimiento', 2);
    expect(valores(titulos)).toEqual(['Establecimiento', 'Municipio', 'D1', 'D2', 'Población propia',
      'Otros municipios', 'Total']);
    const cap = hoja.getRow(titulos.number + 1);
    expect(valores(cap)).toEqual(['CAP San Marcos', 'San Marcos', 40, 35, 70, 5, 75]);
    expect(cap.getCell(3).numFmt).toBe(FORMATO_CANTIDAD);
    expect(valores(hoja.getRow(titulos.number + 2)))
      .toEqual(['Hospital de San Marcos (no suma en el consolidado)', 'San Marcos', 9, 0, 6, 3, 9]);
    const total = hoja.getRow(titulos.number + 3);
    expect(total.getCell(1).value).toBe('Total');
    expect(total.getCell(2).value).toBeNull();
    expect(valores(total).slice(2)).toEqual([40, 35, 70, 5, 75]);
    expect(total.getCell(1).font.bold).toBe(true);
    expect(hoja.getRow(titulos.number + 4).getCell(1).value)
      .toBe('Además, 9 dosis de establecimientos que no suman en el consolidado.');
    expect(hoja.views[0]).toMatchObject({ state: 'frozen', xSplit: 2, ySplit: titulos.number });
  });

  it('producción de todas las vacunas, por municipio y de un solo mes', async () => {
    const produccion = {
      ...PRODUCCION, acumulado: false, agrupar: 'municipio', vacuna: null, preliminar: false, mesesSinCerrar: [],
      dosisFueraDelConsolidado: 0, filas: [{ ...PRODUCCION.filas[0], establecimiento: null, porDosis: [] }],
      total: { ...PRODUCCION.total, porDosis: [] },
    };
    const hoja = await releer(libroDeProduccion(produccion, DATOS));
    expect(hoja.getCell('A1').value).toBe('Producción de todas las vacunas');
    expect(filaQueEmpieza(hoja, 'PRELIMINAR')).toBeNull();
    expect(valorDe(hoja, 'Periodo')).toBe('Agosto de 2026');
    expect(valorDe(hoja, 'Vacuna')).toBe('Todas las vacunas');
    const titulos = filaQueEmpieza(hoja, 'Municipio de aplicación');
    expect(valores(titulos)).toEqual(['Municipio de aplicación', 'Población propia', 'Otros municipios', 'Total']);
    expect(valores(hoja.getRow(titulos.number + 1))).toEqual(['San Marcos', 70, 5, 75]);
    expect(hoja.rowCount).toBe(titulos.number + 2);
  });
});

// ---------------------------------------------------------------- Endpoints

// Todo por SQL y MongoDB, sin el motor, como redesEnIndicadores.test.js: la DDRISS ficticia ZVT_EXC72 con su
// departamento (Z9) y tres municipios, la red Red A (Z901 y Z902, con HEXA D3 y HEXA D1 de trazadoras), el distrito de
// Z903 y una corrida vigente de julio de 2089 con cinco indicadores ZVT_HU72_*. La consulta la Autoridad nacional con
// ddrissId. Producción se exporta con los datos reales de la DDRISS de una cuenta de Epidemiología y se compara con
// GET /indicadores/produccion. Todo se borra al inicio y al final.
describe('GET /indicadores/resultados/excel y /indicadores/produccion/excel (SPEC 72)', () => {
  const ANIO = 2089;
  const MES = 7;
  const DDRISS_PRUEBA = 'ZVT_EXC72';
  const DEPARTAMENTO_PRUEBA = 'Z9';
  const INES = ['Z901', 'Z902', 'Z903'];
  const VACUNA_ID = 2;
  const DOSIS = { D1: 2, D3: 4 };
  const COD = {
    cobertura: 'ZVT_HU72_COB', avance: 'ZVT_HU72_AV', brecha: 'ZVT_HU72_BRECHA', desercion: 'ZVT_HU72_DES',
    proyeccion: 'ZVT_HU72_PROY',
  };
  const cuentas = {};
  const municipios = {};
  const ids = {};
  let ddrissId;

  const coleccion = async () => (await obtenerDb()).collection('configuracion_indicadores');
  const UMBRALES = [
    { color: 'verde', desde: 90, hasta: null },
    { color: 'amarillo', desde: 80, hasta: 90 },
    { color: 'rojo', desde: 0, hasta: 80 },
  ];
  function indicador({ codigo, tipo, aplica, denominador, meta, umbrales = UMBRALES, parametros }) {
    const fecha = new Date();
    return {
      _id: new ObjectId(),
      codigo,
      version: new Int32(1),
      nombre: `vitest-hu72 ${codigo}`,
      tipo_calculo: tipo,
      aplica_a: [{ vacuna: 'HEXA', ...aplica }],
      numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
      denominador,
      meta,
      ...(umbrales ? { umbrales } : {}),
      ...(parametros ? { parametros } : {}),
      umbrales_provisionales: false,
      es_indicador_mapa: false,
      niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
      periodicidad: 'MENSUAL',
      alerta: { generar: false },
      es_estimacion: tipo === 'PROYECCION',
      territorio: { nivel: 'DDRISS', ddriss_codigo: DDRISS_PRUEBA },
      estado: 'VIGENTE',
      vigencia: { desde: fecha, hasta: null },
      auditoria: {
        creado_por: new Int32(4), creado_en: fecha, publicado_por: new Int32(4), publicado_en: fecha,
        motivo_cambio: 'vitest-hu72',
      },
    };
  }
  const poblacion = (prorrateo) => ({ fuente: 'POBLACION_OBJETIVO', prorrateo });
  const META_95 = { valor: 95, unidad: 'PORCENTAJE', comparador: '>' };
  const D3_MENOR_1 = { dosis: 'D3', clasificacion_poblacion: 'MENOR_1' };
  const INDICADORES = [
    indicador({
      codigo: COD.cobertura, tipo: 'COBERTURA', aplica: D3_MENOR_1, denominador: poblacion('NINGUNO'), meta: META_95,
    }),
    indicador({
      codigo: COD.avance, tipo: 'AVANCE_META_MES', aplica: D3_MENOR_1, denominador: poblacion('MENSUAL_LINEAL'),
      meta: { valor: 100, unidad: 'PORCENTAJE', comparador: '>=' },
    }),
    indicador({
      codigo: COD.brecha, tipo: 'BRECHA', aplica: D3_MENOR_1, umbrales: null, denominador: poblacion('NINGUNO'),
      meta: META_95,
    }),
    indicador({
      codigo: COD.desercion, tipo: 'DESERCION', aplica: { dosis_inicial: 'D1', dosis_final: 'D3' },
      denominador: { fuente: 'PRODUCCION' }, meta: { valor: 10, unidad: 'PORCENTAJE', comparador: '<=' },
      umbrales: [{ color: 'verde', desde: null, hasta: 10 }, { color: 'rojo', desde: 10, hasta: null }],
    }),
    indicador({
      codigo: COD.proyeccion, tipo: 'PROYECCION', aplica: D3_MENOR_1, umbrales: null,
      denominador: poblacion('NINGUNO'), meta: META_95,
      parametros: {
        indicador_base: COD.cobertura, metodo: 'PROMEDIO_MOVIL', meses_ventana: new Int32(3), horizonte: 'FIN_DE_ANIO',
      },
    }),
  ];
  // [codigo, municipio (null = departamental), numerador, denominador, valor, meta, brechaDosis, cumpleMeta].
  const FILAS = [
    [COD.cobertura, null, 100, 400, 25, 95, 280, false],
    [COD.cobertura, 'Z901', 60, 100, 60, 95, 35, false],
    [COD.cobertura, 'Z902', 30, 100, 30, 95, 65, false],
    [COD.cobertura, 'Z903', 10, 200, 5, 95, 180, false],
    [COD.avance, null, 140, 210, 66.6667, 100, 70, false],
    [COD.avance, 'Z901', 120, 100, 120, 100, 0, true],
    [COD.avance, 'Z902', 10, 10, 100, 100, 0, true],
    [COD.avance, 'Z903', 10, 100, 10, 100, 90, false],
    [COD.brecha, null, 100, 400, 25, 95, 280, false],
    [COD.brecha, 'Z901', 60, 100, 60, 95, 35, false],
    [COD.brecha, 'Z902', 30, 100, 30, 95, 65, false],
    [COD.brecha, 'Z903', 10, 200, 5, 95, 180, false],
    [COD.desercion, null, 20, 100, 20, 10, null, false],
    [COD.desercion, 'Z901', 5, 50, 10, 10, null, true],
    [COD.desercion, 'Z902', 15, 50, 30, 10, null, false],
    [COD.proyeccion, null, 300, 400, 75, 95, 80, false],
    [COD.proyeccion, 'Z901', 150, 100, 150, 95, 0, true],
  ];

  async function cuentaDe(condicion) {
    const [[cuenta]] = await pool.query(
      `SELECT u.id, r.codigo AS rol, u.rol_id, e.ddriss_id, e.establecimiento_id, e.municipio_id
         FROM usuario u JOIN rol r ON r.id = u.rol_id JOIN empleado e ON e.id = u.empleado_id
        WHERE ${condicion} AND u.activo = TRUE AND e.activo = TRUE AND u.debe_cambiar_contrasena = FALSE
          AND u.nombre_usuario NOT LIKE 'vitest%' AND (e.ddriss_id IS NOT NULL OR r.codigo = 'AUTORIDAD')
        ORDER BY e.ddriss_id IS NULL DESC, u.id
        LIMIT 1`,
    );
    if (!cuenta) throw new Error(`No hay una cuenta activa con ${condicion} en la base de prueba`);
    const [permisos] = await pool.query(
      'SELECT p.codigo FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id WHERE rp.rol_id = ?',
      [cuenta.rol_id],
    );
    return {
      id: cuenta.id,
      token: await tokenDePrueba(cuenta.id, {
        rol: cuenta.rol, permisos: permisos.map((p) => p.codigo), ddrissId: cuenta.ddriss_id,
        establecimientoId: cuenta.establecimiento_id, municipioId: cuenta.municipio_id,
      }, { expiresIn: '10m' }),
    };
  }

  async function limpiar() {
    await (await coleccion()).deleteMany({ codigo: /^ZVT_HU72_/ });
    const corridas = 'SELECT c.id FROM corrida_calculo c JOIN ddriss d ON d.id = c.ddriss_id WHERE d.codigo = ?';
    await pool.query(
      `DELETE a FROM alerta a JOIN resultado_indicador ri ON ri.id = a.resultado_indicador_id
         WHERE ri.corrida_id IN (SELECT id FROM (${corridas}) t)`,
      [DDRISS_PRUEBA],
    );
    await pool.query(
      `DELETE FROM resultado_indicador WHERE corrida_id IN (SELECT id FROM (${corridas}) t)`, [DDRISS_PRUEBA],
    );
    await pool.query(`DELETE FROM corrida_calculo WHERE id IN (SELECT id FROM (${corridas}) t)`, [DDRISS_PRUEBA]);
    const redes = 'SELECT r.id FROM red r JOIN ddriss d ON d.id = r.ddriss_id WHERE d.codigo = ?';
    for (const tabla of ['red_municipio', 'red_trazadora']) {
      await pool.query(`DELETE FROM ${tabla} WHERE red_id IN (SELECT id FROM (${redes}) t)`, [DDRISS_PRUEBA]);
    }
    await pool.query(`DELETE FROM red WHERE id IN (SELECT id FROM (${redes}) t)`, [DDRISS_PRUEBA]);
    await pool.query("DELETE FROM distrito_salud WHERE codigo LIKE 'ZVT72\\_%'");
    await pool.query('DELETE FROM ddriss WHERE codigo = ?', [DDRISS_PRUEBA]);
    await pool.query(
      'DELETE m FROM municipio m JOIN departamento d ON d.id = m.departamento_id WHERE d.codigo_ine = ?',
      [DEPARTAMENTO_PRUEBA],
    );
    await pool.query('DELETE FROM departamento WHERE codigo_ine = ?', [DEPARTAMENTO_PRUEBA]);
  }

  async function preparar() {
    const [departamento] = await pool.query(
      "INSERT INTO departamento (codigo_ine, nombre) VALUES (?, 'vitest-hu72')", [DEPARTAMENTO_PRUEBA],
    );
    const [ddriss] = await pool.query(
      "INSERT INTO ddriss (codigo, nombre, departamento_id, activo) VALUES (?, 'vitest-hu72', ?, TRUE)",
      [DDRISS_PRUEBA, departamento.insertId],
    );
    ddrissId = ddriss.insertId;
    for (const ine of INES) {
      const [m] = await pool.query(
        'INSERT INTO municipio (departamento_id, codigo_ine, nombre, activo) VALUES (?, ?, ?, TRUE)',
        [departamento.insertId, ine, `vitest-hu72-${ine}`],
      );
      municipios[ine] = m.insertId;
    }
    const [red] = await pool.query(
      "INSERT INTO red (ddriss_id, codigo, nombre) VALUES (?, 'RED_01', 'vitest-hu72 Red A')", [ddrissId],
    );
    ids.red = red.insertId;
    await pool.query('INSERT INTO red_municipio (red_id, municipio_id) VALUES (?, ?), (?, ?)', [
      ids.red, municipios.Z901, ids.red, municipios.Z902,
    ]);
    await pool.query('INSERT INTO red_trazadora (red_id, dosis_id) VALUES (?, ?), (?, ?)', [
      ids.red, DOSIS.D3, ids.red, DOSIS.D1,
    ]);
    const [distrito] = await pool.query(
      `INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre)
       VALUES (?, ?, 'ZVT72_D1', 'vitest-hu72 D1')`,
      [ddrissId, municipios.Z903],
    );
    ids.distrito = distrito.insertId;

    await (await coleccion()).insertMany(INDICADORES);
    const [corrida] = await pool.query(
      `INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, motivo, estado, finalizada_en, vigente)
       VALUES (?, ?, ?, 'MANUAL', 'COMPLETADA', NOW(), TRUE)`,
      [ddrissId, ANIO, MES],
    );
    ids.corrida = corrida.insertId;
    await pool.query(
      `INSERT INTO resultado_indicador
         (corrida_id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, anio, mes, es_proyeccion,
          numerador, denominador, valor, meta, brecha_dosis, cumple_meta)
       VALUES ?`,
      [FILAS.map(([codigo, ine, ...resto]) => [
        corrida.insertId, codigo, 1, ine === null ? null : municipios[ine], VACUNA_ID, DOSIS.D3, ANIO, MES,
        codigo === COD.proyeccion, ...resto,
      ])],
    );
  }

  beforeAll(async () => {
    await obtenerDb();
    cuentas.nacional = await cuentaDe("r.codigo = 'AUTORIDAD' AND e.ddriss_id IS NULL");
    cuentas.epidemiologia = await cuentaDe("r.codigo = 'EPIDEMIOLOGIA'");
    cuentas.sinPermiso = await cuentaDe(`NOT EXISTS (
      SELECT 1 FROM rol_permiso rp JOIN permiso p ON p.id = rp.permiso_id
       WHERE rp.rol_id = u.rol_id AND p.codigo = 'INDICADOR_CONSULTAR')`);
    await limpiar();
    await preparar();
  }, 60000);

  afterAll(limpiar, 60000);

  const binario = (res, listo) => {
    const partes = [];
    res.on('data', (parte) => partes.push(parte));
    res.on('end', () => listo(null, Buffer.concat(partes)));
  };
  const descargar = (ruta, consulta, token = cuentas.nacional.token) => request(app)
    .get(`/api/v1/indicadores/${ruta}/excel?${consulta}`)
    .set('Authorization', `Bearer ${token}`)
    .buffer(true)
    .parse(binario);
  const json = (ruta, consulta, token = cuentas.nacional.token) => request(app)
    .get(`/api/v1/indicadores/${ruta}?${consulta}`)
    .set('Authorization', `Bearer ${token}`);
  const base = () => `anio=${ANIO}&mes=${MES}&ddrissId=${ddrissId}`;
  async function hojaDe(res) {
    const libro = new ExcelJS.Workbook();
    await libro.xlsx.load(res.body);
    return libro.worksheets[0];
  }
  // Las filas después de la de títulos de la tabla (la primera cuya columna A es «titulo»).
  function filasDespuesDe(hoja, titulo) {
    const titulos = filaQueEmpieza(hoja, titulo);
    const filas = [];
    for (let n = titulos.number + 1; n <= hoja.rowCount; n += 1) filas.push(hoja.getRow(n));
    return filas;
  }
  const nombreDe = (r) => (r.municipio ? r.municipio.nombre : r.red ? 'Total de la red' : 'Total de la DDRISS');

  async function filasExportar(desdeId, usuarioId = cuentas.nacional.id) {
    const [filas] = await pool.query(
      `SELECT modulo, entidad, entidad_id, valores_nuevos FROM bitacora
        WHERE id > ? AND usuario_id = ? AND accion = 'EXPORTAR' ORDER BY id`,
      [desdeId, usuarioId],
    );
    return filas.map((f) => ({
      ...f,
      valores_nuevos: typeof f.valores_nuevos === 'string' ? JSON.parse(f.valores_nuevos) : f.valores_nuevos,
    }));
  }
  const ultimaBitacora = async () => (await pool.query('SELECT COALESCE(MAX(id), 0) AS id FROM bitacora'))[0][0].id;

  // Las columnas que se comparan en cada pestaña: [número de columna, valor de la fila de la API, solo si calculable].
  const COMPARADAS = {
    cobertura: [[2, (r) => r.numerador], [3, (r) => r.denominador], [7, (r) => r.valor / 100, true]],
    avance: [[2, (r) => r.numerador], [3, (r) => r.denominador], [7, (r) => r.valor / 100, true]],
    brecha: [[2, (r) => r.numerador], [3, (r) => r.metaDosis, true], [5, (r) => r.brechaDosis, true]],
    desercion: [[2, (r) => r.denominador], [3, (r) => r.denominador - r.numerador], [4, (r) => r.numerador]],
    proyeccion: [[4, (r) => r.numerador], [5, (r) => r.denominador]],
  };

  it('cada número coincide con GET /indicadores/resultados en las cinco pestañas, con y sin red', async () => {
    const deLaRed = () => [municipios.Z901, municipios.Z902];
    for (const vista of Object.keys(COMPARADAS)) {
      for (const conRed of [false, true]) {
        const filtro = `indicador=${COD[vista]}${conRed ? `&redId=${ids.red}` : ''}`;
        const [archivo, pantalla] = await Promise.all([
          descargar('resultados', `${base()}&vista=${vista}&${filtro}`),
          json('resultados', `${base()}&${filtro}`),
        ]);
        expect(archivo.status, `${vista} ${filtro}`).toBe(200);
        // Lo que muestra la pantalla: la fila de total que corresponde y los municipios del recorte.
        const esperadas = pantalla.body.resultados.filter((r) => (r.municipio === null
          ? (conRed ? r.red?.id === ids.red : r.red === null)
          : !conRed || deLaRed().includes(r.municipio.id)));
        const filas = filasDespuesDe(await hojaDe(archivo), 'Municipio');
        const delArchivo = new Map(filas.map((f) => [f.getCell(1).value, f]));
        expect([...delArchivo.keys()].sort(), `${vista} ${filtro}`).toEqual(esperadas.map(nombreDe).sort());
        for (const r of esperadas) {
          for (const [columna, valor, soloCalculable] of COMPARADAS[vista]) {
            if (soloCalculable && !r.calculable) continue;
            expect(delArchivo.get(nombreDe(r)).getCell(columna).value, `${vista} ${filtro}: ${nombreDe(r)} ${columna}`)
              .toBeCloseTo(valor(r), 6);
          }
        }
      }
    }
   }, 60000);

  it('con distrito o con municipios trae el total de la DDRISS y esos municipios', async () => {
    const tabla = async (filtro) => {
      const res = await descargar('resultados', `${base()}&vista=cobertura&indicador=${COD.cobertura}&${filtro}`);
      expect(res.status, filtro).toBe(200);
      const hoja = await hojaDe(res);
      return {
        filas: filasDespuesDe(hoja, 'Municipio').map((f) => f.getCell(1).value),
        territorio: valorDe(hoja, 'Territorio'),
      };
    };
    expect(await tabla(`distritoId=${ids.distrito}`)).toEqual({
      filas: ['Total de la DDRISS', 'vitest-hu72-Z903'], territorio: 'vitest-hu72 D1',
    });
    expect(await tabla(`municipioIds=${municipios.Z902},${municipios.Z901}`)).toEqual({
      filas: ['Total de la DDRISS', 'vitest-hu72-Z901', 'vitest-hu72-Z902'],
      territorio: 'vitest-hu72-Z901, vitest-hu72-Z902',
    });
    // La red manda sobre el distrito, como en la pantalla.
    expect(await tabla(`redId=${ids.red}&distritoId=${ids.distrito}`)).toEqual({
      filas: ['Total de la red', 'vitest-hu72-Z901', 'vitest-hu72-Z902'], territorio: 'vitest-hu72 Red A',
    });
  });

  it('responde el libro con su tipo y el nombre del archivo, y la pestaña Redes trae sus trazadoras', async () => {
    const res = await descargar('resultados', `${base()}&vista=cobertura&indicador=${COD.cobertura}`);
    expect(res.headers['content-type']).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(res.headers['content-disposition'])
      .toBe(`attachment; filename="indicadores-cobertura-${COD.cobertura}-${ANIO}-07.xlsx"`);

    const redes = await descargar('resultados', `${base()}&vista=redes&redId=${ids.red}`);
    expect(redes.status).toBe(200);
    expect(redes.headers['content-disposition'])
      .toBe(`attachment; filename="indicadores-redes-red-${ids.red}-${ANIO}-07.xlsx"`);
    const hoja = await hojaDe(redes);
    expect(hoja.getCell('A1').value).toBe('Cobertura de la vitest-hu72 Red A');
    expect(avisosDe(hoja)).toContain(
      'Sin indicador de cobertura anual para: HEXA 1. Se configuran en Administración · Indicadores.',
    );
    const grupos = filaQueEmpieza(hoja, 'Municipio');
    expect(valores(hoja.getRow(grupos.number + 1)).slice(1)).toEqual(['HEXA 3', 'HEXA 1']);
    const celdas = new Map([2, 3, 4].map((n) => {
      const fila = hoja.getRow(grupos.number + n);
      return [fila.getCell(1).value, fila.getCell(2).value];
    }));
    // Red A: (60 + 30) de (100 + 100) = 45 %.
    expect(celdas).toEqual(new Map([['vitest-hu72-Z901', 0.6], ['vitest-hu72-Z902', 0.3], ['Total de la red', 0.45]]));
  });

  it('cada descarga correcta deja una fila EXPORTAR del módulo INDICADORES, sin cantidades', async () => {
    const desde = await ultimaBitacora();
    await descargar('resultados', `${base()}&vista=brecha&indicador=${COD.brecha}&municipioIds=${municipios.Z901}`);
    await descargar('resultados', `${base()}&vista=redes&redId=${ids.red}`);
    expect(await filasExportar(desde)).toEqual([
      {
        modulo: 'INDICADORES', entidad: 'indicador', entidad_id: COD.brecha,
        valores_nuevos: {
          formato: 'xlsx', vista: 'brecha', anio: ANIO, mes: MES, corridaId: ids.corrida, ddrissId, redId: null,
          distritoId: null, municipioIds: [municipios.Z901],
        },
      },
      {
        modulo: 'INDICADORES', entidad: 'indicador', entidad_id: `red-${ids.red}`,
        valores_nuevos: {
          formato: 'xlsx', vista: 'redes', anio: ANIO, mes: MES, corridaId: ids.corrida, ddrissId, redId: ids.red,
          distritoId: null, municipioIds: [],
        },
      },
    ]);
  });

  it('responde 400 o 404 sin dejar fila EXPORTAR', async () => {
    const desde = await ultimaBitacora();
    const cobertura = `vista=cobertura&indicador=${COD.cobertura}`;
    const casos = [
      [`${base()}&indicador=${COD.cobertura}`, 400, 'La vista es obligatoria.'],
      [`${base()}&vista=otra&indicador=${COD.cobertura}`, 400, null],
      [`${base()}&vista=cobertura`, 400, 'El indicador es obligatorio.'],
      [`${base()}&vista=brecha&indicador=${COD.cobertura}`, 400, 'El indicador no es de la pestaña elegida.'],
      [`${base()}&vista=cobertura&indicador=ZVT_HU72_NO`, 400, 'El indicador no está en la corrida.'],
      [`${base()}&vista=redes`, 400, 'La red es obligatoria en redes.'],
      [`${base()}&vista=redes&redId=${ids.red}&indicador=${COD.cobertura}`, 400,
        'Parámetro no permitido en redes: indicador.'],
      [`${base()}&${cobertura}&municipioId=1`, 400, 'Parámetro no permitido: municipioId.'],
      [`anio=${ANIO}&mes=8&ddrissId=${ddrissId}&${cobertura}`, 404, 'No hay indicadores calculados para ese mes.'],
      [`${base()}&vista=redes&redId=65000`, 404, 'La red no existe.'],
      [`${base()}&${cobertura}&distritoId=65000`, 404, 'El distrito de salud no existe.'],
    ];
    for (const [consulta, estado, mensaje] of casos) {
      const res = await json('resultados/excel', consulta);
      expect(res.status, consulta).toBe(estado);
      expect(res.body.error.codigo, consulta).toBe(estado === 400 ? 'ENTRADA_INVALIDA' : 'NO_ENCONTRADO');
      if (mensaje) expect(res.body.error.mensaje, consulta).toBe(mensaje);
    }
    expect(await filasExportar(desde)).toEqual([]);
  });

  it('un rol sin INDICADOR_CONSULTAR recibe 403 en las dos rutas', async () => {
    for (const ruta of ['resultados', 'produccion']) {
      const res = await json(`${ruta}/excel`, `anio=${ANIO}&mes=${MES}`, cuentas.sinPermiso.token);
      expect(res.status, ruta).toBe(403);
    }
  });

  it('producción: el archivo trae lo mismo que GET /indicadores/produccion y deja su fila EXPORTAR', async () => {
    const { token } = cuentas.epidemiologia;
    const opciones = await json('produccion/opciones', '', token);
    expect(opciones.status).toBe(200);
    const [mes] = opciones.body.meses;
    const vacuna = opciones.body.vacunas[0].codigo;
    const desde = await ultimaBitacora();
    for (const consulta of [
      `anio=${mes.anio}&mes=${mes.mes}`,
      `anio=${mes.anio}&mes=${mes.mes}&acumulado=false&agrupar=establecimiento&vacuna=${vacuna}`,
    ]) {
      const [archivo, pantalla] = await Promise.all([
        descargar('produccion', consulta, token), json('produccion', consulta, token),
      ]);
      expect(archivo.status, consulta).toBe(200);
      const p = pantalla.body;
      const hoja = await hojaDe(archivo);
      const porEstablecimiento = p.agrupar === 'establecimiento';
      const titulos = filaQueEmpieza(hoja, porEstablecimiento ? 'Establecimiento' : 'Municipio de aplicación');
      const fijas = porEstablecimiento ? 2 : 1;
      const cantidades = (f) => [
        ...(p.vacuna?.dosis ?? []).map((d) => f.porDosis.find((x) => x.dosisId === d.id)?.dosisTotal ?? 0),
        f.dosisPoblacionPropia, f.dosisOtrosMunicipios, f.dosisTotal,
      ];
      const deLaFila = (fila) => valores(fila).slice(fijas, fijas + cantidades(p.total).length);
      p.filas.forEach((f, i) => {
        expect(deLaFila(hoja.getRow(titulos.number + 1 + i)), `${consulta}: fila ${i}`).toEqual(cantidades(f));
      });
      const total = hoja.getRow(titulos.number + 1 + p.filas.length);
      expect(total.getCell(1).value, consulta).toBe('Total');
      expect(deLaFila(total), consulta).toEqual(cantidades(p.total));
      const corte = String(mes.mes).padStart(2, '0');
      const acumulado = consulta.includes('acumulado=false') ? '' : '-acumulado';
      expect(archivo.headers['content-disposition'])
        .toBe(`attachment; filename="indicadores-produccion-${mes.anio}-${corte}${acumulado}.xlsx"`);
    }
    const exportadas = await filasExportar(desde, cuentas.epidemiologia.id);
    expect(exportadas.map((f) => [f.modulo, f.entidad, f.entidad_id])).toEqual([
      ['INDICADORES', 'indicador', 'produccion'], ['INDICADORES', 'indicador', 'produccion'],
    ]);
    expect(exportadas[1].valores_nuevos).toMatchObject({
      formato: 'xlsx', anio: mes.anio, mes: mes.mes, acumulado: false, agrupar: 'establecimiento', vacuna,
      redId: null, distritoId: null, municipioIds: [], establecimientoIds: [],
    });
  });

  it('producción responde los mismos errores que GET /indicadores/produccion', async () => {
    const res = await json('produccion/excel', 'anio=2026&mes=8&distritoId=1&redId=1', cuentas.epidemiologia.token);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual({ codigo: 'ENTRADA_INVALIDA', mensaje: 'El distrito y la red no se combinan.' });
  });
});
