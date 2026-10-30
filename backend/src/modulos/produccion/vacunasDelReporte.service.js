import pool, { enTransaccion } from '../../config/mysql.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { verificarAlcance } from '../auth/alcance.service.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import { MESES_EDITABLES, aCelda, celdasGuardadas, esquemasDe, obtenerFormulario } from './captura.service.js';
import { obtenerReporte, vacunasConEsquema } from './reportes.service.js';

// SPEC 31: el Personal agrega al reporte en borrador las vacunas con esquema para el mes que no entraron al crearlo,
// y quita las que no son base.
const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  noEditable: () => new ErrorApi(409, 'REPORTE_NO_EDITABLE', 'El reporte ya no está en borrador y no se puede editar.'),
  periodoCerrado: () => new ErrorApi(409, 'PERIODO_CERRADO', 'El mes ya está cerrado.'),
  desactualizado: () =>
    new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'),
  repetida: () => new ErrorApi(409, 'VACUNA_YA_EN_REPORTE', 'La vacuna ya está en el reporte.'),
  base: () => new ErrorApi(409, 'VACUNA_BASE', 'Esta vacuna es parte del reporte del mes y no se puede quitar.'),
  conObservaciones: () =>
    new ErrorApi(409, 'VACUNA_CON_OBSERVACIONES', 'La vacuna tiene observaciones del revisor y no se puede quitar.'),
  noDisponible: () =>
    new ErrorApi(422, 'VACUNA_NO_DISPONIBLE', 'La vacuna no tiene un formulario de captura para este mes.'),
};

const aId = (valor) => (/^\d+$/.test(String(valor)) ? Number(valor) : 0);

function leerEntero(valor, nombre) {
  if (!Number.isInteger(valor) || valor <= 0) throw entradaInvalida(`${nombre} debe ser un número entero mayor que 0.`);
  return valor;
}

// El periodo y la DDRISS dicen qué esquemas aplican. Uno de otro establecimiento responde 404, como la captura.
async function leerReporte(id, usuario) {
  const [[fila]] = await pool.query(
    `SELECT r.id, r.establecimiento_id, e.ddriss_id, d.codigo AS ddriss_codigo, p.anio, p.mes
       FROM reporte_produccion r
       JOIN establecimiento e ON e.id = r.establecimiento_id
       JOIN ddriss d ON d.id = e.ddriss_id
       JOIN periodo p ON p.id = r.periodo_id
      WHERE r.id = ?`,
    [aId(id)],
  );
  if (!fila) throw errores.noEncontrado();
  verificarAlcance(usuario, { establecimientoId: fila.establecimiento_id, ddrissId: fila.ddriss_id });
  return fila;
}

// Primera consulta de la transacción (nota del 2026-10-23): dos cambios del mismo reporte se ordenan aquí.
async function bloquearEditable(conexion, reporteId, versionFila) {
  const [[bloqueado]] = await conexion.query(
    'SELECT estado, version_fila, periodo_id, establecimiento_id FROM reporte_produccion WHERE id = ? FOR UPDATE',
    [reporteId],
  );
  if (bloqueado.estado !== 'BORRADOR') throw errores.noEditable();
  const [[cierre]] = await conexion.query(
    `SELECT cp.estado FROM cierre_periodo cp
       JOIN establecimiento e ON e.ddriss_id = cp.ddriss_id
      WHERE cp.periodo_id = ? AND e.id = ?`,
    [bloqueado.periodo_id, bloqueado.establecimiento_id],
  );
  if (!MESES_EDITABLES.includes(cierre?.estado)) throw errores.periodoCerrado();
  if (bloqueado.version_fila !== versionFila) throw errores.desactualizado();
  return bloqueado;
}

async function subirVersion(conexion, reporteId) {
  await conexion.query('UPDATE reporte_produccion SET version_fila = version_fila + 1 WHERE id = ?', [reporteId]);
}

// Las vacunas activas con esquema para el mes que el reporte no tiene, en el orden de GET /reportes/{id}.
export async function listarDisponibles(id, usuario) {
  const reporte = await leerReporte(id, usuario);
  const [conEsquema, [enElReporte]] = await Promise.all([
    vacunasConEsquema(reporte, reporte.ddriss_codigo),
    pool.query('SELECT vacuna_id FROM reporte_vacuna WHERE reporte_id = ?', [reporte.id]),
  ]);
  const tiene = new Set(enElReporte.map((f) => f.vacuna_id));
  const disponibles = new Map(conEsquema.filter((v) => !tiene.has(v.vacunaId)).map((v) => [v.vacunaId, v]));
  if (disponibles.size === 0) return [];
  const [vacunas] = await pool.query('SELECT id, codigo, nombre FROM vacuna WHERE id IN (?) ORDER BY orden_informe, nombre', [
    [...disponibles.keys()],
  ]);
  return vacunas.map((v) => ({
    vacunaId: v.id,
    codigo: v.codigo,
    nombre: v.nombre,
    esquema: { id: disponibles.get(v.id).id, version: disponibles.get(v.id).version },
  }));
}

