// Los validadores de reglas_validacion (SPEC 33): funciones puras, una por tipo de tiposRegla.js, sobre lo guardado
// de un reporte. validacion.service.js lee los datos y escribe los resultados.
//
// reporte: { establecimiento, periodo, otrosReportes, municipioPropioId, municipios: Map<id, nombre>, vacunas }
// cada vacuna: { reporteVacunaId, vacuna: { id, codigo, nombre }, version, dosis: [{ codigo, etiqueta, activa }] en
//   orden, secciones: [{ grupoEdad, titulo }], validas (celdasDelEsquema), celdas (celdasGuardadas),
//   camposAdicionales, datosAdicionales, permitidas: [municipioId], historial: [{ atras, total }] }, con atras = 1 para
//   el mes anterior; un mes sin reporte enviado, o sin la vacuna, no está
// regla: la forma de aRegla (reglas.service.js), con parametros en snake_case.

import { claveCombinacion } from './celdas.service.js';

const GRUPO_EDAD = 'grupo_edad';
const CAMPO_TOTAL = 'total_dosis_declarado';
const LARGO_MENSAJE = 500; // resultado_validacion.mensaje

const seccionDe = (dimensiones) => dimensiones[GRUPO_EDAD] ?? '';
const llaveValida = (dosis, clave) => `${dosis}|${clave}`;
const aCelda = (municipioId, dosis, claveCombinacion) => ({ municipioId, dosis, claveCombinacion });
const celdaDe = (c) => aCelda(c.municipioProcedenciaId, c.dosisCodigo, c.claveCombinacion);
const suma = (celdas) => celdas.reduce((total, c) => total + c.cantidad, 0);
const sinValor = (valor) => valor === undefined || valor === null || valor === '';

// Una dosis inactiva se oculta en la captura, salvo que el reporte ya tenga filas de ella (SPEC 22).
function dosisVisibles(v) {
  const conFilas = new Set(v.celdas.map((c) => c.dosisCodigo));
  return new Set(v.dosis.filter((d) => d.activa || conFilas.has(d.codigo)).map((d) => d.codigo));
}

const hallazgo = (v, { detalleId = null, dosisCodigo = null, celdas = [], campos = [], valores = {}, prefijo = null }) => ({
  reporteVacunaId: v?.reporteVacunaId ?? null,
  detalleId,
  dosisCodigo,
  celdas,
  campos,
  valores,
  prefijo,
});

// Ámbito DETALLE: un hallazgo por celda guardada que cumple la condición.
const porCelda = (condicion, valoresDe = () => ({})) => (regla, v, reporte) =>
  v.celdas
    .filter((c) => condicion(c, regla, v, reporte))
    .map((c) =>
      hallazgo(v, { detalleId: c.id, dosisCodigo: c.dosisCodigo, celdas: [celdaDe(c)], valores: valoresDe(c, v, reporte) }),
    );

// La tarjeta A son todas las celdas válidas del municipio propio; en la B, solo las filas (procedencia + dosis +
// sección) con alguna celda guardada, nunca combinaciones de municipios sin fila (nota del 2026-10-26).
function camposCompletos(regla, v, reporte) {
  const visibles = dosisVisibles(v);
  const validas = [...v.validas.values()].filter((c) => visibles.has(c.dosisCodigo));
  const guardadas = new Set(v.celdas.map((c) => `${c.municipioProcedenciaId}|${c.dosisCodigo}|${c.claveCombinacion}`));
  const falta = (municipioId, c) => !guardadas.has(`${municipioId}|${c.dosisCodigo}|${c.claveCombinacion}`);

  const celdas = [];
  if (regla.parametros.cero_explicito) {
    for (const c of validas) {
      if (falta(reporte.municipioPropioId, c)) celdas.push(aCelda(reporte.municipioPropioId, c.dosisCodigo, c.claveCombinacion));
    }
    const filas = new Map();
    for (const c of v.celdas) {
      if (c.municipioProcedenciaId === reporte.municipioPropioId) continue;
      if (!v.validas.has(llaveValida(c.dosisCodigo, c.claveCombinacion))) continue;
      const fila = { municipioId: c.municipioProcedenciaId, dosis: c.dosisCodigo, seccion: seccionDe(c.dimensiones) };
      filas.set(`${fila.municipioId}|${fila.dosis}|${fila.seccion}`, fila);
    }
    for (const fila of filas.values()) {
      for (const c of validas) {
        if (c.dosisCodigo !== fila.dosis || seccionDe(c.dimensiones) !== fila.seccion) continue;
        if (falta(fila.municipioId, c)) celdas.push(aCelda(fila.municipioId, c.dosisCodigo, c.claveCombinacion));
      }
    }
  }
  const datos = v.datosAdicionales ?? {};
  const campos = v.camposAdicionales.filter((c) => c.requerido && sinValor(datos[c.clave])).map((c) => c.clave);
  const faltantes = celdas.length + campos.length;
  return faltantes === 0 ? [] : [hallazgo(v, { celdas, campos, valores: { n_faltantes: faltantes } })];
}

