// Los tipos de configuracion_indicadores: qué campos se configuran en cada uno, sus valores por defecto, el semáforo y
// el código generado (SPEC 43). Hay una copia con las mismas reglas y mensajes en
// backend/src/modulos/configuracion/tiposIndicador.js, y tiposIndicador.test.js repite sus casos: un cambio va en los
// cuatro archivos.

export const ASCENDENTE = 'ASCENDENTE'
export const DESCENDENTE = 'DESCENDENTE'
export const PRORRATEOS = ['NINGUNO', 'MENSUAL_LINEAL']
export const LARGO_CODIGO = 40

// dosis: UNA (dosis), DOS (dosisInicial y dosisFinal) o COPIA (se copia de la versión base y no se edita).
// prorrateo y meta: editable con su valor por defecto, o fijo; null si el tipo no tiene.
export const TIPOS_INDICADOR = {
  COBERTURA: {
    etiqueta: 'Cobertura',
    creable: true,
    prefijo: 'COB',
    dosis: 'UNA',
    poblacion: true,
    grupoEdad: true,
    prorrateo: { editable: true, porDefecto: 'MENSUAL_LINEAL' },
    meta: { editable: true, porDefecto: 95, comparador: '>' },
    semaforo: ASCENDENTE,
    cortesPorDefecto: [80, 90],
    mapa: true,
    homogeneidadMunicipal: true,
    parametros: null,
  },
  AVANCE_META_MES: {
    etiqueta: 'Avance contra la meta del mes',
    creable: true,
    prefijo: 'AVANCE',
    dosis: 'UNA',
    poblacion: true,
    grupoEdad: true,
    // Método de la DDRISS: meta del mes = población ÷ 12 × número de mes, y esa cantidad vale 100 %.
    prorrateo: { editable: false, fijo: 'MENSUAL_LINEAL' },
    meta: { editable: false, fijo: 100, comparador: '>=' },
    semaforo: ASCENDENTE,
    cortesPorDefecto: [80, 90],
    mapa: true,
    homogeneidadMunicipal: true,
    parametros: { mostrar_diferencia: true, redondeo: 'ARRIBA', minimo_cero: true },
  },
  BRECHA: {
    etiqueta: 'Brecha de dosis',
    creable: true,
    prefijo: 'BRECHA',
    dosis: 'UNA',
    poblacion: true,
    grupoEdad: true,
    prorrateo: { editable: true, porDefecto: 'NINGUNO' },
    meta: { editable: true, porDefecto: 95, comparador: '>' },
    semaforo: null,
    cortesPorDefecto: null,
    mapa: false,
    homogeneidadMunicipal: false,
    parametros: { redondeo: 'ARRIBA', minimo_cero: true },
  },
  DESERCION: {
    etiqueta: 'Deserción entre dosis',
    creable: true,
    prefijo: 'DES',
    dosis: 'DOS',
    poblacion: false,
    grupoEdad: true,
    prorrateo: null,
    meta: { editable: true, porDefecto: 10, comparador: '<=' },
    semaforo: DESCENDENTE,
    cortesPorDefecto: [10, 15],
    mapa: false,
    homogeneidadMunicipal: false,
    parametros: null,
  },
  PROYECCION: {
    etiqueta: 'Proyección al cierre del año',
    creable: false,
    prefijo: null,
    dosis: 'COPIA',
    poblacion: false,
    grupoEdad: false,
    prorrateo: null,
    meta: { editable: true, porDefecto: 95, comparador: '>' },
    semaforo: null,
    cortesPorDefecto: null,
    mapa: false,
    homogeneidadMunicipal: false,
    parametros: null,
  },
}

export const TIPOS_CREABLES = Object.keys(TIPOS_INDICADOR).filter((tipo) => TIPOS_INDICADOR[tipo].creable)

// Los campos del cuerpo que dependen del tipo, en el orden en que se revisan.
export const CAMPOS_DEL_TIPO = [
  'dosis', 'dosisInicial', 'dosisFinal', 'clasificacionPoblacion', 'grupoEdad', 'prorrateo', 'meta', 'cortes',
  'umbralesProvisionales', 'esIndicadorMapa',
]

