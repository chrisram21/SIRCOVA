import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { validarNombreRed } from '../../validaciones/campos.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { esAlcanceNacional, filtroAlcance, verificarAlcance } from '../auth/alcance.service.js';
import { entradaInvalida, leerBooleano, revisarCampos, revisarParametros } from './catalogos.service.js';

const errores = {
  noEncontrada: () => new ErrorApi(404, 'NO_ENCONTRADO', 'La red no existe.'),
  duplicada: () => new ErrorApi(409, 'RED_DUPLICADA', 'Ya hay una red con ese nombre en la DDRISS.'),
  municipioEnOtraRed: (municipio, red) =>
    new ErrorApi(409, 'MUNICIPIO_EN_OTRA_RED', `${municipio} ya pertenece a la ${red}.`),
  inactiva: () => new ErrorApi(409, 'RED_INACTIVA', 'La red está inactiva; reactívela con sus municipios.'),
  activa: () => new ErrorApi(409, 'RED_ACTIVA', 'La red ya está activa.'),
  municipioInvalido: () =>
    new ErrorApi(422, 'MUNICIPIO_INVALIDO', 'El municipio no existe, está inactivo o no es del departamento de su DDRISS.'),
  dosisInvalida: () =>
    new ErrorApi(422, 'DOSIS_INVALIDA', 'La dosis no existe, está inactiva o es de una vacuna inactiva.'),
};

const leerIdPositivo = (texto, campo) => {
  if (!/^\d+$/.test(texto) || Number(texto) <= 0) throw entradaInvalida(`${campo} debe ser un número entero positivo.`);
  return Number(texto);
};

const CONSULTA_RED = `
  SELECT r.id, r.codigo, r.nombre, r.activo, r.ddriss_id, d.codigo AS ddriss_codigo, d.nombre AS ddriss_nombre
    FROM red r
    JOIN ddriss d ON d.id = r.ddriss_id`;

// Municipios y trazadoras de varias redes en dos consultas, para no hacer una por red.
async function armarRedes(ejecutor, filas) {
  if (filas.length === 0) return [];
  const ids = filas.map((f) => f.id);
  const [[municipios], [trazadoras]] = await Promise.all([
    ejecutor.query(
      `SELECT rm.red_id, m.id, m.codigo_ine, m.nombre
         FROM red_municipio rm JOIN municipio m ON m.id = rm.municipio_id
        WHERE rm.red_id IN (?)
        ORDER BY m.nombre`,
      [ids],
    ),
    ejecutor.query(
      `SELECT rt.red_id, d.id AS dosis_id, d.codigo, d.nombre, d.activa,
              v.id AS vacuna_id, v.codigo AS vacuna_codigo, v.nombre AS vacuna_nombre, v.activa AS vacuna_activa
         FROM red_trazadora rt
         JOIN dosis d ON d.id = rt.dosis_id
         JOIN vacuna v ON v.id = d.vacuna_id
        WHERE rt.red_id IN (?)
        ORDER BY v.orden_informe, v.nombre, d.orden`,
      [ids],
    ),
  ]);
  return filas.map((f) => ({
    id: f.id,
    codigo: f.codigo,
    nombre: f.nombre,
    activo: Boolean(f.activo),
    ddriss: { id: f.ddriss_id, codigo: f.ddriss_codigo, nombre: f.ddriss_nombre },
    municipios: municipios
      .filter((m) => m.red_id === f.id)
      .map((m) => ({ id: m.id, codigoIne: m.codigo_ine, nombre: m.nombre })),
    trazadoras: trazadoras
      .filter((t) => t.red_id === f.id)
      .map((t) => ({
        dosisId: t.dosis_id,
        codigo: t.codigo,
        nombre: t.nombre,
        activa: Boolean(t.activa),
        vacuna: { id: t.vacuna_id, codigo: t.vacuna_codigo, nombre: t.vacuna_nombre, activa: Boolean(t.vacuna_activa) },
      })),
  }));
}

export async function buscarRed(ejecutor, id) {
  const [filas] = await ejecutor.query(`${CONSULTA_RED} WHERE r.id = ?`, [id]);
  const [red] = await armarRedes(ejecutor, filas);
  return red ?? null;
}

