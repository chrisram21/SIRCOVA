import { ObjectId } from 'mongodb';
import pool, { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { verificarAlcance } from '../auth/alcance.service.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos } from '../catalogos/catalogos.service.js';
import { aEsquema } from '../configuracion/esquemas.service.js';
import { celdasDelEsquema, claveCombinacion } from './celdas.service.js';
import { leerProcedencias, procedenciasPermitidas } from './procedencias.service.js';

const MESES_EDITABLES = ['ABIERTO', 'EN_CIERRE'];
const GRUPO_EDAD = 'grupo_edad';
const CANTIDAD_MAXIMA = 4294967295; // INT UNSIGNED de detalle_produccion.cantidad
const LARGO_TEXTO = 200;

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  noEditable: () => new ErrorApi(409, 'REPORTE_NO_EDITABLE', 'El reporte ya no está en borrador y no se puede editar.'),
  periodoCerrado: () => new ErrorApi(409, 'PERIODO_CERRADO', 'El mes ya está cerrado.'),
  desactualizado: () =>
    new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'),
  celdaInvalida: (mensaje) => new ErrorApi(422, 'CELDA_INVALIDA', mensaje),
  celdaRepetida: (nombre) => new ErrorApi(422, 'CELDA_REPETIDA', `La celda ${nombre} está repetida.`),
  datoInvalido: (nombre) => new ErrorApi(422, 'DATO_ADICIONAL_INVALIDO', `El dato «${nombre}» no es válido.`),
};

const aId = (valor) => (/^\d+$/.test(String(valor)) ? Number(valor) : 0);

// Se edita en BORRADOR con el mes abierto o en cierre (así se corrige un reporte devuelto pasada la fecha límite).
const esEditable = (reporte) => reporte.estado === 'BORRADOR' && MESES_EDITABLES.includes(reporte.estadoMes);

// El estado del mes es el de la DDRISS del establecimiento (regla 10).
async function leerReporte(ejecutor, id, usuario) {
  const [[fila]] = await ejecutor.query(
    `SELECT r.id, r.estado, r.version_fila, e.id AS establecimiento_id, e.ddriss_id,
            m.id AS municipio_id, m.nombre AS municipio_nombre, cp.estado AS estado_mes
       FROM reporte_produccion r
       JOIN establecimiento e ON e.id = r.establecimiento_id
       JOIN municipio m ON m.id = e.municipio_id
       LEFT JOIN cierre_periodo cp ON cp.periodo_id = r.periodo_id AND cp.ddriss_id = e.ddriss_id
      WHERE r.id = ?`,
    [aId(id)],
  );
  if (!fila) throw errores.noEncontrado();
  verificarAlcance(usuario, { establecimientoId: fila.establecimiento_id, ddrissId: fila.ddriss_id });
  return {
    id: fila.id,
    estado: fila.estado,
    versionFila: fila.version_fila,
    estadoMes: fila.estado_mes ?? null,
    ddrissId: fila.ddriss_id,
    municipioPropio: { id: fila.municipio_id, nombre: fila.municipio_nombre },
  };
}

const delReporte = (reporte) => ({ ddrissId: reporte.ddrissId, municipioPropioId: reporte.municipioPropio.id });

// En el orden de GET /reportes/{id} (orden_informe, nombre).
async function vacunasDelReporte(ejecutor, reporteId) {
  const [filas] = await ejecutor.query(
    `SELECT rv.id, rv.vacuna_id, rv.esquema_mongo_id, rv.datos_adicionales, rv.total_declarado
       FROM reporte_vacuna rv
       JOIN vacuna v ON v.id = rv.vacuna_id
      WHERE rv.reporte_id = ?
      ORDER BY v.orden_informe, v.nombre`,
    [reporteId],
  );
  return filas;
}

