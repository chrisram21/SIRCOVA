import { describe, it, expect, vi, afterEach } from 'vitest';
import { celdasDelEsquema } from '../src/modulos/produccion/celdas.service.js';
import { armarMensaje, ejecutarReglas } from '../src/modulos/produccion/validadores.js';

// Los validadores son puros: cada caso arma el reporte en memoria, sin base.
const PROPIO = 10;
const VECINO = 11;
const OTRO_DEPTO = 99;

const valor = (codigo) => ({ codigo, etiqueta: codigo, activo: true });
const dimensiones = [
  { codigo: 'grupo_edad', valores: [valor('MENOR_1'), valor('1_A_5')] },
  { codigo: 'sexo', valores: [valor('M'), valor('F')] },
];

// Hexavalente con dos secciones de edad y sexo: 3 dosis × 2 secciones × 2 sexos = 12 celdas.
const contenido = {
  dosis: ['D1', 'D2', 'D3', 'R1'].map((codigo) => ({ codigo, desagregacion: null })),
  desagregacion: [
    { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
    { dimension: 'sexo', valores: ['M', 'F'] },
  ],
  secciones: [
    { grupoEdad: 'MENOR_1', dosis: ['D1', 'D2', 'D3'] },
    { grupoEdad: '1_A_5', dosis: ['D1', 'D2', 'D3', 'R1'] },
  ],
};
const dosis = [
  { codigo: 'D1', etiqueta: '1.ª dosis', activa: true },
  { codigo: 'D2', etiqueta: '2.ª dosis', activa: true },
  { codigo: 'D3', etiqueta: '3.ª dosis', activa: true },
  { codigo: 'R1', etiqueta: '1.er refuerzo', activa: true },
];
const validas = (codigosDosis = dosis.map((d) => d.codigo)) => celdasDelEsquema({ contenido, codigosDosis, dimensiones });

let siguienteId = 1;
const celda = (dosisCodigo, edad, sexo, cantidad, municipio = PROPIO) => ({
  id: siguienteId++,
  dosisCodigo,
  municipioProcedenciaId: municipio,
  dimensiones: { grupo_edad: edad, sexo },
  claveCombinacion: `grupo_edad=${edad}|sexo=${sexo}`,
  cantidad,
});
// Todas las celdas de la tarjeta A llenas con la misma cantidad.
const tarjetaA = (cantidad = 5) =>
  [...validas().values()].map((c) => celda(c.dosisCodigo, c.dimensiones.grupo_edad, c.dimensiones.sexo, cantidad));

const vacuna = (cambios = {}) => ({
  reporteVacunaId: 7,
  vacuna: { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' },
  version: 2,
  dosis,
  secciones: [
    { grupoEdad: 'MENOR_1', titulo: '< 1 año' },
    { grupoEdad: '1_A_5', titulo: 'De 1 a < 6 años' },
  ],
  validas: validas(),
  celdas: tarjetaA(),
  camposAdicionales: [],
  datosAdicionales: null,
  permitidas: [VECINO],
  historial: [],
  ...cambios,
});
const reporte = (vacunas, cambios = {}) => ({
  establecimiento: 'Centro de Salud Prueba',
  periodo: 'septiembre de 2026',
  otrosReportes: 0,
  municipioPropioId: PROPIO,
  municipios: new Map([[VECINO, 'Sibinal'], [OTRO_DEPTO, 'Coatepeque']]),
  vacunas,
  ...cambios,
});
const regla = (tipo, parametros = {}, cambios = {}) => ({
  codigo: `ZVT_${tipo}`,
  version: 1,
  nombre: `Regla ${tipo}`,
  tipo,
  severidad: 'ERROR',
  vacunas: ['*'],
  parametros,
  mensaje: '{vacuna} {dosis}',
  ...cambios,
});
const correr = (r, v = vacuna(), rep = {}) => ejecutarReglas([r], reporte([v], rep));

afterEach(() => vi.restoreAllMocks());

describe('CAMPOS_COMPLETOS', () => {
  const completos = (cero = true) =>
    regla('CAMPOS_COMPLETOS', { cero_explicito: cero }, { mensaje: 'Faltan valores en {vacuna}: {n_faltantes} combinaciones sin registrar.' });

  it('sin casillas vacías no hay resultado', () => {
    expect(correr(completos())).toEqual([]);
  });

  it('una casilla vacía de la tarjeta A da un resultado con su celda', () => {
    const celdas = tarjetaA().filter((c) => !(c.dosisCodigo === 'D3' && c.claveCombinacion === 'grupo_edad=MENOR_1|sexo=F'));
    const [resultado] = correr(completos(), vacuna({ celdas }));
    expect(resultado.mensaje).toBe('Faltan valores en Hexavalente: 1 combinaciones sin registrar.');
    expect(resultado.celdas).toEqual([{ municipioId: PROPIO, dosis: 'D3', claveCombinacion: 'grupo_edad=MENOR_1|sexo=F' }]);
    expect(resultado).toMatchObject({ reporteVacunaId: 7, detalleId: null, dosis: null, campos: [] });
  });

  it('en la tarjeta B cuenta las celdas vacías de una fila guardada, no las combinaciones sin fila', () => {
    const celdas = [...tarjetaA(), celda('D1', 'MENOR_1', 'M', 2, VECINO)];
    const [resultado] = correr(completos(), vacuna({ celdas }));
    expect(resultado.celdas).toEqual([{ municipioId: VECINO, dosis: 'D1', claveCombinacion: 'grupo_edad=MENOR_1|sexo=F' }]);
  });

  it('un campo adicional requerido sin valor cuenta; uno opcional no', () => {
    const camposAdicionales = [
      { clave: 'frascos', requerido: true },
      { clave: 'nota', requerido: false },
      { clave: 'lote_ok', requerido: true },
    ];
    const [resultado] = correr(completos(), vacuna({ camposAdicionales, datosAdicionales: { lote_ok: false } }));
    expect(resultado.campos).toEqual(['frascos']);
    expect(resultado.mensaje).toContain(': 1 combinaciones');
  });

  it('con cero_explicito false solo revisa los campos adicionales', () => {
    expect(correr(completos(false), vacuna({ celdas: [] }))).toEqual([]);
    const [resultado] = correr(completos(false), vacuna({ celdas: [], camposAdicionales: [{ clave: 'frascos', requerido: true }] }));
    expect(resultado).toMatchObject({ celdas: [], campos: ['frascos'] });
  });

  it('una dosis inactiva sin filas no se exige', () => {
    const inactiva = dosis.map((d) => (d.codigo === 'R1' ? { ...d, activa: false } : d));
    const celdas = tarjetaA().filter((c) => c.dosisCodigo !== 'R1');
    expect(correr(completos(), vacuna({ dosis: inactiva, celdas }))).toEqual([]);
  });
});

describe('RANGO', () => {
  const rango = regla('RANGO', { minimo: 0, maximo: 5 }, { mensaje: '{vacuna} {dosis}: {valor} fuera de {minimo} a {maximo}.' });

  it('igual al máximo no es resultado; uno más sí, con su celda y su dosis', () => {
    const celdas = tarjetaA(5);
    expect(correr(rango, vacuna({ celdas }))).toEqual([]);
    celdas[0].cantidad = 6;
    const resultados = correr(rango, vacuna({ celdas }));
    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({
      detalleId: celdas[0].id,
      dosis: { codigo: 'D1', etiqueta: '1.ª dosis' },
      mensaje: 'Hexavalente 1.ª dosis: 6 fuera de 0 a 5.',
    });
  });
});

describe('TOTAL_CUADRA', () => {
  const total = (tolerancia) =>
    regla('TOTAL_CUADRA', { tolerancia }, { mensaje: 'El total declarado de {vacuna} ({total}) no coincide con la suma del detalle ({suma}).' });
  const conCampo = (valorTotal) =>
    vacuna({ camposAdicionales: [{ clave: 'total_dosis_declarado', requerido: true }], datosAdicionales: { total_dosis_declarado: valorTotal } });

  it('compara total_dosis_declarado con la suma del detalle, con tolerancia', () => {
    // 14 celdas de 5 = 70.
    expect(correr(total(0), conCampo(70))).toEqual([]);
    expect(correr(total(2), conCampo(72))).toEqual([]);
    const [resultado] = correr(total(2), conCampo(73));
    expect(resultado).toMatchObject({
      mensaje: 'El total declarado de Hexavalente (73) no coincide con la suma del detalle (70).',
      campos: ['total_dosis_declarado'],
    });
  });

  it('sin el campo o sin valor no hay resultado', () => {
    expect(correr(total(0), vacuna())).toEqual([]);
    expect(correr(total(0), conCampo(null))).toEqual([]);
  });
});

describe('SECUENCIA_DOSIS', () => {
  const secuencia = regla(
    'SECUENCIA_DOSIS',
    { exceso_permitido_pct: 20 },
    { severidad: 'ADVERTENCIA', mensaje: '{dosis_posterior} de {vacuna} supera a {dosis_anterior} en más de {exceso_permitido_pct} %.' },
  );
  const conCantidades = (cantidades) =>
    tarjetaA().map((c) => ({ ...c, cantidad: cantidades[`${c.dosisCodigo}|${c.dimensiones.grupo_edad}`] ?? 5 }));

  it('compara dosis consecutivas por sección y antepone la sección', () => {
    // < 1 año: D1 = 10 (5 + 5), D2 = 2 × 6 = 12 (en el límite del 20 %), D3 = 2 × 8 = 16 (supera a D2).
    const celdas = conCantidades({ 'D2|MENOR_1': 6, 'D3|MENOR_1': 8 });
    const resultados = correr(secuencia, vacuna({ celdas }));
    expect(resultados).toHaveLength(1);
    expect(resultados[0].mensaje).toBe('< 1 año: 3.ª dosis de Hexavalente supera a 2.ª dosis en más de 20 %.');
    expect(resultados[0].celdas.map((c) => c.claveCombinacion).sort()).toEqual([
      'grupo_edad=MENOR_1|sexo=F',
      'grupo_edad=MENOR_1|sexo=M',
    ]);
    expect(resultados[0].celdas.every((c) => c.dosis === 'D3')).toBe(true);
  });

  it('el mismo par en dos secciones da dos mensajes distintos', () => {
    const celdas = conCantidades({ 'D2|MENOR_1': 9, 'D2|1_A_5': 9 });
    expect(correr(secuencia, vacuna({ celdas })).map((r) => r.mensaje)).toEqual([
      '< 1 año: 2.ª dosis de Hexavalente supera a 1.ª dosis en más de 20 %.',
      'De 1 a < 6 años: 2.ª dosis de Hexavalente supera a 1.ª dosis en más de 20 %.',
    ]);
  });

  it('con una sola sección no antepone nada', () => {
    const celdas = conCantidades({ 'D2|MENOR_1': 9 });
    const [resultado] = correr(secuencia, vacuna({ celdas, secciones: [{ grupoEdad: 'MENOR_1', titulo: '< 1 año' }] }));
    expect(resultado.mensaje).toBe('2.ª dosis de Hexavalente supera a 1.ª dosis en más de 20 %.');
  });

  it('no cuenta los refuerzos ni las dosis inactivas', () => {
    expect(correr(secuencia, vacuna({ celdas: conCantidades({ 'R1|1_A_5': 50 }) }))).toEqual([]);
    const sinD2 = dosis.map((d) => (d.codigo === 'D2' ? { ...d, activa: false } : d));
    // Sin D2, el par es D1 → D3: D3 = 6 + 6 = 12 no supera 10 × 1.2.
    expect(correr(secuencia, vacuna({ dosis: sinD2, celdas: conCantidades({ 'D2|MENOR_1': 50, 'D3|MENOR_1': 6 }) }))).toEqual([]);
  });

  it('suma las procedencias', () => {
    const celdas = [...tarjetaA(), celda('D2', 'MENOR_1', 'M', 3, VECINO)];
    expect(correr(secuencia, vacuna({ celdas }))).toHaveLength(1);
  });
});

describe('VARIACION_HISTORICA', () => {
  const variacion = regla(
    'VARIACION_HISTORICA',
    { meses_referencia: 3, variacion_max_pct: 50, minimo_dosis: 10 },
    { severidad: 'ADVERTENCIA', mensaje: 'La producción de {vacuna} varía {variacion} % respecto al promedio de los últimos {meses_referencia} meses.' },
  );

  // Los totales de los meses 1, 2, 3… atrás.
  const meses = (totales) => totales.map((total, i) => ({ atras: i + 1, total }));

  it('sobre el umbral da un resultado con la variación sin signo', () => {
    // El mes suma 70; el promedio de 30, 40 y 50 es 40: varía 75 %.
    const [resultado] = correr(variacion, vacuna({ historial: meses([30, 40, 50]) }));
    expect(resultado.mensaje).toBe('La producción de Hexavalente varía 75 % respecto al promedio de los últimos 3 meses.');
    expect(resultado.celdas).toEqual([]);
  });

  it('bajo el umbral, sin historial o bajo minimo_dosis no hay resultado', () => {
    expect(correr(variacion, vacuna({ historial: meses([60, 70, 80]) }))).toEqual([]);
    expect(correr(variacion, vacuna({ historial: [] }))).toEqual([]);
    expect(correr(variacion, vacuna({ celdas: [celda('D1', 'MENOR_1', 'M', 4)], historial: meses([1, 2]) }))).toEqual([]);
  });

  it('usa solo los meses calendario de referencia, aunque falte alguno', () => {
    expect(correr(variacion, vacuna({ historial: meses([70, 70, 70, 1]) }))).toEqual([]);
    // Sin datos 2 y 3 meses atrás, solo cuenta el anterior (70): el de 4 meses atrás no entra.
    expect(correr(variacion, vacuna({ historial: [{ atras: 1, total: 70 }, { atras: 4, total: 1 }] }))).toEqual([]);
    expect(correr(variacion, vacuna({ historial: [{ atras: 4, total: 1 }] }))).toEqual([]);
  });
});

describe('validadores de una celda', () => {
  it('DIMENSIONES_VALIDAS marca una celda que no es del esquema o cuya clave no cuadra', () => {
    const fuera = celda('D1', 'MENOR_1', 'X', 1);
    const descuadrada = { ...celda('D2', 'MENOR_1', 'M', 1), claveCombinacion: 'grupo_edad=MENOR_1|sexo=F' };
    const resultados = correr(regla('DIMENSIONES_VALIDAS', {}, { mensaje: '{vacuna} {dosis} no es de la versión {version}.' }), vacuna({ celdas: [...tarjetaA(), fuera, descuadrada] }));
    expect(resultados.map((r) => r.detalleId)).toEqual([fuera.id, descuadrada.id]);
    expect(resultados[0].mensaje).toBe('Hexavalente 1.ª dosis no es de la versión 2.');
  });

  it('PROCEDENCIA_VALIDA marca una procedencia que ya no se permite, con su nombre', () => {
    const heredada = celda('D1', 'MENOR_1', 'M', 1, OTRO_DEPTO);
    const celdas = [...tarjetaA(), celda('D1', 'MENOR_1', 'M', 1, VECINO), heredada];
    const resultados = correr(regla('PROCEDENCIA_VALIDA', {}, { mensaje: '{vacuna} {dosis}: {municipio}.' }), vacuna({ celdas }));
    expect(resultados).toHaveLength(1);
    expect(resultados[0]).toMatchObject({ detalleId: heredada.id, mensaje: 'Hexavalente 1.ª dosis: Coatepeque.' });
  });

  it('NO_NEGATIVO marca una cantidad negativa', () => {
    const negativa = celda('D1', 'MENOR_1', 'M', -1);
    expect(correr(regla('NO_NEGATIVO'), vacuna({ celdas: [negativa] })).map((r) => r.detalleId)).toEqual([negativa.id]);
    expect(correr(regla('NO_NEGATIVO'))).toEqual([]);
  });
});

describe('SIN_DUPLICADOS', () => {
  const duplicados = regla('SIN_DUPLICADOS', {}, { mensaje: 'Ya hay un reporte de {establecimiento} para {periodo}.' });

  it('otro reporte del mismo establecimiento y mes da un resultado del reporte', () => {
    const [resultado] = correr(duplicados, vacuna(), { otrosReportes: 1 });
    expect(resultado).toMatchObject({
      vacuna: null,
      reporteVacunaId: null,
      mensaje: 'Ya hay un reporte de Centro de Salud Prueba para septiembre de 2026.',
    });
  });

  it('celdas repetidas dan un solo resultado con ellas', () => {
    const repetida = celda('D1', 'MENOR_1', 'M', 1);
    const resultados = correr(duplicados, vacuna({ celdas: [...tarjetaA(), repetida] }));
    expect(resultados).toHaveLength(1);
    expect(resultados[0].celdas).toEqual([{ municipioId: PROPIO, dosis: 'D1', claveCombinacion: 'grupo_edad=MENOR_1|sexo=M' }]);
  });

  it('sin duplicados no hay resultado', () => {
    expect(correr(duplicados)).toEqual([]);
  });
});

describe('ejecutarReglas', () => {
  it('solo ejecuta las reglas que aplican a la vacuna', () => {
    expect(correr(regla('NO_NEGATIVO', {}, { vacunas: ['BCG'] }), vacuna({ celdas: [celda('D1', 'MENOR_1', 'M', -1)] }))).toEqual([]);
  });

  it('salta un tipo desconocido sin fallar', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(correr(regla('INVENTADO'))).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });

  it('ordena los errores primero, luego por vacuna y por código, y los del reporte al final', () => {
    const otra = vacuna({ reporteVacunaId: 8, vacuna: { id: 1, codigo: 'BCG', nombre: 'BCG' }, celdas: [celda('D1', 'MENOR_1', 'M', 9)] });
    const resultados = ejecutarReglas(
      [
        regla('RANGO', { minimo: 0, maximo: 5 }, { codigo: 'B_RANGO', severidad: 'ADVERTENCIA' }),
        regla('SIN_DUPLICADOS', {}, { codigo: 'A_DUP' }),
        regla('RANGO', { minimo: 0, maximo: 5 }, { codigo: 'C_RANGO' }),
        regla('CAMPOS_COMPLETOS', { cero_explicito: true }, { codigo: 'A_CAMPOS' }),
      ],
      reporte([vacuna(), otra], { otrosReportes: 1 }),
    );
    expect(resultados.map((r) => `${r.severidad} ${r.vacuna?.codigo ?? '-'} ${r.regla.codigo}`)).toEqual([
      'ERROR BCG A_CAMPOS',
      'ERROR BCG C_RANGO',
      'ERROR - A_DUP',
      'ADVERTENCIA BCG B_RANGO',
    ]);
  });
});

describe('armarMensaje', () => {
  it('un marcador sin valor queda como «—»', () => {
    expect(armarMensaje('{vacuna} {dosis}', { vacuna: 'BCG' })).toBe('BCG —');
  });

  it('corta el mensaje a 500 caracteres, con la sección incluida', () => {
    const mensaje = armarMensaje('x'.repeat(600), {}, '< 1 año');
    expect(mensaje).toHaveLength(500);
    expect(mensaje.startsWith('< 1 año: ')).toBe(true);
  });
});
