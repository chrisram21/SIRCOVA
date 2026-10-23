import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import {
  validarCodigoVacuna,
  validarDescripcionVacuna,
  validarNombreDosis,
  validarNombreVacuna,
} from '../../validaciones/campos.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, leerBooleano, revisarCampos, revisarParametros } from './catalogos.service.js';

// El catálogo de vacunas es nacional: ninguna consulta se filtra por DDRISS.

const errores = {
  vacunaNoEncontrada: () => new ErrorApi(404, 'NO_ENCONTRADO', 'La vacuna no existe.'),
  dosisNoEncontrada: () => new ErrorApi(404, 'NO_ENCONTRADO', 'La dosis no existe.'),
  sinDosisActivas: () =>
    new ErrorApi(
      409,
      'VACUNA_SIN_DOSIS_ACTIVAS',
      'La vacuna debe conservar al menos una dosis activa; desactive la vacuna si ya no se aplica.',
    ),
  codigoDuplicado: () => new ErrorApi(409, 'VACUNA_DUPLICADA', 'Ya hay una vacuna con ese código.'),
  nombreDuplicado: () => new ErrorApi(409, 'VACUNA_DUPLICADA', 'Ya hay una vacuna con ese nombre.'),
  dosisDuplicada: () => new ErrorApi(409, 'DOSIS_DUPLICADA', 'La vacuna ya tiene una dosis con ese nombre.'),
  secuenciaUnica: () =>
    new ErrorApi(422, 'SECUENCIA_INVALIDA', 'Una vacuna con dosis única no lleva otras dosis, solo refuerzos.'),
  refuerzoAntes: () => new ErrorApi(422, 'SECUENCIA_INVALIDA', 'Los refuerzos van después de las dosis.'),
};

const TIPOS = ['UNICA', 'DOSIS', 'REFUERZO'];
const PREFIJOS = { DOSIS: 'D', REFUERZO: 'R' };
const ORDEN_INFORME_MAXIMO = 65535;

// El modelo no tiene columna tipo: el código de la dosis lo dice (UNICA, D{n}, R{n}).
export function tipoDeCodigo(codigo) {
  if (codigo === 'UNICA') return 'UNICA';
  if (/^D\d+$/.test(codigo)) return 'DOSIS';
  if (/^R\d+$/.test(codigo)) return 'REFUERZO';
  return null;
}

function aDosis(fila) {
  return {
    id: fila.id,
    codigo: fila.codigo,
    tipo: tipoDeCodigo(fila.codigo),
    nombre: fila.nombre,
    orden: fila.orden,
    completaEsquema: Boolean(fila.completa_esquema),
    esTrazadora: Boolean(fila.es_trazadora),
    activa: Boolean(fila.activa),
  };
}

function aVacuna(fila, dosis) {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    descripcion: fila.descripcion,
    ordenInforme: fila.orden_informe,
    activa: Boolean(fila.activa),
    dosis: dosis.map(aDosis),
  };
}

// Las vacunas que cumplen la condición, cada una con todas sus dosis (también las inactivas) por orden.
async function cargarVacunas(conexion, condicion, parametros) {
  const [vacunas] = await conexion.query(
    `SELECT v.id, v.codigo, v.nombre, v.descripcion, v.orden_informe, v.activa
       FROM vacuna v
      WHERE ${condicion}
      ORDER BY v.orden_informe, v.nombre`,
    parametros,
  );
  if (vacunas.length === 0) return [];
  const [dosis] = await conexion.query(
    `SELECT d.id, d.vacuna_id, d.codigo, d.nombre, d.orden, d.completa_esquema, d.es_trazadora, d.activa
       FROM dosis d
      WHERE d.vacuna_id IN (?)
      ORDER BY d.orden`,
    [vacunas.map((v) => v.id)],
  );
  return vacunas.map((v) => aVacuna(v, dosis.filter((d) => d.vacuna_id === v.id)));
}

