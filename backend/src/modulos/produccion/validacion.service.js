import pool, { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import { verificarAlcance } from '../auth/alcance.service.js';
import { registrarBitacora, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';
import { reglasQueAplican } from '../configuracion/reglas.service.js';
import { celdasDelEsquema } from './celdas.service.js';
import { celdasGuardadas, esquemasDe, MESES_EDITABLES } from './captura.service.js';
import { leerProcedencias, procedenciasPermitidas } from './procedencias.service.js';
import { ejecutarReglas } from './validadores.js';

// Corre el motor de validadores.js sobre lo guardado del reporte y compara con los resultados actuales (SPEC 33).

const GRUPO_EDAD = 'grupo_edad';
const ACTUALES = ['ABIERTO', 'JUSTIFICADO'];
// Los reportes que ya salieron de BORRADOR: el historial de VARIACION_HISTORICA.
const ENVIADOS = ['ENVIADO', 'EN_REVISION', 'CORRECCION_SOLICITADA', 'APROBADO', 'CERRADO', 'RECTIFICACION'];
const MESES_HISTORIAL = 12; // el máximo de meses_referencia en tiposRegla.js
const NOMBRES_MES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre',
  'octubre', 'noviembre', 'diciembre'];

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  noEditable: () => new ErrorApi(409, 'REPORTE_NO_EDITABLE', 'El reporte ya no está en borrador y no se puede editar.'),
  periodoCerrado: () => new ErrorApi(409, 'PERIODO_CERRADO', 'El mes ya está cerrado.'),
};

function leerPedido(id, query, cuerpo) {
  revisarParametros(query, []);
  if (cuerpo !== undefined) revisarCampos(cuerpo, []);
  if (!/^\d+$/.test(String(id)) || Number(id) <= 0) throw entradaInvalida('id debe ser un número entero positivo.');
  return Number(id);
}

async function leerReporte(id, usuario) {
  const [[fila]] = await pool.query(
    `SELECT r.id, r.periodo_id, e.id AS establecimiento_id, e.nombre AS establecimiento, e.ddriss_id,
            e.municipio_id, d.codigo AS ddriss_codigo, p.anio, p.mes
       FROM reporte_produccion r
       JOIN establecimiento e ON e.id = r.establecimiento_id
       JOIN ddriss d ON d.id = e.ddriss_id
       JOIN periodo p ON p.id = r.periodo_id
      WHERE r.id = ?`,
    [id],
  );
  if (!fila) throw errores.noEncontrado();
  verificarAlcance(usuario, { establecimientoId: fila.establecimiento_id, ddrissId: fila.ddriss_id });
  return fila;
}

async function catalogoDimensiones(esquemas) {
  const codigos = new Set([GRUPO_EDAD]);
  for (const e of esquemas) {
    for (const d of [...e.desagregacion, ...e.dosis.flatMap((x) => x.desagregacion ?? [])]) codigos.add(d.dimension);
  }
  const db = await obtenerDb();
  return db.collection('catalogo_dimensiones').find({ codigo: { $in: [...codigos] } }).toArray();
}

// Una sección por grupo_edad de las celdas válidas, en el orden del esquema; una versión sin secciones
// (Hexavalente v1) toma el título del catálogo.
function seccionesDe(esquema, validas, catalogo) {
  const edades = [...new Set([...validas.values()].map((c) => c.dimensiones[GRUPO_EDAD] ?? null))];
  const posicion = (edad) => {
    const i = esquema.secciones.findIndex((s) => (s.grupoEdad ?? null) === edad);
    return i === -1 ? esquema.secciones.length : i;
  };
  const etiquetaEdad = (edad) => catalogo.get(GRUPO_EDAD)?.valores.find((v) => v.codigo === edad)?.etiqueta ?? edad;
  return edades
    .sort((a, b) => posicion(a) - posicion(b))
    .map((edad) => ({
      grupoEdad: edad,
      titulo: esquema.secciones.find((s) => (s.grupoEdad ?? null) === edad)?.titulo ?? etiquetaEdad(edad) ?? '',
    }));
}

// Los totales de los MESES_HISTORIAL meses anteriores, por vacuna: [{ atras, total }].
async function historiales(conexion, reporte, vacunaIds) {
  const actual = reporte.anio * 12 + reporte.mes;
  const [filas] = await conexion.query(
    `SELECT rv.vacuna_id, p.anio * 12 + p.mes AS mes, rv.total_declarado
       FROM reporte_produccion r
       JOIN periodo p ON p.id = r.periodo_id
       JOIN reporte_vacuna rv ON rv.reporte_id = r.id
      WHERE r.establecimiento_id = ? AND r.estado IN (?) AND rv.vacuna_id IN (?) AND rv.total_declarado IS NOT NULL
        AND p.anio * 12 + p.mes BETWEEN ? AND ?`,
    [reporte.establecimiento_id, ENVIADOS, vacunaIds, actual - MESES_HISTORIAL, actual - 1],
  );
  const porVacuna = new Map();
  for (const f of filas) {
    if (!porVacuna.has(f.vacuna_id)) porVacuna.set(f.vacuna_id, []);
    porVacuna.get(f.vacuna_id).push({ atras: actual - Number(f.mes), total: Number(f.total_declarado) });
  }
  return porVacuna;
}

