import bcrypt from 'bcrypt';
import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { filtroAlcance, verificarAlcance } from '../auth/alcance.service.js';
import { generarContrasenaTemporal } from '../auth/contrasenaTemporal.service.js';
import {
  validarNombres,
  validarApellidos,
  validarCargo,
  validarTelefono,
  validarCorreo,
  validarCui,
  validarNombreUsuario,
} from '../../validaciones/campos.js';
import { huellaCui } from './cui.service.js';

const errores = {
  entradaInvalida: (mensaje) => new ErrorApi(400, 'ENTRADA_INVALIDA', mensaje),
  correoDuplicado: () => new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'),
  cuiDuplicado: () => new ErrorApi(409, 'CUI_DUPLICADO', 'Ya hay un empleado registrado con ese CUI.'),
  establecimientoInvalido: () =>
    new ErrorApi(422, 'ESTABLECIMIENTO_INVALIDO', 'El establecimiento no existe, está inactivo o no es de su DDRISS.'),
  municipioInvalido: () =>
    new ErrorApi(422, 'MUNICIPIO_INVALIDO', 'El municipio no existe, está inactivo o no es del departamento de su DDRISS.'),
  empleadoNoEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El empleado no existe.'),
  empleadoConCuenta: () => new ErrorApi(409, 'EMPLEADO_CON_CUENTA', 'El empleado ya tiene una cuenta.'),
  nombreUsuarioDuplicado: () => new ErrorApi(409, 'NOMBRE_USUARIO_DUPLICADO', 'Ya existe ese nombre de usuario.'),
  rolInvalido: () => new ErrorApi(422, 'ROL_INVALIDO', 'El rol no existe.'),
  sinEstablecimiento: () =>
    new ErrorApi(
      422,
      'EMPLEADO_SIN_ESTABLECIMIENTO',
      'Para el rol de personal del establecimiento, el empleado debe tener un establecimiento.',
    ),
  // Mismo mensaje que verificarAlcance: una cuenta de otra DDRISS no se distingue de una que no existe.
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  cuentaDesactivada: (mensaje = 'La cuenta está desactivada; restáurela para editarla.') =>
    new ErrorApi(409, 'CUENTA_DESACTIVADA', mensaje),
  cuentaNoBloqueada: () => new ErrorApi(409, 'CUENTA_NO_BLOQUEADA', 'La cuenta no está bloqueada.'),
  cuentaPropia: (mensaje) => new ErrorApi(422, 'CUENTA_PROPIA', mensaje),
  empleadoInactivo: () => new ErrorApi(409, 'EMPLEADO_INACTIVO', 'El empleado de esta cuenta está inactivo.'),
};

// Nombre de la llave única de MySQL → error que se responde si dos peticiones chocan.
const DUPLICADOS = {
  uq_empleado_correo: errores.correoDuplicado,
  uq_empleado_cui: errores.cuiDuplicado,
  uq_usuario_empleado: errores.empleadoConCuenta,
  uq_usuario_usuario: errores.nombreUsuarioDuplicado,
};

const COSTO_BCRYPT = 12;

function traducirDuplicado(err) {
  if (err.code !== 'ER_DUP_ENTRY') return err;
  const llave = Object.keys(DUPLICADOS).find((nombre) => err.sqlMessage?.includes(nombre));
  return llave ? DUPLICADOS[llave]() : err;
}

// Aplica una regla de validaciones/campos.js: devuelve el valor limpio o responde 400 con su mensaje.
function segun(regla) {
  return (valor) => {
    const resultado = regla(valor);
    if (resultado.error) throw errores.entradaInvalida(resultado.error);
    return resultado.valor;
  };
}

const leerNombres = segun(validarNombres);
const leerApellidos = segun(validarApellidos);
const leerCargo = segun(validarCargo);
const leerTelefono = segun(validarTelefono);
const leerCorreo = segun(validarCorreo);
// Del CUI solo se conserva la huella: el número no se guarda, no se devuelve y no llega a la bitácora.
const leerHuellaCui = (valor) => huellaCui(segun(validarCui)(valor));