export async function listarVacunas(query = {}) {
  revisarParametros(query, ['activa']);
  const activa = leerBooleano(query, 'activa');
  return activa === undefined ? cargarVacunas(pool, '1 = 1', []) : cargarVacunas(pool, 'v.activa = ?', [activa]);
}

export async function obtenerVacuna(id, conexion = pool) {
  const vacunaId = /^\d+$/.test(String(id)) ? Number(id) : 0;
  const [vacuna] = await cargarVacunas(conexion, 'v.id = ?', [vacunaId]);
  if (!vacuna) throw errores.vacunaNoEncontrada();
  return vacuna;
}

function aplicarRegla(regla, valor) {
  const resultado = regla(valor);
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

// Sin mayúsculas ni tildes, como compara la intercalación utf8mb4_0900_ai_ci.
const claveDeNombre = (nombre) => nombre.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

// Siguiente código del tipo contando las dosis activas e inactivas: un código no se reutiliza, para que un reporte
// histórico nunca apunte a una dosis con otro significado.
function siguienteCodigo(tipo, codigos) {
  if (tipo === 'UNICA') return 'UNICA';
  const numeros = codigos.filter((c) => tipoDeCodigo(c) === tipo).map((c) => Number(c.slice(1)));
  return `${PREFIJOS[tipo]}${Math.max(0, ...numeros) + 1}`;
}

// Una UNICA como máximo, y no se combina con dosis DOSIS (sí con refuerzos).
function revisarCombinacion(tipos) {
  const unicas = tipos.filter((t) => t === 'UNICA').length;
  if (unicas > 1 || (unicas === 1 && tipos.includes('DOSIS'))) throw errores.secuenciaUnica();
}

// La dosis activa UNICA o DOSIS de mayor orden o, si no hay, el refuerzo activo de mayor orden. Recibe las dosis
// ordenadas por orden, con su codigo y su activa.
function queCompletaEsquema(dosis) {
  const activas = dosis.filter((d) => d.activa);
  const sinRefuerzos = activas.filter((d) => tipoDeCodigo(d.codigo) !== 'REFUERZO');
  return (sinRefuerzos.length > 0 ? sinRefuerzos : activas).at(-1);
}

function leerMarca(valor, campo, porDefecto) {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== 'boolean') throw entradaInvalida(`${campo} debe ser true o false.`);
  return valor;
}

function leerOrdenInforme(valor) {
  if (!Number.isInteger(valor) || valor < 0 || valor > ORDEN_INFORME_MAXIMO) {
    throw entradaInvalida(`ordenInforme debe ser un número entero entre 0 y ${ORDEN_INFORME_MAXIMO}.`);
  }
  return valor;
}

// Cuerpo de una dosis nueva. codigo, orden, completaEsquema y activa los pone el sistema.
function leerDosisNueva(cuerpo) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw entradaInvalida('Cada dosis debe ser un objeto JSON.');
  }
  revisarCampos(cuerpo, ['tipo', 'nombre', 'esTrazadora']);
  if (!TIPOS.includes(cuerpo.tipo)) throw entradaInvalida('El tipo de la dosis debe ser UNICA, DOSIS o REFUERZO.');
  return {
    tipo: cuerpo.tipo,
    nombre: aplicarRegla(validarNombreDosis, cuerpo.nombre),
    esTrazadora: leerMarca(cuerpo.esTrazadora, 'esTrazadora', false),
  };
}

