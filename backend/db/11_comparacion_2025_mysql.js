// SPEC 51 (HU-43): 2025 ficticio de la DDRISS San Marcos para comparar la cobertura entre años.
// Agrega el calendario de 2025 (cerrado), la población de 2025 (la de 2026 × 0.98) y 12 corridas vigentes con los
// indicadores de la corrida 1 de la semilla, calculados con CALCULADORES a partir de agosto de 2026. No crea reportes
// ni producción: no recalcular 2025 desde «Indicadores», porque daría todo en cero.
//
// Idempotente: si la DDRISS ya tiene corridas de 2025, no escribe. No toca otros años ni escribe en la bitácora
// (como el 03 y el 04). Se corre desde backend/ con:  node --env-file=.env db/11_comparacion_2025_mysql.js
// Con --simular hace todo en la transacción, muestra un resumen y la deshace.

import pool, { enTransaccion } from '../src/config/mysql.js';
import { cliente, obtenerDb } from '../src/config/mongodb.js';
import { CALCULADORES } from '../src/modulos/indicadores/calculadores.js';

const DDRISS = 'DDRISS_SM';
const ANIO = 2025;
const CORRIDA_BASE = 1;
const MES_BASE = 8;
const FACTOR_POBLACION = 0.98;
const FUENTE = 'Datos de prueba (ficticios)';
const SIMULAR = process.argv.includes('--simular');

class Simulacion extends Error {
  constructor(resumen) {
    super('simulación');
    this.resumen = resumen;
  }
}

// De 0.85 a 1.05 según el id: unos municipios quedan mejor que en 2026 y otros peor.
const factorDe = (municipioId) => 0.85 + (municipioId % 5) * 0.05;
const acumulado = (base, mes, municipioId) => Math.round(((base * mes) / MES_BASE) * factorDe(municipioId));

const dosDigitos = (n) => String(n).padStart(2, '0');
function delMesSiguiente(mes, dia, hora = '') {
  const [anio, siguiente] = mes === 12 ? [ANIO + 1, 1] : [ANIO, mes + 1];
  return `${anio}-${dosDigitos(siguiente)}-${dosDigitos(dia)}${hora}`;
}
const ultimoDia = (mes) => new Date(Date.UTC(ANIO, mes, 0)).getUTCDate();
const sumarMinutos = (fecha, minutos) => fecha.replace(/:(\d\d):00$/, (_, m) => `:${dosDigitos(Number(m) + minutos)}:00`);

async function leerBase(conexion, ddrissId) {
  const [filas] = await conexion.query(
    `SELECT ri.indicador_codigo, ri.indicador_version, ri.municipio_id, ri.vacuna_id, ri.dosis_id,
            ri.filtro_dimensiones, ri.numerador, ri.denominador
       FROM resultado_indicador ri JOIN corrida_calculo c ON c.id = ri.corrida_id
      WHERE c.id = ? AND c.ddriss_id = ? AND c.anio = 2026 AND c.mes_hasta = ? AND ri.es_proyeccion = FALSE
      ORDER BY ri.indicador_codigo, ri.municipio_id`,
    [CORRIDA_BASE, ddrissId, MES_BASE],
  );
  const porCodigo = new Map();
  for (const f of filas) {
    if (!porCodigo.has(f.indicador_codigo)) {
      porCodigo.set(f.indicador_codigo, {
        codigo: f.indicador_codigo, version: Number(f.indicador_version), vacunaId: f.vacuna_id, dosisId: f.dosis_id,
        filtro: f.filtro_dimensiones, municipios: new Map(),
      });
    }
    if (f.municipio_id !== null) {
      porCodigo.get(f.indicador_codigo).municipios.set(f.municipio_id, {
        numerador: Number(f.numerador), denominador: Number(f.denominador),
      });
    }
  }
  return [...porCodigo.values()];
}