// Lo reemplazó el CUI (SPEC 11): un cliente viejo que todavía lo envía debe fallar, no perder el dato sin aviso.
function rechazarCodigoEmpleado(cuerpo) {
  if (Object.hasOwn(cuerpo, 'codigoEmpleado')) {
    throw errores.entradaInvalida('El código de empleado ya no se usa; envíe el CUI.');
  }
}

function idOpcional(valor, campo) {
  if (valor == null) return null;
  if (!Number.isInteger(valor) || valor <= 0) throw errores.entradaInvalida(`${campo} no es válido.`);
  return valor;
}

function leerEmpleado(cuerpo) {
  rechazarCodigoEmpleado(cuerpo);
  const empleado = {
    cuiHmac: leerHuellaCui(cuerpo.cui),
    nombres: leerNombres(cuerpo.nombres),
    apellidos: leerApellidos(cuerpo.apellidos),
    cargo: leerCargo(cuerpo.cargo),
    correo: leerCorreo(cuerpo.correo),
    telefono: leerTelefono(cuerpo.telefono),
    establecimientoId: idOpcional(cuerpo.establecimientoId, 'El establecimiento'),
    municipioId: idOpcional(cuerpo.municipioId, 'El municipio'),
  };
  if (empleado.establecimientoId && empleado.municipioId) {
    throw errores.entradaInvalida('Indique el establecimiento o el municipio, no ambos: el municipio se toma del establecimiento.');
  }
  return empleado;
}

async function municipioDelEstablecimiento(conexion, establecimientoId, ddrissId) {
  const [filas] = await conexion.query(
    'SELECT municipio_id FROM establecimiento WHERE id = ? AND activo = TRUE AND ddriss_id = ?',
    [establecimientoId, ddrissId],
  );
  if (filas.length === 0) throw errores.establecimientoInvalido();
  return filas[0].municipio_id;
}

async function verificarMunicipio(conexion, municipioId, ddrissId) {
  const [filas] = await conexion.query(
    `SELECT m.id FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id
      WHERE m.id = ? AND m.activo = TRUE AND d.id = ?`,
    [municipioId, ddrissId],
  );
  if (filas.length === 0) throw errores.municipioInvalido();
}

// Al editar, excluirId deja fuera al propio empleado.
async function verificarDuplicados(conexion, { correo, cuiHmac }, excluirId = 0) {
  if (correo) {
    const [filas] = await conexion.query('SELECT id FROM empleado WHERE correo = ? AND id <> ?', [correo, excluirId]);
    if (filas.length > 0) throw errores.correoDuplicado();
  }
  if (cuiHmac) {
    const [filas] = await conexion.query('SELECT id FROM empleado WHERE cui_hmac = ? AND id <> ?', [cuiHmac, excluirId]);
    if (filas.length > 0) throw errores.cuiDuplicado();
  }
}

