import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import {
  validarCorreo,
  validarDireccion,
  validarNombreContacto,
  validarNombreEstablecimiento,
  validarTelefono,
} from '../../validaciones/campos.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { filtroAlcance } from '../auth/alcance.service.js';
import { entradaInvalida, leerBooleano, revisarCampos, revisarParametros } from './catalogos.service.js';

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El establecimiento no existe.'),
  duplicado: () =>
    new ErrorApi(409, 'ESTABLECIMIENTO_DUPLICADO', 'Ya hay un establecimiento con ese nombre en el municipio.'),
  conCuentas: (n) =>
    new ErrorApi(
      409,
      'ESTABLECIMIENTO_CON_CUENTAS',
      n === 1
        ? 'El establecimiento tiene 1 cuenta activa; muévala o desactívela en Usuarios primero.'
        : `El establecimiento tiene ${n} cuentas activas; muévalas o desactívelas en Usuarios primero.`,
    ),
  tipoInvalido: () => new ErrorApi(422, 'TIPO_INVALIDO', 'El tipo de establecimiento no existe.'),
  municipioInvalido: () =>
    new ErrorApi(422, 'MUNICIPIO_INVALIDO', 'El municipio no existe, está inactivo o no admite establecimientos.'),
  distritoInvalido: () =>
    new ErrorApi(422, 'DISTRITO_INVALIDO', 'El distrito de salud no existe, está inactivo o no es del municipio.'),
  distritoEnExterno: () =>
    new ErrorApi(422, 'DISTRITO_INVALIDO', 'Un establecimiento externo no lleva distrito de salud.'),
  marcasInvalidas: () =>
    new ErrorApi(
      422,
      'MARCAS_INVALIDAS',
      'Un establecimiento que envía el 5C o solo cuenta para cobertura debe reportar producción.',
    ),
};

// cuentas_activas: cuentas activas cuyo empleado, también activo, trabaja en el establecimiento.
const CONSULTA_ESTABLECIMIENTO = `
  SELECT e.id, e.codigo, e.nombre, e.tipo_establecimiento_id, t.codigo AS tipo_codigo, t.nombre AS tipo_nombre,
         e.ddriss_id, e.distrito_salud_id, ds.codigo AS distrito_codigo, ds.nombre AS distrito_nombre,
         e.municipio_id, m.codigo_ine AS municipio_codigo_ine, m.nombre AS municipio_nombre,
         e.reporta_produccion, e.reporta_5c, e.solo_cobertura, e.es_externo,
         e.direccion, e.telefono, e.correo, e.nombre_contacto, e.activo,
         (SELECT COUNT(*) FROM usuario u JOIN empleado em ON em.id = u.empleado_id
           WHERE em.establecimiento_id = e.id AND u.activo = TRUE AND em.activo = TRUE) AS cuentas_activas
    FROM establecimiento e
    JOIN tipo_establecimiento t ON t.id = e.tipo_establecimiento_id
    JOIN municipio m ON m.id = e.municipio_id
    LEFT JOIN distrito_salud ds ON ds.id = e.distrito_salud_id`;

function aEstablecimiento(fila) {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    tipoEstablecimientoId: fila.tipo_establecimiento_id,
    tipoEstablecimientoCodigo: fila.tipo_codigo,
    tipoEstablecimientoNombre: fila.tipo_nombre,
    ddrissId: fila.ddriss_id,
    distritoSaludId: fila.distrito_salud_id,
    distritoSaludCodigo: fila.distrito_codigo,
    distritoSaludNombre: fila.distrito_nombre,
    municipioId: fila.municipio_id,
    municipioCodigoIne: fila.municipio_codigo_ine,
    municipioNombre: fila.municipio_nombre,
    reportaProduccion: Boolean(fila.reporta_produccion),
    reporta5c: Boolean(fila.reporta_5c),
    soloCobertura: Boolean(fila.solo_cobertura),
    esExterno: Boolean(fila.es_externo),
    direccion: fila.direccion,
    telefono: fila.telefono,
    correo: fila.correo,
    nombreContacto: fila.nombre_contacto,
    cuentasActivas: Number(fila.cuentas_activas),
    activo: Boolean(fila.activo),
  };
}

