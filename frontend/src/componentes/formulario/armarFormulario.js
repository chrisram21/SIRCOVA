// Convierte un esquema de captura en las tablas del formulario (SPEC 21). Lo usan la vista previa y la captura
// (HU-20). Lo que no se puede armar (un valor o una dimensión fuera del catálogo, una dosis que no es de la vacuna o
// que no está en ninguna sección, una sección sin dosis) se omite sin error: los problemas se listan aparte.

const GRUPO_EDAD = 'grupo_edad'

// La clave de una celda en detalle_produccion: dimension=VALOR|…, ordenada por código de dimensión; '' sin dimensiones.
export const claveCombinacion = (valores) =>
  Object.keys(valores)
    .sort()
    .map((dimension) => `${dimension}=${valores[dimension]}`)
    .join('|')

// Producto de los valores de cada dimensión, en el orden de la lista: [{ sexo: 'M' }, { sexo: 'F' }, …].
const producto = (dimensiones) =>
  dimensiones.reduce(
    (combinaciones, { codigo, valores }) =>
      combinaciones.flatMap((previa) => valores.map((valor) => ({ ...previa, [codigo]: valor.codigo }))),
    [{}],
  )

// Las versiones anteriores a la v0.4 del modelo no tienen secciones (Hexavalente v1): se arma una por valor de
// grupo_edad, en el orden del catálogo, con las dosis que lo admiten; sin grupo_edad, una sola con todas las dosis.
function seccionesDeducidas(contenido, vacuna, catalogo) {
  const efectiva = (d) => d.desagregacion ?? contenido.desagregacion
  const edadesDe = (d) => efectiva(d).find((x) => x.dimension === GRUPO_EDAD)?.valores ?? []
  if (!contenido.desagregacion.some((x) => x.dimension === GRUPO_EDAD)) {
    return [{ titulo: vacuna.nombre, grupoEdad: null, dosis: contenido.dosis.map((d) => d.codigo) }]
  }
  const usados = new Set(contenido.dosis.flatMap(edadesDe))
  return [...(catalogo.get(GRUPO_EDAD)?.valores ?? [])]
    .filter((v) => usados.has(v.codigo))
    .sort((a, b) => a.orden - b.orden)
    .map((v) => ({
      titulo: v.etiqueta,
      grupoEdad: v.codigo,
      dosis: contenido.dosis.filter((d) => edadesDe(d).includes(v.codigo)).map((d) => d.codigo),
    }))
}

