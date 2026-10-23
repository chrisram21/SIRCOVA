import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { validarNombreDistrito } from '../../validaciones/campos.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { filtroAlcance } from '../auth/alcance.service.js';
import { entradaInvalida, leerBooleano, revisarParametros } from './catalogos.service.js';

const errores = {
  duplicado: () => new ErrorApi(409, 'DISTRITO_DUPLICADO', 'Ya hay un distrito con ese nombre en el municipio.'),
  municipioInvalido: () =>
    new ErrorApi(422, 'MUNICIPIO_INVALIDO', 'El municipio no existe, está inactivo o no es del departamento de su DDRISS.'),
};

const CONSULTA_DISTRITO = `
  SELECT ds.id, ds.codigo, ds.nombre, ds.ddriss_id, ds.municipio_id, m.codigo_ine AS municipio_codigo_ine,
         m.nombre AS municipio_nombre, ds.activo,
         (SELECT COUNT(*) FROM establecimiento e WHERE e.distrito_salud_id = ds.id AND e.activo = TRUE)
           AS establecimientos_activos
    FROM distrito_salud ds
    JOIN municipio m ON m.id = ds.municipio_id`;

function aDistrito(fila) {
  return {
    id: fila.id,
    codigo: fila.codigo,
    nombre: fila.nombre,
    ddrissId: fila.ddriss_id,
    municipioId: fila.municipio_id,
    municipioCodigoIne: fila.municipio_codigo_ine,
    municipioNombre: fila.municipio_nombre,
    establecimientosActivos: Number(fila.establecimientos_activos),
    activo: Boolean(fila.activo),
  };
}

function leerIdPositivo(texto, campo) {
  if (!/^\d+$/.test(texto) || Number(texto) <= 0) throw entradaInvalida(`${campo} debe ser un número entero positivo.`);
  return Number(texto);
}

function leerNombre(valor) {
  const resultado = validarNombreDistrito(valor);
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

function revisarCampos(cuerpo, permitidos) {
  if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    throw entradaInvalida('El cuerpo debe ser un objeto JSON.');
  }
  for (const campo of Object.keys(cuerpo)) {
    if (!permitidos.includes(campo)) throw entradaInvalida(`Campo no permitido: ${campo}.`);
  }
}

async function buscarDistrito(conexion, id) {
  const [[fila]] = await conexion.query(`${CONSULTA_DISTRITO} WHERE ds.id = ?`, [id]);
  return fila ? aDistrito(fila) : null;
}

export async function listarDistritos(usuario, query = {}) {
  revisarParametros(query, ['municipioId', 'activo']);
  const alcance = filtroAlcance(usuario, { ddriss: 'ds.ddriss_id' });
  const condiciones = [alcance.condicion];
  const parametros = [...alcance.parametros];

  if (query.municipioId !== undefined) {
    condiciones.push('ds.municipio_id = ?');
    parametros.push(leerIdPositivo(query.municipioId, 'municipioId'));
  }
  const activo = leerBooleano(query, 'activo');
  if (activo !== undefined) {
    condiciones.push('ds.activo = ?');
    parametros.push(activo);
  }

  const [filas] = await pool.query(
    `${CONSULTA_DISTRITO} WHERE ${condiciones.join(' AND ')} ORDER BY m.nombre, ds.codigo`,
    parametros,
  );
  return filas.map(aDistrito);
}

// Mismas reglas que verificarMunicipio de usuarios.service.js: activo y del departamento sede de la DDRISS.
// El bloqueo hace que dos altas a la vez en el mismo municipio calculen el consecutivo una después de otra.
async function bloquearMunicipio(conexion, municipioId, ddrissId) {
  const [[municipio]] = await conexion.query(
    `SELECT m.id, m.codigo_ine FROM municipio m JOIN ddriss d ON d.departamento_id = m.departamento_id
      WHERE m.id = ? AND m.activo = TRUE AND d.id = ?
      FOR UPDATE OF m`,
    [municipioId, ddrissId],
  );
  if (!municipio) throw errores.municipioInvalido();
  return municipio;
}

async function verificarNombreLibre(conexion, { ddrissId, municipioId, nombre }, excluirId = 0) {
  // La intercalación utf8mb4_0900_ai_ci compara sin mayúsculas ni tildes.
  const [filas] = await conexion.query(
    'SELECT id FROM distrito_salud WHERE ddriss_id = ? AND municipio_id = ? AND nombre = ? AND id <> ?',
    [ddrissId, municipioId, nombre, excluirId],
  );
  if (filas.length > 0) throw errores.duplicado();
}

// DS-{INE}-{NN}. Un código sin consecutivo (DS-1201, de los datos de prueba) cuenta como 01.
async function siguienteCodigo(conexion, codigoIne) {
  const base = `DS-${codigoIne}`;
  const [filas] = await conexion.query('SELECT codigo FROM distrito_salud WHERE codigo = ? OR codigo LIKE ?', [
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

export async function crearDistrito(cuerpo, administrador, contexto) {
  revisarCampos(cuerpo, ['municipioId', 'nombre']);
  const { municipioId } = cuerpo;
  if (!Number.isInteger(municipioId) || municipioId <= 0) {
    throw entradaInvalida('municipioId debe ser un número entero positivo.');
  }
  const nombre = leerNombre(cuerpo.nombre);
  // Regla 10: el distrito queda en la DDRISS de quien lo registra. La autoridad nacional no puede escribir.
  const ddrissId = administrador.ddrissId;
  if (!Number.isInteger(ddrissId)) throw new Error('El usuario que registra no tiene DDRISS.');

  return enTransaccion(async (conexion) => {
    const municipio = await bloquearMunicipio(conexion, municipioId, ddrissId);
    await verificarNombreLibre(conexion, { ddrissId, municipioId, nombre });
    const codigo = await siguienteCodigo(conexion, municipio.codigo_ine);

    const [resultado] = await conexion.query(
      'INSERT INTO distrito_salud (ddriss_id, municipio_id, codigo, nombre) VALUES (?, ?, ?, ?)',
      [ddrissId, municipioId, codigo, nombre],
    );
    const distrito = await buscarDistrito(conexion, resultado.insertId);

    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.CONFIGURACION,
      accion: ACCIONES.CREAR,
      entidad: 'distrito_salud',
      entidadId: distrito.id,
      valoresNuevos: distrito,
    });
    return distrito;
  });
}
