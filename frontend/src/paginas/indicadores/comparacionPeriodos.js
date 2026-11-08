// SPEC 51: lo que la tarjeta «Comparar periodos» arma con GET /indicadores/meses-calculados y una serie por año.
// Funciones puras: las cuentas se prueban aquí y las gráficas solo las dibujan.
//
// La cobertura real es dosis acumuladas ÷ población anual (la de la serie, sin prorrateo), para que los años se
// comparen con la misma cuenta. La producción de un mes es su acumulado menos el del mes anterior del mismo año.

import { MESES, porFecha } from '@/lib/fechas.js'

export const MAXIMO_PERIODOS = 5
export const MINIMO_PERIODOS = 2
export const MODOS = { anio: 'Por año', mes: 'Por mes' }

export const MOTIVOS = {
  SIN_CALCULO: 'SIN_CALCULO',
  SIN_POBLACION: 'SIN_POBLACION',
  SIN_MES_ANTERIOR: 'SIN_MES_ANTERIOR',
}

// 'ago 2025'
export const etiquetaDelMes = ({ anio, mes }) => `${MESES[mes - 1].slice(0, 3)} ${anio}`
export const claveDelMes = ({ anio, mes }) => `${anio}-${String(mes).padStart(2, '0')}`

export function textoDelMotivo(motivo, { codigo, anio }) {
  if (motivo === MOTIVOS.SIN_CALCULO) return `Sin cálculo de ${codigo} en ${anio}`
  if (motivo === MOTIVOS.SIN_POBLACION) return `Sin población de ${anio}`
  if (motivo === MOTIVOS.SIN_MES_ANTERIOR) return 'Sin dato del mes anterior'
  return null
}

const tieneMes = (calculados, { anio, mes }) => calculados.some((a) => a.anio === anio && a.meses.includes(mes))
const tieneAnio = (calculados, anio) => calculados.some((a) => a.anio === anio)

// Por año: el del corte y el anterior, si tienen corridas. Por mes: el de corte y el mismo del año anterior; si ese no
// tiene corrida, el mes anterior al corte.
export function periodosPorDefecto(calculados, { anio, mes }) {
  const anios = [anio - 1, anio].filter((a) => tieneAnio(calculados, a))
  const corte = { anio, mes }
  const mismoDelAnterior = { anio: anio - 1, mes }
  const anteriorAlCorte = mes === 1 ? { anio: anio - 1, mes: 12 } : { anio, mes: mes - 1 }
  const otro = [mismoDelAnterior, anteriorAlCorte].find((p) => tieneMes(calculados, p))
  const meses = [otro, corte].filter((p) => p && tieneMes(calculados, p)).sort(porFecha)
  return { anios, meses }
}

function leerAnios(texto) {
  if (!texto) return []
  return texto.split(',').filter((t) => /^\d{4}$/.test(t)).map(Number)
}

function leerMeses(texto) {
  if (!texto) return []
  return texto.split(',')
    .map((t) => /^(\d{4})-(\d{2})$/.exec(t))
    .filter(Boolean)
    .map(([, anio, mes]) => ({ anio: Number(anio), mes: Number(mes) }))
    .filter(({ mes }) => mes >= 1 && mes <= 12)
}

const sinRepetir = (lista, clave) => [...new Map(lista.map((x) => [clave(x), x])).values()]

// Los periodos de la URL: sin los que no tienen corrida, sin repetidos y recortados a los cinco primeros, en orden
// cronológico. Si la URL no deja ninguno, los de por defecto.
export function leerPeriodos({ comparar, anios, meses }, calculados, corte) {
  const modo = comparar === 'mes' ? 'mes' : 'anio'
  const porDefecto = periodosPorDefecto(calculados, corte)
  const deUrlAnios = sinRepetir(leerAnios(anios).filter((a) => tieneAnio(calculados, a)), String)
    .slice(0, MAXIMO_PERIODOS)
    .sort((a, b) => a - b)
  const deUrlMeses = sinRepetir(leerMeses(meses).filter((p) => tieneMes(calculados, p)), claveDelMes)
    .slice(0, MAXIMO_PERIODOS)
    .sort(porFecha)
  return {
    modo,
    anios: deUrlAnios.length > 0 ? deUrlAnios : porDefecto.anios,
    meses: deUrlMeses.length > 0 ? deUrlMeses : porDefecto.meses,
  }
}

export const textoDeAnios = (anios) => anios.join(',')
export const textoDeMeses = (meses) => meses.map(claveDelMes).join(',')

