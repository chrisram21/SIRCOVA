import { describe, it, expect } from 'vitest';
import {
  CALCULADORES, calcularContraMeta, colorDelValor, filtroCanonico,
} from '../src/modulos/indicadores/calculadores.js';

// Las fórmulas son puras: cada caso arma la versión, los numeradores y las poblaciones en memoria, sin base.
const AVANCE = { tipo_calculo: 'AVANCE_META_MES', denominador: { prorrateo: 'MENSUAL_LINEAL' }, meta: { valor: 100, comparador: '>=' } };
const cobertura = (prorrateo, valor = 95) => ({
  tipo_calculo: 'COBERTURA', denominador: { prorrateo }, meta: { valor, comparador: '>' },
});
const calcular = (version, mesHasta, filas) => calcularContraMeta({
  version,
  mesHasta,
  municipios: filas.map(([id]) => id),
  numeradores: new Map(filas.map(([id, numerador]) => [id, numerador])),
  poblaciones: new Map(filas.filter(([, , poblacion]) => poblacion != null).map(([id, , poblacion]) => [id, poblacion])),
});

describe('calcularContraMeta', () => {
  it('el ejemplo de la historia: 541 de población en junio da 270,50 de meta del mes', () => {
    const [, fila] = calcular(AVANCE, 6, [[1, 270, 541]]);

    expect(fila).toEqual({
      municipioId: 1, numerador: 270, denominador: 270.5, valor: 99.8152, meta: 100, brechaDosis: 1, cumpleMeta: false,
    });
  });

  it('reproduce COB_HEXA3 y AVANCE_HEXA3 de San Marcos en agosto de la semilla (975 / 966,67)', () => {
    const [, cob] = calcular(cobertura('MENSUAL_LINEAL'), 8, [[1, 975, 1450]]);
    const [, avance] = calcular(AVANCE, 8, [[2, 1062, 1620]]);

    expect(cob).toMatchObject({ denominador: 966.67, valor: 100.8621, meta: 95, brechaDosis: 0, cumpleMeta: true });
    expect(avance).toMatchObject({ denominador: 1080, valor: 98.3333, meta: 100, brechaDosis: 18, cumpleMeta: false });
  });

  it('con NINGUNO el denominador es la población anual, con MENSUAL_LINEAL la del mes', () => {
    const [, anual] = calcular(cobertura('NINGUNO'), 8, [[1, 975, 1450]]);
    const [, mensual] = calcular(cobertura('MENSUAL_LINEAL'), 8, [[1, 975, 1450]]);

    expect(anual).toMatchObject({ denominador: 1450, valor: 67.2414, brechaDosis: 403, cumpleMeta: false });
    expect(mensual.denominador).toBe(966.67);
  });

  it('la brecha sube al entero y es 0 si se superó la meta', () => {
    const [, falta] = calcular(cobertura('MENSUAL_LINEAL'), 8, [[3, 325, 520]]);
    const [, sobra] = calcular(AVANCE, 6, [[1, 300, 541]]);
    const [, justa] = calcular(AVANCE, 12, [[1, 100, 100]]);

    expect(falta).toMatchObject({ denominador: 346.67, valor: 93.75, brechaDosis: 5 });
    expect(sobra).toMatchObject({ brechaDosis: 0, cumpleMeta: true });
    expect(justa).toMatchObject({ valor: 100, brechaDosis: 0, cumpleMeta: true });
  });

  it('el comparador de la versión decide si cumple', () => {
    const exacta = (comparador) => calcular(
      { tipo_calculo: 'COBERTURA', denominador: { prorrateo: 'NINGUNO' }, meta: { valor: 50, comparador } }, 1, [[1, 50, 100]],
    )[1].cumpleMeta;

    expect(exacta('>')).toBe(false);
    expect(exacta('>=')).toBe(true);
    expect(exacta('<')).toBe(false);
    expect(exacta('<=')).toBe(true);
  });

  it('sin población la fila guarda el numerador y la departamental tampoco se calcula', () => {
    const [departamental, conPoblacion, sinPoblacion] = calcular(AVANCE, 6, [[1, 270, 541], [2, 40, null]]);

    expect(conPoblacion.valor).toBe(99.8152);
    expect(sinPoblacion).toEqual({
      municipioId: 2, numerador: 40, denominador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null,
    });
    expect(departamental).toEqual({
      municipioId: null, numerador: 310, denominador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null,
    });
  });

  it('la departamental va primero y suma numeradores y poblaciones', () => {
    const filas = calcular(AVANCE, 6, [[1, 270, 541], [2, 30, 59], [3, 0, 600]]);

    expect(filas.map((f) => f.municipioId)).toEqual([null, 1, 2, 3]);
    expect(filas[0]).toMatchObject({ numerador: 300, denominador: 600, valor: 50, brechaDosis: 300, cumpleMeta: false });
    expect(filas[3]).toMatchObject({ numerador: 0, valor: 0, brechaDosis: 300 });
  });

  it('un municipio sin dosis cuenta 0 y una población de 0 no es calculable', () => {
    const resultado = calcularContraMeta({
      version: AVANCE, mesHasta: 3, municipios: [1, 2], numeradores: new Map(), poblaciones: new Map([[1, 120], [2, 0]]),
    });

    expect(resultado[1]).toMatchObject({ numerador: 0, denominador: 30, valor: 0, brechaDosis: 30 });
    expect(resultado[2]).toMatchObject({ numerador: 0, denominador: 0, valor: null, cumpleMeta: null });
  });

  it('en AVANCE_META_MES el prorrateo y la meta son siempre los del tipo', () => {
    const [, fila] = calcular({ tipo_calculo: 'AVANCE_META_MES', denominador: { prorrateo: 'NINGUNO' } }, 6, [[1, 270, 541]]);

    expect(fila).toMatchObject({ denominador: 270.5, meta: 100, cumpleMeta: false });
  });
});