function leerVacunaNueva(cuerpo) {
  revisarCampos(cuerpo, ['codigo', 'nombre', 'descripcion', 'ordenInforme', 'dosis']);
  const datos = {
    codigo: aplicarRegla(validarCodigoVacuna, cuerpo.codigo),
    nombre: aplicarRegla(validarNombreVacuna, cuerpo.nombre),
    descripcion: aplicarRegla(validarDescripcionVacuna, cuerpo.descripcion),
    ordenInforme: cuerpo.ordenInforme == null ? null : leerOrdenInforme(cuerpo.ordenInforme),
  };
  if (!Array.isArray(cuerpo.dosis) || cuerpo.dosis.length === 0) throw entradaInvalida('Indique al menos una dosis.');
  datos.dosis = cuerpo.dosis.map(leerDosisNueva);

  const tipos = datos.dosis.map((d) => d.tipo);
  revisarCombinacion(tipos);
  const primerRefuerzo = tipos.indexOf('REFUERZO');
  if (primerRefuerzo >= 0 && tipos.slice(primerRefuerzo).some((t) => t !== 'REFUERZO')) throw errores.refuerzoAntes();

  const claves = datos.dosis.map((d) => claveDeNombre(d.nombre));
  if (new Set(claves).size !== claves.length) throw errores.dosisDuplicada();
  return datos;
}

async function verificarVacunaLibre(conexion, { codigo, nombre }, excluirId = 0) {
  if (codigo !== undefined) {
    const [filas] = await conexion.query('SELECT id FROM vacuna WHERE codigo = ? AND id <> ?', [codigo, excluirId]);
    if (filas.length > 0) throw errores.codigoDuplicado();
  }
  if (nombre !== undefined) {
    // La intercalación utf8mb4_0900_ai_ci compara sin mayúsculas ni tildes.
    const [filas] = await conexion.query('SELECT id FROM vacuna WHERE nombre = ? AND id <> ?', [nombre, excluirId]);
    if (filas.length > 0) throw errores.nombreDuplicado();
  }
}

export async function crearVacuna(cuerpo, contexto) {
  const datos = leerVacunaNueva(cuerpo);

  // El orden de la lista es el orden del esquema; los códigos se numeran por tipo.
  const codigos = [];
  const dosis = datos.dosis.map((d, i) => {
    const codigo = siguienteCodigo(d.tipo, codigos);
    codigos.push(codigo);
    return { ...d, codigo, orden: i + 1, activa: true };
  });
  const completa = queCompletaEsquema(dosis);

  try {
    return await enTransaccion(async (conexion) => {
      await verificarVacunaLibre(conexion, datos);
      let { ordenInforme } = datos;
      if (ordenInforme === null) {
        const [[{ mayor }]] = await conexion.query('SELECT MAX(orden_informe) AS mayor FROM vacuna');
        ordenInforme = Math.min((mayor ?? -1) + 1, ORDEN_INFORME_MAXIMO);
      }

      const [resultado] = await conexion.query(
        'INSERT INTO vacuna (codigo, nombre, descripcion, orden_informe) VALUES (?, ?, ?, ?)',
        [datos.codigo, datos.nombre, datos.descripcion, ordenInforme],
      );
      await conexion.query(
        'INSERT INTO dosis (vacuna_id, codigo, nombre, orden, completa_esquema, es_trazadora) VALUES ?',
        [dosis.map((d) => [resultado.insertId, d.codigo, d.nombre, d.orden, d === completa, d.esTrazadora])],
      );
      const vacuna = await obtenerVacuna(resultado.insertId, conexion);

      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.CONFIGURACION,
        accion: ACCIONES.CREAR,
        entidad: 'vacuna',
        entidadId: vacuna.id,
        valoresNuevos: vacuna,
      });
      return vacuna;
    });
  } catch (err) {
    // Dos altas a la vez con el mismo código: la llave única es la última barrera.
    if (err.code === 'ER_DUP_ENTRY') throw errores.codigoDuplicado();
    throw err;
  }
}

// Va como primera consulta de cada transacción que cambia una vacuna o sus dosis: con REPEATABLE READ, una lectura
// sin bloqueo antes de esperarlo fijaría una vista en la que no se ven las dosis que acaba de insertar otra petición.
async function bloquearVacuna(conexion, id) {
  const vacunaId = /^\d+$/.test(String(id)) ? Number(id) : 0;
  const [[fila]] = await conexion.query(
    'SELECT id, nombre, descripcion, orden_informe, activa FROM vacuna WHERE id = ? FOR UPDATE',
    [vacunaId],
  );
  if (!fila) throw errores.vacunaNoEncontrada();
  return fila;
}

