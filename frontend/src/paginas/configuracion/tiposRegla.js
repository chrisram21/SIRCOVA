// Los tipos de reglas_validacion: su ámbito, sus parámetros y los marcadores que acepta su mensaje (SPEC 32). Hay
// una copia con las mismas reglas y mensajes en backend/src/modulos/configuracion/tiposRegla.js, y
// tiposRegla.test.js repite sus casos: un cambio va en los cuatro archivos.

const entero = (clave, etiqueta, minimo, maximo, opciones = {}) => ({
  clave, etiqueta, tipo: 'entero', minimo, maximo, ...opciones,
})
const booleano = (clave, etiqueta) => ({ clave, etiqueta, tipo: 'booleano' })

export const TIPOS_REGLA = {
  RANGO: {
    etiqueta: 'Rango de valores',
    creable: true,
    ambito: 'DETALLE',
    // mayorQue: el mínimo de maximo es el minimo elegido + 1.
    parametros: [
      entero('minimo', 'Mínimo', 0, 100_000),
      entero('maximo', 'Máximo', 1, 100_000, { mayorQue: 'minimo' }),
    ],
    marcadores: ['vacuna', 'dosis', 'valor', 'minimo', 'maximo'],
    mensajeEjemplo: '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).',
  },
  SECUENCIA_DOSIS: {
    etiqueta: 'Secuencia de dosis',
    creable: true,
    ambito: 'VACUNA',
    parametros: [entero('exceso_permitido_pct', 'Exceso permitido (%)', 0, 1000)],
    marcadores: ['vacuna', 'dosis_anterior', 'dosis_posterior', 'exceso_permitido_pct'],
    mensajeEjemplo: '{dosis_posterior} de {vacuna} supera a {dosis_anterior} en más de {exceso_permitido_pct} %.',
  },
  VARIACION_HISTORICA: {
    etiqueta: 'Variación frente al historial',
    creable: true,
    ambito: 'VACUNA',
    parametros: [
      entero('meses_referencia', 'Meses de referencia', 1, 12),
      entero('variacion_max_pct', 'Variación máxima (%)', 1, 1000),
      entero('minimo_dosis', 'Mínimo de dosis para comparar', 0, 100_000),
    ],
    marcadores: ['vacuna', 'variacion', 'meses_referencia', 'variacion_max_pct'],
    mensajeEjemplo:
      'La producción de {vacuna} varía {variacion} % respecto al promedio de los últimos {meses_referencia} meses.',
  },
  TOTAL_CUADRA: {
    etiqueta: 'Total que cuadra',
    creable: true,
    ambito: 'VACUNA',
    parametros: [entero('tolerancia', 'Tolerancia (dosis)', 0, 1000)],
    marcadores: ['vacuna', 'total', 'suma'],
    mensajeEjemplo: 'El total declarado de {vacuna} ({total}) no coincide con la suma del detalle ({suma}).',
  },
  CAMPOS_COMPLETOS: {
    etiqueta: 'Campos completos',
    creable: false,
    ambito: 'VACUNA',
    parametros: [booleano('cero_explicito', 'Exigir 0 en las celdas sin dosis')],
    marcadores: ['vacuna', 'n_faltantes'],
  },
  NO_NEGATIVO: {
    etiqueta: 'Cantidades no negativas',
    creable: false,
    ambito: 'DETALLE',
    parametros: [],
    marcadores: ['vacuna', 'dosis'],
  },
  DIMENSIONES_VALIDAS: {
    etiqueta: 'Dimensiones del esquema',
    creable: false,
    ambito: 'DETALLE',
    parametros: [],
    marcadores: ['vacuna', 'dosis', 'version'],
  },
  PROCEDENCIA_VALIDA: {
    etiqueta: 'Procedencia válida',
    creable: false,
    ambito: 'DETALLE',
    parametros: [],
    marcadores: ['vacuna', 'dosis', 'municipio'],
  },
  SIN_DUPLICADOS: {
    etiqueta: 'Sin reportes duplicados',
    creable: false,
    ambito: 'REPORTE',
    parametros: [],
    marcadores: ['establecimiento', 'periodo'],
  },
}

export const TIPOS_CREABLES = Object.keys(TIPOS_REGLA).filter((tipo) => TIPOS_REGLA[tipo].creable)

export const MENSAJES_TIPOS = {
  tipo: 'El tipo de regla no existe.',
  parametros: 'Los parámetros deben ser un objeto.',
  parametroNoPermitido: (tipo, clave) => `Parámetro no permitido en una regla de tipo ${tipo}: ${clave}.`,
  parametroFaltante: (clave) => `Falta el parámetro ${clave}.`,
  parametroEntero: (clave, minimo, maximo) => `El parámetro ${clave} debe ser un entero entre ${minimo} y ${maximo}.`,
  parametroBooleano: (clave) => `El parámetro ${clave} debe ser verdadero o falso.`,
  marcador: (marcador, tipo) =>
    `El mensaje usa el marcador {${marcador}}, que no existe en las reglas de tipo ${tipo}.`,
}

const esObjeto = (valor) => valor !== null && typeof valor === 'object' && !Array.isArray(valor)

// Devuelve { valor } con los parámetros en el orden del catálogo, o { error } con el primer problema: primero los
// que sobran, después cada parámetro en su orden.
export function revisarParametros(tipo, parametros) {
  const definicion = TIPOS_REGLA[tipo]
  if (!definicion) return { error: MENSAJES_TIPOS.tipo }
  if (!esObjeto(parametros)) return { error: MENSAJES_TIPOS.parametros }
  const claves = new Set(definicion.parametros.map((p) => p.clave))
  const sobrante = Object.keys(parametros).find((clave) => !claves.has(clave))
  if (sobrante !== undefined) return { error: MENSAJES_TIPOS.parametroNoPermitido(tipo, sobrante) }

  const valor = {}
  for (const parametro of definicion.parametros) {
    const dato = parametros[parametro.clave]
    if (dato === undefined || dato === null) return { error: MENSAJES_TIPOS.parametroFaltante(parametro.clave) }
    if (parametro.tipo === 'booleano') {
      if (typeof dato !== 'boolean') return { error: MENSAJES_TIPOS.parametroBooleano(parametro.clave) }
    } else {
      const minimo = parametro.mayorQue ? valor[parametro.mayorQue] + 1 : parametro.minimo
      if (!Number.isInteger(dato) || dato < minimo || dato > parametro.maximo) {
        return { error: MENSAJES_TIPOS.parametroEntero(parametro.clave, minimo, parametro.maximo) }
      }
    }
    valor[parametro.clave] = dato
  }
  return { valor }
}

// Los nombres de los {x} del mensaje que el tipo no acepta, sin repetir y en el orden en que aparecen.
export function marcadoresDesconocidos(tipo, mensaje) {
  const permitidos = new Set(TIPOS_REGLA[tipo]?.marcadores ?? [])
  const usados = [...String(mensaje).matchAll(/\{([^{}]*)\}/g)].map((m) => m[1])
  return [...new Set(usados)].filter((marcador) => !permitidos.has(marcador))
}

export function revisarMarcadores(tipo, mensaje) {
  if (!TIPOS_REGLA[tipo]) return { error: MENSAJES_TIPOS.tipo }
  const [desconocido] = marcadoresDesconocidos(tipo, mensaje)
  if (desconocido !== undefined) return { error: MENSAJES_TIPOS.marcador(desconocido, tipo) }
  return { valor: mensaje }
}