describe('CALCULADORES', () => {
  it('solo calcula COBERTURA y AVANCE_META_MES', () => {
    expect(Object.keys(CALCULADORES).sort()).toEqual(['AVANCE_META_MES', 'COBERTURA']);
  });
});

describe('filtroCanonico', () => {
  it.each([
    [undefined, ''],
    [{}, ''],
    [{ grupo_edad: ['MENOR_1'] }, 'grupo_edad=MENOR_1'],
    [{ sexo: ['F', 'M'], grupo_edad: ['MENOR_1'] }, 'grupo_edad=MENOR_1|sexo=F,M'],
    [{ grupo_edad: ['1_A_5', 'MENOR_1'], sexo: [] }, 'grupo_edad=1_A_5,MENOR_1'],
  ])('%j → %j', (filtros, esperado) => {
    expect(filtroCanonico(filtros)).toBe(esperado);
  });
});

describe('colorDelValor', () => {
  const ascendente = [
    { color: 'verde', desde: 90, hasta: null },
    { color: 'amarillo', desde: 80, hasta: 90 },
    { color: 'rojo', desde: 0, hasta: 80 },
  ];
  const descendente = [
    { color: 'verde', desde: null, hasta: 10 },
    { color: 'amarillo', desde: 10, hasta: 15 },
    { color: 'rojo', desde: 15, hasta: null },
  ];

  it.each([[79.9, 'rojo'], [80, 'amarillo'], [89.99, 'amarillo'], [90, 'verde'], [120, 'verde']])(
    'ascendente: %s → %s',
    (valor, color) => expect(colorDelValor(ascendente, valor, 'COBERTURA')).toBe(color),
  );

  it.each([[10, 'verde'], [10.1, 'amarillo'], [15, 'amarillo'], [15.1, 'rojo']])(
    'descendente (DESERCION): %s → %s',
    (valor, color) => expect(colorDelValor(descendente, valor, 'DESERCION')).toBe(color),
  );

  it('sin valor o sin umbrales es null', () => {
    expect(colorDelValor(ascendente, null, 'COBERTURA')).toBeNull();
    expect(colorDelValor([], 50, 'COBERTURA')).toBeNull();
    expect(colorDelValor(undefined, 50, 'COBERTURA')).toBeNull();
  });
});