// Los años de las series que hacen falta para los periodos del modo.
export function aniosNecesarios({ modo, anios, meses }) {
  return modo === 'anio' ? anios : [...new Set(meses.map((p) => p.anio))].sort((a, b) => a - b)
}

const porcentaje = (dosis, poblacion) => (dosis / poblacion) * 100

export function coberturaReal(punto) {
  const dosis = punto?.resultado?.numerador
  const poblacion = punto?.poblacionAnual
  return dosis == null || !poblacion ? null : porcentaje(dosis, poblacion)
}

// Una línea por año: { anio, motivo, valores: [{ mes, dosis, porcentaje, parcial }] }. series es un Map año → puntos
// (de la serie del indicador comparado; un año sin puntos no tiene ese indicador). El año del corte llega hasta el
// mes de corte, aunque tenga corridas de meses posteriores; los demás años van completos.
export function puntosPorAnio(series, anios, corte = null) {
  return anios.map((anio) => {
    const puntos = (series.get(anio) ?? []).filter((p) => anio !== corte?.anio || p.mes <= corte.mes)
    if (puntos.length === 0) return { anio, motivo: MOTIVOS.SIN_CALCULO, valores: [] }
    const valores = puntos
      .map((p) => ({ mes: p.mes, dosis: p.resultado.numerador, porcentaje: coberturaReal(p), parcial: p.parcial }))
      .filter((v) => v.porcentaje !== null)
    if (valores.length === 0) return { anio, motivo: MOTIVOS.SIN_POBLACION, valores: [] }
    return { anio, motivo: null, valores }
  })
}

const aUnDecimal = (numero) => Math.round(numero * 10) / 10

// Diferencia de valor contra base, en puntos porcentuales y en dosis; positiva es mejora. Los pp salen de los
// porcentajes ya redondeados a un decimal, como se muestran, para que la resta cuadre a la vista.
export function diferencias(base, valor) {
  if (base?.porcentaje == null || valor?.porcentaje == null) return null
  const pp = aUnDecimal(aUnDecimal(valor.porcentaje) - aUnDecimal(base.porcentaje))
  const dosis = valor.dosis != null && base.dosis != null ? valor.dosis - base.dosis : null
  return { pp, dosis, sentido: pp > 0 ? 'sube' : pp < 0 ? 'baja' : 'igual' }
}

// Las filas de la tabla por año: una por mes con datos en algún año, con el valor de cada uno y la diferencia del
// último año con datos en ese mes contra el primero.
export function filasPorAnio(lineas) {
  const conDatos = lineas.filter((l) => l.motivo === null)
  const meses = [...new Set(conDatos.flatMap((l) => l.valores.map((v) => v.mes)))].sort((a, b) => a - b)
  return meses.map((mes) => {
    const porAnio = Object.fromEntries(conDatos.map((l) => [l.anio, l.valores.find((v) => v.mes === mes) ?? null]))
    const presentes = conDatos.map((l) => porAnio[l.anio]).filter(Boolean)
    const diferencia = presentes.length >= 2 ? diferencias(presentes[0], presentes.at(-1)) : null
    return { mes, porAnio, diferencia }
  })
}

// Lo vacunado en el mes: el acumulado del mes menos el del anterior del mismo año (en enero, el acumulado).
export function produccionDelMes(series, { anio, mes }) {
  const puntos = series.get(anio) ?? []
  const punto = puntos.find((p) => p.mes === mes)
  const periodo = { anio, mes }
  if (!punto) return { ...periodo, motivo: MOTIVOS.SIN_CALCULO, dosis: null, porcentaje: null }
  if (!punto.poblacionAnual) return { ...periodo, motivo: MOTIVOS.SIN_POBLACION, dosis: null, porcentaje: null }
  const anterior = mes === 1 ? null : puntos.find((p) => p.mes === mes - 1)
  if (mes > 1 && !anterior) return { ...periodo, motivo: MOTIVOS.SIN_MES_ANTERIOR, dosis: null, porcentaje: null }
  const dosis = punto.resultado.numerador - (anterior?.resultado.numerador ?? 0)
  return { ...periodo, motivo: null, dosis, porcentaje: porcentaje(dosis, punto.poblacionAnual), parcial: punto.parcial }
}

// Las filas de la tabla por mes, con la diferencia de cada una contra el primer mes con datos.
export function filasPorMes(series, meses) {
  const filas = meses.map((p) => produccionDelMes(series, p))
  const base = filas.find((f) => f.motivo === null) ?? null
  return filas.map((f) => ({ ...f, diferencia: f === base || f.motivo !== null ? null : diferencias(base, f) }))
}

export const conDatos = (periodos) => periodos.filter((p) => p.motivo === null).length
