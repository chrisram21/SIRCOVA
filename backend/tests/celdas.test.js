import { describe, it, expect } from 'vitest';
import { celdasDelEsquema, claveCombinacion } from '../src/modulos/produccion/celdas.service.js';

// Los mismos casos de frontend/src/componentes/formulario/armarFormulario.test.js: cada uno espera las celdas
// ({dosis}|{claveCombinacion}) que dibuja el frontend. Un cambio en la regla va en los dos archivos.
const valor = (codigo, orden) => ({ codigo, etiqueta: codigo, orden, activo: true });
const dimensiones = [
  { codigo: 'grupo_edad', nombre: 'Grupo de edad', valores: [valor('MENOR_1', 1), valor('1_A_5', 4)] },
  { codigo: 'sexo', nombre: 'Sexo', valores: [valor('M', 1), valor('F', 2)] },
  { codigo: 'embarazo', nombre: 'Condición de embarazo', valores: [valor('EMBARAZADA', 1), valor('NO_EMBARAZADA', 2)] },
];
const general = (codigo) => ({ codigo, desagregacion: null });

const hexavalente = () => ({
  dosis: [general('D1'), general('D2'), general('D3')],
  desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
  secciones: [
    { grupoEdad: 'MENOR_1', dosis: ['D1', 'D2', 'D3'] },
    { grupoEdad: '1_A_5', dosis: ['D1', 'D2', 'D3'] },
  ],
});
const vph = () => ({
  dosis: [general('D1'), general('D2'), general('D3')],
  desagregacion: [{ dimension: 'sexo', valores: ['F', 'M'] }],
  secciones: [{ grupoEdad: null, dosis: ['D1', 'D2', 'D3'] }],
});
const claves = (contenido, codigosDosis = ['D1', 'D2', 'D3'], opciones = {}) =>
  [...celdasDelEsquema({ contenido, codigosDosis, dimensiones, ...opciones }).keys()].sort();
const cruce = (dosis, combinaciones) => dosis.flatMap((d) => combinaciones.map((c) => `${d}|${c}`)).sort();

it('Hexavalente v2: cada dosis en las dos secciones de edad', () => {
  expect(claves(hexavalente())).toEqual(cruce(['D1', 'D2', 'D3'], ['grupo_edad=MENOR_1', 'grupo_edad=1_A_5']));
});

it('VPH: una sección sin edad, por sexo', () => {
  expect(claves(vph())).toEqual(cruce(['D1', 'D2', 'D3'], ['sexo=M', 'sexo=F']));
});

it('BCG: sin desagregación, una celda con clave vacía', () => {
  const contenido = { dosis: [general('UNICA')], desagregacion: [], secciones: [{ grupoEdad: null, dosis: ['UNICA'] }] };
  const celdas = celdasDelEsquema({ contenido, codigosDosis: ['UNICA'], dimensiones });
  expect([...celdas.values()]).toEqual([{ dosisCodigo: 'UNICA', dimensiones: {}, claveCombinacion: '' }]);
});

it('una dosis con desagregación propia usa la suya, solo en sus secciones', () => {
  const contenido = hexavalente();
  contenido.dosis.push({ codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] });
  contenido.secciones[1].dosis.push('R1');
  expect(claves(contenido, ['D1', 'D2', 'D3', 'R1'])).toEqual(
    [...cruce(['D1', 'D2', 'D3'], ['grupo_edad=MENOR_1', 'grupo_edad=1_A_5']), 'R1|grupo_edad=1_A_5'].sort(),
  );
});

it('una dosis que no está en una sección no tiene celda en ella', () => {
  const contenido = hexavalente();
  contenido.secciones[1].dosis = ['D1', 'D2'];
  expect(claves(contenido)).toEqual(
    [...cruce(['D1', 'D2'], ['grupo_edad=MENOR_1', 'grupo_edad=1_A_5']), 'D3|grupo_edad=MENOR_1'].sort(),
  );
});