const ETIQUETAS_CAMPO = {
  dosis: 'dosis',
  dosisInicial: 'dosis inicial',
  dosisFinal: 'dosis final',
  clasificacionPoblacion: 'grupo de población',
  grupoEdad: 'grupo de edad',
  prorrateo: 'prorrateo',
  meta: 'meta editable',
  cortes: 'semáforo',
  umbralesProvisionales: 'semáforo',
  esIndicadorMapa: 'marca de indicador del mapa',
}

export const MENSAJES_TIPOS_INDICADOR = {
  tipo: 'El tipo de indicador no existe.',
  campoDelTipo: (tipo, campo) => `Los indicadores de tipo ${tipo} no llevan ${ETIQUETAS_CAMPO[campo]}.`,
  faltante: (campo) => `Falta el campo ${campo}.`,
  codigo: (campo) => `${campo} debe ser un código en mayúsculas, dígitos y guion bajo.`,
  booleano: (campo) => `${campo} debe ser verdadero o falso.`,
  prorrateo: 'El prorrateo debe ser NINGUNO o MENSUAL_LINEAL.',
  meta: 'La meta debe ser un número de 1 a 100, con un decimal como máximo.',
  cortes:
    'Los cortes del semáforo deben ser dos números de 0 a 100, con un decimal como máximo, y el primero menor que el '
    + 'segundo.',
  ordenDosis: 'La dosis inicial debe ir antes que la final.',
  codigoLargo: 'El código generado pasa de 40 caracteres; use una vacuna con un código más corto.',
}

const M = MENSAJES_TIPOS_INDICADOR
const FORMATO_CODIGO = /^[A-Z0-9_]{1,40}$/

const esCodigo = (valor) => typeof valor === 'string' && FORMATO_CODIGO.test(valor)
const conUnDecimal = (valor) => Math.abs(valor * 10 - Math.round(valor * 10)) < 1e-9
const numeroEntre = (valor, minimo, maximo) =>
  typeof valor === 'number' && Number.isFinite(valor) && valor >= minimo && valor <= maximo && conUnDecimal(valor)

// Los campos que el tipo deja editar.
export function camposDelTipo(tipo) {
  const d = TIPOS_INDICADOR[tipo]
  if (!d) return []
  return [
    ...(d.dosis === 'UNA' ? ['dosis'] : []),
    ...(d.dosis === 'DOS' ? ['dosisInicial', 'dosisFinal'] : []),
    ...(d.poblacion ? ['clasificacionPoblacion'] : []),
    ...(d.grupoEdad ? ['grupoEdad'] : []),
    ...(d.prorrateo?.editable ? ['prorrateo'] : []),
    ...(d.meta?.editable ? ['meta'] : []),
    ...(d.semaforo ? ['cortes', 'umbralesProvisionales'] : []),
    ...(d.mapa ? ['esIndicadorMapa'] : []),
  ]
}

// Revisa los campos de CAMPOS_DEL_TIPO de un cuerpo. Devuelve { valor } con los que el tipo edita (los opcionales
// con su valor por defecto), o { error } con el primer problema: primero un campo que el tipo no lleva, después cada
// campo en su orden. Que las dosis y el grupo de edad existan lo revisa el servicio.
export function revisarCamposDelTipo(tipo, cuerpo) {
  if (!TIPOS_INDICADOR[tipo]) return { error: M.tipo }
  const propios = new Set(camposDelTipo(tipo))
  const ajeno = CAMPOS_DEL_TIPO.find((campo) => {
    if (cuerpo[campo] === undefined || propios.has(campo)) return false
    // false no marca nada: se acepta en cualquier tipo.
    return !(campo === 'esIndicadorMapa' && cuerpo[campo] === false)
  })
  if (ajeno !== undefined) return { error: M.campoDelTipo(tipo, ajeno) }

  const valor = {}
  for (const campo of CAMPOS_DEL_TIPO.filter((c) => propios.has(c))) {
    const dato = cuerpo[campo]
    if (campo === 'grupoEdad') {
      if (dato !== undefined && dato !== null && !esCodigo(dato)) return { error: M.codigo(campo) }
      valor.grupoEdad = dato ?? null
    } else if (campo === 'umbralesProvisionales' || campo === 'esIndicadorMapa') {
      if (dato !== undefined && typeof dato !== 'boolean') return { error: M.booleano(campo) }
      valor[campo] = dato ?? false
    } else if (dato === undefined || dato === null) {
      return { error: M.faltante(campo) }
    } else if (campo === 'prorrateo') {
      if (!PRORRATEOS.includes(dato)) return { error: M.prorrateo }
      valor.prorrateo = dato
    } else if (campo === 'meta') {
      if (!numeroEntre(dato, 1, 100)) return { error: M.meta }
      valor.meta = dato
    } else if (campo === 'cortes') {
      const valido = Array.isArray(dato) && dato.length === 2 && dato.every((c) => numeroEntre(c, 0, 100))
        && dato[0] < dato[1]
      if (!valido) return { error: M.cortes }
      valor.cortes = [...dato]
    } else {
      if (!esCodigo(dato)) return { error: M.codigo(campo) }
      valor[campo] = dato
    }
  }
  if (valor.dosisInicial !== undefined && valor.dosisInicial === valor.dosisFinal) return { error: M.ordenDosis }
  return { valor }
}

