// SPEC 50: lo que el mapa territorial arma con los resultados de la corrida vigente, el avance del mes por municipio
// y los límites. Funciones puras: las cuentas se prueban aquí y el mapa, el panel y la clasificación solo las dibujan.
import { DESCENDENTE, TIPOS_INDICADOR } from '@/paginas/configuracion/tiposIndicador.js'
import { indicadoresDeLaVacuna, vacunaDe } from '@/paginas/indicadores/panelIndicadores.js'
import { dosisFinales } from '@/paginas/indicadores/TablaDesercion.jsx'
import { COLOR_SEMAFORO, formatoEntero, porcentaje } from '@/paginas/indicadores/TarjetaGrafica.jsx'

export const MODOS = {
  cobertura: { etiqueta: 'Cobertura', pregunta: '¿Dónde está el rezago de cobertura?' },
  brecha: { etiqueta: 'Brecha', pregunta: '¿Dónde faltan más dosis para la meta?' },
  desercion: { etiqueta: 'Deserción', pregunta: '¿Dónde se pierde más población entre dosis?' },
  estado: { etiqueta: 'Estado del reporte', pregunta: '¿Dónde faltan reportes del mes?' },
}
export const MODO_POR_DEFECTO = 'cobertura'

export const COLOR_SIN_DATOS = 'var(--muted)'

// Del menos al más avanzado: el primero con reportes es el «más atrasado» del municipio.
export const ORDEN_DE_ATRASO = ['SIN_ENVIAR', 'CORRECCION_SOLICITADA', 'ENVIADO', 'EN_REVISION', 'APROBADO', 'CERRADO']

// SIN_ENVIAR no usa --estado-borrador: es casi blanco y en el mapa se leería como «Sin datos».
export const COLOR_ESTADO = {
  SIN_ENVIAR: 'var(--mapa-sin-enviar)',
  CORRECCION_SOLICITADA: 'var(--estado-correccion)',
  ENVIADO: 'var(--estado-enviado)',
  EN_REVISION: 'var(--estado-revision)',
  APROBADO: 'var(--estado-aprobado)',
  CERRADO: 'var(--estado-cerrado)',
}

export const TITULO_ESTADO = {
  SIN_ENVIAR: 'Sin enviar',
  CORRECCION_SOLICITADA: 'Corrección solicitada',
  ENVIADO: 'Enviado',
  EN_REVISION: 'En revisión',
  APROBADO: 'Aprobado',
  CERRADO: 'Cerrado',
}

const colorDeBrecha = (token) => `var(--mapa-brecha-${token})`

// Un archivo por departamento, por los dos primeros dígitos del código INE del municipio.
export const ARCHIVO_DE_LIMITES = { 12: 'geo/san-marcos.geojson' }

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es')
const TIPOS_DE_COBERTURA = ['COBERTURA', 'AVANCE_META_MES']

export function archivoDeLimites(codigosIne) {
  for (const codigo of codigosIne) {
    const archivo = ARCHIVO_DE_LIMITES[String(codigo).slice(0, 2)]
    if (archivo) return archivo
  }
  return null
}

// La de la URL si la corrida la tiene; si no, la del primer indicador del mapa; si no, la del primer avance; si no,
// la del primero.
export function vacunaDelMapa(indicadores, resultados, vacuna) {
  if (vacuna && resultados.some((r) => r.vacuna.codigo === vacuna)) return vacuna
  const indicador = indicadores.find((i) => i.esIndicadorMapa && TIPOS_DE_COBERTURA.includes(i.tipoCalculo))
    ?? indicadores.find((i) => i.tipoCalculo === 'AVANCE_META_MES')
    ?? indicadores[0]
  return indicador ? vacunaDe(resultados, indicador.codigo)?.codigo ?? null : null
}

