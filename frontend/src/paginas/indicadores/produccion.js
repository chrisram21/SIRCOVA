import { MESES } from '@/lib/fechas.js'

// SPEC 61: la pestaña «Producción». Las demás pestañas leen vacuna=todas como sin vacuna (no es un código).
export const TODAS_LAS_VACUNAS = 'todas'

const id = (texto) => (/^[1-9]\d*$/.test(texto) ? Number(texto) : undefined)

// agrupar, periodo, vacuna y establecimientos de la URL, contra las opciones. Sin vacuna o con una que no está: todas.
export function filtrosDeProduccion(parametros, opciones) {
  const vacuna = parametros.get('vacuna')
  const existentes = new Set((opciones?.establecimientos ?? []).map((e) => e.id))
  const establecimientos = (parametros.get('establecimientos') ?? '').split(',').map(id)
  return {
    agrupar: parametros.get('agrupar') === 'establecimiento' ? 'establecimiento' : 'municipio',
    acumulado: parametros.get('periodo') !== 'mes',
    vacuna: (opciones?.vacunas ?? []).some((v) => v.codigo === vacuna) ? vacuna : null,
    establecimientos: [...new Set(establecimientos.filter((e) => existentes.has(e)))],
  }
}

// El mes de la URL (o el anterior al actual, que filtrosDeUrl pone por defecto) si la DDRISS lo tiene; si no, el más
// reciente de las opciones. null si la DDRISS no tiene meses.
export function mesDeProduccion(meses, { anio, mes }) {
  return meses.find((m) => m.anio === anio && m.mes === mes) ?? meses[0] ?? null
}

// Las opciones de establecimientos dentro de los municipios visibles (ids); null = sin recorte.
export function establecimientosVisibles(establecimientos, municipios) {
  return municipios === null ? establecimientos : establecimientos.filter((e) => municipios.includes(e.municipioId))
}

export const nombreDeFilaProduccion = (fila) => (fila.establecimiento ?? fila.municipio).nombre

// Las barras de la gráfica, de mayor a menor total (a igual total, por nombre).
export function barrasDeProduccion(filas) {
  return filas
    .map((fila) => ({
      clave: `${fila.establecimiento ? 'e' : 'm'}${(fila.establecimiento ?? fila.municipio).id}`,
      nombre: nombreDeFilaProduccion(fila),
      propia: fila.dosisPoblacionPropia,
      otros: fila.dosisOtrosMunicipios,
      total: fila.dosisTotal,
      fueraDelConsolidado: fila.fueraDelConsolidado,
    }))
    .sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre, 'es'))
}

function enumerar(textos) {
  return textos.length === 1 ? textos[0] : `${textos.slice(0, -1).join(', ')} y ${textos.at(-1)}`
}

// «Datos preliminares: agosto y septiembre de 2026 todavía no están cerrados.» Los meses del rango son de un año.
export function textoPreliminar(mesesSinCerrar) {
  if (mesesSinCerrar.length === 0) return null
  const meses = `${enumerar(mesesSinCerrar.map((m) => MESES[m.mes - 1]))} de ${mesesSinCerrar[0].anio}`
  const verbo = mesesSinCerrar.length === 1 ? 'todavía no está cerrado' : 'todavía no están cerrados'
  return `Datos preliminares: ${meses} ${verbo}.`
}
