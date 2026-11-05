import pool, { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, contextoAuditoria, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { esAlcanceNacional, verificarAlcance } from '../auth/alcance.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import { indicadoresQueAplican } from '../configuracion/indicadores.service.js';
import { colorDelValor, metaYExcedente, sumaBrechasMunicipales } from './calculadores.js';
import { calcularIndicadores, leerDatos } from './motor.service.js';

// Una corrida es de una DDRISS y se calcula entera en una transacción (SPEC 44): nunca se ve EN_PROCESO. La última
// COMPLETADA de (DDRISS, año, mes) es la vigente. «Parcial» no se guarda: se deduce de cierre_periodo al leer.

const ENTIDAD = 'corrida_calculo';
const FORMATO_CODIGO = /^[A-Z0-9_]{1,40}$/;

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  sinDdriss: () => new ErrorApi(403, 'SIN_PERMISO', 'No tiene permiso para realizar esta acción.'),
  fueraDelCalendario: (anio, mes) =>
    new ErrorApi(422, 'CORRIDA_INVALIDA', `El mes ${mes} de ${anio} no está en el calendario.`),
};

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());
const aNumero = (valor) => (valor == null ? null : Number(valor));

function leerEntero(valor, mensaje, minimo, maximo) {
  const numero = typeof valor === 'number' ? valor : /^\d+$/.test(String(valor ?? '')) ? Number(valor) : NaN;
  if (!Number.isInteger(numero) || numero < minimo || numero > maximo) throw entradaInvalida(mensaje);
  return numero;
}
const leerAnio = (valor, nombre = 'El año') => leerEntero(valor, `${nombre} debe ser un número de 2000 a 2100.`, 2000, 2100);
const leerMes = (valor, nombre) => leerEntero(valor, `${nombre} debe ser un número de 1 a 12.`, 1, 12);
const leerId = (valor, nombre) =>
  leerEntero(valor, `${nombre} debe ser un número entero positivo.`, 1, Number.MAX_SAFE_INTEGER);

// La Autoridad nacional elige la DDRISS (obligatorio); los demás roles consultan la suya y no pueden mandarla.
function ddrissDeLaConsulta(usuario, query) {
  if (esAlcanceNacional(usuario)) {
    if (query.ddrissId === undefined) throw entradaInvalida('ddrissId es obligatorio para consultar todo el país.');
    return leerId(query.ddrissId, 'ddrissId');
  }
  if (query.ddrissId !== undefined) throw entradaInvalida('Parámetro no permitido: ddrissId.');
  return usuario.ddrissId;
}

// ---------------------------------------------------------------- Escritura

async function mesesCerradosAl(ejecutor, { ddrissId, anio, mesHasta, corridaId }) {
  const [filas] = await ejecutor.query(
    `SELECT p.mes FROM cierre_periodo cp
       JOIN periodo p ON p.id = cp.periodo_id
       JOIN corrida_calculo c ON c.id = ?
      WHERE cp.ddriss_id = ? AND p.anio = ? AND p.mes <= ?
        AND cp.estado = 'CERRADO' AND cp.cerrado_en <= c.iniciada_en`,
    [corridaId, ddrissId, anio, mesHasta],
  );
  const cerrados = new Set(filas.map((f) => f.mes));
  return Array.from({ length: mesHasta }, (_, i) => i + 1).filter((mes) => !cerrados.has(mes));
}

async function insertarResultados(conexion, corridaId, { anio, mesHasta }, filas) {
  if (filas.length === 0) return;
  await conexion.query(
    `INSERT INTO resultado_indicador
       (corrida_id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, filtro_dimensiones,
        anio, mes, es_proyeccion, numerador, denominador, valor, meta, brecha_dosis, cumple_meta)
     VALUES ?`,
    [
      filas.map((f) => [
        corridaId, f.codigo, f.version, f.municipioId, f.vacunaId, f.dosisId, f.filtro,
        anio, mesHasta, false, f.numerador, f.denominador, f.valor, f.meta, f.brechaDosis, f.cumpleMeta,
      ]),
    ],
  );
}

const bitacoraDeCorrida = (corridaId, contexto, valoresNuevos) => ({
  ...contexto,
  modulo: MODULOS.INDICADORES,
  accion: ACCIONES.CALCULAR_INDICADORES,
  entidad: ENTIDAD,
  entidadId: corridaId,
  valoresNuevos,
});