// El indicador que pinta cada modo, entre los de la vacuna; null en «Estado del reporte» o si no hay uno.
export function indicadorDelModo(indicadores, resultados, vacuna, modo) {
  const deLaVacuna = indicadoresDeLaVacuna(indicadores, resultados, vacuna)
  const primero = (tipo) => deLaVacuna.find((i) => i.tipoCalculo === tipo) ?? null
  const cobertura = deLaVacuna.find((i) => i.esIndicadorMapa && TIPOS_DE_COBERTURA.includes(i.tipoCalculo))
    ?? primero('AVANCE_META_MES')
    ?? primero('COBERTURA')
  if (modo === 'cobertura') return cobertura
  if (modo === 'brecha') return primero('BRECHA') ?? cobertura
  if (modo === 'desercion') return primero('DESERCION')
  return null
}

export function estadoMasAtrasado(conteos) {
  if (!conteos) return null
  return ORDEN_DE_ATRASO.find((estado) => conteos[estado] > 0) ?? null
}

const enteroCercano = (ordenados, p) => ordenados[Math.max(0, Math.ceil(p * ordenados.length) - 1)]

// Clase 1: brecha 0 («Meta alcanzada»). Las demás, los cuartiles de las brechas mayores que 0 (por rango más cercano),
// con las variables más intensas para las mayores. Con menos de cuatro valores distintos, una clase por valor; las
// clases que quedan vacías porque sus cortes se repiten no se muestran.
export function clasesDeBrecha(valores) {
  const conValor = valores.filter((v) => v !== null && v !== undefined)
  const clases = conValor.some((v) => v === 0) ? [{ token: 1, desde: 0, hasta: 0 }] : []
  const positivos = conValor.filter((v) => v > 0).sort((a, b) => a - b)
  if (positivos.length === 0) return clases

  const distintos = [...new Set(positivos)]
  let rangos
  if (distintos.length < 4) {
    rangos = distintos.map((v) => [v, v])
  } else {
    const cortes = [0.25, 0.5, 0.75].map((p) => Math.round(enteroCercano(positivos, p)))
    const limites = [...cortes, positivos.at(-1)]
    rangos = limites
      .map((hasta, i) => [i === 0 ? positivos[0] : limites[i - 1] + 1, hasta])
      .filter(([desde, hasta]) => desde <= hasta)
  }
  const tokens = [2, 3, 4, 5].slice(-rangos.length)
  return [...clases, ...rangos.map(([desde, hasta], i) => ({ token: tokens[i], desde, hasta }))]
}

export function claseDeBrecha(clases, valor) {
  if (valor === null || valor === undefined) return null
  return clases.find((c) => valor >= c.desde && valor <= c.hasta) ?? null
}

// Por qué un municipio va con el color «Sin datos», o null si tiene datos para el modo.
function motivoSinDatos(modo, { resultado, avance, tipoCalculo }) {
  if (modo === 'estado') return avance && avance.esperados > 0 ? null : 'Sin reportes esperados'
  if (!resultado) return 'Sin datos'
  if (modo === 'brecha') return resultado.brechaDosis === null ? 'Sin población' : null
  if (resultado.calculable) return null
  return tipoCalculo === 'DESERCION' ? 'Sin primeras dosis' : 'Sin población'
}

function colorDe(modo, { resultado, estado }, clases) {
  if (modo === 'estado') return COLOR_ESTADO[estado] ?? COLOR_SIN_DATOS
  if (modo === 'brecha') {
    const clase = claseDeBrecha(clases, resultado.brechaDosis)
    return clase ? colorDeBrecha(clase.token) : COLOR_SIN_DATOS
  }
  return COLOR_SEMAFORO[resultado.color] ?? COLOR_SIN_DATOS
}