// Las filas de detalle_produccion de esas vacunas del reporte, con sus dimensiones de detalle_dimension.
async function celdasGuardadas(ejecutor, reporteVacunaIds) {
  if (reporteVacunaIds.length === 0) return [];
  const [filas] = await ejecutor.query(
    `SELECT dp.id, dp.reporte_vacuna_id, d.codigo AS dosis_codigo, dp.municipio_procedencia_id,
            dp.clave_combinacion, dp.cantidad, dd.dimension_codigo, dd.valor_codigo
       FROM detalle_produccion dp
       JOIN dosis d ON d.id = dp.dosis_id
       LEFT JOIN detalle_dimension dd ON dd.detalle_id = dp.id
      WHERE dp.reporte_vacuna_id IN (?)
      ORDER BY d.orden, dp.clave_combinacion, dp.municipio_procedencia_id, dp.id`,
    [reporteVacunaIds],
  );
  const porId = new Map();
  for (const f of filas) {
    if (!porId.has(f.id)) {
      porId.set(f.id, {
        id: f.id,
        reporteVacunaId: f.reporte_vacuna_id,
        dosisCodigo: f.dosis_codigo,
        municipioProcedenciaId: f.municipio_procedencia_id,
        dimensiones: {},
        claveCombinacion: f.clave_combinacion,
        cantidad: f.cantidad,
      });
    }
    if (f.dimension_codigo) porId.get(f.id).dimensiones[f.dimension_codigo] = f.valor_codigo;
  }
  return [...porId.values()];
}

// La versión fijada en el reporte, sin los datos de creación ni de publicación. Un documento que ya no está en
// MongoDB no aparece en el Map.
async function esquemasDe(idsMongo) {
  const ids = idsMongo.filter((id) => /^[0-9a-f]{24}$/i.test(id)).map((id) => new ObjectId(id));
  if (ids.length === 0) return new Map();
  const db = await obtenerDb();
  const documentos = await db.collection('esquemas_captura').find({ _id: { $in: ids } }).toArray();
  return new Map(
    documentos.map((doc) => {
      const { creadoPor, creadoEn, publicadoPor, publicadoEn, motivoCambio, ...esquema } = aEsquema(doc);
      return [doc._id.toString(), esquema];
    }),
  );
}

const aCelda = ({ dosisCodigo, municipioProcedenciaId, dimensiones, claveCombinacion, cantidad }) => ({
  dosisCodigo,
  municipioProcedenciaId,
  dimensiones,
  claveCombinacion,
  cantidad,
});

function aVacunaDeFormulario(fila, esquemas, celdas, procedencias) {
  const esquema = esquemas.get(fila.esquema_mongo_id) ?? null;
  return {
    vacunaId: fila.vacuna_id,
    // Como en GET /reportes/{id}: sin el documento, o sin la marca, la vacuna cuenta como base.
    base: esquema?.incluirPorDefecto ?? true,
    esquema,
    procedenciasPermitidas: procedenciasPermitidas(esquema, procedencias),
    celdas: celdas.filter((c) => c.reporteVacunaId === fila.id).map(aCelda),
    datosAdicionales: fila.datos_adicionales ?? null,
    totalDeclarado: fila.total_declarado ?? null,
  };
}

export async function obtenerFormulario(id, usuario) {
  const reporte = await leerReporte(pool, id, usuario);
  const vacunas = await vacunasDelReporte(pool, reporte.id);
  const [celdas, esquemas] = await Promise.all([
    celdasGuardadas(pool, vacunas.map((v) => v.id)),
    esquemasDe(vacunas.map((v) => v.esquema_mongo_id)),
  ]);
  const guardadas = [...new Set(celdas.map((c) => c.municipioProcedenciaId))];
  const procedencias = await leerProcedencias(pool, delReporte(reporte), guardadas);
  return {
    reporteId: reporte.id,
    versionFila: reporte.versionFila,
    editable: esEditable(reporte),
    municipioPropio: reporte.municipioPropio,
    municipios: procedencias.municipios,
    vacunas: vacunas.map((fila) => aVacunaDeFormulario(fila, esquemas, celdas, procedencias)),
  };
}

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor);

function leerCelda(celda) {
  if (!esObjeto(celda)) throw entradaInvalida('Cada celda debe ser un objeto.');
  revisarCampos(celda, ['dosisCodigo', 'municipioProcedenciaId', 'dimensiones', 'cantidad']);
  const { dosisCodigo, municipioProcedenciaId, dimensiones, cantidad } = celda;
  if (typeof dosisCodigo !== 'string' || dosisCodigo === '') throw entradaInvalida('dosisCodigo debe ser un texto.');
  if (!Number.isInteger(municipioProcedenciaId) || municipioProcedenciaId <= 0) {
    throw entradaInvalida('municipioProcedenciaId debe ser un número entero positivo.');
  }
  if (!esObjeto(dimensiones) || Object.values(dimensiones).some((v) => typeof v !== 'string' || v === '')) {
    throw entradaInvalida('dimensiones debe ser un objeto con un código de valor por dimensión.');
  }
  if (!Number.isInteger(cantidad) || cantidad < 0 || cantidad > CANTIDAD_MAXIMA) {
    throw entradaInvalida('La cantidad de cada celda debe ser un número entero mayor o igual a 0.');
  }
  return { dosisCodigo, municipioProcedenciaId, dimensiones, cantidad };
}

