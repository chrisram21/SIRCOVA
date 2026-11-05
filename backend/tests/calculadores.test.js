import { describe, it, expect } from 'vitest';
import {
  CALCULADORES, calcularContraMeta, calcularDesercion, colorDelValor, filtroCanonico, metaYExcedente,
  sumaBrechasMunicipales,
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
  it('calcula COBERTURA, AVANCE_META_MES y BRECHA con las mismas fórmulas, y DESERCION con la suya', () => {
    expect(Object.keys(CALCULADORES).sort()).toEqual(['AVANCE_META_MES', 'BRECHA', 'COBERTURA', 'DESERCION']);
    expect(CALCULADORES.BRECHA).toBe(calcularContraMeta);
    expect(CALCULADORES.DESERCION).toBe(calcularDesercion);
  });
});

describe('DESERCION', () => {
  const DES = { tipo_calculo: 'DESERCION', meta: { valor: 10, comparador: '<=' } };
  // filas: [municipioId, dosis iniciales, dosis finales]
  const desercion = (version, filas) => calcularDesercion({
    version,
    municipios: filas.map(([id]) => id),
    iniciales: new Map(filas.map(([id, inicial]) => [id, inicial])),
    finales: new Map(filas.map(([id, , final]) => [id, final])),
  });

  it('reproduce DES_HEXA1_3 de San Marcos en agosto de la semilla (D1 1051, D3 975)', () => {
    const [, fila] = desercion(DES, [[1, 1051, 975]]);

    expect(fila).toEqual({
      municipioId: 1, numerador: 76, denominador: 1051, valor: 7.2312, meta: 10, brechaDosis: null, cumpleMeta: true,
    });
  });

  it('sobre la meta no cumple y justo en la meta cumple con <=', () => {
    const [, sobre, justa] = desercion(DES, [[1, 100, 85], [2, 100, 90]]);

    expect(sobre).toMatchObject({ numerador: 15, valor: 15, cumpleMeta: false });
    expect(justa).toMatchObject({ numerador: 10, valor: 10, cumpleMeta: true });
  });

  it('con más dosis finales que iniciales el valor es negativo y cumple', () => {
    const [, fila] = desercion(DES, [[1, 40, 50]]);

    expect(fila).toEqual({
      municipioId: 1, numerador: -10, denominador: 40, valor: -25, meta: 10, brechaDosis: null, cumpleMeta: true,
    });
  });

  it('sin dosis iniciales la fila no es calculable, sin error', () => {
    const [, sinIniciales, sinNada] = desercion(DES, [[1, 0, 7], [2, 0, 0]]);

    expect(sinIniciales).toEqual({
      municipioId: 1, numerador: -7, denominador: 0, valor: null, meta: null, brechaDosis: null, cumpleMeta: null,
    });
    expect(sinNada).toMatchObject({ numerador: 0, denominador: 0, valor: null, cumpleMeta: null });
  });

  it('la departamental va primero y suma iniciales y finales; no se calcula solo sin iniciales en total', () => {
    const filas = desercion(DES, [[1, 100, 90], [2, 0, 5], [3, 50, 40]]);
    const [departamental] = filas;
    const [sinIniciales] = desercion(DES, [[1, 0, 3], [2, 0, 0]]);

    expect(filas.map((f) => f.municipioId)).toEqual([null, 1, 2, 3]);
    expect(departamental).toEqual({
      municipioId: null, numerador: 15, denominador: 150, valor: 10, meta: 10, brechaDosis: null, cumpleMeta: true,
    });
    expect(sinIniciales).toMatchObject({ municipioId: null, numerador: -3, valor: null, cumpleMeta: null });
  });

  it('no usa población: un municipio sin dosis cuenta 0 y la fila se calcula con lo que tiene', () => {
    const [departamental, conDosis, sinDatos] = calcularDesercion({
      version: DES, municipios: [1, 2], iniciales: new Map([[1, 20]]), finales: new Map([[1, 18]]),
    });

    expect(conDosis).toMatchObject({ valor: 10, cumpleMeta: true });
    expect(sinDatos).toMatchObject({ numerador: 0, denominador: 0, valor: null });
    expect(departamental).toMatchObject({ numerador: 2, denominador: 20, valor: 10 });
  });

  it('usa la meta y el comparador de la versión, y los del tipo si faltan', () => {
    const [, propia] = desercion({ tipo_calculo: 'DESERCION', meta: { valor: 5, comparador: '<' } }, [[1, 100, 95]]);
    const [, porDefecto] = desercion({ tipo_calculo: 'DESERCION' }, [[1, 100, 90]]);

    expect(propia).toMatchObject({ valor: 5, meta: 5, cumpleMeta: false });
    expect(porDefecto).toMatchObject({ valor: 10, meta: 10, cumpleMeta: true });
  });

  it('la fila no tiene brecha, así que la meta en dosis y el excedente son null', () => {
    const [, fila] = desercion(DES, [[1, 1051, 975]]);

    expect(metaYExcedente(fila)).toEqual({ metaDosis: null, excedenteDosis: null });
  });
});