async function insertarCalendario(conexion, ddrissId) {
  const [[cierre]] = await conexion.query(
    `SELECT cerrado_por FROM cierre_periodo WHERE ddriss_id = ? AND estado = 'CERRADO' AND cerrado_por IS NOT NULL
      ORDER BY id LIMIT 1`,
    [ddrissId],
  );
  if (!cierre) throw new Error('La DDRISS no tiene ningún mes cerrado de donde tomar quién cierra.');
  for (let mes = 1; mes <= 12; mes += 1) {
    await conexion.query('INSERT IGNORE INTO periodo (anio, mes, fecha_inicio, fecha_fin) VALUES (?, ?, ?, ?)', [
      ANIO, mes, `${ANIO}-${dosDigitos(mes)}-01`, `${ANIO}-${dosDigitos(mes)}-${ultimoDia(mes)}`,
    ]);
    await conexion.query(
      `INSERT IGNORE INTO cierre_periodo (periodo_id, ddriss_id, fecha_limite_envio, estado, cerrado_por, cerrado_en)
       SELECT id, ?, ?, 'CERRADO', ?, ? FROM periodo WHERE anio = ? AND mes = ?`,
      [ddrissId, delMesSiguiente(mes, 10), cierre.cerrado_por, delMesSiguiente(mes, 20, ' 16:00:00'), ANIO, mes],
    );
  }
}

async function insertarPoblacion(conexion, ddrissId) {
  await conexion.query(
    `INSERT IGNORE INTO poblacion_objetivo (municipio_id, anio, clasificacion_poblacion_id, cantidad, fuente, registrado_por)
     SELECT po.municipio_id, ?, po.clasificacion_poblacion_id, ROUND(po.cantidad * ?), ?, po.registrado_por
       FROM poblacion_objetivo po JOIN municipio m ON m.id = po.municipio_id JOIN ddriss d ON d.id = ?
      WHERE po.anio = 2026 AND m.departamento_id = d.departamento_id`,
    [ANIO, FACTOR_POBLACION, FUENTE, ddrissId],
  );
}

async function poblacionesPorGrupo(conexion) {
  const [filas] = await conexion.query(
    `SELECT cp.codigo, po.municipio_id, po.cantidad
       FROM poblacion_objetivo po JOIN clasificacion_poblacion cp ON cp.id = po.clasificacion_poblacion_id
      WHERE po.anio = ?`,
    [ANIO],
  );
  const porGrupo = new Map();
  for (const f of filas) {
    if (!porGrupo.has(f.codigo)) porGrupo.set(f.codigo, new Map());
    porGrupo.get(f.codigo).set(f.municipio_id, Number(f.cantidad));
  }
  return porGrupo;
}

// Las filas de un indicador en el mes, con su calculador (como en el motor: la departamental primero).
function filasDelMes(base, documento, mes, poblaciones) {
  const municipios = [...base.municipios.keys()];
  const calcular = CALCULADORES[documento.tipo_calculo];
  if (!calcular) throw new Error(`${base.codigo}: el tipo ${documento.tipo_calculo} no tiene calculador.`);
  if (documento.tipo_calculo === 'DESERCION') {
    const iniciales = new Map();
    const finales = new Map();
    for (const [id, { numerador, denominador }] of base.municipios) {
      iniciales.set(id, acumulado(denominador, mes, id));
      finales.set(id, acumulado(denominador - numerador, mes, id));
    }
    return calcular({ version: documento, municipios, iniciales, finales });
  }
  const grupo = documento.aplica_a?.[0]?.clasificacion_poblacion;
  const numeradores = new Map([...base.municipios].map(([id, { numerador }]) => [id, acumulado(numerador, mes, id)]));
  return calcular({ version: documento, mesHasta: mes, municipios, numeradores, poblaciones: poblaciones.get(grupo) ?? new Map() });
}

// Para --simular: la fila departamental y la de Tacaná de cada indicador en marzo, agosto y diciembre.
async function muestra(conexion, ddrissId) {
  const [filas] = await conexion.query(
    `SELECT ri.indicador_codigo AS codigo, ri.mes, COALESCE(m.nombre, 'DDRISS') AS fila, ri.numerador, ri.denominador,
            ri.valor, ri.meta, ri.brecha_dosis AS brecha, ri.cumple_meta AS cumple
       FROM resultado_indicador ri JOIN corrida_calculo c ON c.id = ri.corrida_id
       LEFT JOIN municipio m ON m.id = ri.municipio_id
      WHERE c.ddriss_id = ? AND c.anio = ? AND ri.mes IN (3, 8, 12) AND (ri.municipio_id IS NULL OR m.codigo_ine = '1203')
      ORDER BY ri.indicador_codigo, ri.mes, ri.municipio_id IS NOT NULL`,
    [ddrissId, ANIO],
  );
  return filas;
}