const alcanceDe = (usuario) => filtroAlcance(usuario, { establecimiento: 'e.id', ddriss: 'e.ddriss_id' });

function leerIdFiltro(query, nombre) {
  if (query[nombre] === undefined) return undefined;
  const id = Number(query[nombre]);
  if (!Number.isInteger(id) || id <= 0) throw entradaInvalida(`El parámetro ${nombre} no es válido.`);
  return id;
}

// Los mensajes de municipioId y activo son los de la versión mínima de HU-04.
function leerFiltros(query) {
  revisarParametros(query, ['municipioId', 'tipoEstablecimientoId', 'activo']);
  let activo;
  try {
    activo = leerBooleano(query, 'activo');
  } catch {
    throw entradaInvalida('El parámetro activo debe ser true o false.');
  }
  return {
    municipioId: leerIdFiltro(query, 'municipioId'),
    tipoEstablecimientoId: leerIdFiltro(query, 'tipoEstablecimientoId'),
    activo,
  };
}

export async function listarEstablecimientos(usuario, query = {}) {
  const filtros = leerFiltros(query);
  const alcance = alcanceDe(usuario);
  const condiciones = [alcance.condicion];
  const parametros = [...alcance.parametros];

  for (const [valor, columna] of [
    [filtros.municipioId, 'e.municipio_id'],
    [filtros.tipoEstablecimientoId, 'e.tipo_establecimiento_id'],
    [filtros.activo, 'e.activo'],
  ]) {
    if (valor === undefined) continue;
    condiciones.push(`${columna} = ?`);
    parametros.push(valor);
  }

  const [filas] = await pool.query(
    `${CONSULTA_ESTABLECIMIENTO} WHERE ${condiciones.join(' AND ')} ORDER BY e.nombre`,
    parametros,
  );
  return filas.map(aEstablecimiento);
}

// Uno fuera del ámbito responde el mismo 404 que uno inexistente, para no revelar qué hay fuera.
export async function obtenerEstablecimiento(id, usuario, conexion = pool) {
  const establecimientoId = /^\d+$/.test(String(id)) ? Number(id) : 0;
  const alcance = alcanceDe(usuario);
  const [[fila]] = await conexion.query(`${CONSULTA_ESTABLECIMIENTO} WHERE e.id = ? AND ${alcance.condicion}`, [
    establecimientoId,
    ...alcance.parametros,
  ]);
  if (!fila) throw errores.noEncontrado();
  return aEstablecimiento(fila);
}

export async function listarTiposEstablecimiento(query = {}) {
  revisarParametros(query, []);
  const [filas] = await pool.query('SELECT id, codigo, nombre FROM tipo_establecimiento ORDER BY nombre');
  return filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre }));
}

// Cuerpo de POST /establecimientos. codigo, ddrissId, esExterno y activo no se aceptan: los pone el sistema.
const CAMPOS_NUEVO = [
  'tipoEstablecimientoId', 'municipioId', 'distritoSaludId', 'nombre', 'direccion', 'telefono', 'correo',
  'nombreContacto', 'reportaProduccion', 'reporta5c', 'soloCobertura',
];

function leerId(valor, campo) {
  if (!Number.isInteger(valor) || valor <= 0) throw entradaInvalida(`${campo} debe ser un número entero positivo.`);
  return valor;
}