// Una fila por municipio, unida por codigoIne: los de los resultados, los del avance y los polígonos de los límites
// (features), aunque falten en los otros. `enMapa` dice si tiene polígono; sin límites cargados, ninguno lo tiene.
export function filasDelMapa({ resultados = [], indicador = null, avance = null, features = [], modo }) {
  const porCodigo = new Map()
  const fila = (codigoIne, nombre, id = null) => {
    if (!porCodigo.has(codigoIne)) {
      porCodigo.set(codigoIne, { codigoIne, municipioId: id, nombre, resultado: null, avance: null, enMapa: false })
    }
    const existente = porCodigo.get(codigoIne)
    if (existente.municipioId === null && id !== null) existente.municipioId = id
    return existente
  }

  for (const feature of features) {
    fila(feature.properties.codigo_ine, feature.properties.nombre).enMapa = true
  }
  for (const r of resultados) {
    if (r.municipio === null) continue
    const f = fila(r.municipio.codigoIne, r.municipio.nombre, r.municipio.id)
    f.nombre = r.municipio.nombre
    if (indicador && r.indicadorCodigo === indicador.codigo) f.resultado = r
  }
  for (const a of avance?.municipios ?? []) {
    const f = fila(a.municipio.codigoIne, a.municipio.nombre, a.municipio.id)
    f.avance = a
  }

  const tipoCalculo = indicador?.tipoCalculo ?? null
  const filas = [...porCodigo.values()].map((f) => ({ ...f, estado: estadoMasAtrasado(f.avance?.conteos) }))
  const clases = modo === 'brecha' ? clasesDeBrecha(filas.map((f) => f.resultado?.brechaDosis)) : []
  return {
    clases,
    filas: filas
      .map((f) => {
        const sinDatos = motivoSinDatos(modo, { ...f, tipoCalculo })
        return { ...f, sinDatos, color: sinDatos ? COLOR_SIN_DATOS : colorDe(modo, f, clases) }
      })
      .sort(porNombre),
  }
}

// La fila departamental del indicador del modo y el avance de toda la DDRISS, con las mismas reglas de las filas de
// los municipios. La brecha de la DDRISS no lleva color: las clases son de los municipios.
export function filaDeLaDdriss({ resultados = [], indicador = null, avance = null, modo }) {
  const resultado = indicador
    ? resultados.find((r) => r.municipio === null && r.indicadorCodigo === indicador.codigo) ?? null
    : null
  const deLaDdriss = avance?.periodo ? { esperados: avance.esperados, conteos: avance.conteos } : null
  const fila = {
    codigoIne: null, municipioId: null, nombre: 'Total de la DDRISS', resultado, avance: deLaDdriss, enMapa: false,
    estado: estadoMasAtrasado(deLaDdriss?.conteos),
  }
  const sinDatos = motivoSinDatos(modo, { ...fila, tipoCalculo: indicador?.tipoCalculo ?? null })
  const color = sinDatos ? COLOR_SIN_DATOS : modo === 'brecha' ? null : colorDe(modo, fila, [])
  return { ...fila, sinDatos, color }
}

const formato = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 })
const entero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })

// Un rótulo por franja, leídos directamente de los umbrales (dos o tres, decidido en el paso 3 del SPEC 50), del
// mejor color al peor. Ascendente: desde ≤ valor < hasta; descendente: desde < valor ≤ hasta.
function rotulosDeUmbrales(umbrales, tipoCalculo) {
  const descendente = TIPOS_INDICADOR[tipoCalculo]?.semaforo === DESCENDENTE
  const abierto = (limite) => limite === null || limite === undefined
  const sinPiso = (desde) => abierto(desde) || desde <= 0
  const texto = ({ desde, hasta }) => {
    if (descendente) {
      if (sinPiso(desde)) return abierto(hasta) ? 'Todos los valores' : `${formato.format(hasta)} % o menos`
      if (abierto(hasta)) return `Más de ${formato.format(desde)} %`
      return `Más de ${formato.format(desde)} a ${formato.format(hasta)} %`
    }
    if (abierto(hasta)) return sinPiso(desde) ? 'Todos los valores' : `${formato.format(desde)} % o más`
    if (sinPiso(desde)) return `Menos de ${formato.format(hasta)} %`
    return `${formato.format(desde)} a ${formato.format(hasta - 0.1)} %`
  }
  const piso = (u) => (abierto(u.desde) ? -Infinity : u.desde)
  return [...umbrales]
    .sort((a, b) => (descendente ? piso(a) - piso(b) : piso(b) - piso(a)))
    .map((u) => ({ color: COLOR_SEMAFORO[u.color] ?? COLOR_SIN_DATOS, texto: texto(u) }))
}

const textoDeClase = ({ token, desde, hasta }) => {
  if (token === 1) return 'Meta alcanzada'
  return desde === hasta ? `${entero.format(desde)} dosis` : `${entero.format(desde)} a ${entero.format(hasta)}`
}