// La deja FALLIDA en otra transacción: la de la corrida ya se deshizo.
async function registrarFallida({ ddrissId, anio, mesHasta, motivo, usuarioId }, contexto, err) {
  try {
    return await enTransaccion(async (conexion) => {
      const [insercion] = await conexion.query(
        `INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, disparada_por, motivo, estado, finalizada_en, vigente)
         VALUES (?, ?, ?, ?, ?, 'FALLIDA', NOW(), FALSE)`,
        [ddrissId, anio, mesHasta, usuarioId, motivo],
      );
      await registrarBitacora(
        conexion,
        bitacoraDeCorrida(insercion.insertId, contexto, {
          ddrissId, anio, mesHasta, motivo, estado: 'FALLIDA', error: String(err?.message ?? err).slice(0, 500),
        }),
      );
      return insercion.insertId;
    });
  } catch (errorAlRegistrar) {
    console.error(errorAlRegistrar);
    return null;
  }
}

// Calcula y guarda una corrida; devuelve su id. contexto es el de la bitácora (contextoAuditoria, o { usuarioId } sin
// petición). Las lecturas van antes y fuera de la transacción (leerDatos); la transacción solo bloquea y escribe. Si
// algo falla, deja la corrida FALLIDA y relanza el error.
async function guardarCorrida({ ddrissId, anio, mesHasta, motivo, usuarioId = null }, contexto = { usuarioId }) {
  const pedido = { ddrissId, anio, mesHasta, motivo, usuarioId };
  try {
    const [[ddriss]] = await pool.query('SELECT codigo FROM ddriss WHERE id = ?', [ddrissId]);
    if (!ddriss) throw new Error(`La DDRISS ${ddrissId} no existe.`);
    const versiones = await indicadoresQueAplican(ddriss.codigo);
    const datos = await leerDatos({ ddrissId, anio, mesHasta, versiones });
    const { filas, calculados, omitidos } = calcularIndicadores({ mesHasta, versiones, datos });
    return await enTransaccion(async (conexion) => {
      // Primera consulta: serializa las corridas de la DDRISS para que no queden dos vigentes (nota del 2026-10-23).
      await conexion.query('SELECT id FROM ddriss WHERE id = ? FOR UPDATE', [ddrissId]);
      await conexion.query(
        'UPDATE corrida_calculo SET vigente = FALSE WHERE ddriss_id = ? AND anio = ? AND mes_hasta = ? AND vigente = TRUE',
        [ddrissId, anio, mesHasta],
      );
      const [insercion] = await conexion.query(
        `INSERT INTO corrida_calculo (ddriss_id, anio, mes_hasta, disparada_por, motivo, estado, finalizada_en, vigente)
         VALUES (?, ?, ?, ?, ?, 'COMPLETADA', NOW(), TRUE)`,
        [ddrissId, anio, mesHasta, usuarioId, motivo],
      );
      const id = insercion.insertId;
      await insertarResultados(conexion, id, { anio, mesHasta }, filas);
      await registrarBitacora(
        conexion,
        bitacoraDeCorrida(id, contexto, {
          ddrissId,
          anio,
          mesHasta,
          motivo,
          estado: 'COMPLETADA',
          parcial: datos.mesesSinCerrar.length > 0,
          indicadores: calculados,
          omitidos,
          resultados: filas.length,
        }),
      );
      return id;
    });
  } catch (err) {
    err.corridaFallidaId = await registrarFallida(pedido, contexto, err);
    throw err;
  }
}

export async function calcularCorrida(pedido, contexto) {
  return leerCorrida(await guardarCorrida(pedido, contexto));
}

// Para el cierre del mes y la rectificación, que ya se confirmaron: un fallo del cálculo no los deshace, queda la
// corrida FALLIDA y se informa en la respuesta.
export async function calcularSinFallar(pedido, contexto) {
  try {
    return { id: await guardarCorrida(pedido, contexto), mesHasta: pedido.mesHasta, estado: 'COMPLETADA' };
  } catch (err) {
    console.error(err);
    return { id: err.corridaFallidaId ?? null, mesHasta: pedido.mesHasta, estado: 'FALLIDA' };
  }
}

