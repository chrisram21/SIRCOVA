import bcrypt from 'bcrypt';
import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { filtroAlcance, verificarAlcance } from '../auth/alcance.service.js';

const errores = {
  entradaInvalida: (mensaje) => new ErrorApi(400, 'ENTRADA_INVALIDA', mensaje),
  correoDuplicado: () => new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'),
  codigoDuplicado: () => new ErrorApi(409, 'CODIGO_EMPLEADO_DUPLICADO', 'Ya hay un empleado con ese código.'),
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
  cuentaDesactivada: () =>
    new ErrorApi(409, 'CUENTA_DESACTIVADA', 'La cuenta está desactivada; restáurela para editarla.'),
  cuentaPropia: (mensaje) => new ErrorApi(422, 'CUENTA_PROPIA', mensaje),
  empleadoInactivo: () => new ErrorApi(409, 'EMPLEADO_INACTIVO', 'El empleado de esta cuenta está inactivo.'),
};

// Nombre de la llave única de MySQL → error que se responde si dos peticiones chocan.
const DUPLICADOS = {
  uq_empleado_correo: errores.correoDuplicado,
  uq_empleado_codigo: errores.codigoDuplicado,
  uq_usuario_empleado: errores.empleadoConCuenta,
  uq_usuario_usuario: errores.nombreUsuarioDuplicado,
};

const COSTO_BCRYPT = 12;
const NOMBRE_USUARIO = /^\S{3,50}$/;
const LARGO_MINIMO_CONTRASENA = 8;
// bcrypt solo usa los primeros 72 bytes; una contraseña más larga se aceptaría truncada.
const BYTES_MAXIMOS_CONTRASENA = 72;

function traducirDuplicado(err) {
  if (err.code !== 'ER_DUP_ENTRY') return err;
  const llave = Object.keys(DUPLICADOS).find((nombre) => err.sqlMessage?.includes(nombre));
  return llave ? DUPLICADOS[llave]() : err;
}

const demasiadoLargo = (campo, largo) => errores.entradaInvalida(`${campo}: como máximo ${largo} caracteres.`);

function textoObligatorio(valor, campo, largo) {
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!texto) throw errores.entradaInvalida(`Debe indicar ${campo.toLowerCase()}.`);
  if (texto.length > largo) throw demasiadoLargo(campo, largo);
  return texto;
}

// Ausente o vacío se guarda como NULL.
function textoOpcional(valor, campo, largo) {
  if (valor == null) return null;
  if (typeof valor !== 'string') throw errores.entradaInvalida(`${campo} no es válido.`);
  const texto = valor.trim();
  if (texto.length > largo) throw demasiadoLargo(campo, largo);
  return texto || null;
}

function idOpcional(valor, campo) {
  if (valor == null) return null;
  if (!Number.isInteger(valor) || valor <= 0) throw errores.entradaInvalida(`${campo} no es válido.`);
  return valor;
}