function leerGuardado(cuerpo) {
  revisarCampos(cuerpo, ['versionFila', 'celdas', 'datosAdicionales']);
  const { versionFila, celdas, datosAdicionales = null } = cuerpo;
  if (!Number.isInteger(versionFila) || versionFila <= 0) throw entradaInvalida('versionFila debe ser un número entero positivo.');
  if (!Array.isArray(celdas)) throw entradaInvalida('celdas debe ser una lista.');
  if (datosAdicionales !== null && !esObjeto(datosAdicionales)) throw entradaInvalida('datosAdicionales debe ser un objeto.');
  return { versionFila, celdas: celdas.map(leerCelda), datosAdicionales };
}

// Un valor nulo o un texto vacío cuentan como sin llenar y no se guardan; requerido no se exige en el borrador.
function leerDatosAdicionales(datos, campos) {
  if (datos === null) return null;
  const porClave = new Map(campos.map((c) => [c.clave, c]));
  const guardados = {};
  for (const [clave, original] of Object.entries(datos)) {
    const campo = porClave.get(clave);
    if (!campo) throw errores.datoInvalido(clave);
    const valor = typeof original === 'string' && campo.tipo === 'texto' ? original.trim() : original;
    if (valor === null || valor === '') continue;
    const enRango = (n) => (campo.minimo ?? -Infinity) <= n && n <= (campo.maximo ?? Infinity);
    const valido = {
      entero: () => Number.isInteger(valor) && enRango(valor),
      decimal: () => typeof valor === 'number' && Number.isFinite(valor) && enRango(valor),
      texto: () => typeof valor === 'string' && valor.length <= LARGO_TEXTO,
      booleano: () => typeof valor === 'boolean',
      lista: () => (campo.opciones ?? []).includes(valor),
    }[campo.tipo]?.();
    if (!valido) throw errores.datoInvalido(campo.etiqueta);
    guardados[clave] = valor;
  }
  return Object.keys(guardados).length > 0 ? conClavesOrdenadas(guardados) : null;
}

// MySQL reordena las claves de un JSON al guardarlo; ordenadas, el mismo dato compara igual antes y después.
const conClavesOrdenadas = (objeto) =>
  objeto === null ? null : Object.fromEntries(Object.keys(objeto).sort().map((clave) => [clave, objeto[clave]]));

// "3.ª dosis · < 1 año · Femenino": la dosis y las etiquetas del catálogo, con el grupo de edad primero.
function nombreDeCelda(celda, dosis, catalogo) {
  const dimensiones = Object.keys(celda.dimensiones).sort(
    (a, b) => (b === GRUPO_EDAD) - (a === GRUPO_EDAD) || a.localeCompare(b),
  );
  const etiqueta = (dimension) => {
    const valor = celda.dimensiones[dimension];
    return catalogo.get(dimension)?.valores.find((v) => v.codigo === valor)?.etiqueta ?? valor;
  };
  return [dosis.get(celda.dosisCodigo)?.nombre ?? celda.dosisCodigo, ...dimensiones.map(etiqueta)].join(' · ');
}

async function catalogoDe(esquema) {
  const codigos = new Set([GRUPO_EDAD]);
  for (const d of [...esquema.desagregacion, ...esquema.dosis.flatMap((x) => x.desagregacion ?? [])]) codigos.add(d.dimension);
  const db = await obtenerDb();
  return db.collection('catalogo_dimensiones').find({ codigo: { $in: [...codigos] } }).toArray();
}

// La llave de uq_detalle dentro de una vacuna.
const llaveDeCelda = (c) => `${c.dosisCodigo}|${c.municipioProcedenciaId}|${c.claveCombinacion}`;

const procedenciaInvalida = (celda, dosis, catalogo) =>
  errores.celdaInvalida(
    `La celda ${nombreDeCelda(celda, dosis, catalogo)} tiene una procedencia que no se puede usar en esta vacuna.`,
  );