it('dos dimensiones además de la edad: el producto, con claves ordenadas por código', () => {
  const contenido = hexavalente();
  contenido.desagregacion = [
    { dimension: 'embarazo', valores: ['NO_EMBARAZADA', 'EMBARAZADA'] },
    { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
    { dimension: 'sexo', valores: ['F', 'M'] },
  ];
  const celdas = celdasDelEsquema({ contenido, codigosDosis: ['D1', 'D2', 'D3'], dimensiones });
  expect(celdas.size).toBe(3 * 8);
  expect(celdas.get('D1|embarazo=EMBARAZADA|grupo_edad=MENOR_1|sexo=F')).toEqual({
    dosisCodigo: 'D1',
    dimensiones: { grupo_edad: 'MENOR_1', sexo: 'F', embarazo: 'EMBARAZADA' },
    claveCombinacion: 'embarazo=EMBARAZADA|grupo_edad=MENOR_1|sexo=F',
  });
});

it('omite sin error un valor o una dimensión fuera del catálogo y una dosis que no es de la vacuna', () => {
  const contenido = vph();
  contenido.desagregacion = [
    { dimension: 'sexo', valores: ['F', 'X'] },
    { dimension: 'inexistente', valores: ['A'] },
  ];
  contenido.dosis.push(general('D9'));
  contenido.secciones[0].dosis.push('D9');
  expect(claves(contenido)).toEqual(cruce(['D1', 'D2', 'D3'], ['sexo=F']));
});

it('omite una dosis sin sección y una sección sin dosis', () => {
  const contenido = hexavalente();
  contenido.secciones[0].dosis = ['D1', 'D2'];
  contenido.secciones[1].dosis = [];
  expect(claves(contenido)).toEqual(cruce(['D1', 'D2'], ['grupo_edad=MENOR_1']));
});

it('un esquema sin secciones no tiene celdas', () => {
  const contenido = hexavalente();
  contenido.secciones = [];
  expect(claves(contenido)).toEqual([]);
});

describe('versión publicada sin secciones (anterior a la v0.4, como Hexavalente v1)', () => {
  const sinSecciones = (c) => ({ ...c, secciones: [] });
  const deducidas = (contenido, codigosDosis) => claves(contenido, codigosDosis, { deducirSecciones: true });

  it('deduce una sección por valor de grupo_edad, con las dosis que lo admiten', () => {
    const contenido = sinSecciones(hexavalente());
    contenido.desagregacion = [{ dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'] }];
    contenido.dosis.push({ codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] });
    expect(deducidas(contenido, ['D1', 'D2', 'D3', 'R1'])).toEqual(
      [...cruce(['D1', 'D2', 'D3'], ['grupo_edad=MENOR_1', 'grupo_edad=1_A_5']), 'R1|grupo_edad=1_A_5'].sort(),
    );
  });

  it('con un solo grupo de edad, una sección con todas las dosis', () => {
    const contenido = sinSecciones(hexavalente());
    contenido.desagregacion = [{ dimension: 'grupo_edad', valores: ['MENOR_1'] }];
    expect(deducidas(contenido)).toEqual(cruce(['D1', 'D2', 'D3'], ['grupo_edad=MENOR_1']));
  });

  it('sin grupo de edad, una sola sección', () => {
    expect(deducidas(sinSecciones(vph()))).toEqual(cruce(['D1', 'D2', 'D3'], ['sexo=M', 'sexo=F']));
  });

  it('sin deducirSecciones (un borrador) no las inventa', () => {
    expect(claves(sinSecciones(hexavalente()))).toEqual([]);
  });
});

it('el orden de las dosis en el esquema no cambia las celdas', () => {
  const contenido = vph();
  contenido.dosis.reverse();
  expect(claves(contenido)).toEqual(claves(vph()));
});

it('claveCombinacion ordena por código de dimensión', () => {
  expect(claveCombinacion({ sexo: 'F', grupo_edad: 'MENOR_1' })).toBe('grupo_edad=MENOR_1|sexo=F');
  expect(claveCombinacion({})).toBe('');
});