describe('BRECHA, meta en dosis y excedente', () => {
  const brecha = (prorrateo = 'NINGUNO', valor = 95) => ({
    tipo_calculo: 'BRECHA', denominador: { prorrateo }, meta: { valor, comparador: '>' },
  });
  const conDosis = (fila) => ({ ...fila, ...metaYExcedente(fila) });
  const cuadra = (f) => f.metaDosis - f.numerador === f.brechaDosis - f.excedenteDosis;

  it('reproduce BRECHA_HEXA3 de San Marcos en agosto de la semilla (975 de 1,450)', () => {
    const [, fila] = calcular(brecha(), 8, [[1, 975, 1450]]);

    expect(conDosis(fila)).toMatchObject({
      denominador: 1450, valor: 67.2414, meta: 95, brechaDosis: 403, cumpleMeta: false, metaDosis: 1378, excedenteDosis: 0,
    });
  });

  it('con la meta superada la brecha es 0 y el excedente es lo que pasa de la meta en dosis', () => {
    const [, fila] = calcular(AVANCE, 6, [[1, 300, 541]]);

    expect(conDosis(fila)).toMatchObject({ denominador: 270.5, brechaDosis: 0, metaDosis: 271, excedenteDosis: 29 });
  });

  it('con la meta justa la brecha y el excedente son 0', () => {
    const [, fila] = calcular(AVANCE, 12, [[1, 100, 100]]);

    expect(conDosis(fila)).toMatchObject({ brechaDosis: 0, metaDosis: 100, excedenteDosis: 0 });
  });

  it('el redondeo a 6 decimales quita el error de coma flotante (0,07 × 100 = 7,000…01)', () => {
    const fila = conDosis({ numerador: 50, denominador: 100, meta: 7, brechaDosis: 0 });

    expect(fila).toMatchObject({ metaDosis: 7, excedenteDosis: 43 });
  });

  it('con el denominador guardado redondeado, la meta en dosis no pasa del numerador si no falta nada', () => {
    const fila = conDosis({ numerador: 10, denominador: 10.01, meta: 100, brechaDosis: 0 });

    expect(fila).toMatchObject({ metaDosis: 10, excedenteDosis: 0 });
    expect(cuadra(fila)).toBe(true);
  });

  it('NINGUNO compara con la población anual y MENSUAL_LINEAL con la del mes', () => {
    const [, anual] = calcular(brecha('NINGUNO'), 8, [[1, 975, 1450]]);
    const [, mensual] = calcular(brecha('MENSUAL_LINEAL'), 8, [[1, 975, 1450]]);

    expect(conDosis(anual)).toMatchObject({ brechaDosis: 403, metaDosis: 1378, excedenteDosis: 0 });
    expect(conDosis(mensual)).toMatchObject({ denominador: 966.67, brechaDosis: 0, metaDosis: 919, excedenteDosis: 56 });
  });

  it('sin población la meta en dosis, el excedente y la suma municipal son null', () => {
    const [departamental, , sinPoblacion] = calcular(brecha(), 6, [[1, 270, 541], [2, 40, null]]);

    expect(metaYExcedente(sinPoblacion)).toEqual({ metaDosis: null, excedenteDosis: null });
    expect(metaYExcedente(departamental)).toEqual({ metaDosis: null, excedenteDosis: null });
    expect(sumaBrechasMunicipales(departamental, [sinPoblacion])).toBeNull();
  });

  it('la suma municipal no descuenta los excedentes y difiere de la brecha departamental', () => {
    const [departamental, ...municipales] = calcular(AVANCE, 6, [[1, 300, 541], [2, 10, 59], [3, 0, 600]]);

    expect(municipales.map((f) => f.brechaDosis)).toEqual([0, 20, 300]);
    expect(departamental.brechaDosis).toBe(290);
    expect(sumaBrechasMunicipales(departamental, municipales)).toBe(320);
    expect([departamental, ...municipales].map(conDosis).every(cuadra)).toBe(true);
  });

  it('un municipio con población 0 no suma a la brecha municipal', () => {
    const resultado = calcularContraMeta({
      version: brecha(), mesHasta: 3, municipios: [1, 2], numeradores: new Map([[1, 50]]), poblaciones: new Map([[1, 100], [2, 0]]),
    });

    expect(resultado[2].brechaDosis).toBeNull();
    expect(sumaBrechasMunicipales(resultado[0], resultado.slice(1))).toBe(45);
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

  it.each([[-25, 'verde'], [10, 'verde'], [10.1, 'amarillo'], [15, 'amarillo'], [15.1, 'rojo']])(
    'descendente (DESERCION): %s → %s',
    (valor, color) => expect(colorDelValor(descendente, valor, 'DESERCION')).toBe(color),
  );

  it('sin valor o sin umbrales es null', () => {
    expect(colorDelValor(ascendente, null, 'COBERTURA')).toBeNull();
    expect(colorDelValor([], 50, 'COBERTURA')).toBeNull();
    expect(colorDelValor(undefined, 50, 'COBERTURA')).toBeNull();
  });
});