// En DESERCION, con el orden de cada dosis en MySQL.
export function revisarOrdenDosis(ordenInicial, ordenFinal) {
  return ordenInicial < ordenFinal ? { valor: true } : { error: M.ordenDosis }
}

// Ascendente (más es mejor): rojo [0, c1), amarillo [c1, c2), verde [c2, …). Descendente: verde (…, c1],
// amarillo (c1, c2], rojo (c2, …). El orden de las franjas es el de la semilla.
export function aUmbrales([c1, c2], sentido) {
  if (sentido === DESCENDENTE) {
    return [
      { color: 'verde', desde: null, hasta: c1 },
      { color: 'amarillo', desde: c1, hasta: c2 },
      { color: 'rojo', desde: c2, hasta: null },
    ]
  }
  return [
    { color: 'verde', desde: c2, hasta: null },
    { color: 'amarillo', desde: c1, hasta: c2 },
    { color: 'rojo', desde: 0, hasta: c1 },
  ]
}

// [c1, c2] si las franjas son exactamente las tres que arma aUmbrales; null si no (otra cantidad u otra forma).
export function aCortes(umbrales, sentido) {
  if (!Array.isArray(umbrales) || umbrales.length !== 3) return null
  const amarillo = umbrales.find((u) => u?.color === 'amarillo')
  if (!amarillo || typeof amarillo.desde !== 'number' || typeof amarillo.hasta !== 'number') return null
  const cortes = [amarillo.desde, amarillo.hasta]
  if (!(cortes[0] < cortes[1])) return null
  const forma = (u) => ({ color: u?.color, desde: u?.desde ?? null, hasta: u?.hasta ?? null })
  const iguales = JSON.stringify(umbrales.map(forma)) === JSON.stringify(aUmbrales(cortes, sentido))
  return iguales ? cortes : null
}

// D3 → 3, UNICA → U; los demás (R1) quedan igual.
function sufijoDosis(codigo) {
  if (codigo === 'UNICA') return 'U'
  return /^D\d+$/.test(codigo) ? codigo.slice(1) : codigo
}

// {PREFIJO}_{VACUNA}{DOSIS}, o {PREFIJO}_{VACUNA}{INICIAL}_{FINAL} en DESERCION; si ya existe, el primer _2, _3…
// libre. existentes: los códigos de la colección en cualquier territorio y estado. Una COBERTURA con prorrateo
// NINGUNO (la cobertura anual, SPEC 60) lleva el prefijo COB_ANUAL.
export function codigoIndicador(tipo, vacuna, dosis, existentes, prorrateo) {
  const d = TIPOS_INDICADOR[tipo]
  if (!d?.prefijo) return { error: M.tipo }
  const usados = new Set(existentes)
  const parteDosis = d.dosis === 'DOS'
    ? `${sufijoDosis(dosis.inicial)}_${sufijoDosis(dosis.final)}`
    : sufijoDosis(dosis)
  const prefijo = tipo === 'COBERTURA' && prorrateo === 'NINGUNO' ? 'COB_ANUAL' : d.prefijo
  const base = `${prefijo}_${vacuna}${parteDosis}`
  let codigo = base
  for (let n = 2; usados.has(codigo); n += 1) codigo = `${base}_${n}`
  if (codigo.length > LARGO_CODIGO) return { error: M.codigoLargo }
  return { valor: codigo }
}
