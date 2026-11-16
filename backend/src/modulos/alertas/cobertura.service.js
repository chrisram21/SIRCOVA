import { registrarBitacoras, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { colorDelIndicador, mayorACien } from '../indicadores/calculadores.js';
import { NOMBRES_MES } from '../produccion/validacion.service.js';

// Alertas que crea cada corrida de indicadores no parcial (SPEC 68). Como en generacion.service.js, el título
// identifica la clase; el tipo y la severidad los fija la clase, no alerta.tipo de la configuración.
export const TITULOS_COBERTURA = {
  BAJO_META: 'Municipio bajo la meta',
  MAYOR_A_CIEN: 'Cobertura mayor al 100 %',
};

export const CLASES_COBERTURA = {
  BAJO_META: { titulo: TITULOS_COBERTURA.BAJO_META, tipo: 'COBERTURA_BAJO_META', severidad: 'CRITICA' },
  MAYOR_A_CIEN: { titulo: TITULOS_COBERTURA.MAYOR_A_CIEN, tipo: 'CALIDAD', severidad: 'ADVERTENCIA' },
};

// «El rango más bajo del semáforo» de HU-51: el color de lo peor, también en la deserción (descendente).
export const FRANJA_BAJO_META = 'rojo';

function clasesDeLaFila(doc, fila, mes) {
  const clases = [];
  if (colorDelIndicador(doc, fila.valor, mes) === FRANJA_BAJO_META) clases.push('BAJO_META');
  if (mayorACien({ tipoCalculo: doc.tipo_calculo, valor: fila.valor, esProyeccion: Boolean(fila.esProyeccion) })) {
    clases.push('MAYOR_A_CIEN');
  }
  return clases;
}

// Las filas de una corrida que dan alerta: solo municipales, sin proyecciones, de versiones con alerta.generar.
// mes es el mes de corte de la corrida (el de la cobertura anual contra lo esperado).
export function candidatosDeAlerta({ versiones, filas, mes }) {
  const porVersion = new Map(versiones.map((doc) => [`${doc.codigo}:${Number(doc.version)}`, doc]));
  const candidatos = [];
  for (const fila of filas) {
    if (fila.municipioId == null || fila.esProyeccion || fila.valor == null) continue;
    const doc = porVersion.get(`${fila.codigo}:${Number(fila.version)}`);
    if (doc?.alerta?.generar !== true) continue;
    const rolesDestino = Array.isArray(doc.alerta.rol_destino) ? [...doc.alerta.rol_destino] : [];
    for (const clase of clasesDeLaFila(doc, fila, mes)) {
      candidatos.push({
        clase,
        codigo: fila.codigo,
        version: Number(fila.version),
        nombre: doc.nombre,
        municipioId: fila.municipioId,
        vacunaId: fila.vacunaId,
        dosisId: fila.dosisId,
        filtro: fila.filtro,
        valor: fila.valor,
        meta: fila.meta,
        rolesDestino,
      });
    }
  }
  return candidatos;
}

const aNumero = (valor) => (valor == null ? null : Number(valor));
const conDecimal = (numero) => Number(numero).toFixed(1);
const sinCerosDeMas = (numero) => String(Number(Number(numero).toFixed(1)));

const mensajes = {
  BAJO_META: ({ municipio, nombre, vacuna, mes, anio, valor, meta }) =>
    `${municipio}: ${nombre} (${vacuna}) en ${NOMBRES_MES[mes - 1]} de ${anio} quedó en ${conDecimal(valor)} %, ` +
    `en la franja más baja del semáforo (meta ${sinCerosDeMas(meta)} %).`,
  MAYOR_A_CIEN: ({ municipio, nombre, vacuna, mes, anio, valor }) =>
    `${municipio}: ${nombre} (${vacuna}) en ${NOMBRES_MES[mes - 1]} de ${anio} da ${conDecimal(valor)} %; ` +
    'revise la población o los registros.',
};

// La misma alerta en dos corridas del mes: clase (título), rol, municipio y lo que identifica al resultado.
const claveDe = ({ titulo, rolDestinoId, municipioId, codigo, vacunaId, dosisId, filtro }) =>
  [titulo, rolDestinoId, municipioId, codigo, vacunaId, dosisId, filtro ?? ''].join('|');
const claveDelResultado = (fila) => claveDe({ ...fila, titulo: '', rolDestinoId: '' });

async function resultadosDeLaCorrida(conexion, corridaId) {
  const [filas] = await conexion.query(
    `SELECT id, indicador_codigo, indicador_version, municipio_id, vacuna_id, dosis_id, filtro_dimensiones, valor, meta
       FROM resultado_indicador
      WHERE corrida_id = ? AND municipio_id IS NOT NULL AND es_proyeccion = FALSE`,
    [corridaId],
  );
  return filas.map((f) => ({
    id: f.id,
    codigo: f.indicador_codigo,
    version: Number(f.indicador_version),
    municipioId: f.municipio_id,
    vacunaId: f.vacuna_id,
    dosisId: f.dosis_id,
    filtro: f.filtro_dimensiones,
    valor: aNumero(f.valor),
    meta: aNumero(f.meta),
    esProyeccion: false,
  }));
}

async function nombresPorId(conexion, tabla, ids) {
  if (ids.length === 0) return new Map();
  const [filas] = await conexion.query(`SELECT id, nombre FROM ${tabla} WHERE id IN (?)`, [ids]);
  return new Map(filas.map((f) => [f.id, f.nombre]));
}

// Lo que dejaría la corrida: una alerta por candidato y por rol de destino que exista en rol.
async function alertasDeseadas(conexion, { corridaId, ddrissId, anio, mes, periodoId, versiones }) {
  const filas = await resultadosDeLaCorrida(conexion, corridaId);
  const candidatos = candidatosDeAlerta({ versiones, filas, mes });
  if (candidatos.length === 0) return [];

  const codigosRol = [...new Set(candidatos.flatMap((c) => c.rolesDestino))];
  const [roles] = codigosRol.length === 0
    ? [[]]
    : await conexion.query('SELECT id, codigo FROM rol WHERE codigo IN (?)', [codigosRol]);
  const rolPorCodigo = new Map(roles.map((r) => [r.codigo, r.id]));
  const municipios = await nombresPorId(conexion, 'municipio', [...new Set(candidatos.map((c) => c.municipioId))]);
  const vacunas = await nombresPorId(conexion, 'vacuna', [...new Set(candidatos.map((c) => c.vacunaId))]);
  const resultadoPorClave = new Map(filas.map((f) => [claveDelResultado(f), f.id]));

  return candidatos.flatMap((c) => {
    const { titulo, tipo, severidad } = CLASES_COBERTURA[c.clase];
    const mensaje = mensajes[c.clase]({
      ...c, municipio: municipios.get(c.municipioId), vacuna: vacunas.get(c.vacunaId), mes, anio,
    });
    const resultadoIndicadorId = resultadoPorClave.get(claveDelResultado(c));
    return c.rolesDestino
      .filter((codigo) => rolPorCodigo.has(codigo))
      .map((codigo) => {
        const rolDestinoId = rolPorCodigo.get(codigo);
        return {
          clave: claveDe({ ...c, titulo, rolDestinoId }),
          alerta: {
            tipo, severidad, titulo, mensaje, ddrissId, periodoId, municipioId: c.municipioId, resultadoIndicadorId,
            rolDestinoId,
          },
        };
      });
  });
}

// Las alertas de las dos clases de la DDRISS y el mes, en cualquier estado: una atendida o descartada no se recrea.
async function alertasExistentes(conexion, { ddrissId, periodoId }) {
  const [filas] = await conexion.query(
    `SELECT a.id, a.titulo, a.rol_destino_id, a.municipio_id, a.estado, a.mensaje, a.resultado_indicador_id,
            ri.indicador_codigo, ri.vacuna_id, ri.dosis_id, ri.filtro_dimensiones
       FROM alerta a
       JOIN resultado_indicador ri ON ri.id = a.resultado_indicador_id
      WHERE a.ddriss_id = ? AND a.periodo_id = ? AND a.titulo IN (?)`,
    [ddrissId, periodoId, Object.values(TITULOS_COBERTURA)],
  );
  const porClave = new Map();
  for (const a of filas) {
    const clave = claveDe({
      titulo: a.titulo,
      rolDestinoId: a.rol_destino_id,
      municipioId: a.municipio_id,
      codigo: a.indicador_codigo,
      vacunaId: a.vacuna_id,
      dosisId: a.dosis_id,
      filtro: a.filtro_dimensiones,
    });
    if (!porClave.has(clave) || a.estado === 'ACTIVA') porClave.set(clave, a);
  }
  return { porClave, activas: filas.filter((a) => a.estado === 'ACTIVA') };
}

const bitacoraDeAlerta = (contexto, accion, entidadId, valores) => ({
  ...contexto,
  modulo: MODULOS.INDICADORES,
  accion,
  entidad: 'alerta',
  entidadId,
  ...valores,
});

async function crear(conexion, nuevas, contexto) {
  if (nuevas.length === 0) return;
  const [insercion] = await conexion.query(
    `INSERT INTO alerta
       (tipo, severidad, titulo, mensaje, ddriss_id, periodo_id, municipio_id, resultado_indicador_id, rol_destino_id)
     VALUES ?`,
    [nuevas.map((a) => [
      a.tipo, a.severidad, a.titulo, a.mensaje, a.ddrissId, a.periodoId, a.municipioId, a.resultadoIndicadorId,
      a.rolDestinoId,
    ])],
  );
  // Los ids se leen de vuelta en lugar de suponerlos consecutivos. Los resultados son de esta corrida: solo las
  // alertas recién creadas los tienen con un id desde el primero insertado.
  const [creadas] = await conexion.query(
    `SELECT id, titulo, rol_destino_id, resultado_indicador_id FROM alerta
      WHERE id >= ? AND resultado_indicador_id IN (?)`,
    [insercion.insertId, nuevas.map((a) => a.resultadoIndicadorId)],
  );
  const clave = (titulo, rolDestinoId, resultadoId) => `${titulo}|${rolDestinoId}|${resultadoId}`;
  const idPorClave = new Map(creadas.map((a) => [clave(a.titulo, a.rol_destino_id, a.resultado_indicador_id), a.id]));
  await registrarBitacoras(conexion, nuevas.map((alerta) => {
    const id = idPorClave.get(clave(alerta.titulo, alerta.rolDestinoId, alerta.resultadoIndicadorId));
    return bitacoraDeAlerta(contexto, ACCIONES.CREAR, id, { valoresNuevos: { ...alerta, estado: 'ACTIVA' } });
  }));
}

async function actualizar(conexion, cambios, contexto) {
  if (cambios.length === 0) return;
  const casos = (columna) => `CASE id ${cambios.map(() => 'WHEN ? THEN ?').join(' ')} ELSE ${columna} END`;
  await conexion.query(
    `UPDATE alerta
        SET mensaje = ${casos('mensaje')}, resultado_indicador_id = ${casos('resultado_indicador_id')}
      WHERE id IN (?)`,
    [
      ...cambios.flatMap((c) => [c.id, c.despues.mensaje]),
      ...cambios.flatMap((c) => [c.id, c.despues.resultadoIndicadorId]),
      cambios.map((c) => c.id),
    ],
  );
  await registrarBitacoras(conexion, cambios.map(({ id, cambio }) =>
    bitacoraDeAlerta(contexto, ACCIONES.ACTUALIZAR, id, {
      valoresAnteriores: cambio.anteriores,
      valoresNuevos: cambio.nuevos,
    })));
}

async function descartar(conexion, ids, contexto) {
  if (ids.length === 0) return;
  await conexion.query("UPDATE alerta SET estado = 'DESCARTADA' WHERE id IN (?)", [ids]);
  await registrarBitacoras(conexion, ids.map((id) => bitacoraDeAlerta(contexto, ACCIONES.ACTUALIZAR, id, {
    valoresAnteriores: { estado: 'ACTIVA' },
    valoresNuevos: { estado: 'DESCARTADA' },
  })));
}

// Dentro de la transacción de guardarCorrida, después de insertar los resultados y solo si la corrida no es parcial:
// crea las alertas nuevas, actualiza las activas que siguen (mensaje y resultado de esta corrida) y descarta las
// activas que ya no aplican. contexto es el de la bitácora de la corrida.
export async function alertarCorrida(conexion, { corridaId, ddrissId, anio, mes, versiones }, contexto) {
  const [[periodo]] = await conexion.query('SELECT id FROM periodo WHERE anio = ? AND mes = ?', [anio, mes]);
  const periodoId = periodo.id;
  const deseadas = await alertasDeseadas(conexion, { corridaId, ddrissId, anio, mes, periodoId, versiones });
  const { porClave, activas } = await alertasExistentes(conexion, { ddrissId, periodoId });

  const nuevas = [];
  const cambios = [];
  const siguen = new Set();
  for (const { clave, alerta } of deseadas) {
    const existente = porClave.get(clave);
    if (!existente) {
      nuevas.push(alerta);
      continue;
    }
    siguen.add(existente.id);
    if (existente.estado !== 'ACTIVA') continue;
    const despues = { mensaje: alerta.mensaje, resultadoIndicadorId: alerta.resultadoIndicadorId };
    const cambio = diferencias(
      { mensaje: existente.mensaje, resultadoIndicadorId: existente.resultado_indicador_id },
      despues,
    );
    if (cambio) cambios.push({ id: existente.id, despues, cambio });
  }
  const sobran = activas.filter((a) => !siguen.has(a.id)).map((a) => a.id);

  await crear(conexion, nuevas, contexto);
  await actualizar(conexion, cambios, contexto);
  await descartar(conexion, sobran, contexto);
  return { creadas: nuevas.length, actualizadas: cambios.length, descartadas: sobran.length };
}