function leerAgregar(cuerpo) {
  revisarCampos(cuerpo, ['vacunaId', 'versionFila']);
  return { vacunaId: leerEntero(cuerpo.vacunaId, 'vacunaId'), versionFila: leerEntero(cuerpo.versionFila, 'versionFila') };
}

// Fija el esquema que cubre el día 1 del mes en este momento, marcado o no; después no cambia (regla 5).
export async function agregarVacuna(id, cuerpo, usuario, contexto) {
  const pedido = leerAgregar(cuerpo);
  const reporte = await leerReporte(id, usuario);
  // MongoDB se lee antes de la transacción, para no tenerla abierta mientras tanto.
  const esquema = (await vacunasConEsquema(reporte, reporte.ddriss_codigo)).find((v) => v.vacunaId === pedido.vacunaId);
  if (!esquema) throw errores.noDisponible();
  const [[vacuna]] = await pool.query('SELECT codigo FROM vacuna WHERE id = ?', [pedido.vacunaId]);

  let versionFila;
  try {
    versionFila = await enTransaccion(async (conexion) => {
      const bloqueado = await bloquearEditable(conexion, reporte.id, pedido.versionFila);
      const [[existente]] = await conexion.query('SELECT id FROM reporte_vacuna WHERE reporte_id = ? AND vacuna_id = ?', [
        reporte.id,
        pedido.vacunaId,
      ]);
      if (existente) throw errores.repetida();
      const [resultado] = await conexion.query(
        'INSERT INTO reporte_vacuna (reporte_id, vacuna_id, esquema_mongo_id, esquema_version) VALUES (?, ?, ?, ?)',
        [reporte.id, pedido.vacunaId, esquema.id, esquema.version],
      );
      await subirVersion(conexion, reporte.id);
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.PRODUCCION,
        accion: ACCIONES.CREAR,
        entidad: 'reporte_vacuna',
        entidadId: resultado.insertId,
        valoresNuevos: {
          reporteId: reporte.id,
          vacunaId: pedido.vacunaId,
          vacunaCodigo: vacuna.codigo,
          esquemaId: esquema.id,
          esquemaVersion: esquema.version,
        },
      });
      return bloqueado.version_fila + 1;
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw errores.repetida();
    throw err;
  }

  // La vacuna en la forma de GET /reportes/{id} y del formulario, para unirla sin recargar la pantalla.
  const [completo, formulario] = await Promise.all([obtenerReporte(reporte.id, usuario), obtenerFormulario(reporte.id, usuario)]);
  return {
    versionFila,
    orden: completo.vacunas.map((v) => v.vacuna.id),
    vacuna: completo.vacunas.find((v) => v.vacuna.id === pedido.vacunaId),
    formulario: formulario.vacunas.find((v) => v.vacunaId === pedido.vacunaId),
  };
}

// Borra la fila y, en cascada, sus cantidades; la bitácora guarda todo lo borrado para poder reconstruirlo.
export async function quitarVacuna(id, vacunaId, query, usuario, contexto) {
  revisarParametros(query, ['versionFila']);
  // En la consulta llega como texto: solo dígitos.
  const versionFila = leerEntero(/^\d+$/.test(query.versionFila ?? '') ? Number(query.versionFila) : null, 'versionFila');
  const reporte = await leerReporte(id, usuario);
  const [[fila]] = await pool.query(
    `SELECT rv.id, rv.vacuna_id, v.codigo, rv.esquema_mongo_id, rv.esquema_version, rv.datos_adicionales, rv.total_declarado
       FROM reporte_vacuna rv
       JOIN vacuna v ON v.id = rv.vacuna_id
      WHERE rv.reporte_id = ? AND rv.vacuna_id = ?`,
    [reporte.id, aId(vacunaId)],
  );
  if (!fila) throw errores.noEncontrado();
  // La versión fijada no cambia (regla 5): se lee fuera de la transacción. Sin documento, cuenta como base.
  const esBase = (await esquemasDe([fila.esquema_mongo_id])).get(fila.esquema_mongo_id)?.incluirPorDefecto ?? true;

  return enTransaccion(async (conexion) => {
    const bloqueado = await bloquearEditable(conexion, reporte.id, versionFila);
    if (esBase) throw errores.base();
    const [[observada]] = await conexion.query('SELECT id FROM observacion_revision WHERE reporte_vacuna_id = ? LIMIT 1', [
      fila.id,
    ]);
    if (observada) throw errores.conObservaciones();

    const celdas = (await celdasGuardadas(conexion, [fila.id])).map(aCelda);
    await conexion.query('DELETE FROM reporte_vacuna WHERE id = ?', [fila.id]);
    await subirVersion(conexion, reporte.id);
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.PRODUCCION,
      accion: ACCIONES.ELIMINAR,
      entidad: 'reporte_vacuna',
      entidadId: fila.id,
      valoresAnteriores: {
        reporteId: reporte.id,
        vacunaId: fila.vacuna_id,
        vacunaCodigo: fila.codigo,
        esquemaId: fila.esquema_mongo_id,
        esquemaVersion: fila.esquema_version,
        totalDeclarado: fila.total_declarado ?? null,
        datosAdicionales: fila.datos_adicionales ?? null,
        celdas,
      },
    });
    return { versionFila: bloqueado.version_fila + 1 };
  });
}