// Lee lo guardado dentro de la transacción, después del bloqueo, y arma la entrada de ejecutarReglas.
async function armarReporte(conexion, reporte) {
  const [vacunas] = await conexion.query(
    `SELECT rv.id, rv.vacuna_id, v.codigo, v.nombre, rv.esquema_mongo_id, rv.datos_adicionales
       FROM reporte_vacuna rv
       JOIN vacuna v ON v.id = rv.vacuna_id
      WHERE rv.reporte_id = ?
      ORDER BY v.orden_informe, v.nombre`,
    [reporte.id],
  );
  const [[{ otros }]] = await conexion.query(
    'SELECT COUNT(*) AS otros FROM reporte_produccion WHERE establecimiento_id = ? AND periodo_id = ? AND id <> ?',
    [reporte.establecimiento_id, reporte.periodo_id, reporte.id],
  );
  const base = {
    establecimiento: reporte.establecimiento,
    periodo: `${NOMBRES_MES[reporte.mes - 1]} de ${reporte.anio}`,
    otrosReportes: Number(otros),
    municipioPropioId: reporte.municipio_id,
  };
  if (vacunas.length === 0) return { ...base, municipios: new Map(), vacunas: [] };

  const vacunaIds = vacunas.map((v) => v.vacuna_id);
  const [celdas, esquemas, [filasDosis], historial] = await Promise.all([
    celdasGuardadas(conexion, vacunas.map((v) => v.id)),
    esquemasDe(vacunas.map((v) => v.esquema_mongo_id)),
    conexion.query('SELECT vacuna_id, codigo, nombre, orden, activa FROM dosis WHERE vacuna_id IN (?) ORDER BY orden', [
      vacunaIds,
    ]),
    historiales(conexion, reporte, vacunaIds),
  ]);
  const dimensiones = await catalogoDimensiones([...esquemas.values()]);
  const catalogo = new Map(dimensiones.map((d) => [d.codigo, d]));
  const procedencias = await leerProcedencias(
    conexion,
    { ddrissId: reporte.ddriss_id, municipioPropioId: reporte.municipio_id },
    [...new Set(celdas.map((c) => c.municipioProcedenciaId))],
  );

  return {
    ...base,
    municipios: new Map(procedencias.municipios.map((m) => [m.id, m.nombre])),
    // Una vacuna cuyo esquema ya no está en MongoDB no se puede revisar: no tiene celdas válidas.
    vacunas: vacunas
      .filter((v) => esquemas.has(v.esquema_mongo_id))
      .map((v) => {
        const esquema = esquemas.get(v.esquema_mongo_id);
        const deLaVacuna = filasDosis.filter((d) => d.vacuna_id === v.vacuna_id);
        const validas = celdasDelEsquema({
          contenido: esquema,
          codigosDosis: deLaVacuna.map((d) => d.codigo),
          dimensiones,
          deducirSecciones: true,
        });
        return {
          reporteVacunaId: v.id,
          vacuna: { id: v.vacuna_id, codigo: v.codigo, nombre: v.nombre },
          version: esquema.version,
          dosis: deLaVacuna.map((d) => ({
            codigo: d.codigo,
            etiqueta: esquema.dosis.find((x) => x.codigo === d.codigo)?.etiqueta ?? d.nombre,
            activa: Boolean(d.activa),
          })),
          secciones: seccionesDe(esquema, validas, catalogo),
          validas,
          celdas: celdas.filter((c) => c.reporteVacunaId === v.id),
          camposAdicionales: esquema.camposAdicionales,
          datosAdicionales: v.datos_adicionales ?? null,
          permitidas: procedenciasPermitidas(esquema, procedencias),
          historial: historial.get(v.vacuna_id) ?? [],
        };
      }),
  };
}

// La llave de un resultado: no lleva la versión de la regla, para que una versión nueva con el mismo mensaje no
// pase el resultado a CORREGIDO.
const llave = (r) => [r.reglaCodigo, r.reporteVacunaId ?? '', r.detalleId ?? '', r.mensaje].join('|');

// Dos hallazgos con la misma llave son un solo resultado, con las casillas de los dos.
function unirPorLlave(resultados) {
  const porLlave = new Map();
  for (const r of resultados) {
    const k = llave({ ...r, reglaCodigo: r.regla.codigo });
    const previo = porLlave.get(k);
    if (previo) {
      previo.celdas.push(...r.celdas);
      previo.campos.push(...r.campos.filter((c) => !previo.campos.includes(c)));
    } else {
      porLlave.set(k, { ...r, celdas: [...r.celdas], campos: [...r.campos], llave: k });
    }
  }
  return [...porLlave.values()];
}

