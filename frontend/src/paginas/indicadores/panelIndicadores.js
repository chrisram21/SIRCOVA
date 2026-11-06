// SPEC 49: lo que el panel de gráficas de «Indicadores» arma con los resultados de la corrida vigente y la serie
// mensual. Funciones puras: las cuentas se prueban aquí y las gráficas solo las dibujan.

const TIPOS_DE_COBERTURA = ['COBERTURA', 'AVANCE_META_MES']
const MAXIMO_DE_BARRAS = 8

const porNombre = (a, b) => a.nombre.localeCompare(b.nombre, 'es')
const deMayorAMenor = (a, b) => b.valor - a.valor || a.municipio.nombre.localeCompare(b.municipio.nombre, 'es')

export const filasDe = (resultados, codigo) => resultados.filter((r) => r.indicadorCodigo === codigo)

// La vacuna de un indicador sale de sus filas: corrida.indicadores no la trae.
export const vacunaDe = (resultados, codigo) => resultados.find((r) => r.indicadorCodigo === codigo)?.vacuna ?? null

export function vacunasDeLaCorrida(resultados) {
  const porCodigo = new Map(resultados.map((r) => [r.vacuna.codigo, r.vacuna]))
  return [...porCodigo.values()].sort(porNombre)
}

// La de la URL si la corrida la tiene; si no, la del indicador de la URL; si no, la del primer avance; si no, la del
// primero.
export function vacunaElegida(indicadores, resultados, { vacuna, indicador }) {
  if (vacuna && resultados.some((r) => r.vacuna.codigo === vacuna)) return vacuna
  const codigo = (indicadores.find((i) => i.codigo === indicador)
    ?? indicadores.find((i) => i.tipoCalculo === 'AVANCE_META_MES')
    ?? indicadores[0])?.codigo
  return codigo ? vacunaDe(resultados, codigo)?.codigo ?? null : null
}

export const indicadoresDeLaVacuna = (indicadores, resultados, vacuna) =>
  indicadores.filter((i) => vacunaDe(resultados, i.codigo)?.codigo === vacuna)

// Un indicador por gráfica, entre los de la vacuna. La línea usa el indicador base de la proyección si la corrida lo
// calculó; si no, la primera cobertura.
export function indicadoresDelPanel(indicadores, resultados, vacuna, codigoElegido) {
  const deLaVacuna = indicadoresDeLaVacuna(indicadores, resultados, vacuna)
  const primero = (tipo) => deLaVacuna.find((i) => i.tipoCalculo === tipo) ?? null
  const elegido = deLaVacuna.find((i) => i.codigo === codigoElegido)
  const proyeccion = primero('PROYECCION')
  const codigoBase = proyeccion
    ? filasDe(resultados, proyeccion.codigo).find((r) => r.proyeccion?.indicadorBase)?.proyeccion.indicadorBase
    : undefined
  return {
    cobertura: (TIPOS_DE_COBERTURA.includes(elegido?.tipoCalculo) ? elegido : null)
      ?? primero('AVANCE_META_MES') ?? primero('COBERTURA'),
    brecha: primero('BRECHA'),
    desercion: primero('DESERCION'),
    proyeccion,
    base: indicadores.find((i) => i.codigo === codigoBase) ?? primero('COBERTURA'),
  }
}

export function municipiosDeLaCorrida(resultados) {
  const porId = new Map(resultados.filter((r) => r.municipio !== null).map((r) => [r.municipio.id, r.municipio]))
  return [...porId.values()].sort(porNombre)
}

// Los de la corrida, recortados al distrito (si lo hay) y luego a los elegidos (si los hay).
export function municipiosVisibles(municipios, { delDistrito = null, elegidos = [] } = {}) {
  const enDistrito = delDistrito ? municipios.filter((m) => delDistrito.includes(m.id)) : municipios
  const validos = elegidos.filter((id) => enDistrito.some((m) => m.id === id))
  return validos.length > 0 ? enDistrito.filter((m) => validos.includes(m.id)) : enDistrito
}

// La DDRISS y los municipios visibles, para las tablas.
export function filasVisibles(filas, visibles) {
  const ids = new Set(visibles.map((m) => m.id))
  return filas.filter((r) => r.municipio === null || ids.has(r.municipio.id))
}

// Con un solo municipio visible, su fila; con todos o con varios, la de la DDRISS.
export function filaDeReferencia(filas, visibles) {
  if (visibles.length === 1) return filas.find((r) => r.municipio?.id === visibles[0].id) ?? null
  return filas.find((r) => r.municipio === null) ?? null
}