function totalCuadra(regla, v) {
  if (!v.camposAdicionales.some((c) => c.clave === CAMPO_TOTAL)) return [];
  const total = v.datosAdicionales?.[CAMPO_TOTAL];
  if (typeof total !== 'number') return [];
  const detalle = suma(v.celdas);
  if (Math.abs(total - detalle) <= regla.parametros.tolerancia) return [];
  return [hallazgo(v, { campos: [CAMPO_TOTAL], valores: { total, suma: detalle } })];
}

// Pares de dosis D{n} activas consecutivas, por sección, sumando procedencias y las demás dimensiones.
function secuenciaDosis(regla, v) {
  const serie = v.dosis.filter((d) => d.activa && /^D\d+$/.test(d.codigo));
  const conSeccion = v.secciones.length > 1;
  const resultados = [];
  for (const seccion of v.secciones) {
    const clave = seccion.grupoEdad ?? '';
    const enSeccion = (codigo) =>
      [...v.validas.values()].some((c) => c.dosisCodigo === codigo && seccionDe(c.dimensiones) === clave);
    const deDosis = (codigo) => v.celdas.filter((c) => c.dosisCodigo === codigo && seccionDe(c.dimensiones) === clave);
    for (let i = 1; i < serie.length; i++) {
      const [anterior, posterior] = [serie[i - 1], serie[i]];
      if (!enSeccion(anterior.codigo) || !enSeccion(posterior.codigo)) continue;
      const celdasPosterior = deDosis(posterior.codigo);
      const limite = suma(deDosis(anterior.codigo)) * (1 + regla.parametros.exceso_permitido_pct / 100);
      if (suma(celdasPosterior) <= limite) continue;
      resultados.push(
        hallazgo(v, {
          celdas: celdasPosterior.map(celdaDe),
          valores: { dosis_anterior: anterior.etiqueta, dosis_posterior: posterior.etiqueta },
          // Sin la sección, los mensajes de dos secciones serían iguales y compartirían la llave del resultado.
          prefijo: conSeccion ? seccion.titulo : null,
        }),
      );
    }
  }
  return resultados;
}

// Los meses calendario anteriores que tienen datos, sin buscar más atrás. Con un promedio de 0 no hay con qué comparar.
function variacionHistorica(regla, v) {
  const { meses_referencia: meses, variacion_max_pct: maximo, minimo_dosis: minimo } = regla.parametros;
  const historial = v.historial.filter((m) => m.atras <= meses).map((m) => m.total);
  if (historial.length === 0) return [];
  const total = suma(v.celdas);
  const promedio = historial.reduce((a, b) => a + b, 0) / historial.length;
  if (total < minimo && promedio < minimo) return [];
  if (promedio === 0) return [];
  const variacion = Math.round((Math.abs(total - promedio) / promedio) * 100);
  return variacion > maximo ? [hallazgo(v, { valores: { variacion } })] : [];
}

// Un solo resultado por reporte: otro reporte del mismo establecimiento y mes, o celdas repetidas.
function sinDuplicados(regla, reporte) {
  const repetidas = [];
  for (const v of reporte.vacunas) {
    const vistas = new Set();
    for (const c of v.celdas) {
      const llave = `${c.municipioProcedenciaId}|${c.dosisCodigo}|${c.claveCombinacion}`;
      if (vistas.has(llave)) repetidas.push(celdaDe(c));
      vistas.add(llave);
    }
  }
  if (reporte.otrosReportes === 0 && repetidas.length === 0) return [];
  return [hallazgo(null, { celdas: repetidas })];
}