export async function crearCorrida(cuerpo, req) {
  revisarCampos(cuerpo ?? {}, ['anio', 'mesHasta']);
  const anio = leerAnio(cuerpo?.anio);
  const mesHasta = leerMes(cuerpo?.mesHasta, 'El mes de corte');
  const ddrissId = req.usuario.ddrissId;
  if (ddrissId == null) throw errores.sinDdriss();
  const [[periodo]] = await pool.query('SELECT id FROM periodo WHERE anio = ? AND mes = ?', [anio, mesHasta]);
  if (!periodo) throw errores.fueraDelCalendario(anio, mesHasta);
  return calcularCorrida(
    { ddrissId, anio, mesHasta, motivo: 'MANUAL', usuarioId: req.usuario.id },
    contextoAuditoria(req),
  );
}

// ---------------------------------------------------------------- Lectura

const SELECT_CORRIDA = `
  SELECT c.id, c.ddriss_id, d.codigo AS ddriss_codigo, c.anio, c.mes_hasta, c.motivo, c.estado, c.vigente,
         c.disparada_por, CONCAT(em.nombres, ' ', em.apellidos) AS disparada_nombre,
         UNIX_TIMESTAMP(c.iniciada_en) AS iniciada_en, UNIX_TIMESTAMP(c.finalizada_en) AS finalizada_en,
         (SELECT COUNT(*) FROM resultado_indicador ri WHERE ri.corrida_id = c.id) AS total_resultados
    FROM corrida_calculo c
    JOIN ddriss d ON d.id = c.ddriss_id
    LEFT JOIN usuario u   ON u.id = c.disparada_por
    LEFT JOIN empleado em ON em.id = u.empleado_id`;

// Las versiones usadas, para el nombre, el tipo y el semáforo: por código y versión, tal como se calcularon.
async function versionesUsadas(pares) {
  const unicos = [...new Map(pares.map((p) => [`${p.codigo}:${p.version}`, p])).values()];
  if (unicos.length === 0) return new Map();
  const documentos = await (await obtenerDb())
    .collection('configuracion_indicadores')
    .find({ $or: unicos.map(({ codigo, version }) => ({ codigo, version })) })
    .project({ codigo: 1, version: 1, nombre: 1, tipo_calculo: 1, umbrales: 1 })
    .toArray();
  return new Map(documentos.map((d) => [`${d.codigo}:${Number(d.version)}`, d]));
}

async function detallesDeBitacora(ids) {
  if (ids.length === 0) return new Map();
  const [filas] = await pool.query(
    `SELECT entidad_id, valores_nuevos FROM bitacora
      WHERE entidad = ? AND accion = ? AND entidad_id IN (?)`,
    [ENTIDAD, ACCIONES.CALCULAR_INDICADORES, ids.map(String)],
  );
  return new Map(filas.map((f) => [Number(f.entidad_id), f.valores_nuevos ?? {}]));
}

// Sin bitácora (la corrida de la semilla), los indicadores salen de sus resultados.
async function indicadoresDeResultados(ids) {
  if (ids.length === 0) return new Map();
  const [filas] = await pool.query(
    `SELECT DISTINCT corrida_id, indicador_codigo AS codigo, indicador_version AS version
       FROM resultado_indicador WHERE corrida_id IN (?) ORDER BY indicador_codigo`,
    [ids],
  );
  const porCorrida = new Map();
  for (const f of filas) {
    if (!porCorrida.has(f.corrida_id)) porCorrida.set(f.corrida_id, []);
    porCorrida.get(f.corrida_id).push({ codigo: f.codigo, version: Number(f.version) });
  }
  return porCorrida;
}