// Los doce meses de la línea de avance. El prorrateo del indicador base no viene en los resultados, así que con una
// proyección calculable todo va contra su población anual (su denominador): lo real es el numerador de la serie, la
// proyección sigue su ritmo desde el corte (diciembre es su valor) y la meta es la suya, proporcional al mes. Sin
// proyección, lo real es el valor del indicador base y la meta, la suya, plana.
export function puntosDeLinea({ puntos, mesCorte, metaBase, filaProyeccion }) {
  const deLaSerie = new Map(puntos.filter((p) => p.mes <= mesCorte).map((p) => [p.mes, p]))
  const datos = filaProyeccion?.proyeccion
  const poblacion = filaProyeccion?.calculable ? filaProyeccion.denominador : null
  const anual = Boolean(poblacion && datos?.dosisAcumuladas != null && datos?.ritmoMensual != null)
  const desde = filaProyeccion?.mes ?? mesCorte
  const contraPoblacion = (dosis) => (dosis / poblacion) * 100
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1
    const punto = deLaSerie.get(mes)
    let real = null
    if (anual) real = punto?.resultado.numerador != null ? contraPoblacion(punto.resultado.numerador) : null
    else if (punto?.resultado.calculable) real = punto.resultado.valor
    let proyeccion = null
    if (anual && mes >= desde) {
      proyeccion = mes === 12 ? filaProyeccion.valor : contraPoblacion(datos.dosisAcumuladas + datos.ritmoMensual * (mes - desde))
    }
    let meta = null
    if (anual) meta = filaProyeccion.meta == null ? null : (filaProyeccion.meta * mes) / 12
    else meta = metaBase ?? null
    return { mes, real, parcial: punto?.parcial ?? false, proyeccion, meta }
  })
}

// Una barra por indicador del tipo de la cobertura del panel, de todas las vacunas, con su fila de referencia.
export function barrasPorVacuna(indicadores, resultados, tipo, visibles, vacuna) {
  const barras = indicadores
    .filter((i) => i.tipoCalculo === tipo)
    .map((i) => ({ indicador: i, fila: filaDeReferencia(filasDe(resultados, i.codigo), visibles) }))
    .filter(({ fila }) => fila !== null)
    .map(({ indicador, fila }) => ({
      codigo: indicador.codigo,
      nombre: indicador.nombre ?? indicador.codigo,
      valor: fila.valor,
      meta: fila.meta,
      color: fila.color,
      calculable: fila.calculable,
      resaltada: fila.vacuna.codigo === vacuna,
    }))
  const calculables = barras.filter((b) => b.calculable).sort((a, b) => b.valor - a.valor || porNombre(a, b))
  const metas = [...new Set(calculables.map((b) => b.meta))]
  return {
    barras: calculables,
    sinPoblacion: barras.filter((b) => !b.calculable).map((b) => b.nombre),
    metaComun: metas.length === 1 ? metas[0] : null,
  }
}

const municipalesVisibles = (filas, visibles) => filasVisibles(filas, visibles).filter((r) => r.municipio !== null)

export function barrasPorMunicipio(filas, visibles) {
  const municipales = municipalesVisibles(filas, visibles)
  return {
    barras: municipales.filter((r) => r.calculable).sort(deMayorAMenor),
    sinPoblacion: municipales.filter((r) => !r.calculable).map((r) => r.municipio.nombre).sort((a, b) => a.localeCompare(b, 'es')),
  }
}

// Los 8 con más dosis por aplicar; el total es la suma de los visibles (con todos, igual a sumaBrechasMunicipales).
export function barrasDeBrecha(filas, visibles) {
  const municipales = municipalesVisibles(filas, visibles)
  return {
    barras: municipales
      .filter((r) => r.brechaDosis > 0)
      .sort((a, b) => b.brechaDosis - a.brechaDosis || a.municipio.nombre.localeCompare(b.municipio.nombre, 'es'))
      .slice(0, MAXIMO_DE_BARRAS),
    total: municipales.reduce((suma, r) => suma + (r.brechaDosis ?? 0), 0),
  }
}

// Las 8 deserciones más altas; una negativa queda al final y se dibuja a la izquierda del 0.
export const barrasDeDesercion = (filas, visibles) =>
  municipalesVisibles(filas, visibles).filter((r) => r.calculable).sort(deMayorAMenor).slice(0, MAXIMO_DE_BARRAS)