// contenido: la forma de contenidoDe (EditorEsquema.jsx). vacuna: GET /vacunas/{id}, con sus dosis.
// dimensiones: GET /dimensiones. camposAdicionales y reglas: los del esquema cargado. deducirSecciones: solo para una
// versión publicada; en un borrador, no tener secciones es un problema de coherencia.
export function armarFormulario({
  contenido,
  vacuna,
  dimensiones,
  camposAdicionales = [],
  reglas = [],
  deducirSecciones = false,
}) {
  const catalogo = new Map(dimensiones.map((d, posicion) => [d.codigo, { ...d, posicion }]))
  const dosisVacuna = new Map(vacuna.dosis.map((d) => [d.codigo, d]))

  const originales =
    deducirSecciones && contenido.secciones.length === 0
      ? seccionesDeducidas(contenido, vacuna, catalogo)
      : contenido.secciones
  const secciones = originales
    .map((s) => ({ ...s, dosis: s.dosis.filter((codigo) => dosisVacuna.has(codigo)) }))
    .filter((s) => s.dosis.length > 0)
  const dosis = contenido.dosis
    .filter(({ codigo }) => dosisVacuna.has(codigo) && secciones.some((s) => s.dosis.includes(codigo)))
    .sort((a, b) => dosisVacuna.get(a.codigo).orden - dosisVacuna.get(b.codigo).orden)

  // Las dimensiones de una desagregación sin grupo_edad (lo dan las secciones), en el orden del catálogo, con sus
  // valores también en el orden del catálogo.
  const dimensionesDe = (desagregacion) =>
    desagregacion
      .filter(({ dimension }) => dimension !== GRUPO_EDAD && catalogo.has(dimension))
      .map(({ dimension, valores, etiqueta }) => {
        const encontrada = catalogo.get(dimension)
        return {
          codigo: dimension,
          etiqueta: etiqueta ?? encontrada.nombre,
          posicion: encontrada.posicion,
          valores: [...encontrada.valores].filter((v) => valores.includes(v.codigo)).sort((a, b) => a.orden - b.orden),
        }
      })
      .filter((d) => d.valores.length > 0)
      .sort((a, b) => a.posicion - b.posicion)

  const usadas = new Map()
  const armarTabla = (clave, titulo, dosisTabla, desagregacion) => {
    const seccionesTabla = secciones.filter((s) => dosisTabla.some((d) => s.dosis.includes(d.codigo)))
    const dims = dimensionesDe(desagregacion)
    for (const d of dims) usadas.set(d.codigo, d)
    const combinaciones = producto(dims)

    const columnas = seccionesTabla.flatMap((seccion, indice) =>
      combinaciones.map((combinacion) => ({
        seccion: indice,
        valores: seccion.grupoEdad ? { [GRUPO_EDAD]: seccion.grupoEdad, ...combinacion } : combinacion,
      })),
    )

    // Un nivel por sección (si hay más de una) y uno por dimensión; cada etiqueta abarca las columnas de las
    // dimensiones que siguen.
    const encabezados = []
    if (seccionesTabla.length > 1) {
      encabezados.push(seccionesTabla.map((s) => ({ etiqueta: s.titulo, columnas: combinaciones.length })))
    }
    dims.forEach((dim, nivel) => {
      const abarca = dims.slice(nivel + 1).reduce((n, d) => n * d.valores.length, 1)
      const repeticiones = seccionesTabla.length * dims.slice(0, nivel).reduce((n, d) => n * d.valores.length, 1)
      encabezados.push(
        Array.from({ length: repeticiones }).flatMap(() =>
          dim.valores.map((v) => ({ etiqueta: v.etiqueta, columnas: abarca })),
        ),
      )
    })

    const filas = dosisTabla.map(({ codigo }) => {
      const enSeccion = new Set(seccionesTabla.flatMap((s, indice) => (s.dosis.includes(codigo) ? [indice] : [])))
      return {
        dosis: codigo,
        etiqueta: dosisVacuna.get(codigo).nombre,
        celdas: columnas.map((c) => (enSeccion.has(c.seccion) ? { claveCombinacion: claveCombinacion(c.valores) } : null)),
      }
    })

    return {
      clave,
      titulo,
      // Con una sola sección no hay nivel de secciones: su título va encima de la tabla.
      seccion: seccionesTabla.length === 1 ? seccionesTabla[0].titulo : null,
      // columnas[].seccion es la posición en esta lista; la tarjeta B la usa para el grupo de edad de cada fila.
      secciones: seccionesTabla.map((s) => ({ titulo: s.titulo, grupoEdad: s.grupoEdad ?? null })),
      encabezados,
      columnas,
      filas,
    }
  }

  const generales = dosis.filter((d) => d.desagregacion === null)
  const tablas = [
    ...(generales.length > 0 ? [armarTabla('general', null, generales, contenido.desagregacion)] : []),
    ...dosis
      .filter((d) => d.desagregacion !== null)
      .map((d) => armarTabla(`dosis-${d.codigo}`, dosisVacuna.get(d.codigo).nombre, [d], d.desagregacion)),
  ].filter((t) => t.columnas.length > 0 && t.filas.length > 0)

  const porEdad = secciones.some((s) => s.grupoEdad) && catalogo.has(GRUPO_EDAD)
  const dimensionesUsadas = [
    'Dosis',
    ...(porEdad ? [catalogo.get(GRUPO_EDAD).nombre] : []),
    ...[...usadas.values()].sort((a, b) => a.posicion - b.posicion).map((d) => d.etiqueta),
  ]

  return {
    dimensionesUsadas: [...new Set(dimensionesUsadas)],
    tablas,
    procedencia: contenido.procedencia,
    camposAdicionales,
    reglas,
  }
}