async function aCorridas(filas) {
  const ids = filas.map((f) => f.id);
  const [bitacoras, deResultados, sinCerrarPorCorrida] = await Promise.all([
    detallesDeBitacora(ids),
    indicadoresDeResultados(ids),
    Promise.all(filas.map((f) => mesesCerradosAl(pool, {
      ddrissId: f.ddriss_id, anio: f.anio, mesHasta: f.mes_hasta, corridaId: f.id,
    }))),
  ]);
  const usados = (f) => bitacoras.get(f.id)?.indicadores ?? deResultados.get(f.id) ?? [];
  const versiones = await versionesUsadas(filas.flatMap(usados));
  return filas.map((f, i) => {
    const sinCerrar = sinCerrarPorCorrida[i];
    return {
      id: f.id,
      ddriss: { id: f.ddriss_id, codigo: f.ddriss_codigo },
      anio: f.anio,
      mesHasta: f.mes_hasta,
      motivo: f.motivo,
      estado: f.estado,
      vigente: Boolean(f.vigente),
      parcial: sinCerrar.length > 0,
      mesesSinCerrar: sinCerrar,
      disparadaPor: f.disparada_por == null ? null : { id: f.disparada_por, nombre: f.disparada_nombre ?? '' },
      iniciadaEn: aFechaIso(f.iniciada_en),
      finalizadaEn: aFechaIso(f.finalizada_en),
      indicadores: usados(f).map(({ codigo, version }) => {
        const doc = versiones.get(`${codigo}:${version}`);
        return { codigo, version, nombre: doc?.nombre ?? null, tipoCalculo: doc?.tipo_calculo ?? null };
      }),
      omitidos: bitacoras.get(f.id)?.omitidos ?? [],
      totalResultados: Number(f.total_resultados),
    };
  });
}

async function leerCorrida(id) {
  const [filas] = await pool.query(`${SELECT_CORRIDA} WHERE c.id = ?`, [id]);
  if (filas.length === 0) return null;
  return (await aCorridas(filas))[0];
}

async function leerResultados(corridaId, { indicador, municipioId } = {}) {
  const condiciones = ['ri.corrida_id = ?'];
  const parametros = [corridaId];
  if (indicador) {
    condiciones.push('ri.indicador_codigo = ?');
    parametros.push(indicador);
  }
  if (municipioId) {
    condiciones.push('ri.municipio_id = ?');
    parametros.push(municipioId);
  }
  const [filas] = await pool.query(
    `SELECT ri.indicador_codigo, ri.indicador_version, ri.municipio_id, m.nombre AS municipio_nombre,
            v.codigo AS vacuna_codigo, v.nombre AS vacuna_nombre, ds.codigo AS dosis_codigo, ri.filtro_dimensiones,
            ri.anio, ri.mes, ri.es_proyeccion, ri.numerador, ri.denominador, ri.valor, ri.meta, ri.brecha_dosis,
            ri.cumple_meta
       FROM resultado_indicador ri
       JOIN vacuna v       ON v.id = ri.vacuna_id
       LEFT JOIN dosis ds  ON ds.id = ri.dosis_id
       LEFT JOIN municipio m ON m.id = ri.municipio_id
      WHERE ${condiciones.join(' AND ')}
      ORDER BY ri.indicador_codigo, ri.municipio_id IS NOT NULL, m.nombre`,
    parametros,
  );
  const versiones = await versionesUsadas(
    filas.map((f) => ({ codigo: f.indicador_codigo, version: Number(f.indicador_version) })),
  );
  const resultados = filas
    .map((f) => {
      const doc = versiones.get(`${f.indicador_codigo}:${Number(f.indicador_version)}`);
      const valor = aNumero(f.valor);
      const numerador = aNumero(f.numerador);
      const denominador = aNumero(f.denominador);
      const meta = aNumero(f.meta);
      const brechaDosis = aNumero(f.brecha_dosis);
      return {
        indicadorCodigo: f.indicador_codigo,
        indicadorVersion: Number(f.indicador_version),
        tipoCalculo: doc?.tipo_calculo ?? null,
        municipio: f.municipio_id == null ? null : { id: f.municipio_id, nombre: f.municipio_nombre },
        vacuna: { codigo: f.vacuna_codigo, nombre: f.vacuna_nombre },
        dosis: f.dosis_codigo ?? null,
        filtroDimensiones: f.filtro_dimensiones,
        anio: f.anio,
        mes: f.mes,
        numerador,
        denominador,
        valor,
        meta,
        brechaDosis,
        cumpleMeta: f.cumple_meta == null ? null : Boolean(f.cumple_meta),
        calculable: valor !== null,
        color: colorDelValor(doc?.umbrales, valor, doc?.tipo_calculo),
        esProyeccion: Boolean(f.es_proyeccion),
        ...metaYExcedente({ numerador, denominador, meta, brechaDosis }),
        sumaBrechasMunicipales: null,
      };
    });
  // La fila departamental solo viene sin municipioId, y entonces vienen también todos los municipios del indicador.
  for (const departamental of resultados.filter((r) => r.municipio === null)) {
    const municipales = resultados.filter((r) => r.municipio !== null && r.indicadorCodigo === departamental.indicadorCodigo);
    departamental.sumaBrechasMunicipales = sumaBrechasMunicipales(departamental, municipales);
  }
  return resultados;
}