function leerEmpleado(cuerpo) {
  const empleado = {
    codigoEmpleado: textoOpcional(cuerpo.codigoEmpleado, 'El código de empleado', 20),
    nombres: textoObligatorio(cuerpo.nombres, 'Los nombres', 100),
    apellidos: textoObligatorio(cuerpo.apellidos, 'Los apellidos', 100),
    cargo: textoOpcional(cuerpo.cargo, 'El cargo', 100),
    correo: textoOpcional(cuerpo.correo, 'El correo', 150),
    telefono: textoOpcional(cuerpo.telefono, 'El teléfono', 20),
    establecimientoId: idOpcional(cuerpo.establecimientoId, 'El establecimiento'),
    municipioId: idOpcional(cuerpo.municipioId, 'El municipio'),
  };
  if (empleado.correo && !empleado.correo.includes('@')) throw errores.entradaInvalida('El correo no es válido.');
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
async function verificarDuplicados(conexion, { correo, codigoEmpleado }, excluirId = 0) {
  if (correo) {
    const [filas] = await conexion.query('SELECT id FROM empleado WHERE correo = ? AND id <> ?', [correo, excluirId]);
    if (filas.length > 0) throw errores.correoDuplicado();
  }
  if (codigoEmpleado) {
    const [filas] = await conexion.query('SELECT id FROM empleado WHERE codigo_empleado = ? AND id <> ?', [
      codigoEmpleado,
      excluirId,
    ]);
    if (filas.length > 0) throw errores.codigoDuplicado();
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
           (codigo_empleado, nombres, apellidos, cargo, correo, telefono, establecimiento_id, ddriss_id, municipio_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [datos.codigoEmpleado, datos.nombres, datos.apellidos, datos.cargo, datos.correo, datos.telefono,
          datos.establecimientoId, ddrissId, municipioId],
      );
      const empleado = { id: resultado.insertId, ...datos, municipioId, ddrissId, activo: true };

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
  const { nombreUsuario, contrasenaTemporal } = cuerpo;
  if (typeof nombreUsuario !== 'string' || !NOMBRE_USUARIO.test(nombreUsuario)) {
    throw errores.entradaInvalida('El nombre de usuario debe tener de 3 a 50 caracteres, sin espacios.');
  }
  if (
    typeof contrasenaTemporal !== 'string' ||
    contrasenaTemporal.length < LARGO_MINIMO_CONTRASENA ||
    Buffer.byteLength(contrasenaTemporal) > BYTES_MAXIMOS_CONTRASENA
  ) {
    throw errores.entradaInvalida(
      `La contraseña temporal debe tener de ${LARGO_MINIMO_CONTRASENA} a ${BYTES_MAXIMOS_CONTRASENA} caracteres.`,
    );
  }
  return {
    empleadoId: idObligatorio(cuerpo.empleadoId, 'el empleado'),
    nombreUsuario,
    contrasenaTemporal,
    rolId: idObligatorio(cuerpo.rolId, 'el rol'),
  };
}

export async function crearCuenta(cuerpo, administrador, contexto) {
  const datos = leerCuenta(cuerpo ?? {});
  // Se calcula antes de abrir la transacción para no retener los bloqueos mientras bcrypt trabaja.
  const hash = await bcrypt.hash(datos.contrasenaTemporal, COSTO_BCRYPT);

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

      // Se guarda el objeto de la respuesta y no el cuerpo: contrasenaTemporal no está entre los campos sensibles.
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.USUARIOS,
        accion: ACCIONES.CREAR,
        entidad: 'usuario',
        entidadId: usuario.id,
        valoresNuevos: usuario,
      });
      return usuario;
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
// Nunca se leen hash_contrasena, intentos_fallidos ni bloqueado_hasta.
const CONSULTA_DETALLE = `
  SELECT u.id, u.empleado_id, u.nombre_usuario, r.codigo AS rol, r.nombre AS rol_nombre, u.activo,
         u.debe_cambiar_contrasena, UNIX_TIMESTAMP(u.ultimo_acceso) AS ultimo_acceso,
         UNIX_TIMESTAMP(u.desactivado_en) AS desactivado_en,
         e.codigo_empleado, e.nombres, e.apellidos, e.cargo, e.correo, e.telefono, e.establecimiento_id,
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
    ultimoAcceso: aFechaIso(fila.ultimo_acceso),
    desactivadoEn: aFechaIso(fila.desactivado_en),
    empleado: {
      id: fila.empleado_id,
      codigoEmpleado: fila.codigo_empleado,
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
    `SELECT u.id, u.activo, r.codigo AS rol, e.ddriss_id, e.establecimiento_id, e.activo AS empleado_activo
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

// Campo de la API → columna, y cómo se lee cada uno. ddrissId y activo no se cambian por aquí.
const CAMPOS_EMPLEADO = {
  nombres: { columna: 'nombres', leer: (v) => textoObligatorio(v, 'Los nombres', 100) },
  apellidos: { columna: 'apellidos', leer: (v) => textoObligatorio(v, 'Los apellidos', 100) },
  codigoEmpleado: { columna: 'codigo_empleado', leer: (v) => textoOpcional(v, 'El código de empleado', 20) },
  cargo: { columna: 'cargo', leer: (v) => textoOpcional(v, 'El cargo', 100) },
  correo: { columna: 'correo', leer: (v) => textoOpcional(v, 'El correo', 150) },
  telefono: { columna: 'telefono', leer: (v) => textoOpcional(v, 'El teléfono', 20) },
  establecimientoId: { columna: 'establecimiento_id', leer: (v) => idOpcional(v, 'El establecimiento') },
  municipioId: { columna: 'municipio_id', leer: (v) => idOpcional(v, 'El municipio') },
};

function leerCambiosEmpleado(cuerpo) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo) || Object.keys(cuerpo).length === 0) {
    throw errores.entradaInvalida('Indique al menos un dato del empleado.');
  }
  const cambios = {};
  for (const [clave, valor] of Object.entries(cuerpo)) {
    if (!Object.hasOwn(CAMPOS_EMPLEADO, clave)) throw errores.entradaInvalida(`No se puede cambiar ${clave}.`);
    cambios[clave] = CAMPOS_EMPLEADO[clave].leer(valor);
  }
  if (cambios.correo && !cambios.correo.includes('@')) throw errores.entradaInvalida('El correo no es válido.');
  if (cambios.establecimientoId && cambios.municipioId) {
    throw errores.entradaInvalida('Indique el establecimiento o el municipio, no ambos: el municipio se toma del establecimiento.');
  }
  return cambios;
}

function aEmpleado(fila) {
  return {
    id: fila.id,
    codigoEmpleado: fila.codigo_empleado,
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
  const cambios = leerCambiosEmpleado(cuerpo ?? {});

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
      const despues = { ...antes, ...cambios };
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
      if (!diferencia) return antes;

      await verificarDuplicados(
        conexion,
        { correo: diferencia.nuevos.correo, codigoEmpleado: diferencia.nuevos.codigoEmpleado },
        empleadoId,
      );
      const claves = Object.keys(diferencia.nuevos);
      await conexion.query(
        `UPDATE empleado SET ${claves.map((clave) => `${CAMPOS_EMPLEADO[clave].columna} = ?`).join(', ')} WHERE id = ?`,
        [...claves.map((clave) => diferencia.nuevos[clave]), empleadoId],
      );
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.USUARIOS,
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'empleado',
        entidadId: empleadoId,
        valoresAnteriores: diferencia.anteriores,
        valoresNuevos: diferencia.nuevos,
      });
      return despues;
    });
  } catch (err) {
    throw traducirDuplicado(err);
  }
}