function aplicarRegla(regla, valor) {
  const resultado = regla(valor);
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

// El correo es obligatorio para el personal, pero opcional para un establecimiento.
function leerCorreoOpcional(valor) {
  if (valor == null || (typeof valor === 'string' && valor.trim() === '')) return null;
  return aplicarRegla(validarCorreo, valor);
}

function leerMarca(valor, campo, porDefecto) {
  if (valor === undefined) return porDefecto;
  if (typeof valor !== 'boolean') throw entradaInvalida(`${campo} debe ser true o false.`);
  return valor;
}

function revisarMarcas({ reportaProduccion, reporta5c, soloCobertura }) {
  if (!reportaProduccion && (reporta5c || soloCobertura)) throw errores.marcasInvalidas();
}

// es_externo se deduce aquí: un municipio fuera del departamento sede de la DDRISS es externo. El 9999 es una
// procedencia, no un lugar donde se vacuna. El bloqueo hace que dos altas a la vez en el mismo municipio
// calculen el consecutivo una después de otra.
async function bloquearMunicipio(conexion, municipioId, ddrissId) {
  const [[municipio]] = await conexion.query(
    `SELECT m.id, m.codigo_ine, m.departamento_id <> d.departamento_id AS es_externo
       FROM municipio m JOIN ddriss d ON d.id = ?
      WHERE m.id = ? AND m.activo = TRUE AND m.codigo_ine <> '9999'
      FOR UPDATE OF m`,
    [ddrissId, municipioId],
  );
  if (!municipio) throw errores.municipioInvalido();
  return { ...municipio, es_externo: Boolean(municipio.es_externo) };
}

async function verificarDistrito(conexion, distritoId, { ddrissId, municipioId }) {
  if (distritoId == null) throw errores.distritoInvalido();
  const [[distrito]] = await conexion.query(
    'SELECT id FROM distrito_salud WHERE id = ? AND ddriss_id = ? AND municipio_id = ? AND activo = TRUE',
    [distritoId, ddrissId, municipioId],
  );
  if (!distrito) throw errores.distritoInvalido();
}

async function verificarNombreLibre(conexion, { ddrissId, municipioId, nombre }, excluirId = 0) {
  // La intercalación utf8mb4_0900_ai_ci compara sin mayúsculas ni tildes.
  const [filas] = await conexion.query(
    'SELECT id FROM establecimiento WHERE ddriss_id = ? AND municipio_id = ? AND nombre = ? AND id <> ?',
    [ddrissId, municipioId, nombre, excluirId],
  );
  if (filas.length > 0) throw errores.duplicado();
}

// {TIPO}-{INE}-{NN}. Un código sin consecutivo (CS-1201, de los datos de prueba) cuenta como 01; los que no
// siguen el formato (HOSP-SM) no tienen el prefijo o no terminan en número, así que no cuentan.
async function siguienteCodigo(conexion, base) {
  const [filas] = await conexion.query('SELECT codigo FROM establecimiento WHERE codigo = ? OR codigo LIKE ?', [
    base,
    `${base}-%`,
  ]);
  const consecutivos = filas.map(({ codigo }) => {
    if (codigo === base) return 1;
    const sufijo = codigo.slice(base.length + 1);
    return /^\d+$/.test(sufijo) ? Number(sufijo) : 0;
  });
  return `${base}-${String(Math.max(0, ...consecutivos) + 1).padStart(2, '0')}`;
}

function leerNuevo(cuerpo) {
  revisarCampos(cuerpo, CAMPOS_NUEVO);
  const datos = {
    tipoEstablecimientoId: leerId(cuerpo.tipoEstablecimientoId, 'tipoEstablecimientoId'),
    municipioId: leerId(cuerpo.municipioId, 'municipioId'),
    distritoSaludId: cuerpo.distritoSaludId == null ? null : leerId(cuerpo.distritoSaludId, 'distritoSaludId'),
    nombre: aplicarRegla(validarNombreEstablecimiento, cuerpo.nombre),
    direccion: aplicarRegla(validarDireccion, cuerpo.direccion),
    telefono: aplicarRegla(validarTelefono, cuerpo.telefono),
    correo: leerCorreoOpcional(cuerpo.correo),
    nombreContacto: aplicarRegla(validarNombreContacto, cuerpo.nombreContacto),
    reportaProduccion: leerMarca(cuerpo.reportaProduccion, 'reportaProduccion', true),
    reporta5c: leerMarca(cuerpo.reporta5c, 'reporta5c', false),
    soloCobertura: leerMarca(cuerpo.soloCobertura, 'soloCobertura', false),
  };
  revisarMarcas(datos);
  return datos;
}

export async function crearEstablecimiento(cuerpo, administrador, contexto) {
  const datos = leerNuevo(cuerpo);
  // Regla 10: el establecimiento queda en la DDRISS de quien lo registra. La autoridad nacional no puede escribir.
  const ddrissId = administrador.ddrissId;
  if (!Number.isInteger(ddrissId)) throw new Error('El usuario que registra no tiene DDRISS.');

  return enTransaccion(async (conexion) => {
    // El bloqueo va primero: la primera lectura sin bloqueo fija la vista de la transacción (REPEATABLE READ), y si
    // ocurre antes de esperar al bloqueo, el consecutivo no ve el código que acaba de insertar otra alta.
    const municipio = await bloquearMunicipio(conexion, datos.municipioId, ddrissId);
    const [[tipo]] = await conexion.query('SELECT id, codigo FROM tipo_establecimiento WHERE id = ?', [
      datos.tipoEstablecimientoId,
    ]);
    if (!tipo) throw errores.tipoInvalido();

    if (municipio.es_externo) {
      if (datos.distritoSaludId !== null) throw errores.distritoEnExterno();
    } else {
      await verificarDistrito(conexion, datos.distritoSaludId, { ddrissId, municipioId: municipio.id });
    }
    await verificarNombreLibre(conexion, { ddrissId, municipioId: municipio.id, nombre: datos.nombre });
    const codigo = await siguienteCodigo(conexion, `${tipo.codigo}-${municipio.codigo_ine}`);

    const [resultado] = await conexion.query(
      `INSERT INTO establecimiento
         (codigo, nombre, tipo_establecimiento_id, ddriss_id, distrito_salud_id, municipio_id, reporta_produccion,
          reporta_5c, solo_cobertura, es_externo, direccion, telefono, correo, nombre_contacto)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        codigo, datos.nombre, tipo.id, ddrissId, datos.distritoSaludId, municipio.id, datos.reportaProduccion,
        datos.reporta5c, datos.soloCobertura, municipio.es_externo, datos.direccion, datos.telefono, datos.correo,
        datos.nombreContacto,
      ],
    );
    const establecimiento = await obtenerEstablecimiento(resultado.insertId, administrador, conexion);

    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.CONFIGURACION,
      accion: ACCIONES.CREAR,
      entidad: 'establecimiento',
      entidadId: establecimiento.id,
      valoresNuevos: establecimiento,
    });
    return establecimiento;
  });
}

const NO_SE_CAMBIAN = ['codigo', 'tipoEstablecimientoId', 'municipioId', 'distritoSaludId', 'ddrissId', 'esExterno'];

// Campo de la API → columna y cómo se lee un valor nuevo.
const EDITABLES = {
  nombre: { columna: 'nombre', leer: (v) => aplicarRegla(validarNombreEstablecimiento, v) },
  direccion: { columna: 'direccion', leer: (v) => aplicarRegla(validarDireccion, v) },
  telefono: { columna: 'telefono', leer: (v) => aplicarRegla(validarTelefono, v) },
  correo: { columna: 'correo', leer: leerCorreoOpcional },
  nombreContacto: { columna: 'nombre_contacto', leer: (v) => aplicarRegla(validarNombreContacto, v) },
  reportaProduccion: { columna: 'reporta_produccion', leer: (v) => leerMarca(v, 'reportaProduccion') },
  reporta5c: { columna: 'reporta_5c', leer: (v) => leerMarca(v, 'reporta5c') },
  soloCobertura: { columna: 'solo_cobertura', leer: (v) => leerMarca(v, 'soloCobertura') },
};

function leerCambios(cuerpo) {
  if (cuerpo !== null && typeof cuerpo === 'object') {
    for (const campo of NO_SE_CAMBIAN) {
      if (Object.hasOwn(cuerpo, campo)) throw entradaInvalida(`${campo} no se puede cambiar.`);
    }
  }
  revisarCampos(cuerpo, Object.keys(EDITABLES));
  if (Object.keys(cuerpo).length === 0) throw entradaInvalida('Indique al menos un dato del establecimiento.');
  return cuerpo;
}

// Uno de otra DDRISS responde el mismo 404 que uno inexistente, para no revelar qué hay fuera del ámbito.
async function bloquearEstablecimiento(conexion, id, usuario) {
  const establecimientoId = /^\d+$/.test(String(id)) ? Number(id) : 0;
  const { condicion, parametros } = alcanceDe(usuario);
  const [[fila]] = await conexion.query(
    `SELECT e.id, e.ddriss_id, e.municipio_id, e.distrito_salud_id, e.es_externo, e.nombre, e.direccion,
            e.telefono, e.correo, e.nombre_contacto, e.reporta_produccion, e.reporta_5c, e.solo_cobertura, e.activo
       FROM establecimiento e
      WHERE e.id = ? AND ${condicion}
      FOR UPDATE`,
    [establecimientoId, ...parametros],
  );
  if (!fila) throw errores.noEncontrado();
  return fila;
}

async function registrarCambio(conexion, contexto, accion, establecimientoId, cambios) {
  await registrarBitacora(conexion, {
    ...contexto,
    modulo: MODULOS.CONFIGURACION,
    accion,
    entidad: 'establecimiento',
    entidadId: establecimientoId,
    valoresAnteriores: cambios.anteriores,
    valoresNuevos: cambios.nuevos,
  });
}

// Solo nombre, dirección, contacto y marcas: el tipo y el municipio van en el código, y el municipio es el de
// aplicación de los reportes ya enviados. Un valor igual al guardado no se valida, así que un dato viejo con
// otro formato no impide cambiar los demás.
export async function editarEstablecimiento(id, cuerpo, usuario, contexto) {
  const cambiosPedidos = leerCambios(cuerpo);

  return enTransaccion(async (conexion) => {
    const fila = await bloquearEstablecimiento(conexion, id, usuario);
    const antes = {};
    const despues = {};
    for (const [campo, { columna, leer }] of Object.entries(EDITABLES)) {
      const guardado = typeof fila[columna] === 'number' ? Boolean(fila[columna]) : fila[columna];
      antes[campo] = guardado;
      despues[campo] = guardado;
      if (Object.hasOwn(cambiosPedidos, campo) && cambiosPedidos[campo] !== guardado) {
        despues[campo] = leer(cambiosPedidos[campo]);
      }
    }
    revisarMarcas(despues);

    const cambios = diferencias(antes, despues);
    if (cambios) {
      if (Object.hasOwn(cambios.nuevos, 'nombre')) {
        await verificarNombreLibre(
          conexion,
          { ddrissId: fila.ddriss_id, municipioId: fila.municipio_id, nombre: despues.nombre },
          fila.id,
        );
      }
      const campos = Object.keys(cambios.nuevos);
      await conexion.query(
        `UPDATE establecimiento SET ${campos.map((c) => `${EDITABLES[c].columna} = ?`).join(', ')} WHERE id = ?`,
        [...campos.map((c) => despues[c]), fila.id],
      );
      await registrarCambio(conexion, contexto, ACCIONES.ACTUALIZAR, fila.id, cambios);
    }
    return obtenerEstablecimiento(fila.id, usuario, conexion);
  });
}

async function verificarReactivable(conexion, fila) {
  const [[municipio]] = await conexion.query('SELECT id FROM municipio WHERE id = ? AND activo = TRUE', [
    fila.municipio_id,
  ]);
  if (!municipio) throw errores.municipioInvalido();
  if (fila.es_externo) return;
  const [[distrito]] = await conexion.query('SELECT id FROM distrito_salud WHERE id = ? AND activo = TRUE', [
    fila.distrito_salud_id,
  ]);
  if (!distrito) throw errores.distritoInvalido();
}

async function cambiarEstadoEstablecimiento(id, activo, usuario, contexto) {
  return enTransaccion(async (conexion) => {
    const fila = await bloquearEstablecimiento(conexion, id, usuario);
    const cambios = diferencias({ activo: Boolean(fila.activo) }, { activo });
    if (cambios) {
      if (activo) {
        await verificarReactivable(conexion, fila);
      } else {
        const [[{ total }]] = await conexion.query(
          `SELECT COUNT(*) AS total FROM usuario u JOIN empleado em ON em.id = u.empleado_id
            WHERE em.establecimiento_id = ? AND u.activo = TRUE AND em.activo = TRUE`,
          [fila.id],
        );
        if (total > 0) throw errores.conCuentas(Number(total));
      }
      await conexion.query('UPDATE establecimiento SET activo = ? WHERE id = ?', [activo, fila.id]);
      await registrarCambio(conexion, contexto, activo ? ACCIONES.REACTIVAR : ACCIONES.DESACTIVAR, fila.id, cambios);
    }
    return obtenerEstablecimiento(fila.id, usuario, conexion);
  });
}

export const desactivarEstablecimiento = (id, usuario, contexto) =>
  cambiarEstadoEstablecimiento(id, false, usuario, contexto);

export const reactivarEstablecimiento = (id, usuario, contexto) =>
  cambiarEstadoEstablecimiento(id, true, usuario, contexto);
