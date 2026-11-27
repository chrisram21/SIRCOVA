import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { validarCodigoIne, validarNombreMunicipio } from '../../validaciones/campos.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from './catalogos.service.js';

// El 99 «No especificado / otro» solo existe para el 9999 y no admite municipios nuevos.
const DEPARTAMENTO_SIN_MUNICIPIOS = '99';
// Migrantes / fuera de San Marcos: la procedencia de quien no tiene municipio en el catálogo.
const MUNICIPIO_ESPECIAL = '9999';

const conCantidad = (n, singular, plural) => `${n} ${n === 1 ? singular : plural}`;

// «a», «a y b», «a, b y c».
const enumerar = (partes) =>
  partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}` : partes[0];

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El municipio no existe.'),
  especial: () =>
    new ErrorApi(409, 'MUNICIPIO_ESPECIAL', 'El municipio Migrantes / fuera de San Marcos no se puede cambiar.'),
  enUso: (lista) =>
    new ErrorApi(409, 'MUNICIPIO_EN_USO', `El municipio tiene ${lista}; desactívelos o quítelo de la red primero.`),
  duplicado: (codigo) => new ErrorApi(409, 'MUNICIPIO_DUPLICADO', `Ya hay un municipio con el código INE ${codigo}.`),
  nombreDuplicado: () =>
    new ErrorApi(409, 'MUNICIPIO_NOMBRE_DUPLICADO', 'Ya hay un municipio con ese nombre en el departamento.'),
  departamentoInvalido: () =>
    new ErrorApi(422, 'DEPARTAMENTO_INVALIDO', 'El departamento no existe o no admite municipios.'),
  prefijo: (codigo) =>
    new ErrorApi(
      422,
      'CODIGO_INE_DEPARTAMENTO',
      `El código INE debe empezar con ${codigo}, el código del departamento.`,
    ),
};

const CONSULTA_MUNICIPIO = `
  SELECT m.id, m.departamento_id, dep.nombre AS departamento_nombre, m.codigo_ine, m.nombre, m.activo
    FROM municipio m
    JOIN departamento dep ON dep.id = m.departamento_id`;

// Misma forma que cada elemento de GET /municipios.
function aMunicipio(fila) {
  return {
    id: fila.id,
    departamentoId: fila.departamento_id,
    departamentoNombre: fila.departamento_nombre,
    codigoIne: fila.codigo_ine,
    nombre: fila.nombre,
    activo: Boolean(fila.activo),
  };
}

function leer(regla, valor) {
  const resultado = regla(valor);
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

async function buscarMunicipio(conexion, id) {
  const [[fila]] = await conexion.query(`${CONSULTA_MUNICIPIO} WHERE m.id = ?`, [id]);
  return fila ? aMunicipio(fila) : null;
}

async function verificarNombreLibre(conexion, { departamentoId, nombre }, excluirId = 0) {
  // La intercalación utf8mb4_0900_ai_ci compara sin mayúsculas ni tildes.
  const [filas] = await conexion.query(
    'SELECT id FROM municipio WHERE departamento_id = ? AND nombre = ? AND id <> ?',
    [departamentoId, nombre, excluirId],
  );
  if (filas.length > 0) throw errores.nombreDuplicado();
}

export async function listarDepartamentos(query = {}) {
  revisarParametros(query, []);
  const [filas] = await pool.query(
    'SELECT id, codigo_ine, nombre FROM departamento WHERE codigo_ine <> ? ORDER BY codigo_ine',
    [DEPARTAMENTO_SIN_MUNICIPIOS],
  );
  return filas.map((f) => ({ id: f.id, codigoIne: f.codigo_ine, nombre: f.nombre }));
}

// El catálogo es nacional: no se filtra por la DDRISS de quien registra.
export async function crearMunicipio(cuerpo, contexto) {
  revisarCampos(cuerpo, ['departamentoId', 'codigoIne', 'nombre']);
  const { departamentoId } = cuerpo;
  if (!Number.isInteger(departamentoId) || departamentoId <= 0) {
    throw entradaInvalida('departamentoId debe ser un número entero positivo.');
  }
  const codigoIne = leer(validarCodigoIne, cuerpo.codigoIne);
  const nombre = leer(validarNombreMunicipio, cuerpo.nombre);

  try {
    return await enTransaccion(async (conexion) => {
      // Primera consulta de la transacción: dos altas a la vez en el departamento revisan el nombre una tras otra.
      const [[departamento]] = await conexion.query(
        'SELECT id, codigo_ine FROM departamento WHERE id = ? FOR UPDATE',
        [departamentoId],
      );
      if (!departamento || departamento.codigo_ine === DEPARTAMENTO_SIN_MUNICIPIOS) {
        throw errores.departamentoInvalido();
      }
      if (!codigoIne.startsWith(departamento.codigo_ine)) throw errores.prefijo(departamento.codigo_ine);

      const [conCodigo] = await conexion.query('SELECT id FROM municipio WHERE codigo_ine = ?', [codigoIne]);
      if (conCodigo.length > 0) throw errores.duplicado(codigoIne);
      await verificarNombreLibre(conexion, { departamentoId, nombre });

      const [resultado] = await conexion.query(
        'INSERT INTO municipio (departamento_id, codigo_ine, nombre) VALUES (?, ?, ?)',
        [departamentoId, codigoIne, nombre],
      );
      const municipio = await buscarMunicipio(conexion, resultado.insertId);

      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.CONFIGURACION,
        accion: ACCIONES.CREAR,
        entidad: 'municipio',
        entidadId: municipio.id,
        valoresNuevos: municipio,
      });
      return municipio;
    });
  } catch (err) {
    // El código es único en todo el país: dos altas a la vez en departamentos distintos no se bloquean entre sí.
    if (err.code === 'ER_DUP_ENTRY' && err.message.includes('uq_municipio_codigo')) throw errores.duplicado(codigoIne);
    throw err;
  }
}

async function bloquearMunicipio(conexion, id) {
  const municipioId = /^\d+$/.test(id) ? Number(id) : 0;
  const [[fila]] = await conexion.query(
    'SELECT id, departamento_id, codigo_ine, nombre, activo FROM municipio WHERE id = ? FOR UPDATE',
    [municipioId],
  );
  if (!fila) throw errores.noEncontrado();
  return fila;
}

async function registrarCambio(conexion, contexto, accion, municipioId, cambios) {
  await registrarBitacora(conexion, {
    ...contexto,
    modulo: MODULOS.CONFIGURACION,
    accion,
    entidad: 'municipio',
    entidadId: municipioId,
    valoresAnteriores: cambios.anteriores,
    valoresNuevos: cambios.nuevos,
  });
}

// Solo el nombre: el código no se renombra (regla 6) y es la llave del GeoJSON; el departamento va en el código.
export async function renombrarMunicipio(id, cuerpo, contexto) {
  if (cuerpo !== null && typeof cuerpo === 'object') {
    for (const campo of ['codigoIne', 'departamentoId']) {
      if (Object.hasOwn(cuerpo, campo)) throw entradaInvalida(`${campo} no se puede cambiar.`);
    }
  }
  revisarCampos(cuerpo, ['nombre']);
  const nombre = leer(validarNombreMunicipio, cuerpo.nombre);

  return enTransaccion(async (conexion) => {
    const municipio = await bloquearMunicipio(conexion, id);
    if (municipio.codigo_ine === MUNICIPIO_ESPECIAL) throw errores.especial();
    const cambios = diferencias({ nombre: municipio.nombre }, { nombre });
    if (cambios) {
      await verificarNombreLibre(conexion, { departamentoId: municipio.departamento_id, nombre }, municipio.id);
      await conexion.query('UPDATE municipio SET nombre = ? WHERE id = ?', [nombre, municipio.id]);
      await registrarCambio(conexion, contexto, ACCIONES.ACTUALIZAR, municipio.id, cambios);
    }
    return buscarMunicipio(conexion, municipio.id);
  });
}

// El personal con este municipio no lo impide: es un dato de la persona, no del territorio que reporta.
async function verificarSinUso(conexion, municipioId) {
  const [[{ distritos, establecimientos }]] = await conexion.query(
    `SELECT (SELECT COUNT(*) FROM distrito_salud WHERE municipio_id = ? AND activo = TRUE) AS distritos,
            (SELECT COUNT(*) FROM establecimiento WHERE municipio_id = ? AND activo = TRUE) AS establecimientos`,
    [municipioId, municipioId],
  );
  const [redes] = await conexion.query(
    `SELECT r.nombre FROM red_municipio rm JOIN red r ON r.id = rm.red_id
      WHERE rm.municipio_id = ? AND r.activo = TRUE`,
    [municipioId],
  );
  const partes = [];
  if (distritos > 0) partes.push(conCantidad(Number(distritos), 'distrito activo', 'distritos activos'));
  if (establecimientos > 0) {
    partes.push(conCantidad(Number(establecimientos), 'establecimiento activo', 'establecimientos activos'));
  }
  for (const red of redes) partes.push(`la red activa ${red.nombre}`);
  if (partes.length > 0) throw errores.enUso(enumerar(partes));
}

async function cambiarEstadoMunicipio(id, activo, contexto) {
  return enTransaccion(async (conexion) => {
    const municipio = await bloquearMunicipio(conexion, id);
    if (!activo && municipio.codigo_ine === MUNICIPIO_ESPECIAL) throw errores.especial();
    const cambios = diferencias({ activo: Boolean(municipio.activo) }, { activo });
    if (cambios) {
      if (!activo) await verificarSinUso(conexion, municipio.id);
      await conexion.query('UPDATE municipio SET activo = ? WHERE id = ?', [activo, municipio.id]);
      const accion = activo ? ACCIONES.REACTIVAR : ACCIONES.DESACTIVAR;
      await registrarCambio(conexion, contexto, accion, municipio.id, cambios);
    }
    return buscarMunicipio(conexion, municipio.id);
  });
}

export const desactivarMunicipio = (id, contexto) => cambiarEstadoMunicipio(id, false, contexto);

export const reactivarMunicipio = (id, contexto) => cambiarEstadoMunicipio(id, true, contexto);