// Las reglas de las dosis inactivas y de las procedencias heredadas necesitan las filas actuales: se revisan dentro
// de la transacción. Aquí se devuelven las celdas cuya procedencia no es la propia ni una permitida.
function revisarCeldas(celdas, { validas, dosis, catalogo, municipioPropio, permitidas }) {
  const conClave = celdas.map((celda) => ({ ...celda, claveCombinacion: claveCombinacion(celda.dimensiones) }));
  for (const celda of conClave) {
    if (!validas.has(`${celda.dosisCodigo}|${celda.claveCombinacion}`)) {
      throw errores.celdaInvalida(`La celda ${nombreDeCelda(celda, dosis, catalogo)} no es parte del formulario.`);
    }
  }
  const vistas = new Set();
  for (const celda of conClave) {
    const llave = llaveDeCelda(celda);
    if (vistas.has(llave)) throw errores.celdaRepetida(nombreDeCelda(celda, dosis, catalogo));
    vistas.add(llave);
  }
  const heredadas = conClave.filter(
    (c) => c.municipioProcedenciaId !== municipioPropio && !permitidas.includes(c.municipioProcedenciaId),
  );
  return { pedidas: conClave, heredadas };
}

// Plano, porque diferencias compara solo el primer nivel: una clave por celda, más los datos y el total.
const estadoParaBitacora = (celdas, datosAdicionales, totalDeclarado) => ({
  ...Object.fromEntries(
    celdas.map((c) => [`celda:${c.dosisCodigo}|${c.municipioProcedenciaId}|${c.claveCombinacion}`, c.cantidad]),
  ),
  datosAdicionales,
  totalDeclarado,
});