export async function listarRedes(usuario, query = {}) {
  revisarParametros(query, ['activo', 'ddrissId']);
  const condiciones = [];
  const parametros = [];

  if (query.ddrissId !== undefined) {
    if (!esAlcanceNacional(usuario)) throw entradaInvalida('Parámetro no permitido: ddrissId.');
    condiciones.push('r.ddriss_id = ?');
    parametros.push(leerIdPositivo(query.ddrissId, 'ddrissId'));
  } else {
    const alcance = filtroAlcance(usuario, { ddriss: 'r.ddriss_id' });
    condiciones.push(alcance.condicion);
    parametros.push(...alcance.parametros);
  }
  const activo = leerBooleano(query, 'activo');
  if (activo !== undefined) {
    condiciones.push('r.activo = ?');
    parametros.push(activo);
  }

  const [filas] = await pool.query(
    `${CONSULTA_RED} WHERE ${condiciones.join(' AND ')} ORDER BY d.nombre, r.nombre`,
    parametros,
  );
  return armarRedes(pool, filas);
}

export async function obtenerRed(id, usuario) {
  const redId = /^\d+$/.test(String(id)) ? Number(id) : 0;
  const red = redId > 0 ? await buscarRed(pool, redId) : null;
  if (!red) throw errores.noEncontrada();
  verificarAlcance(usuario, { ddrissId: red.ddriss.id });
  return red;
}

// Los municipios que puede tener una red de la DDRISS: activos, del departamento sede y sin el 9999.
const MUNICIPIOS_ELEGIBLES = `
  SELECT m.id, m.codigo_ine, m.nombre
    FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id
   WHERE d.id = ? AND m.activo = TRUE AND m.codigo_ine <> '9999'`;

export async function opcionesRed(usuario, query = {}) {
  revisarParametros(query, []);
  const ddrissId = usuario.ddrissId;
  const [[municipios], [vacunas], [dosis]] = await Promise.all([
    pool.query(
      `SELECT e.id, e.codigo_ine, e.nombre, r.id AS red_id, r.nombre AS red_nombre
         FROM (${MUNICIPIOS_ELEGIBLES}) e
         LEFT JOIN red_municipio rm ON rm.municipio_id = e.id
         LEFT JOIN red r ON r.id = rm.red_id
        ORDER BY e.nombre`,
      [ddrissId],
    ),
    pool.query('SELECT id, codigo, nombre FROM vacuna WHERE activa = TRUE ORDER BY orden_informe, nombre'),
    pool.query(
      `SELECT d.id, d.vacuna_id, d.codigo, d.nombre, d.es_trazadora
         FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id
        WHERE d.activa = TRUE AND v.activa = TRUE
        ORDER BY d.orden`,
    ),
  ]);
  return {
    municipios: municipios.map((m) => ({
      id: m.id,
      codigoIne: m.codigo_ine,
      nombre: m.nombre,
      red: m.red_id ? { id: m.red_id, nombre: m.red_nombre } : null,
    })),
    vacunas: vacunas.map((v) => ({
      id: v.id,
      codigo: v.codigo,
      nombre: v.nombre,
      dosis: dosis
        .filter((d) => d.vacuna_id === v.id)
        .map((d) => ({ id: d.id, codigo: d.codigo, nombre: d.nombre, esTrazadora: Boolean(d.es_trazadora) })),
    })),
  };
}

// ---------------------------------------------------------------- Escritura