const POR_VACUNA = {
  CAMPOS_COMPLETOS: camposCompletos,
  TOTAL_CUADRA: totalCuadra,
  SECUENCIA_DOSIS: secuenciaDosis,
  VARIACION_HISTORICA: variacionHistorica,
  NO_NEGATIVO: porCelda((c) => c.cantidad < 0),
  DIMENSIONES_VALIDAS: porCelda(
    (c, _regla, v) =>
      !v.validas.has(llaveValida(c.dosisCodigo, c.claveCombinacion)) ||
      claveCombinacion(c.dimensiones) !== c.claveCombinacion,
  ),
  PROCEDENCIA_VALIDA: porCelda(
    (c, _regla, v, reporte) => c.municipioProcedenciaId !== reporte.municipioPropioId && !v.permitidas.includes(c.municipioProcedenciaId),
    (c, _v, reporte) => ({ municipio: reporte.municipios.get(c.municipioProcedenciaId) }),
  ),
  RANGO: porCelda(
    (c, regla) => c.cantidad < regla.parametros.minimo || c.cantidad > regla.parametros.maximo,
    (c) => ({ valor: c.cantidad }),
  ),
};
const POR_REPORTE = { SIN_DUPLICADOS: sinDuplicados };

// Un marcador sin valor queda como «—»; los números van sin separador de miles.
export function armarMensaje(plantilla, valores, prefijo = null) {
  const texto = plantilla.replace(/\{(\w+)\}/g, (_, marcador) => {
    const valor = valores[marcador];
    return sinValor(valor) ? '—' : String(valor);
  });
  return (prefijo ? `${prefijo}: ${texto}` : texto).slice(0, LARGO_MENSAJE);
}

const aplicaA = (regla, codigo) => regla.vacunas.includes('*') || regla.vacunas.includes(codigo);

// Errores primero; dentro, en el orden de las vacunas y por código de regla; los de ámbito REPORTE al final.
export function ejecutarReglas(reglas, reporte) {
  const resultados = [];
  const agregar = (regla, v, hallazgos) => {
    for (const h of hallazgos) {
      const dosis = v?.dosis.find((d) => d.codigo === h.dosisCodigo);
      const valores = {
        ...regla.parametros,
        establecimiento: reporte.establecimiento,
        periodo: reporte.periodo,
        vacuna: v?.vacuna.nombre,
        dosis: dosis?.etiqueta,
        version: v?.version,
        ...h.valores,
      };
      resultados.push({
        regla: { codigo: regla.codigo, version: regla.version, nombre: regla.nombre, tipo: regla.tipo },
        severidad: regla.severidad,
        mensaje: armarMensaje(regla.mensaje, valores, h.prefijo),
        reporteVacunaId: h.reporteVacunaId,
        detalleId: h.detalleId,
        vacuna: v ? { ...v.vacuna } : null,
        dosis: h.detalleId !== null && dosis ? { codigo: dosis.codigo, etiqueta: dosis.etiqueta } : null,
        celdas: h.celdas,
        campos: h.campos,
        orden: v ? reporte.vacunas.indexOf(v) : reporte.vacunas.length,
      });
    }
  };

  for (const regla of reglas) {
    if (POR_REPORTE[regla.tipo]) {
      if (reporte.vacunas.some((v) => aplicaA(regla, v.vacuna.codigo))) agregar(regla, null, POR_REPORTE[regla.tipo](regla, reporte));
    } else if (POR_VACUNA[regla.tipo]) {
      for (const v of reporte.vacunas) {
        if (aplicaA(regla, v.vacuna.codigo)) agregar(regla, v, POR_VACUNA[regla.tipo](regla, v, reporte));
      }
    } else {
      console.error(`Regla ${regla.codigo} v${regla.version}: el motor no conoce el tipo ${regla.tipo}; se salta.`);
    }
  }

  const peso = { ERROR: 0, ADVERTENCIA: 1 };
  return resultados
    .sort(
      (a, b) =>
        peso[a.severidad] - peso[b.severidad] || a.orden - b.orden || a.regla.codigo.localeCompare(b.regla.codigo),
    )
    .map(({ orden, ...resultado }) => resultado);
}