export async function listarCorridas(usuario, query = {}) {
  revisarParametros(query, ['anio', 'mesHasta', 'ddrissId', 'pagina', 'porPagina']);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  if (query.anio === undefined) throw entradaInvalida('El año es obligatorio.');
  const anio = leerAnio(query.anio);
  const pagina = query.pagina === undefined ? 1 : leerId(query.pagina, 'pagina');
  const porPagina = query.porPagina === undefined
    ? 20
    : leerEntero(query.porPagina, 'porPagina debe ser un número entero entre 1 y 100.', 1, 100);
  const condiciones = ['c.ddriss_id = ?', 'c.anio = ?'];
  const parametros = [ddrissId, anio];
  if (query.mesHasta !== undefined) {
    condiciones.push('c.mes_hasta = ?');
    parametros.push(leerMes(query.mesHasta, 'El mes de corte'));
  }
  const donde = `WHERE ${condiciones.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM corrida_calculo c ${donde}`, parametros);
  const [filas] = await pool.query(`${SELECT_CORRIDA} ${donde} ORDER BY c.iniciada_en DESC, c.id DESC LIMIT ? OFFSET ?`, [
    ...parametros,
    porPagina,
    (pagina - 1) * porPagina,
  ]);
  return { elementos: await aCorridas(filas), total: Number(total), pagina, porPagina };
}

export async function obtenerCorrida(id, usuario) {
  const corridaId = leerId(id, 'id');
  const corrida = await leerCorrida(corridaId);
  if (!corrida) throw errores.noEncontrado();
  verificarAlcance(usuario, { ddrissId: corrida.ddriss.id });
  return { ...corrida, resultados: await leerResultados(corridaId) };
}

export async function resultadosVigentes(usuario, query = {}) {
  revisarParametros(query, ['anio', 'mes', 'indicador', 'municipioId', 'ddrissId']);
  const ddrissId = ddrissDeLaConsulta(usuario, query);
  if (query.anio === undefined) throw entradaInvalida('El año es obligatorio.');
  if (query.mes === undefined) throw entradaInvalida('El mes es obligatorio.');
  const anio = leerAnio(query.anio);
  const mes = leerMes(query.mes, 'El mes');
  if (query.indicador !== undefined && !FORMATO_CODIGO.test(query.indicador)) {
    throw entradaInvalida('indicador debe ser un código en mayúsculas, dígitos y guion bajo.');
  }
  const municipioId = query.municipioId === undefined ? undefined : leerId(query.municipioId, 'municipioId');
  const [[vigente]] = await pool.query(
    `SELECT id FROM corrida_calculo
      WHERE ddriss_id = ? AND anio = ? AND mes_hasta = ? AND vigente = TRUE AND estado = 'COMPLETADA'
      ORDER BY id DESC LIMIT 1`,
    [ddrissId, anio, mes],
  );
  if (!vigente) return { corrida: null, resultados: [] };
  return {
    corrida: await leerCorrida(vigente.id),
    resultados: await leerResultados(vigente.id, { indicador: query.indicador, municipioId }),
  };
}

// Los meses CERRADO de la DDRISS en el año, desde mes: los que recalcula una rectificación aplicada.
export async function mesesCerradosDesde(ddrissId, anio, mes) {
  const [filas] = await pool.query(
    `SELECT p.mes FROM cierre_periodo cp JOIN periodo p ON p.id = cp.periodo_id
      WHERE cp.ddriss_id = ? AND p.anio = ? AND p.mes >= ? AND cp.estado = 'CERRADO'
      ORDER BY p.mes`,
    [ddrissId, anio, mes],
  );
  return filas.map((f) => f.mes);
}