async function registrarCambio(conexion, contexto, { accion, entidad, entidadId, cambios }) {
  await registrarBitacora(conexion, {
    ...contexto,
    modulo: MODULOS.CONFIGURACION,
    accion,
    entidad,
    entidadId,
    valoresAnteriores: cambios.anteriores,
    valoresNuevos: cambios.nuevos,
  });
}

// Campo de la API → columna y cómo se lee un valor nuevo.
const EDITABLES_VACUNA = {
  nombre: { columna: 'nombre', leer: (v) => aplicarRegla(validarNombreVacuna, v) },
  descripcion: { columna: 'descripcion', leer: (v) => aplicarRegla(validarDescripcionVacuna, v) },
  ordenInforme: { columna: 'orden_informe', leer: leerOrdenInforme },
};

function leerCambiosVacuna(cuerpo) {
  if (cuerpo !== null && typeof cuerpo === 'object' && Object.hasOwn(cuerpo, 'codigo')) {
    throw entradaInvalida('codigo no se puede cambiar.');
  }
  revisarCampos(cuerpo, Object.keys(EDITABLES_VACUNA));
  if (Object.keys(cuerpo).length === 0) throw entradaInvalida('Indique al menos un dato de la vacuna.');
  return cuerpo;
}

// También con la vacuna inactiva. Un valor igual al guardado no se valida.
export async function editarVacuna(id, cuerpo, contexto) {
  const cambiosPedidos = leerCambiosVacuna(cuerpo);

  return enTransaccion(async (conexion) => {
    const fila = await bloquearVacuna(conexion, id);
    const antes = {};
    const despues = {};
    for (const [campo, { columna, leer }] of Object.entries(EDITABLES_VACUNA)) {
      antes[campo] = fila[columna];
      despues[campo] = fila[columna];
      if (Object.hasOwn(cambiosPedidos, campo) && cambiosPedidos[campo] !== fila[columna]) {
        despues[campo] = leer(cambiosPedidos[campo]);
      }
    }

    const cambios = diferencias(antes, despues);
    if (cambios) {
      if (Object.hasOwn(cambios.nuevos, 'nombre')) {
        await verificarVacunaLibre(conexion, { nombre: despues.nombre }, fila.id);
      }
      const campos = Object.keys(cambios.nuevos);
      await conexion.query(
        `UPDATE vacuna SET ${campos.map((c) => `${EDITABLES_VACUNA[c].columna} = ?`).join(', ')} WHERE id = ?`,
        [...campos.map((c) => despues[c]), fila.id],
      );
      await registrarCambio(conexion, contexto, {
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'vacuna',
        entidadId: fila.id,
        cambios,
      });
    }
    return obtenerVacuna(fila.id, conexion);
  });
}

// Solo cambia vacuna.activa: las dosis quedan como están, así la vacuna vuelve igual al reactivarla.
async function cambiarEstadoVacuna(id, activa, contexto) {
  return enTransaccion(async (conexion) => {
    const fila = await bloquearVacuna(conexion, id);
    const cambios = diferencias({ activa: Boolean(fila.activa) }, { activa });
    if (cambios) {
      await conexion.query('UPDATE vacuna SET activa = ? WHERE id = ?', [activa, fila.id]);
      await registrarCambio(conexion, contexto, {
        accion: activa ? ACCIONES.REACTIVAR : ACCIONES.DESACTIVAR,
        entidad: 'vacuna',
        entidadId: fila.id,
        cambios,
      });
    }
    return obtenerVacuna(fila.id, conexion);
  });
}

export const desactivarVacuna = (id, contexto) => cambiarEstadoVacuna(id, false, contexto);

