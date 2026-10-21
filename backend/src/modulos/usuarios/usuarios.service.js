import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';

const errores = {
  entradaInvalida: (mensaje) => new ErrorApi(400, 'ENTRADA_INVALIDA', mensaje),
  correoDuplicado: () => new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'),
  codigoDuplicado: () => new ErrorApi(409, 'CODIGO_EMPLEADO_DUPLICADO', 'Ya hay un empleado con ese código.'),
  establecimientoInvalido: () =>
    new ErrorApi(422, 'ESTABLECIMIENTO_INVALIDO', 'El establecimiento no existe, está inactivo o no es de su DDRISS.'),
  municipioInvalido: () =>
    new ErrorApi(422, 'MUNICIPIO_INVALIDO', 'El municipio no existe, está inactivo o no es del departamento de su DDRISS.'),
};

// Nombre de la llave única de MySQL → error que se responde si dos peticiones chocan.
const DUPLICADOS = {
  uq_empleado_correo: errores.correoDuplicado,
  uq_empleado_codigo: errores.codigoDuplicado,
};

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

async function verificarDuplicados(conexion, { correo, codigoEmpleado }) {
  if (correo) {
    const [filas] = await conexion.query('SELECT id FROM empleado WHERE correo = ?', [correo]);
    if (filas.length > 0) throw errores.correoDuplicado();
  }
  if (codigoEmpleado) {
    const [filas] = await conexion.query('SELECT id FROM empleado WHERE codigo_empleado = ?', [codigoEmpleado]);
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

export async function listarRoles() {
  const [filas] = await pool.query('SELECT id, codigo, nombre FROM rol ORDER BY id');
  return filas.map((f) => ({ id: f.id, codigo: f.codigo, nombre: f.nombre }));
}
