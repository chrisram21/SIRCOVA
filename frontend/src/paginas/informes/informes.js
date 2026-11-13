import { MESES, nombreDelMes } from '@/lib/fechas.js'

// SPEC 62 (HU-45): los filtros, la URL y los textos de «Informes». La pantalla no nombra los Excel.

export const INFORMES = [
  {
    valor: 'poblacion-propia',
    nombre: 'Producción a la población propia',
    ayuda: 'Dosis que cada municipio o establecimiento aplicó a personas de su propio municipio.',
  },
  {
    valor: 'total',
    nombre: 'Producción total (incluye Migrantes)',
    ayuda: 'Todas las dosis que aplicó, sin importar de dónde sea la persona. Incluye Migrantes.',
  },
  {
    valor: 'residencia',
    nombre: 'Dosis por municipio de residencia',
    ayuda: 'Dosis atribuidas al municipio donde vive la persona, solo municipios del departamento. '
      + 'Es la base de la cobertura.',
  },
]

export const NIVELES = [
  { valor: 'departamento', nombre: 'Departamento' },
  { valor: 'municipio', nombre: 'Municipio' },
  { valor: 'distrito', nombre: 'Distrito' },
  { valor: 'establecimiento', nombre: 'Establecimiento' },
]

const INFORME_POR_DEFECTO = 'poblacion-propia'
const NIVEL_POR_DEFECTO = 'municipio'

// El informe por residencia no tiene nivel establecimiento: pasa a municipio.
export const nivelPermitido = (informe, nivel) =>
  (informe === 'residencia' && nivel === 'establecimiento' ? NIVEL_POR_DEFECTO : nivel)

export const aTextoDeMes = ({ anio, mes }) => `${anio}-${String(mes).padStart(2, '0')}`

const leerMes = (texto) => {
  const partes = /^(\d{4})-(\d{2})$/.exec(texto ?? '')
  return partes ? { anio: Number(partes[1]), mes: Number(partes[2]) } : null
}
const numero = ({ anio, mes }) => anio * 100 + mes
const id = (texto) => (/^[1-9]\d*$/.test(texto ?? '') ? Number(texto) : null)

// meses: los de las opciones, del más reciente al más antiguo. «Hasta» es el último cerrado (o el último), y
// «Desde», el primero habilitado de ese año (enero si está).
export function rangoPorDefecto(meses) {
  const hasta = meses.find((m) => m.estado === 'CERRADO') ?? meses[0]
  if (!hasta) return { desde: null, hasta: null }
  const delAnio = meses.filter((m) => m.anio === hasta.anio)
  const desde = delAnio.at(-1)
  return { desde: { anio: desde.anio, mes: desde.mes }, hasta: { anio: hasta.anio, mes: hasta.mes } }
}

// Los filtros de la URL contra las opciones, con los valores por defecto. generado: la URL pide un informe.
export function filtrosDeInforme(parametros, opciones) {
  const meses = opciones?.meses ?? []
  const habilitado = (m) => m !== null && meses.some((x) => x.anio === m.anio && x.mes === m.mes)
  const porDefecto = rangoPorDefecto(meses)
  const hasta = habilitado(leerMes(parametros.get('hasta'))) ? leerMes(parametros.get('hasta')) : porDefecto.hasta
  let desde = habilitado(leerMes(parametros.get('desde'))) ? leerMes(parametros.get('desde')) : porDefecto.desde
  if (desde && hasta && numero(desde) > numero(hasta)) desde = hasta

  const informe = INFORMES.some((i) => i.valor === parametros.get('informe'))
    ? parametros.get('informe')
    : INFORME_POR_DEFECTO
  const nivel = NIVELES.some((n) => n.valor === parametros.get('nivel')) ? parametros.get('nivel') : NIVEL_POR_DEFECTO
  const vacuna = parametros.get('vacuna')
  const existentes = new Set((opciones?.municipios ?? []).map((m) => m.id))
  const municipios = (parametros.get('municipios') ?? '').split(',').map(id).filter((m) => existentes.has(m))

  return {
    informe,
    desde,
    hasta,
    nivel: nivelPermitido(informe, nivel),
    vacuna: (opciones?.vacunas ?? []).some((v) => v.codigo === vacuna) ? vacuna : null,
    red: id(parametros.get('red')),
    municipios: [...new Set(municipios)],
    aprobados: parametros.get('aprobados') === 'si',
    generado: ['informe', 'desde', 'hasta'].every((nombre) => parametros.has(nombre)),
  }
}