export const reactivarVacuna = (id, contexto) => cambiarEstadoVacuna(id, true, contexto);

async function leerDosisDeVacuna(conexion, vacunaId) {
  const [filas] = await conexion.query(
    `SELECT id, codigo, nombre, orden, completa_esquema, es_trazadora, activa
       FROM dosis WHERE vacuna_id = ? ORDER BY orden`,
    [vacunaId],
  );
  return filas;
}

// Una dosis de otra vacuna responde el mismo 404 que una inexistente.
function buscarDosis(dosis, id) {
  const dosisId = /^\d+$/.test(String(id)) ? Number(id) : 0;
  const fila = dosis.find((d) => d.id === dosisId);
  if (!fila) throw errores.dosisNoEncontrada();
  return fila;
}

function verificarNombreDosisLibre(dosis, nombre, excluirId = 0) {
  const clave = claveDeNombre(nombre);
  if (dosis.some((d) => d.id !== excluirId && claveDeNombre(d.nombre) === clave)) throw errores.dosisDuplicada();
}

// Recalcula completa_esquema de todas las dosis de la vacuna y deja una fila ACTUALIZAR por cada una cuya marca
// cambió, salvo la dosis de la operación, cuya fila ya lleva el cambio.
async function recalcularCompleta(conexion, contexto, vacunaId, dosisDeLaOperacion) {
  const dosis = await leerDosisDeVacuna(conexion, vacunaId);
  const completa = queCompletaEsquema(dosis);
  for (const fila of dosis) {
    const antes = Boolean(fila.completa_esquema);
    const despues = fila.id === completa?.id;
    if (antes === despues) continue;
    await conexion.query('UPDATE dosis SET completa_esquema = ? WHERE id = ?', [despues, fila.id]);
    if (fila.id === dosisDeLaOperacion) continue;
    await registrarCambio(conexion, contexto, {
      accion: ACCIONES.ACTUALIZAR,
      entidad: 'dosis',
      entidadId: fila.id,
      cambios: { anteriores: { completaEsquema: antes }, nuevos: { completaEsquema: despues } },
    });
  }
}

// Siempre al final: su código es el siguiente de su tipo y su orden el mayor de la vacuna más uno.
export async function agregarDosis(vacunaId, cuerpo, contexto) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw entradaInvalida('El cuerpo debe ser un objeto JSON.');
  }
  const nueva = leerDosisNueva(cuerpo);

  return enTransaccion(async (conexion) => {
    const vacuna = await bloquearVacuna(conexion, vacunaId);
    const dosis = await leerDosisDeVacuna(conexion, vacuna.id);
    revisarCombinacion([...dosis.map((d) => tipoDeCodigo(d.codigo)), nueva.tipo]);
    verificarNombreDosisLibre(dosis, nueva.nombre);

    const codigo = siguienteCodigo(nueva.tipo, dosis.map((d) => d.codigo));
    const orden = Math.max(0, ...dosis.map((d) => d.orden)) + 1;
    const [resultado] = await conexion.query(
      'INSERT INTO dosis (vacuna_id, codigo, nombre, orden, es_trazadora) VALUES (?, ?, ?, ?, ?)',
      [vacuna.id, codigo, nueva.nombre, orden, nueva.esTrazadora],
    );
    await recalcularCompleta(conexion, contexto, vacuna.id, resultado.insertId);

    const resultadoVacuna = await obtenerVacuna(vacuna.id, conexion);
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.CONFIGURACION,
      accion: ACCIONES.CREAR,
      entidad: 'dosis',
      entidadId: resultado.insertId,
      valoresNuevos: { vacunaId: vacuna.id, ...resultadoVacuna.dosis.find((d) => d.id === resultado.insertId) },
    });
    return resultadoVacuna;
  });
}

const NO_SE_CAMBIAN_DOSIS = ['codigo', 'tipo', 'orden', 'completaEsquema'];