function leerNombre(valor) {
  const resultado = validarNombreRed(valor);
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

function leerIds(valor, campo, mensajeVacia) {
  if (!Array.isArray(valor)) throw entradaInvalida(`${campo} debe ser una lista de ids.`);
  if (valor.length === 0) throw entradaInvalida(mensajeVacia);
  if (!valor.every((id) => Number.isInteger(id) && id > 0)) {
    throw entradaInvalida(`${campo} debe tener solo números enteros positivos.`);
  }
  if (new Set(valor).size !== valor.length) throw entradaInvalida(`${campo} no puede repetir ids.`);
  return [...valor].sort((a, b) => a - b);
}

const leerMunicipios = (valor) => leerIds(valor, 'municipioIds', 'La red debe tener al menos un municipio.');
const leerDosis = (valor) => leerIds(valor, 'dosisIds', 'La red debe tener al menos una trazadora.');

function revisarCuerpo(cuerpo, permitidos) {
  if (cuerpo !== null && typeof cuerpo === 'object' && Object.hasOwn(cuerpo, 'codigo')) {
    throw entradaInvalida('codigo no se puede cambiar.');
  }
  revisarCampos(cuerpo, permitidos);
}

// Regla 10: escriben solo usuarios con DDRISS; la Autoridad nacional no tiene RED_CREAR ni RED_EDITAR.
function ddrissDeQuienEscribe(usuario) {
  if (!Number.isInteger(usuario.ddrissId)) throw new Error('El usuario que escribe redes no tiene DDRISS.');
  return usuario.ddrissId;
}

// Primera consulta de cada transacción: ordena las escrituras de redes de la DDRISS, para que dos altas no tomen
// el mismo código y dos ediciones no pongan un municipio en dos redes (nota del 2026-10-23 de CLAUDE.md).
async function bloquearDdriss(conexion, ddrissId) {
  await conexion.query('SELECT id FROM ddriss WHERE id = ? FOR UPDATE', [ddrissId]);
}

// Una red de otra DDRISS responde el mismo 404 que una inexistente.
async function bloquearRed(conexion, id, ddrissId) {
  const redId = /^\d+$/.test(String(id)) ? Number(id) : 0;
  const [[fila]] = await conexion.query('SELECT id, nombre, activo FROM red WHERE id = ? AND ddriss_id = ? FOR UPDATE', [
    redId,
    ddrissId,
  ]);
  if (!fila) throw errores.noEncontrada();
  return fila;
}

async function verificarNombreLibre(conexion, ddrissId, nombre, excluirId = 0) {
  // La intercalación utf8mb4_0900_ai_ci compara sin mayúsculas ni tildes.
  const [filas] = await conexion.query('SELECT id FROM red WHERE ddriss_id = ? AND nombre = ? AND id <> ?', [
    ddrissId,
    nombre,
    excluirId,
  ]);
  if (filas.length > 0) throw errores.duplicada();
}

async function verificarMunicipios(conexion, ddrissId, municipioIds, redId = 0) {
  const [elegibles] = await conexion.query(`${MUNICIPIOS_ELEGIBLES} AND m.id IN (?)`, [ddrissId, municipioIds]);
  if (elegibles.length !== municipioIds.length) throw errores.municipioInvalido();
  const [ocupados] = await conexion.query(
    `SELECT m.nombre AS municipio, r.nombre AS red
       FROM red_municipio rm
       JOIN red r ON r.id = rm.red_id
       JOIN municipio m ON m.id = rm.municipio_id
      WHERE rm.municipio_id IN (?) AND rm.red_id <> ?
      ORDER BY m.nombre`,
    [municipioIds, redId],
  );
  if (ocupados.length > 0) throw errores.municipioEnOtraRed(ocupados[0].municipio, ocupados[0].red);
}

// Una dosis nueva debe estar activa y ser de una vacuna activa; una ya guardada se conserva aunque se desactive.
async function verificarDosis(conexion, dosisIds, guardadas = []) {
  const nuevas = dosisIds.filter((id) => !guardadas.includes(id));
  if (nuevas.length === 0) return;
  const [vigentes] = await conexion.query(
    `SELECT d.id FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id
      WHERE d.id IN (?) AND d.activa = TRUE AND v.activa = TRUE`,
    [nuevas],
  );
  if (vigentes.length !== nuevas.length) throw errores.dosisInvalida();
}

async function trazadorasPorDefecto(conexion) {
  const [filas] = await conexion.query(
    `SELECT d.id FROM dosis d JOIN vacuna v ON v.id = d.vacuna_id
      WHERE d.es_trazadora = TRUE AND d.activa = TRUE AND v.activa = TRUE
      ORDER BY d.id`,
  );
  return filas.map((f) => f.id);
}

// RED_{NN}, el siguiente de la DDRISS contando las inactivas.
async function siguienteCodigo(conexion, ddrissId) {
  const [filas] = await conexion.query('SELECT codigo FROM red WHERE ddriss_id = ?', [ddrissId]);
  const consecutivos = filas
    .map(({ codigo }) => /^RED_(\d+)$/.exec(codigo)?.[1])
    .filter(Boolean)
    .map(Number);
  return `RED_${String(Math.max(0, ...consecutivos) + 1).padStart(2, '0')}`;
}

async function estadoGuardado(conexion, red) {
  const [[municipios], [dosis]] = await Promise.all([
    conexion.query('SELECT municipio_id FROM red_municipio WHERE red_id = ? ORDER BY municipio_id', [red.id]),
    conexion.query('SELECT dosis_id FROM red_trazadora WHERE red_id = ? ORDER BY dosis_id', [red.id]),
  ]);
  return {
    nombre: red.nombre,
    activo: Boolean(red.activo),
    municipioIds: municipios.map((f) => f.municipio_id),
    dosisIds: dosis.map((f) => f.dosis_id),
  };
}

const igualLista = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function reemplazarListas(conexion, redId, antes, despues) {
  if (!igualLista(antes.municipioIds, despues.municipioIds)) {
    await conexion.query('DELETE FROM red_municipio WHERE red_id = ?', [redId]);
    if (despues.municipioIds.length > 0) {
      await conexion.query('INSERT INTO red_municipio (red_id, municipio_id) VALUES ?', [
        despues.municipioIds.map((id) => [redId, id]),
      ]);
    }
  }
  if (!igualLista(antes.dosisIds, despues.dosisIds)) {
    await conexion.query('DELETE FROM red_trazadora WHERE red_id = ?', [redId]);
    await conexion.query('INSERT INTO red_trazadora (red_id, dosis_id) VALUES ?', [
      despues.dosisIds.map((id) => [redId, id]),
    ]);
  }
}

// Con el bloqueo de la DDRISS no debería pasar; si dos escrituras chocan igual, el índice único responde 409.
function traducirDuplicado(err) {
  if (err?.code !== 'ER_DUP_ENTRY') throw err;
  if (String(err.message).includes('uq_red_municipio')) {
    throw new ErrorApi(409, 'MUNICIPIO_EN_OTRA_RED', 'Uno de los municipios ya pertenece a otra red.');
  }
  throw errores.duplicada();
}

const registrar = (conexion, contexto, accion, redId, valores) =>
  registrarBitacora(conexion, {
    ...contexto,
    modulo: MODULOS.CONFIGURACION,
    accion,
    entidad: 'red',
    entidadId: redId,
    valoresAnteriores: valores.anteriores ?? null,
    valoresNuevos: valores.nuevos,
  });

export async function crearRed(cuerpo, usuario, contexto) {
  revisarCuerpo(cuerpo, ['nombre', 'municipioIds']);
  const nombre = leerNombre(cuerpo.nombre);
  const municipioIds = leerMunicipios(cuerpo.municipioIds);
  const ddrissId = ddrissDeQuienEscribe(usuario);

  return enTransaccion(async (conexion) => {
    await bloquearDdriss(conexion, ddrissId);
    await verificarNombreLibre(conexion, ddrissId, nombre);
    await verificarMunicipios(conexion, ddrissId, municipioIds);
    const dosisIds = await trazadorasPorDefecto(conexion);
    if (dosisIds.length === 0) throw entradaInvalida('No hay dosis trazadoras activas para la red.');
    const codigo = await siguienteCodigo(conexion, ddrissId);

    const redId = await conexion
      .query('INSERT INTO red (ddriss_id, codigo, nombre) VALUES (?, ?, ?)', [ddrissId, codigo, nombre])
      .then(([resultado]) => resultado.insertId, traducirDuplicado);
    await reemplazarListas(conexion, redId, { municipioIds: [], dosisIds: [] }, { municipioIds, dosisIds }).catch(
      traducirDuplicado,
    );
    await registrar(conexion, contexto, ACCIONES.CREAR, redId, { nuevos: { codigo, nombre, municipioIds, dosisIds } });
    return buscarRed(conexion, redId);
  });
}

// Lo común de editar y reactivar: valida lo que cambia, escribe y deja la bitácora solo si algo cambió.
async function guardarCambios(conexion, { red, ddrissId, antes, despues, accion, contexto }) {
  if (despues.nombre !== antes.nombre) await verificarNombreLibre(conexion, ddrissId, despues.nombre, red.id);
  if (!igualLista(despues.municipioIds, antes.municipioIds)) {
    await verificarMunicipios(conexion, ddrissId, despues.municipioIds, red.id);
  }
  await verificarDosis(conexion, despues.dosisIds, antes.dosisIds);

  const cambios = diferencias(antes, despues);
  if (!cambios) return;
  if (despues.nombre !== antes.nombre || despues.activo !== antes.activo) {
    await conexion
      .query('UPDATE red SET nombre = ?, activo = ? WHERE id = ?', [despues.nombre, despues.activo, red.id])
      .catch(traducirDuplicado);
  }
  await reemplazarListas(conexion, red.id, antes, despues).catch(traducirDuplicado);
  await registrar(conexion, contexto, accion, red.id, cambios);
}

function leerCambios(cuerpo) {
  return {
    nombre: cuerpo.nombre === undefined ? undefined : leerNombre(cuerpo.nombre),
    municipioIds: cuerpo.municipioIds === undefined ? undefined : leerMunicipios(cuerpo.municipioIds),
    dosisIds: cuerpo.dosisIds === undefined ? undefined : leerDosis(cuerpo.dosisIds),
  };
}

const aplicar = (antes, cambios) => ({
  ...antes,
  nombre: cambios.nombre ?? antes.nombre,
  municipioIds: cambios.municipioIds ?? antes.municipioIds,
  dosisIds: cambios.dosisIds ?? antes.dosisIds,
});

export async function editarRed(id, cuerpo, usuario, contexto) {
  revisarCuerpo(cuerpo, ['nombre', 'municipioIds', 'dosisIds']);
  if (Object.keys(cuerpo).length === 0) throw entradaInvalida('Indique al menos un campo para cambiar.');
  const cambios = leerCambios(cuerpo);
  const ddrissId = ddrissDeQuienEscribe(usuario);

  return enTransaccion(async (conexion) => {
    await bloquearDdriss(conexion, ddrissId);
    const red = await bloquearRed(conexion, id, ddrissId);
    if (!red.activo) throw errores.inactiva();
    const antes = await estadoGuardado(conexion, red);
    const despues = aplicar(antes, cambios);
    await guardarCambios(conexion, { red, ddrissId, antes, despues, accion: ACCIONES.ACTUALIZAR, contexto });
    return buscarRed(conexion, red.id);
  });
}

// Libera los municipios para que otra red los pueda tomar; las trazadoras se conservan.
export async function desactivarRed(id, usuario, contexto) {
  const ddrissId = ddrissDeQuienEscribe(usuario);
  return enTransaccion(async (conexion) => {
    await bloquearDdriss(conexion, ddrissId);
    const red = await bloquearRed(conexion, id, ddrissId);
    if (red.activo) {
      const antes = await estadoGuardado(conexion, red);
      const despues = { ...antes, activo: false, municipioIds: [] };
      await conexion.query('UPDATE red SET activo = FALSE WHERE id = ?', [red.id]);
      await reemplazarListas(conexion, red.id, antes, despues);
      await registrar(conexion, contexto, ACCIONES.DESACTIVAR, red.id, diferencias(antes, despues));
    }
    return buscarRed(conexion, red.id);
  });
}

// Una red inactiva no tiene municipios: se reactiva con al menos uno libre, y puede cambiar nombre y trazadoras.
export async function reactivarRed(id, cuerpo, usuario, contexto) {
  revisarCuerpo(cuerpo, ['municipioIds', 'nombre', 'dosisIds']);
  if (cuerpo.municipioIds === undefined) throw entradaInvalida('La red debe tener al menos un municipio.');
  const cambios = leerCambios(cuerpo);
  const ddrissId = ddrissDeQuienEscribe(usuario);

  return enTransaccion(async (conexion) => {
    await bloquearDdriss(conexion, ddrissId);
    const red = await bloquearRed(conexion, id, ddrissId);
    if (red.activo) throw errores.activa();
    const antes = await estadoGuardado(conexion, red);
    const despues = { ...aplicar(antes, cambios), activo: true };
    if (despues.dosisIds.length === 0) throw entradaInvalida('La red debe tener al menos una trazadora.');
    await guardarCambios(conexion, { red, ddrissId, antes, despues, accion: ACCIONES.REACTIVAR, contexto });
    return buscarRed(conexion, red.id);
  });
}