// El título, las franjas y si los rangos son provisionales. «Sin datos» va siempre al final.
export function rotulosDeLeyenda(modo, { indicador = null, clases = [], mesNombre = '' } = {}) {
  const sinDatos = { color: COLOR_SIN_DATOS, texto: 'Sin datos' }
  if (modo === 'estado') {
    return {
      titulo: `Estado de los reportes de ${mesNombre}`,
      franjas: [...ORDEN_DE_ATRASO.map((e) => ({ color: COLOR_ESTADO[e], texto: TITULO_ESTADO[e] })), sinDatos],
      provisional: false,
    }
  }
  if (modo === 'brecha') {
    return {
      titulo: 'Dosis por aplicar para la meta',
      franjas: [...clases.map((c) => ({ color: colorDeBrecha(c.token), texto: textoDeClase(c) })), sinDatos],
      provisional: false,
    }
  }
  const titulo = modo === 'desercion'
    ? 'Deserción'
    : indicador?.tipoCalculo === 'AVANCE_META_MES' ? 'Avance contra la meta del mes' : 'Cobertura'
  return {
    titulo,
    franjas: [...rotulosDeUmbrales(indicador?.umbrales ?? [], indicador?.tipoCalculo), sinDatos],
    provisional: Boolean(indicador?.umbralesProvisionales),
  }
}

const dosis = (n) => (n === null || n === undefined ? '—' : formatoEntero.format(n))

// Lo que dice el tooltip de un municipio: [etiqueta, valor] por línea, o el motivo si no tiene datos.
export function lineasDelTooltip(modo, fila, indicador = null) {
  if (fila.sinDatos) return [[fila.sinDatos, '']]
  if (modo === 'estado') {
    const { esperados, conteos } = fila.avance
    return [
      ['Reportes esperados', formatoEntero.format(esperados)],
      ...ORDEN_DE_ATRASO.filter((e) => conteos[e] > 0).map((e) => [TITULO_ESTADO[e], formatoEntero.format(conteos[e])]),
    ]
  }
  const r = fila.resultado
  if (modo === 'desercion') {
    return [
      ['Deserción', porcentaje(r.valor)],
      ['Dosis iniciales', dosis(r.denominador)],
      ['Dosis finales', dosis(dosisFinales(r))],
    ]
  }
  const contraMeta = [
    ['Dosis aplicadas', dosis(r.numerador)],
    ['Meta en dosis', dosis(r.metaDosis)],
  ]
  if (modo === 'brecha') return [['Dosis por aplicar', dosis(r.brechaDosis)], ...contraMeta]
  return [
    [indicador?.tipoCalculo === 'AVANCE_META_MES' ? 'Avance' : 'Cobertura', r.valor === null ? '—' : porcentaje(r.valor)],
    ...contraMeta,
    ['Meta', r.meta === null ? '—' : porcentaje(r.meta)],
    ['Dosis por aplicar', dosis(r.brechaDosis)],
  ]
}

// La cifra de un municipio en la clasificación y en el panel; sin datos, el motivo.
export function cifraDelModo(modo, fila) {
  if (fila.sinDatos) return fila.sinDatos
  if (modo === 'estado') return TITULO_ESTADO[fila.estado]
  if (modo === 'brecha') return `${dosis(fila.resultado.brechaDosis)} dosis`
  return porcentaje(fila.resultado.valor)
}

// Del más rezagado al menos, según el modo; los empates por nombre y los que no tienen datos al final.
export function ordenDeClasificacion(filas, modo) {
  const clave = {
    cobertura: (f) => f.resultado.valor,
    brecha: (f) => -f.resultado.brechaDosis,
    desercion: (f) => -f.resultado.valor,
    estado: (f) => ORDEN_DE_ATRASO.indexOf(f.estado) * 1e6 - (f.avance.conteos.SIN_ENVIAR ?? 0),
  }[modo]
  const conDatos = filas.filter((f) => !f.sinDatos).sort((a, b) => clave(a) - clave(b) || porNombre(a, b))
  const sinDatos = filas.filter((f) => f.sinDatos).sort(porNombre)
  return [...conDatos, ...sinDatos]
}
