// SPEC 60: coberturas anuales (prorrateo NINGUNO) de BCG, Hexavalente D3 y SPR D1, para la tabla de la red de
// «Indicadores». Son los mismos tres documentos del 04 (datos_prueba: true): un cambio va en los dos. Las demás
// trazadoras las confirma la DDRISS y se crean en Administración · Indicadores.
//
// Idempotente: no inserta un código que ya existe, en cualquier versión o estado. No recrea nada ni escribe en la
// bitácora (como el 04). Se corre desde backend/ con:  node --env-file=.env db/13_coberturas_anuales_mongo.js
// Con --simular solo muestra qué insertaría. Entran en la siguiente corrida que se calcule.

import { Int32 } from 'mongodb';
import { cliente, obtenerDb } from '../src/config/mongodb.js';

const SIMULAR = process.argv.includes('--simular');
const fecha = new Date('2026-10-15T15:00:00Z');

const coberturaAnual = (codigo, nombre, aplica) => ({
  codigo,
  version: new Int32(1),
  nombre,
  tipo_calculo: 'COBERTURA',
  aplica_a: [aplica],
  numerador: { fuente: 'PRODUCCION', estados_reporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'NINGUNO' },
  meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>', homogeneidad_municipal: true },
  umbrales: [
    { color: 'verde', desde: 90, hasta: null },
    { color: 'amarillo', desde: 80, hasta: 90 },
    { color: 'rojo', desde: 0, hasta: 80 },
  ],
  umbrales_provisionales: true,
  niveles: ['MUNICIPIO', 'DEPARTAMENTO'],
  periodicidad: 'MENSUAL',
  alerta: { generar: false },
  es_estimacion: false,
  territorio: { nivel: 'NACIONAL', ddriss_codigo: null },
  estado: 'VIGENTE',
  vigencia: { desde: new Date('2026-10-01'), hasta: null },
  auditoria: {
    creado_por: new Int32(1), creado_en: fecha, publicado_por: new Int32(1), publicado_en: fecha, motivo_cambio: null,
  },
  datos_prueba: true,
});

const DOCUMENTOS = [
  coberturaAnual('COB_ANUAL_BCGU', 'Cobertura anual de BCG en nacidos vivos',
    { vacuna: 'BCG', dosis: 'UNICA', clasificacion_poblacion: 'NACIDOS_VIVOS' }),
  coberturaAnual('COB_ANUAL_HEXA3', 'Cobertura anual de Hexavalente 3.ª dosis en menores de 1 año',
    { vacuna: 'HEXA', dosis: 'D3', clasificacion_poblacion: 'MENOR_1', filtros_dimension: { grupo_edad: ['MENOR_1'] } }),
  coberturaAnual('COB_ANUAL_SPR1', 'Cobertura anual de SPR 1.ª dosis de 1 a menos de 2 años',
    { vacuna: 'SPR', dosis: 'D1', clasificacion_poblacion: '1_A_MENOR_2' }),
];

async function main() {
  const coleccion = (await obtenerDb()).collection('configuracion_indicadores');
  const existentes = new Set(await coleccion.distinct('codigo', { codigo: { $in: DOCUMENTOS.map((d) => d.codigo) } }));
  const nuevos = DOCUMENTOS.filter((d) => !existentes.has(d.codigo));
  if (existentes.size > 0) console.log(`Ya existen (no se tocan): ${[...existentes].join(', ')}.`);
  if (nuevos.length === 0) return console.log('No hay coberturas anuales por agregar.');
  if (SIMULAR) return console.log(`Simulación: se insertarían ${nuevos.map((d) => d.codigo).join(', ')}.`);
  await coleccion.insertMany(nuevos);
  return console.log(`Listo: ${nuevos.map((d) => d.codigo).join(', ')}.`);
}

try {
  await main();
} finally {
  await cliente.close();
}