async function main() {
  const [[ddriss]] = await pool.query('SELECT id FROM ddriss WHERE codigo = ?', [DDRISS]);
  if (!ddriss) return console.log(`No existe la DDRISS ${DDRISS}: no se escribió nada.`);
  const [[previa]] = await pool.query('SELECT COUNT(*) AS total FROM corrida_calculo WHERE ddriss_id = ? AND anio = ?', [
    ddriss.id, ANIO,
  ]);
  if (Number(previa.total) > 0) return console.log(`${DDRISS} ya tiene corridas de ${ANIO}: no se escribió nada.`);

  const bases = await leerBase(pool, ddriss.id);
  if (bases.length === 0) {
    return console.log(`No existe la corrida ${CORRIDA_BASE} (agosto de 2026) de la semilla: no se escribió nada.`);
  }
  const documentos = await (await obtenerDb())
    .collection('configuracion_indicadores')
    .find({ $or: bases.map(({ codigo, version }) => ({ codigo, version })) })
    .toArray();
  const documentoDe = new Map(documentos.map((d) => [`${d.codigo}:${Number(d.version)}`, d]));
  for (const base of bases) {
    if (!documentoDe.has(`${base.codigo}:${base.version}`)) {
      throw new Error(`No está la versión ${base.version} de ${base.codigo} en MongoDB.`);
    }
  }

  const resumen = await enTransaccion(async (conexion) => {
    // Primera consulta: como el motor, serializa con las corridas de la DDRISS.
    await conexion.query('SELECT id FROM ddriss WHERE id = ? FOR UPDATE', [ddriss.id]);
    const [[otra]] = await conexion.query('SELECT COUNT(*) AS total FROM corrida_calculo WHERE ddriss_id = ? AND anio = ?', [
      ddriss.id, ANIO,
    ]);
    if (Number(otra.total) > 0) return null;

    await insertarCalendario(conexion, ddriss.id);
    await insertarPoblacion(conexion, ddriss.id);
    const poblaciones = await poblacionesPorGrupo(conexion);

    let resultados = 0;
    for (let mes = 1; mes <= 12; mes += 1) {
      const iniciada = sumarMinutos(delMesSiguiente(mes, 20, ' 16:00:00'), 5);
      const [corrida] = await conexion.query(
        `INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, disparada_por, motivo, estado, iniciada_en, finalizada_en, vigente)
         VALUES (?, ?, ?, NULL, 'CIERRE_PERIODO', 'COMPLETADA', ?, ?, TRUE)`,
        [ddriss.id, ANIO, mes, iniciada, sumarMinutos(iniciada, 1)],
      );
      const filas = bases.flatMap((base) => filasDelMes(base, documentoDe.get(`${base.codigo}:${base.version}`), mes, poblaciones)
        .map((f) => [
          corrida.insertId, base.codigo, base.version, f.municipioId, base.vacunaId, base.dosisId, base.filtro,
          ANIO, mes, false, f.numerador, f.denominador, f.valor, f.meta, f.brechaDosis, f.cumpleMeta,
        ]));
      await conexion.query(
        `INSERT INTO resultado_indicador
           (corrida_id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, filtro_dimensiones,
            anio, mes, es_proyeccion, numerador, denominador, valor, meta, brecha_dosis, cumple_meta)
         VALUES ?`,
        [filas],
      );
      resultados += filas.length;
    }
    const resumen = { indicadores: bases.map((b) => b.codigo), resultados };
    if (SIMULAR) throw new Simulacion({ ...resumen, muestra: await muestra(conexion, ddriss.id) });
    return resumen;
  }).catch((err) => {
    if (err instanceof Simulacion) return err.resumen;
    throw err;
  });

  if (!resumen) return console.log(`${DDRISS} ya tiene corridas de ${ANIO}: no se escribió nada.`);
  if (SIMULAR) {
    console.log(`Simulación (deshecha): 12 corridas de ${ANIO} con ${resumen.resultados} resultados.`);
    return console.table(resumen.muestra);
  }
  return console.log(`Listo: 12 corridas de ${ANIO} con ${resumen.resultados} resultados (${resumen.indicadores.join(', ')}).`);
}

try {
  await main();
} finally {
  await pool.end();
  await cliente.close();
}
