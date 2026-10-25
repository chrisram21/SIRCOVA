// Las reglas de coherencia del esquema de captura del SPEC 19 (reglas 2 a 6), para avisar en el editor antes de
// guardar. Repite revisarCoherencia de backend/src/modulos/configuracion/esquemas.service.js con los mismos mensajes:
// un cambio va en los dos. El backend responde con el primer problema; aquí se listan todos. El que decide es el
// backend.

export const GRUPO_EDAD = 'grupo_edad'
const LARGO_COMBINACION = 255

export const MENSAJES_COHERENCIA = {
  sinDosis: 'Indique al menos una dosis.',
  dosisInactiva: (dosis, vacuna) => `La dosis ${dosis} no es una dosis activa de ${vacuna}.`,
  dimensionInactiva: (dimension) => `La dimensión ${dimension} no existe o está inactiva.`,
  valorInactivo: (valor, dimension) => `El valor ${valor} de ${dimension} no existe o está inactivo.`,
  dosisSinEdad: (dosis) => `La dosis ${dosis} debe desagregarse por grupo de edad, como la vacuna.`,
  dosisConEdad: (dosis) => `La dosis ${dosis} no se desagrega por grupo de edad, porque la vacuna no lo hace.`,
  sinSecciones: 'Indique al menos una sección.',
  dosisAjena: (seccion, dosis) => `La sección ${seccion} usa la dosis ${dosis}, que no está en el esquema.`,
  dosisSinSeccion: (dosis) => `La dosis ${dosis} no aparece en ninguna sección.`,
  seccionSinGrupo: (seccion) => `La sección ${seccion} necesita un grupo de edad.`,
  grupoRepetido: (grupo) => `Dos secciones usan el grupo de edad ${grupo}.`,
  grupoNoPermitido: (dosis, grupo, seccion) =>
    `La dosis ${dosis} no admite el grupo de edad ${grupo} de la sección ${seccion}.`,
  unaSeccion: 'Sin desagregación por grupo de edad, el esquema lleva una sola sección.',
  seccionConGrupo: (seccion) =>
    `La sección ${seccion} no lleva grupo de edad, porque la vacuna no se desagrega por edad.`,
  combinacionLarga: (dosis) => `La combinación de la dosis ${dosis} supera los ${LARGO_COMBINACION} caracteres.`,
  // En el backend estas dos son de forma (400); en el editor pueden pasar al desmarcar todo.
  sinValores: (dimension) => `Indique al menos un valor de ${dimension}.`,
  seccionSinDosis: (seccion) => `Indique al menos una dosis en la sección ${seccion}.`,
}

export const valoresDeEdad = (desagregacion) => desagregacion.find((d) => d.dimension === GRUPO_EDAD)?.valores ?? null

// contenido: { dosis: [{ codigo, desagregacion }], desagregacion: [{ dimension, valores }],
// secciones: [{ titulo, grupoEdad, dosis }] }, como el cuerpo del POST.
// referencias: { vacuna: { codigo }, dosis: las de GET /vacunas/{id}, dimensiones: las de GET /dimensiones }.
export function problemasDeCoherencia(contenido, { vacuna, dosis: dosisVacuna, dimensiones }) {
  const M = MENSAJES_COHERENCIA
  const problemas = []
  const anotar = (mensaje) => {
    if (!problemas.includes(mensaje)) problemas.push(mensaje)
  }

  if (contenido.dosis.length === 0) anotar(M.sinDosis)
  const dosisActivas = new Set(dosisVacuna.filter((d) => d.activa).map((d) => d.codigo))
  for (const { codigo } of contenido.dosis) {
    if (!dosisActivas.has(codigo)) anotar(M.dosisInactiva(codigo, vacuna.codigo))
  }

  const dimensionesActivas = new Map(dimensiones.filter((d) => d.activa).map((d) => [d.codigo, d]))
  const revisarDesagregacion = (lista) => {
    for (const { dimension, valores } of lista) {
      const encontrada = dimensionesActivas.get(dimension)
      if (!encontrada) {
        anotar(M.dimensionInactiva(dimension))
        continue
      }
      if (valores.length === 0) anotar(M.sinValores(dimension))
      const activos = new Set(encontrada.valores.filter((v) => v.activo).map((v) => v.codigo))
      for (const valor of valores) if (!activos.has(valor)) anotar(M.valorInactivo(valor, dimension))
    }
  }
  revisarDesagregacion(contenido.desagregacion)

  // Toda celda tiene grupo de edad o ninguna lo tiene: lo decide la desagregación general.
  const porEdad = valoresDeEdad(contenido.desagregacion) !== null
  for (const { codigo, desagregacion } of contenido.dosis) {
    if (desagregacion === null) continue
    revisarDesagregacion(desagregacion)
    const conEdad = valoresDeEdad(desagregacion) !== null
    if (porEdad && !conEdad) anotar(M.dosisSinEdad(codigo))
    if (!porEdad && conEdad) anotar(M.dosisConEdad(codigo))
  }

  const { secciones } = contenido
  if (secciones.length === 0) anotar(M.sinSecciones)
  const codigosEsquema = new Set(contenido.dosis.map((d) => d.codigo))
  for (const seccion of secciones) {
    if (seccion.dosis.length === 0) anotar(M.seccionSinDosis(seccion.titulo))
    for (const dosis of seccion.dosis) if (!codigosEsquema.has(dosis)) anotar(M.dosisAjena(seccion.titulo, dosis))
  }
  for (const { codigo } of contenido.dosis) {
    if (!secciones.some((s) => s.dosis.includes(codigo))) anotar(M.dosisSinSeccion(codigo))
  }
  const efectiva = (codigo) => contenido.dosis.find((d) => d.codigo === codigo)?.desagregacion ?? contenido.desagregacion
  if (porEdad) {
    const grupos = new Set()
    for (const seccion of secciones) {
      if (seccion.grupoEdad === null) {
        anotar(M.seccionSinGrupo(seccion.titulo))
        continue
      }
      if (grupos.has(seccion.grupoEdad)) anotar(M.grupoRepetido(seccion.grupoEdad))
      grupos.add(seccion.grupoEdad)
      for (const dosis of seccion.dosis) {
        if (!codigosEsquema.has(dosis)) continue
        // Una dosis sin grupo de edad propio ya tiene su problema (dosisSinEdad).
        const permitidos = valoresDeEdad(efectiva(dosis))
        if (permitidos && !permitidos.includes(seccion.grupoEdad)) {
          anotar(M.grupoNoPermitido(dosis, seccion.grupoEdad, seccion.titulo))
        }
      }
    }
  } else if (secciones.length > 0) {
    if (secciones.length > 1) anotar(M.unaSeccion)
    for (const seccion of secciones) if (seccion.grupoEdad !== null) anotar(M.seccionConGrupo(seccion.titulo))
  }

  // La clave de una celda en MySQL es dimension=VALOR|…, ordenada por código de dimensión; se mide la más larga.
  const masLargo = (valores) => valores.reduce((a, b) => (b.length > a.length ? b : a), '')
  for (const { codigo } of contenido.dosis) {
    const clave = [...efectiva(codigo)]
      .sort((a, b) => a.dimension.localeCompare(b.dimension))
      .map(({ dimension, valores }) => `${dimension}=${masLargo(valores)}`)
      .join('|')
    if (clave.length > LARGO_COMBINACION) anotar(M.combinacionLarga(codigo))
  }

  return problemas
}