// Lo que «Generar» escribe en la URL: informe, desde y hasta siempre; lo demás solo si no es el valor por defecto.
export function parametrosDeInforme({ informe, desde, hasta, nivel, vacuna, red, municipios, aprobados, ddriss }) {
  const parametros = new URLSearchParams()
  parametros.set('informe', informe)
  parametros.set('desde', aTextoDeMes(desde))
  parametros.set('hasta', aTextoDeMes(hasta))
  if (nivel !== NIVEL_POR_DEFECTO) parametros.set('nivel', nivel)
  if (vacuna) parametros.set('vacuna', vacuna)
  if (red) parametros.set('red', String(red))
  if (municipios?.length) parametros.set('municipios', municipios.join(','))
  if (aprobados) parametros.set('aprobados', 'si')
  if (ddriss) parametros.set('ddriss', String(ddriss))
  return parametros
}

// SPEC 63: la agrupación de la URL, si es una de las dimensiones de las opciones; si no, la sección del 5C (null).
export function agrupacionDeUrl(parametros, opciones) {
  const codigo = parametros.get('agrupacion')
  return (opciones?.dimensiones ?? []).some((d) => d.codigo === codigo) ? codigo : null
}

// Los parámetros de la URL con la agrupación puesta o, con null («Sección del 5C»), sin ella; lo demás no cambia.
export function conAgrupacion(parametros, codigo) {
  const nuevos = new URLSearchParams(parametros)
  if (codigo) nuevos.set('agrupacion', codigo)
  else nuevos.delete('agrupacion')
  return nuevos
}

// Las tres filas del encabezado: vacuna y sección abarcan sus columnas seguidas; una columna sin sección deja la
// celda de sección vacía (titulo ''). Al agrupar (SPEC 63), la segunda fila es el valor de la dimensión.
export function encabezadosDeTabla(columnas) {
  const vacunas = []
  const secciones = []
  let ultimaIdentidad = null
  columnas.forEach((columna, i) => {
    const ultimaVacuna = vacunas.at(-1)
    if (ultimaVacuna?.codigo === columna.vacuna.codigo) ultimaVacuna.abarca += 1
    else vacunas.push({ clave: `v${i}`, codigo: columna.vacuna.codigo, nombre: columna.vacuna.nombre, abarca: 1 })

    const titulo = columna.valor?.etiqueta ?? columna.seccion?.titulo ?? ''
    const grupo = columna.seccion?.grupoEdad ?? null
    const identidad = `${columna.vacuna.codigo}|${columna.valor ? `valor:${columna.valor.codigo}` : grupo}|${titulo}`
    if (identidad === ultimaIdentidad) secciones.at(-1).abarca += 1
    else secciones.push({ clave: `s${i}`, titulo, grupoEdad: grupo, abarca: 1 })
    ultimaIdentidad = identidad
  })
  const dosis = columnas.map((columna, i) => ({ clave: `d${i}`, codigo: columna.dosis.codigo }))
  return { vacunas, secciones, dosis }
}

const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1)

// «De enero de 2026 a agosto de 2026»; un solo mes: «Agosto de 2026».
export function textoRango(desde, hasta) {
  if (numero(desde) === numero(hasta)) return conMayuscula(nombreDelMes(hasta))
  return `De ${nombreDelMes(desde)} a ${nombreDelMes(hasta)}`
}

function enumerar(textos) {
  return textos.length === 1 ? textos[0] : `${textos.slice(0, -1).join(', ')} y ${textos.at(-1)}`
}

// «enero y febrero de 2026»; de años distintos, cada mes con su año: «diciembre de 2025 y enero de 2026».
export function textoMesesSinCerrar(meses) {
  if (meses.length === 0) return ''
  if (meses.every((m) => m.anio === meses[0].anio)) {
    return `${enumerar(meses.map((m) => MESES[m.mes - 1]))} de ${meses[0].anio}`
  }
  return enumerar(meses.map(nombreDelMes))
}

// SPEC 63: el aviso de un informe agrupado, o null sin agrupación. Sin columnas, ninguna vacuna registra la
// dimensión; con «Todas las vacunas», cuáles se muestran.
export function avisoDeAgrupacion({ agrupacion, columnas }, todasLasVacunas) {
  if (!agrupacion) return null
  if (columnas.length === 0) return `Ninguna vacuna de este informe registra ${agrupacion.nombre}.`
  if (!todasLasVacunas) return null
  const nombres = [...new Set(columnas.map((c) => c.vacuna.nombre))]
  return `Solo se muestran las vacunas que registran ${agrupacion.nombre}: ${enumerar(nombres)}.`
}

// El aviso encima de la tabla, o null si todos los meses del rango están cerrados.
export function avisoDeMeses(mesesSinCerrar, preliminar) {
  if (mesesSinCerrar.length === 0) return null
  const meses = textoMesesSinCerrar(mesesSinCerrar)
  const uno = mesesSinCerrar.length === 1
  if (preliminar) {
    return `Datos preliminares: ${meses} todavía no ${uno ? 'está cerrado' : 'están cerrados'}.`
  }
  return `${conMayuscula(meses)} todavía no ${uno ? 'está cerrado y no suma' : 'están cerrados y no suman'} `
    + 'en el informe. Marca «Incluir aprobados sin cerrar» para verlos como preliminares.'
}