function leerCambiosDosis(cuerpo) {
  if (cuerpo !== null && typeof cuerpo === 'object') {
    for (const campo of NO_SE_CAMBIAN_DOSIS) {
      if (Object.hasOwn(cuerpo, campo)) throw entradaInvalida(`${campo} no se puede cambiar.`);
    }
  }
  revisarCampos(cuerpo, ['nombre', 'esTrazadora']);
  if (Object.keys(cuerpo).length === 0) throw entradaInvalida('Indique al menos un dato de la dosis.');
  return cuerpo;
}

export async function editarDosis(vacunaId, dosisId, cuerpo, contexto) {
  const cambiosPedidos = leerCambiosDosis(cuerpo);

  return enTransaccion(async (conexion) => {
    const vacuna = await bloquearVacuna(conexion, vacunaId);
    const dosis = await leerDosisDeVacuna(conexion, vacuna.id);
    const fila = buscarDosis(dosis, dosisId);

    const antes = { nombre: fila.nombre, esTrazadora: Boolean(fila.es_trazadora) };
    const despues = { ...antes };
    if (Object.hasOwn(cambiosPedidos, 'nombre') && cambiosPedidos.nombre !== fila.nombre) {
      despues.nombre = aplicarRegla(validarNombreDosis, cambiosPedidos.nombre);
    }
    if (Object.hasOwn(cambiosPedidos, 'esTrazadora')) {
      despues.esTrazadora = leerMarca(cambiosPedidos.esTrazadora, 'esTrazadora');
    }

    const cambios = diferencias(antes, despues);
    if (cambios) {
      if (Object.hasOwn(cambios.nuevos, 'nombre')) verificarNombreDosisLibre(dosis, despues.nombre, fila.id);
      await conexion.query('UPDATE dosis SET nombre = ?, es_trazadora = ? WHERE id = ?', [
        despues.nombre,
        despues.esTrazadora,
        fila.id,
      ]);
      await registrarCambio(conexion, contexto, {
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'dosis',
        entidadId: fila.id,
        cambios,
      });
    }
    return obtenerVacuna(vacuna.id, conexion);
  });
}

// La vacuna conserva siempre una dosis activa, aunque esté inactiva: así siempre hay una que completa el esquema.
async function cambiarEstadoDosis(vacunaId, dosisId, activa, contexto) {
  return enTransaccion(async (conexion) => {
    const vacuna = await bloquearVacuna(conexion, vacunaId);
    const dosis = await leerDosisDeVacuna(conexion, vacuna.id);
    const fila = buscarDosis(dosis, dosisId);
    if (Boolean(fila.activa) === activa) return obtenerVacuna(vacuna.id, conexion);
    if (!activa && !dosis.some((d) => d.id !== fila.id && d.activa)) throw errores.sinDosisActivas();

    await conexion.query('UPDATE dosis SET activa = ? WHERE id = ?', [activa, fila.id]);
    await recalcularCompleta(conexion, contexto, vacuna.id, fila.id);
    const resultado = await obtenerVacuna(vacuna.id, conexion);
    const actualizada = resultado.dosis.find((d) => d.id === fila.id);
    await registrarCambio(conexion, contexto, {
      accion: activa ? ACCIONES.REACTIVAR : ACCIONES.DESACTIVAR,
      entidad: 'dosis',
      entidadId: fila.id,
      cambios: diferencias(
        { activa: Boolean(fila.activa), completaEsquema: Boolean(fila.completa_esquema) },
        { activa: actualizada.activa, completaEsquema: actualizada.completaEsquema },
      ),
    });
    return resultado;
  });
}

export const desactivarDosis = (vacunaId, dosisId, contexto) => cambiarEstadoDosis(vacunaId, dosisId, false, contexto);

export const reactivarDosis = (vacunaId, dosisId, contexto) => cambiarEstadoDosis(vacunaId, dosisId, true, contexto);