async function compararYEscribir(conexion, reporteId, resultados) {
  const [filas] = await conexion.query(
    `SELECT id, regla_codigo, regla_version, severidad, reporte_vacuna_id, detalle_id, mensaje, estado
       FROM resultado_validacion
      WHERE reporte_id = ? AND estado IN (?)
      ORDER BY id`,
    [reporteId, ACTUALES],
  );
  const existentes = new Map();
  for (const f of filas) {
    const k = llave({ reglaCodigo: f.regla_codigo, reporteVacunaId: f.reporte_vacuna_id, detalleId: f.detalle_id, mensaje: f.mensaje });
    if (!existentes.has(k)) existentes.set(k, f);
  }

  const conteo = { nuevos: 0, actualizados: 0, corregidos: 0 };
  const vistos = new Set();
  const actuales = [];
  for (const r of resultados) {
    const previo = existentes.get(r.llave);
    if (previo) {
      vistos.add(previo.id);
      if (previo.regla_version !== r.regla.version || previo.severidad !== r.severidad) {
        await conexion.query('UPDATE resultado_validacion SET regla_version = ?, severidad = ? WHERE id = ?', [
          r.regla.version,
          r.severidad,
          previo.id,
        ]);
        conteo.actualizados++;
      }
      actuales.push({ ...r, id: previo.id, estado: previo.estado });
      continue;
    }
    const [nuevo] = await conexion.query(
      `INSERT INTO resultado_validacion
         (reporte_id, reporte_vacuna_id, detalle_id, regla_codigo, regla_version, severidad, mensaje, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ABIERTO')`,
      [reporteId, r.reporteVacunaId, r.detalleId, r.regla.codigo, r.regla.version, r.severidad, r.mensaje],
    );
    conteo.nuevos++;
    actuales.push({ ...r, id: nuevo.insertId, estado: 'ABIERTO' });
  }

  const corregidos = filas.filter((f) => !vistos.has(f.id)).map((f) => f.id);
  if (corregidos.length > 0) {
    await conexion.query("UPDATE resultado_validacion SET estado = 'CORREGIDO' WHERE id IN (?)", [corregidos]);
    conteo.corregidos = corregidos.length;
  }
  return { actuales, conteo };
}

const aResultado = (r) => ({
  id: r.id,
  regla: r.regla,
  severidad: r.severidad,
  estado: r.estado,
  mensaje: r.mensaje,
  vacuna: r.vacuna,
  dosis: r.dosis,
  celdas: r.celdas,
  campos: r.campos,
});

export async function validarReporte(id, query, cuerpo, usuario, contexto) {
  const reporte = await leerReporte(leerPedido(id, query, cuerpo), usuario);
  // Las versiones publicadas no cambian (regla 5): se pueden leer antes del bloqueo.
  const reglas = await reglasQueAplican(reporte.ddriss_codigo);

  return enTransaccion(async (conexion) => {
    // Primera consulta de la transacción: dos validaciones o un guardado del mismo reporte se ordenan aquí.
    const [[bloqueado]] = await conexion.query('SELECT estado FROM reporte_produccion WHERE id = ? FOR UPDATE', [
      reporte.id,
    ]);
    if (bloqueado.estado !== 'BORRADOR') throw errores.noEditable();
    const [[cierre]] = await conexion.query('SELECT estado FROM cierre_periodo WHERE periodo_id = ? AND ddriss_id = ?', [
      reporte.periodo_id,
      reporte.ddriss_id,
    ]);
    if (!MESES_EDITABLES.includes(cierre?.estado)) throw errores.periodoCerrado();

    const resultados = unirPorLlave(ejecutarReglas(reglas, await armarReporte(conexion, reporte)));
    const { actuales, conteo } = await compararYEscribir(conexion, reporte.id, resultados);
    const cuantosErrores = actuales.filter((r) => r.severidad === 'ERROR').length;
    const resumen = { errores: cuantosErrores, advertencias: actuales.length - cuantosErrores };

    if (conteo.nuevos + conteo.actualizados + conteo.corregidos > 0) {
      await registrarBitacora(conexion, {
        ...contexto,
        modulo: MODULOS.PRODUCCION,
        accion: ACCIONES.VALIDAR,
        entidad: 'reporte_produccion',
        entidadId: reporte.id,
        valoresNuevos: { ...resumen, ...conteo },
      });
    }

    return {
      validadoEn: new Date().toISOString(),
      ...resumen,
      corregidos: conteo.corregidos,
      resultados: actuales.map(aResultado),
    };
  });
}
