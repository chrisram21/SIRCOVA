import readline from 'node:readline';
import { Writable } from 'node:stream';
import bcrypt from 'bcrypt';
import pool from '../src/config/mysql.js';
import { registrarBitacora } from '../src/modulos/auditoria/auditoria.service.js';

const COSTO_BCRYPT = 12;
const LARGO_MINIMO_CONTRASENA = 8;

// La salida pasa por aquí para poder ocultar el eco mientras se escribe la contraseña.
const salida = new Writable({
  write(fragmento, codificacion, listo) {
    if (!salida.silenciada) process.stdout.write(fragmento, codificacion);
    listo();
  },
});
salida.silenciada = false;

const rl = readline.createInterface({ input: process.stdin, output: salida, terminal: process.stdin.isTTY });
// El iterador conserva las líneas que llegan antes de cada pregunta (por ejemplo, con la entrada redirigida).
const lineas = rl[Symbol.asyncIterator]();

async function leerLinea(texto, { oculta = false } = {}) {
  process.stdout.write(texto);
  salida.silenciada = oculta;
  const { value, done } = await lineas.next();
  salida.silenciada = false;
  if (oculta) process.stdout.write('\n');
  if (done) throw new Error('Se canceló la creación del usuario.');
  return oculta ? value : value.trim();
}

async function preguntar(texto, validar, opciones) {
  for (;;) {
    const respuesta = await leerLinea(texto, opciones);
    const error = await validar(respuesta);
    if (!error) return respuesta;
    console.log(`  ✗ ${error}`);
  }
}

const obligatorio = (respuesta) => (respuesta ? null : 'Este dato es obligatorio.');

async function existe(sql, parametros) {
  const [filas] = await pool.query(sql, parametros);
  return filas[0] ?? null;
}

async function pedirDatos() {
  const nombres = await preguntar('Nombres: ', obligatorio);
  const apellidos = await preguntar('Apellidos: ', obligatorio);

  const correo = await preguntar('Correo (opcional): ', async (r) => {
    if (!r) return null;
    if (!r.includes('@')) return 'El correo no es válido.';
    return (await existe('SELECT id FROM empleado WHERE correo = ?', [r])) ? 'Ese correo ya está registrado.' : null;
  });

  const nombreUsuario = await preguntar('Nombre de usuario: ', async (r) => {
    if (!r) return 'Este dato es obligatorio.';
    if (r.length > 50) return 'El nombre de usuario admite como máximo 50 caracteres.';
    return (await existe('SELECT id FROM usuario WHERE nombre_usuario = ?', [r])) ? 'Ese nombre de usuario ya existe.' : null;
  });

  let contrasena;
  for (;;) {
    contrasena = await preguntar('Contraseña: ', (r) =>
      r.length >= LARGO_MINIMO_CONTRASENA ? null : `La contraseña debe tener al menos ${LARGO_MINIMO_CONTRASENA} caracteres.`,
      { oculta: true });
    const confirmacion = await leerLinea('Repita la contraseña: ', { oculta: true });
    if (confirmacion === contrasena) break;
    console.log('  ✗ Las contraseñas no coinciden.');
  }

  const [roles] = await pool.query('SELECT id, codigo FROM rol ORDER BY id');
  const codigoRol = await preguntar(`Rol (${roles.map((r) => r.codigo).join(', ')}): `,
    (r) => (roles.some((rol) => rol.codigo === r.toUpperCase()) ? null : 'Ese rol no existe.'));
  const rol = roles.find((r) => r.codigo === codigoRol.toUpperCase());

  // Regla 10: solo AUTORIDAD puede quedar sin DDRISS (alcance nacional).
  let ddriss = null;
  await preguntar(`Código de DDRISS${rol.codigo === 'AUTORIDAD' ? ' (vacío = nivel nacional)' : ''}: `, async (r) => {
    if (!r) return rol.codigo === 'AUTORIDAD' ? null : 'Este rol necesita una DDRISS.';
    ddriss = await existe('SELECT id, codigo FROM ddriss WHERE codigo = ? AND activo = TRUE', [r.toUpperCase()]);
    return ddriss ? null : 'No existe una DDRISS activa con ese código.';
  });

  let establecimientoId = null;
  if (rol.codigo === 'ESTABLECIMIENTO') {
    await preguntar('Id del establecimiento: ', async (r) => {
      const id = Number(r);
      if (!Number.isInteger(id) || id <= 0) return 'Escriba el id numérico del establecimiento.';
      const est = await existe('SELECT id FROM establecimiento WHERE id = ? AND activo = TRUE AND ddriss_id = ?', [id, ddriss.id]);
      if (!est) return `No existe un establecimiento activo con ese id en ${ddriss.codigo}.`;
      establecimientoId = id;
      return null;
    });
  }

  return { nombres, apellidos, correo: correo || null, nombreUsuario, contrasena, rol, ddriss, establecimientoId };
}

async function guardar(datos) {
  const hash = await bcrypt.hash(datos.contrasena, COSTO_BCRYPT);
  const conexion = await pool.getConnection();
  try {
    await conexion.beginTransaction();

    const empleado = {
      nombres: datos.nombres,
      apellidos: datos.apellidos,
      correo: datos.correo,
      ddrissId: datos.ddriss?.id ?? null,
      establecimientoId: datos.establecimientoId,
    };
    const [resEmpleado] = await conexion.query(
      `INSERT INTO empleado (nombres, apellidos, correo, ddriss_id, establecimiento_id) VALUES (?, ?, ?, ?, ?)`,
      [empleado.nombres, empleado.apellidos, empleado.correo, empleado.ddrissId, empleado.establecimientoId],
    );

    const usuario = { empleadoId: resEmpleado.insertId, nombreUsuario: datos.nombreUsuario, rol: datos.rol.codigo };
    const [resUsuario] = await conexion.query(
      `INSERT INTO usuario (empleado_id, nombre_usuario, hash_contrasena, rol_id) VALUES (?, ?, ?, ?)`,
      [usuario.empleadoId, usuario.nombreUsuario, hash, datos.rol.id],
    );

    const comun = { modulo: 'USUARIOS', accion: 'CREAR', agenteUsuario: 'scripts/crear-usuario.js' };
    await registrarBitacora(conexion, { ...comun, entidad: 'empleado', entidadId: resEmpleado.insertId, valoresNuevos: empleado });
    await registrarBitacora(conexion, { ...comun, entidad: 'usuario', entidadId: resUsuario.insertId, valoresNuevos: usuario });

    await conexion.commit();
    return { empleadoId: resEmpleado.insertId, usuarioId: resUsuario.insertId };
  } catch (err) {
    await conexion.rollback();
    // Otra persona pudo registrar el mismo usuario o correo mientras se llenaban los datos.
    if (err.code === 'ER_DUP_ENTRY') throw new Error('El nombre de usuario o el correo ya se registró mientras se llenaban los datos.');
    throw err;
  } finally {
    conexion.release();
  }
}

try {
  console.log('Crear empleado y cuenta de SIRCOVA\n');
  const datos = await pedirDatos();
  const { empleadoId, usuarioId } = await guardar(datos);
  console.log(`\n✓ Cuenta "${datos.nombreUsuario}" creada (usuario ${usuarioId}, empleado ${empleadoId}, rol ${datos.rol.codigo}).`);
} catch (err) {
  console.error(`\n✗ ${err.message}`);
  process.exitCode = 1;
} finally {
  rl.close();
  await pool.end();
}