export async function registrarEmpleado(cuerpo, administrador, contexto) {
  const datos = leerEmpleado(cuerpo ?? {});
  // Regla 10: el empleado queda en la DDRISS de quien lo registra. La autoridad nacional no puede escribir.
  const ddrissId = administrador.ddrissId;
  if (!Number.isInteger(ddrissId)) throw new Error('El usuario que registra no tiene DDRISS.');

  try {
    return await enTransaccion(async (conexion) => {
      const municipioId = datos.establecimientoId
        ? await municipioDelEstablecimiento(conexion, datos.establecimientoId, ddrissId)
        : datos.municipioId;
      if (!datos.establecimientoId && municipioId) await verificarMunicipio(conexion, municipioId, ddrissId);
      await verificarDuplicados(conexion, datos);

      const [resultado] = await conexion.query(
        `INSERT INTO empleado
           (cui_hmac, nombres, apellidos, cargo, correo, telefono, establecimiento_id, ddriss_id, municipio_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [datos.cuiHmac, datos.nombres, datos.apellidos, datos.cargo, datos.correo, datos.telefono,
          datos.establecimientoId, ddrissId, municipioId],
      );
      // La huella no sale en la respuesta ni en la bitácora; solo que el CUI quedó registrado.
      const { cuiHmac, ...resto } = datos;
      const empleado = { id: resultado.insertId, cuiRegistrado: true, ...resto, municipioId, ddrissId, activo: true };

      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.USUARIOS,
        accion: ACCIONES.CREAR,
        entidad: 'empleado',
        entidadId: empleado.id,
        valoresNuevos: empleado,
      });
      return empleado;
    });
  } catch (err) {
    throw traducirDuplicado(err);
  }
}

function idObligatorio(valor, campo) {
  if (!Number.isInteger(valor) || valor <= 0) throw errores.entradaInvalida(`Debe indicar ${campo}.`);
  return valor;
}

function leerCuenta(cuerpo) {
  // Un cliente viejo que todavía la envía debe fallar, no creer que eligió la contraseña.
  if (Object.hasOwn(cuerpo, 'contrasenaTemporal')) {
    throw errores.entradaInvalida('La contraseña temporal la genera el sistema; no la envíe.');
  }
  return {
    empleadoId: idObligatorio(cuerpo.empleadoId, 'el empleado'),
    nombreUsuario: segun(validarNombreUsuario)(cuerpo.nombreUsuario),
    rolId: idObligatorio(cuerpo.rolId, 'el rol'),
  };
}

// Se calcula antes de abrir la transacción para no retener los bloqueos mientras bcrypt trabaja.
async function contrasenaConHash(datosPersonales) {
  const contrasena = generarContrasenaTemporal(datosPersonales);
  return { contrasena, hash: await bcrypt.hash(contrasena, COSTO_BCRYPT) };
}

export async function crearCuenta(cuerpo, administrador, contexto) {
  const datos = leerCuenta(cuerpo ?? {});
  // Solo para que la contraseña no contenga el nombre; el empleado se revisa dentro de la transacción.
  const [[nombre]] = await pool.query('SELECT nombres, apellidos FROM empleado WHERE id = ?', [datos.empleadoId]);
  const { contrasena, hash } = await contrasenaConHash({ nombreUsuario: datos.nombreUsuario, ...nombre });

  try {
    return await enTransaccion(async (conexion) => {
      const [[empleado]] = await conexion.query(
        'SELECT id, activo, ddriss_id, establecimiento_id FROM empleado WHERE id = ? FOR UPDATE',
        [datos.empleadoId],
      );
      // Uno inactivo o de otra DDRISS responde igual que uno que no existe (regla 10).
      if (!empleado || !empleado.activo || empleado.ddriss_id !== administrador.ddrissId) {
        throw errores.empleadoNoEncontrado();
      }

      const [conCuenta] = await conexion.query('SELECT id FROM usuario WHERE empleado_id = ?', [empleado.id]);
      if (conCuenta.length > 0) throw errores.empleadoConCuenta();

      const [[rol]] = await conexion.query('SELECT id, codigo, nombre FROM rol WHERE id = ?', [datos.rolId]);
      if (!rol) throw errores.rolInvalido();
      // Sin establecimiento, el login de esa cuenta respondería CUENTA_SIN_ALCANCE.
      if (rol.codigo === 'ESTABLECIMIENTO' && empleado.establecimiento_id == null) throw errores.sinEstablecimiento();

      const [repetido] = await conexion.query('SELECT id FROM usuario WHERE nombre_usuario = ?', [datos.nombreUsuario]);
      if (repetido.length > 0) throw errores.nombreUsuarioDuplicado();

      const [resultado] = await conexion.query(
        `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id, debe_cambiar_contrasena, creado_por)
         VALUES (?, ?, ?, ?, TRUE, ?)`,
        [empleado.id, datos.nombreUsuario, hash, rol.id, administrador.id],
      );
      const usuario = {
        id: resultado.insertId,
        empleadoId: empleado.id,
        nombreUsuario: datos.nombreUsuario,
        rol: rol.codigo,
        rolNombre: rol.nombre,
        activo: true,
        debeCambiarContrasena: true,
      };

      // La contraseña no se pasa a la bitácora; CLAVES_SENSIBLES la quitaría de todos modos.
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.USUARIOS,
        accion: ACCIONES.CREAR,
        entidad: 'usuario',
        entidadId: usuario.id,
        valoresNuevos: usuario,
      });
      return { ...usuario, contrasenaTemporal: contrasena };
    });
  } catch (err) {
    throw traducirDuplicado(err);
  }
}

export async function listarRoles() {
  const [filas] = await pool.query('SELECT id, codigo, nombre FROM rol ORDER BY id');
  return filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre }));
}

// Las fechas salen como UNIX_TIMESTAMP: mysql2 lee un DATETIME como hora local de Node, y la base guarda
// la hora en su propia zona (UTC en Aiven), así que la fecha ISO saldría corrida.
// Nunca se leen hash_contrasena ni intentos_fallidos; de bloqueado_hasta solo sale si el bloqueo sigue vigente.
const CUENTA_BLOQUEADA = 'COALESCE(u.bloqueado_hasta > NOW(), FALSE)';
const CONSULTA_DETALLE = `
  SELECT u.id, u.empleado_id, u.nombre_usuario, r.codigo AS rol, r.nombre AS rol_nombre, u.activo,
         u.debe_cambiar_contrasena, ${CUENTA_BLOQUEADA} AS bloqueada, UNIX_TIMESTAMP(u.ultimo_acceso) AS ultimo_acceso,
         UNIX_TIMESTAMP(u.desactivado_en) AS desactivado_en,
         e.cui_hmac IS NOT NULL AS cui_registrado, e.nombres, e.apellidos, e.cargo, e.correo, e.telefono, e.establecimiento_id,
         e.municipio_id, e.ddriss_id, e.activo AS empleado_activo,
         est.nombre AS establecimiento_nombre, m.nombre AS municipio_nombre
    FROM usuario u
    JOIN rol r ON r.id = u.rol_id
    JOIN empleado e ON e.id = u.empleado_id
    LEFT JOIN establecimiento est ON est.id = e.establecimiento_id
    LEFT JOIN municipio m ON m.id = e.municipio_id`;

const aFechaIso = (segundos) => (segundos == null ? null : new Date(Number(segundos) * 1000).toISOString());

function aUsuarioDetalle(fila) {
  return {
    id: fila.id,
    empleadoId: fila.empleado_id,
    nombreUsuario: fila.nombre_usuario,
    rol: fila.rol,
    rolNombre: fila.rol_nombre,
    activo: Boolean(fila.activo),
    debeCambiarContrasena: Boolean(fila.debe_cambiar_contrasena),
    bloqueada: Boolean(fila.bloqueada),
    ultimoAcceso: aFechaIso(fila.ultimo_acceso),
    desactivadoEn: aFechaIso(fila.desactivado_en),
    empleado: {
      id: fila.empleado_id,
      cuiRegistrado: Boolean(fila.cui_registrado),
      nombres: fila.nombres,
      apellidos: fila.apellidos,
      cargo: fila.cargo,
      correo: fila.correo,
      telefono: fila.telefono,
      establecimientoId: fila.establecimiento_id,
      municipioId: fila.municipio_id,
      ddrissId: fila.ddriss_id,
      activo: Boolean(fila.empleado_activo),
      establecimientoNombre: fila.establecimiento_nombre,
      municipioNombre: fila.municipio_nombre,
    },
  };
}

export async function listarUsuarios(usuario) {
  const alcance = filtroAlcance(usuario, { ddriss: 'e.ddriss_id' });
  const [filas] = await pool.query(
    `${CONSULTA_DETALLE} WHERE ${alcance.condicion} ORDER BY e.apellidos, e.nombres, u.id`,
    alcance.parametros,
  );
  return filas.map(aUsuarioDetalle);
}

function leerId(valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) throw errores.noEncontrado();
  return id;
}

async function buscarDetalle(conexion, id) {
  const [[fila]] = await conexion.query(`${CONSULTA_DETALLE} WHERE u.id = ?`, [id]);
  return fila ?? null;
}

export async function obtenerUsuario(id, usuario) {
  const fila = await buscarDetalle(pool, leerId(id));
  if (!fila) throw errores.noEncontrado();
  verificarAlcance(usuario, { ddrissId: fila.ddriss_id });
  return aUsuarioDetalle(fila);
}

// Bloquea la fila de la cuenta hasta el final de la transacción y revisa que sea del ámbito del administrador.
async function bloquearCuenta(conexion, id, administrador) {
  const [[cuenta]] = await conexion.query(
    `SELECT u.id, u.activo, ${CUENTA_BLOQUEADA} AS bloqueada, u.debe_cambiar_contrasena, r.codigo AS rol, e.ddriss_id,
            e.establecimiento_id, e.activo AS empleado_activo
       FROM usuario u
       JOIN rol r ON r.id = u.rol_id
       JOIN empleado e ON e.id = u.empleado_id
      WHERE u.id = ?
        FOR UPDATE OF u`,
    [id],
  );
  if (!cuenta) throw errores.noEncontrado();
  verificarAlcance(administrador, { ddrissId: cuenta.ddriss_id });
  return cuenta;
}

function leerCambioRol(cuerpo) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw errores.entradaInvalida('Debe indicar el rol.');
  }
  // Desactivar y restaurar tienen sus propios endpoints y permisos.
  if (Object.keys(cuerpo).some((clave) => clave !== 'rolId')) {
    throw errores.entradaInvalida('Solo se puede cambiar el rol (rolId).');
  }
  return idObligatorio(cuerpo.rolId, 'el rol');
}

export async function cambiarRol(id, cuerpo, administrador, contexto) {
  const usuarioId = leerId(id);
  const rolId = leerCambioRol(cuerpo ?? {});

  return enTransaccion(async (conexion) => {
    const cuenta = await bloquearCuenta(conexion, usuarioId, administrador);
    if (!cuenta.activo) throw errores.cuentaDesactivada();
    if (cuenta.id === administrador.id) throw errores.cuentaPropia('No puede cambiar su propio rol.');

    const [[rol]] = await conexion.query('SELECT id, codigo FROM rol WHERE id = ?', [rolId]);
    if (!rol) throw errores.rolInvalido();
    if (rol.codigo === 'ESTABLECIMIENTO' && cuenta.establecimiento_id == null) throw errores.sinEstablecimiento();

    const cambios = diferencias({ rol: cuenta.rol }, { rol: rol.codigo });
    if (cambios) {
      await conexion.query('UPDATE usuario SET rol_id = ? WHERE id = ?', [rol.id, cuenta.id]);
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.USUARIOS,
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'usuario',
        entidadId: cuenta.id,
        valoresAnteriores: cambios.anteriores,
        valoresNuevos: cambios.nuevos,
      });
    }
    return aUsuarioDetalle(await buscarDetalle(conexion, cuenta.id));
  });
}

// Desactivación lógica: solo cambia la cuenta; el empleado y sus filas de bitácora quedan como estaban.
async function cambiarEstadoCuenta(id, activo, administrador, contexto) {
  const usuarioId = leerId(id);

  return enTransaccion(async (conexion) => {
    const cuenta = await bloquearCuenta(conexion, usuarioId, administrador);
    if (!activo && cuenta.id === administrador.id) throw errores.cuentaPropia('No puede desactivar su propia cuenta.');

    const cambios = diferencias({ activo: Boolean(cuenta.activo) }, { activo });
    if (cambios) {
      if (activo && !cuenta.empleado_activo) throw errores.empleadoInactivo();
      // Al restaurar se limpia el bloqueo: los intentos fallidos de antes no deben seguir contando.
      await conexion.query(
        activo
          ? 'UPDATE usuario SET activo = TRUE, desactivado_en = NULL, intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?'
          : 'UPDATE usuario SET activo = FALSE, desactivado_en = NOW() WHERE id = ?',
        [cuenta.id],
      );
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.USUARIOS,
        accion: activo ? ACCIONES.REACTIVAR : ACCIONES.DESACTIVAR,
        entidad: 'usuario',
        entidadId: cuenta.id,
        valoresAnteriores: cambios.anteriores,
        valoresNuevos: cambios.nuevos,
      });
    }
    return aUsuarioDetalle(await buscarDetalle(conexion, cuenta.id));
  });
}

export const desactivarCuenta = (id, administrador, contexto) => cambiarEstadoCuenta(id, false, administrador, contexto);

export const restaurarCuenta = (id, administrador, contexto) => cambiarEstadoCuenta(id, true, administrador, contexto);

// Se permite desbloquear la cuenta propia: pudieron bloquearla con intentos mientras su sesión seguía abierta.
export async function desbloquearCuenta(id, administrador, contexto) {
  const usuarioId = leerId(id);

  return enTransaccion(async (conexion) => {
    const cuenta = await bloquearCuenta(conexion, usuarioId, administrador);
    if (!cuenta.activo) throw errores.cuentaDesactivada('La cuenta está desactivada; al restaurarla se quita el bloqueo.');
    if (!cuenta.bloqueada) throw errores.cuentaNoBloqueada();

    await conexion.query('UPDATE usuario SET intentos_fallidos = 0, bloqueado_hasta = NULL WHERE id = ?', [cuenta.id]);
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.USUARIOS,
      accion: ACCIONES.DESBLOQUEAR,
      entidad: 'usuario',
      entidadId: cuenta.id,
      valoresAnteriores: { bloqueada: true },
      valoresNuevos: { bloqueada: false },
    });
    return aUsuarioDetalle(await buscarDetalle(conexion, cuenta.id));
  });
}

export async function restablecerContrasena(id, administrador, contexto) {
  const usuarioId = leerId(id);
  // Antes de gastar bcrypt: una cuenta inexistente o ajena responde 404 enseguida, como dentro de la transacción.
  const [[datos]] = await pool.query(
    `SELECT u.nombre_usuario, e.nombres, e.apellidos, e.ddriss_id
       FROM usuario u JOIN empleado e ON e.id = u.empleado_id WHERE u.id = ?`,
    [usuarioId],
  );
  if (!datos) throw errores.noEncontrado();
  verificarAlcance(administrador, { ddrissId: datos.ddriss_id });
  const { contrasena, hash } = await contrasenaConHash({
    nombreUsuario: datos.nombre_usuario,
    nombres: datos.nombres,
    apellidos: datos.apellidos,
  });

  return enTransaccion(async (conexion) => {
    const cuenta = await bloquearCuenta(conexion, usuarioId, administrador);
    if (!cuenta.activo) {
      throw errores.cuentaDesactivada('La cuenta está desactivada; restáurela antes de restablecer su contraseña.');
    }
    if (cuenta.id === administrador.id) {
      throw errores.cuentaPropia('Para cambiar su propia contraseña use «Cambiar contraseña».');
    }

    await conexion.query(
      `UPDATE usuario SET hash_contrasena = ?, debe_cambiar_contrasena = TRUE, intentos_fallidos = 0, bloqueado_hasta = NULL
        WHERE id = ?`,
      [hash, cuenta.id],
    );
    // Se registra siempre, aunque estos datos no cambien: la contraseña sí cambió (excepción escrita en el SPEC 10).
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.USUARIOS,
      accion: ACCIONES.RESTABLECER_CONTRASENA,
      entidad: 'usuario',
      entidadId: cuenta.id,
      valoresAnteriores: { debeCambiarContrasena: Boolean(cuenta.debe_cambiar_contrasena), bloqueada: Boolean(cuenta.bloqueada) },
      valoresNuevos: { debeCambiarContrasena: true, bloqueada: false },
    });
    return { usuario: aUsuarioDetalle(await buscarDetalle(conexion, cuenta.id)), contrasenaTemporal: contrasena };
  });
}

// Campo de la API → columna, y cómo se lee cada uno. ddrissId y activo no se cambian por aquí.
// Solo se validan los campos que llegan: un dato viejo que no cumple la regla no impide editar otro.
const CAMPOS_EMPLEADO = {
  nombres: { columna: 'nombres', leer: leerNombres },
  apellidos: { columna: 'apellidos', leer: leerApellidos },
  // Llega el CUI y se guarda su huella; nunca se compara ni se devuelve el número.
  cui: { columna: 'cui_hmac', leer: leerHuellaCui },
  cargo: { columna: 'cargo', leer: leerCargo },
  correo: { columna: 'correo', leer: leerCorreo },
  telefono: { columna: 'telefono', leer: leerTelefono },
  establecimientoId: { columna: 'establecimiento_id', leer: (v) => idOpcional(v, 'El establecimiento') },
  municipioId: { columna: 'municipio_id', leer: (v) => idOpcional(v, 'El municipio') },
};

function leerCambiosEmpleado(cuerpo) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).length === 0) {
    throw errores.entradaInvalida('Indique al menos un dato del empleado.');
  }
  rechazarCodigoEmpleado(cuerpo);
  const cambios = {};
  for (const [clave, valor] of Object.entries(cuerpo)) {
    if (!Object.hasOwn(CAMPOS_EMPLEADO, clave)) throw errores.entradaInvalida(`No se puede cambiar ${clave}.`);
    cambios[clave] = CAMPOS_EMPLEADO[clave].leer(valor);
  }
  if (cambios.establecimientoId && cambios.municipioId) {
    throw errores.entradaInvalida('Indique el establecimiento o el municipio, no ambos: el municipio se toma del establecimiento.');
  }
  return cambios;
}

function aEmpleado(fila) {
  return {
    id: fila.id,
    cuiRegistrado: fila.cui_hmac != null,
    nombres: fila.nombres,
    apellidos: fila.apellidos,
    cargo: fila.cargo,
    correo: fila.correo,
    telefono: fila.telefono,
    establecimientoId: fila.establecimiento_id,
    municipioId: fila.municipio_id,
    ddrissId: fila.ddriss_id,
    activo: Boolean(fila.activo),
  };
}

export async function editarEmpleado(id, cuerpo, administrador, contexto) {
  const empleadoId = leerId(id);
  const { cui: cuiHmac, ...cambios } = leerCambiosEmpleado(cuerpo ?? {});

  try {
    return await enTransaccion(async (conexion) => {
      const [[fila]] = await conexion.query('SELECT * FROM empleado WHERE id = ? FOR UPDATE', [empleadoId]);
      if (!fila) throw errores.noEncontrado();
      verificarAlcance(administrador, { ddrissId: fila.ddriss_id });

      const [[cuenta]] = await conexion.query(
        'SELECT u.activo, r.codigo AS rol FROM usuario u JOIN rol r ON r.id = u.rol_id WHERE u.empleado_id = ?',
        [empleadoId],
      );
      if (cuenta && !cuenta.activo) throw errores.cuentaDesactivada();

      // Las reglas de establecimiento y municipio se aplican al resultado: lo guardado más lo que llega.
      const antes = aEmpleado(fila);
      const despues = { ...antes, ...cambios, cuiRegistrado: antes.cuiRegistrado || cuiHmac !== undefined };
      if (despues.establecimientoId) {
        if (cambios.municipioId) {
          throw errores.entradaInvalida('El empleado tiene establecimiento: el municipio se toma de él.');
        }
        if (despues.establecimientoId !== antes.establecimientoId) {
          despues.municipioId = await municipioDelEstablecimiento(conexion, despues.establecimientoId, fila.ddriss_id);
        } else {
          despues.municipioId = antes.municipioId;
        }
      } else if (cambios.municipioId) {
        await verificarMunicipio(conexion, cambios.municipioId, fila.ddriss_id);
      }
      if (cuenta?.rol === 'ESTABLECIMIENTO' && !despues.establecimientoId) throw errores.sinEstablecimiento();

      const diferencia = diferencias(antes, despues);
      // La misma huella que ya estaba no es un cambio.
      const cambiaCui = cuiHmac !== undefined && cuiHmac !== fila.cui_hmac;
      if (!diferencia && !cambiaCui) return antes;

      await verificarDuplicados(
        conexion,
        { correo: diferencia?.nuevos.correo, cuiHmac: cambiaCui ? cuiHmac : undefined },
        empleadoId,
      );
      // cuiRegistrado no es una columna: se refleja al guardar la huella.
      const columnas = Object.entries(diferencia?.nuevos ?? {})
        .filter(([clave]) => clave !== 'cuiRegistrado')
        .map(([clave, valor]) => [CAMPOS_EMPLEADO[clave].columna, valor]);
      if (cambiaCui) columnas.push(['cui_hmac', cuiHmac]);
      await conexion.query(
        `UPDATE empleado SET ${columnas.map(([columna]) => `${columna} = ?`).join(', ')} WHERE id = ?`,
        [...columnas.map(([, valor]) => valor), empleadoId],
      );

      // Al reemplazar un CUI, cuiRegistrado sigue en true y diferencias no ve el cambio.
      const reemplazaCui = cambiaCui && fila.cui_hmac != null;
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.USUARIOS,
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'empleado',
        entidadId: empleadoId,
        valoresAnteriores: diferencia?.anteriores ?? null,
        valoresNuevos: { ...diferencia?.nuevos, ...(reemplazaCui && { cuiReemplazado: true }) },
      });
      return despues;
    });
  } catch (err) {
    throw traducirDuplicado(err);
  }
}