async function escribirCeldas(conexion, { repVacId, actuales, pedidas, dosis, usuarioId }) {
  const porLlave = new Map(actuales.map((c) => [llaveDeCelda(c), c]));
  const llavesPedidas = new Set(pedidas.map(llaveDeCelda));
  const borradas = actuales.filter((c) => !llavesPedidas.has(llaveDeCelda(c))).map((c) => c.id);
  if (borradas.length > 0) await conexion.query('DELETE FROM detalle_produccion WHERE id IN (?)', [borradas]);

  for (const celda of pedidas) {
    const existente = porLlave.get(llaveDeCelda(celda));
    if (existente) {
      if (existente.cantidad !== celda.cantidad) {
        await conexion.query('UPDATE detalle_produccion SET cantidad = ?, actualizado_por = ? WHERE id = ?', [
          celda.cantidad,
          usuarioId,
          existente.id,
        ]);
      }
      continue;
    }
    const [nueva] = await conexion.query(
      `INSERT INTO detalle_produccion
         (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        repVacId,
        dosis.get(celda.dosisCodigo).id,
        celda.municipioProcedenciaId,
        celda.claveCombinacion,
        celda.cantidad,
        usuarioId,
      ],
    );
    // detalle_dimension repite exactamente las dimensiones de la clave (regla de CONTEXTO BD.md).
    const dimensiones = Object.entries(celda.dimensiones);
    if (dimensiones.length > 0) {
      await conexion.query('INSERT INTO detalle_dimension (detalle_id, dimension_codigo, valor_codigo) VALUES ?', [
        dimensiones.map(([dimension, valor]) => [nueva.insertId, dimension, valor]),
      ]);
    }
  }
}

// Reemplaza todas las celdas de la vacuna, de cualquier procedencia (las tarjetas A y B).
export async function guardarVacuna(id, vacunaId, cuerpo, usuario, contexto) {
  const pedido = leerGuardado(cuerpo);
  const reporte = await leerReporte(pool, id, usuario);
  const [[repVac]] = await pool.query(
    'SELECT id, vacuna_id, esquema_mongo_id FROM reporte_vacuna WHERE reporte_id = ? AND vacuna_id = ?',
    [reporte.id, aId(vacunaId)],
  );
  if (!repVac) throw errores.noEncontrado();

  // La versión fijada en el reporte no cambia (regla 5), así que se puede leer fuera de la transacción.
  const esquema = (await esquemasDe([repVac.esquema_mongo_id])).get(repVac.esquema_mongo_id);
  if (!esquema) throw errores.celdaInvalida('No se encontró el formulario de esta vacuna.');
  const [filasDosis] = await pool.query('SELECT id, codigo, nombre, activa FROM dosis WHERE vacuna_id = ?', [
    repVac.vacuna_id,
  ]);
  const dosis = new Map(filasDosis.map((d) => [d.codigo, d]));
  const dimensiones = await catalogoDe(esquema);
  const catalogo = new Map(dimensiones.map((d) => [d.codigo, d]));
  const validas = celdasDelEsquema({ contenido: esquema, codigosDosis: [...dosis.keys()], dimensiones, deducirSecciones: true });
  const municipioPropio = reporte.municipioPropio.id;
  const procedencias = await leerProcedencias(pool, delReporte(reporte));
  const { pedidas, heredadas } = revisarCeldas(pedido.celdas, {
    validas,
    dosis,
    catalogo,
    municipioPropio,
    permitidas: procedenciasPermitidas(esquema, procedencias),
  });
  const datosAdicionales = leerDatosAdicionales(pedido.datosAdicionales, esquema.camposAdicionales);

  return enTransaccion(async (conexion) => {
    // Primera consulta de la transacción: dos guardados del mismo reporte se ordenan aquí.
    const [[bloqueado]] = await conexion.query(
      'SELECT estado, version_fila, periodo_id, establecimiento_id FROM reporte_produccion WHERE id = ? FOR UPDATE',
      [reporte.id],
    );
    if (bloqueado.estado !== 'BORRADOR') throw errores.noEditable();
    const [[cierre]] = await conexion.query(
      `SELECT cp.estado FROM cierre_periodo cp
         JOIN establecimiento e ON e.ddriss_id = cp.ddriss_id
        WHERE cp.periodo_id = ? AND e.id = ?`,
      [bloqueado.periodo_id, bloqueado.establecimiento_id],
    );
    if (!MESES_EDITABLES.includes(cierre?.estado)) throw errores.periodoCerrado();
    if (bloqueado.version_fila !== pedido.versionFila) throw errores.desactualizado();

    const actuales = await celdasGuardadas(conexion, [repVac.id]);
    const conFilas = new Set(actuales.map((c) => c.dosisCodigo));
    const inactiva = pedidas.find((c) => !dosis.get(c.dosisCodigo).activa && !conFilas.has(c.dosisCodigo));
    if (inactiva) throw errores.celdaInvalida(`La dosis ${dosis.get(inactiva.dosisCodigo).nombre} está desactivada.`);
    // Una procedencia que ya no se ofrece (o un id que no existe) solo se acepta si la vacuna ya tenía filas de ella.
    const conProcedencia = new Set(actuales.map((c) => c.municipioProcedenciaId));
    const sinFilas = heredadas.find((c) => !conProcedencia.has(c.municipioProcedenciaId));
    if (sinFilas) throw procedenciaInvalida(sinFilas, dosis, catalogo);

    const totalDeclarado = pedidas.length === 0 ? null : pedidas.reduce((suma, c) => suma + c.cantidad, 0);
    const [[antes]] = await conexion.query('SELECT datos_adicionales, total_declarado FROM reporte_vacuna WHERE id = ?', [
      repVac.id,
    ]);
    const cambios = diferencias(
      estadoParaBitacora(actuales, conClavesOrdenadas(antes.datos_adicionales ?? null), antes.total_declarado ?? null),
      estadoParaBitacora(pedidas, datosAdicionales, totalDeclarado),
    );

    if (cambios) {
      await escribirCeldas(conexion, {
        repVacId: repVac.id,
        actuales,
        pedidas,
        dosis,
        usuarioId: contexto.usuarioId,
      });
      await conexion.query('UPDATE reporte_vacuna SET datos_adicionales = ?, total_declarado = ? WHERE id = ?', [
        datosAdicionales === null ? null : JSON.stringify(datosAdicionales),
        totalDeclarado,
        repVac.id,
      ]);
      await conexion.query('UPDATE reporte_produccion SET version_fila = version_fila + 1 WHERE id = ?', [reporte.id]);
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.PRODUCCION,
        accion: ACCIONES.ACTUALIZAR,
        entidad: 'reporte_vacuna',
        entidadId: repVac.id,
        valoresAnteriores: cambios.anteriores,
        valoresNuevos: cambios.nuevos,
      });
    }

    const [[guardada]] = await conexion.query(
      'SELECT id, vacuna_id, esquema_mongo_id, datos_adicionales, total_declarado FROM reporte_vacuna WHERE id = ?',
      [repVac.id],
    );
    return {
      versionFila: cambios ? bloqueado.version_fila + 1 : bloqueado.version_fila,
      vacuna: aVacunaDeFormulario(
        guardada,
        new Map([[repVac.esquema_mongo_id, esquema]]),
        await celdasGuardadas(conexion, [repVac.id]),
        procedencias,
      ),
    };
  });
}
