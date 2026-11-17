import { MODOS } from './EditorEsquema.jsx'

export const GRUPOS = [
  { codigo: 'procedencia', titulo: 'Procedencia' },
  { codigo: 'desagregacion', titulo: 'Desagregación' },
  { codigo: 'dosis', titulo: 'Dosis' },
  { codigo: 'secciones', titulo: 'Secciones' },
  { codigo: 'inclusion', titulo: 'Inclusión en reportes nuevos' },
]

const siNo = (valor) => (valor ? 'Sí' : 'No')
const etiquetaModo = (modo) => MODOS.find((m) => m.valor === modo)?.etiqueta ?? modo
const iguales = (x, y) => JSON.stringify(x) === JSON.stringify(y)

// Nombres del catálogo de dimensiones; sin él (o con un código que no está) se muestra el código.
function nombres(dimensiones) {
  const porCodigo = new Map(dimensiones.map((d) => [d.codigo, d]))
  return {
    dimension: (codigo) => porCodigo.get(codigo)?.nombre ?? codigo,
    valor: (dimension, codigo) =>
      porCodigo.get(dimension)?.valores?.find((v) => v.codigo === codigo)?.etiqueta ?? codigo,
  }
}

// Recorre las claves de b en su orden y después las que solo están en a.
function porClave(listaA, listaB, clave) {
  const enA = new Map(listaA.map((x) => [clave(x), x]))
  const enB = new Map(listaB.map((x) => [clave(x), x]))
  return [
    ...listaB.map((x) => [clave(x), enA.get(clave(x)), x]),
    ...listaA.filter((x) => !enB.has(clave(x))).map((x) => [clave(x), x, undefined]),
  ]
}

// La diferencia de una versión «Desde» (a) a una «Hasta» (b), como las devuelve GET /esquemas-captura/{id}.
export function compararEsquemas(a, b, dimensiones = []) {
  const n = nombres(dimensiones)
  const valores = (d) => d.valores.map((v) => n.valor(d.dimension, v)).join(', ')
  const textoDesagregacion = (lista) => {
    if (lista === null || lista === undefined) return 'General'
    if (lista.length === 0) return 'Sin desagregar'
    return lista.map((d) => `${n.dimension(d.dimension)}: ${valores(d)}`).join('; ')
  }
  const diferencias = []
  const agregar = (grupo, tipo, etiqueta, antes, despues) => diferencias.push({ grupo, tipo, etiqueta, antes, despues })

  const procA = a.procedencia ?? {}
  const procB = b.procedencia ?? {}
  if (procA.modo !== procB.modo) {
    agregar('procedencia', 'cambiado', 'Modo de procedencia', etiquetaModo(procA.modo), etiquetaModo(procB.modo))
  }
  const permiteA = procA.permiteNoEspecificado ?? true
  const permiteB = procB.permiteNoEspecificado ?? true
  if (permiteA !== permiteB) {
    agregar('procedencia', 'cambiado', 'Permitir procedencia no especificada', siNo(permiteA), siNo(permiteB))
  }

  const desA = a.desagregacion ?? []
  const desB = b.desagregacion ?? []
  for (const [codigo, x, y] of porClave(desA, desB, (d) => d.dimension)) {
    const nombre = n.dimension(codigo)
    if (!x) agregar('desagregacion', 'agregado', `Dimensión ${nombre}`, undefined, valores(y))
    else if (!y) agregar('desagregacion', 'quitado', `Dimensión ${nombre}`, valores(x), undefined)
    else {
      if (!iguales(x.valores, y.valores)) {
        agregar('desagregacion', 'cambiado', `Valores de ${nombre}`, valores(x), valores(y))
      }
      if ((x.etiqueta ?? null) !== (y.etiqueta ?? null)) {
        agregar('desagregacion', 'cambiado', `Etiqueta de ${nombre}`, x.etiqueta ?? '—', y.etiqueta ?? '—')
      }
    }
  }
  const comunes = (lista, otra) => lista.map((d) => d.dimension).filter((c) => otra.some((d) => d.dimension === c))
  const ordenA = comunes(desA, desB)
  const ordenB = comunes(desB, desA)
  if (!iguales(ordenA, ordenB)) {
    agregar(
      'desagregacion',
      'cambiado',
      'Orden de las dimensiones',
      ordenA.map(n.dimension).join(', '),
      ordenB.map(n.dimension).join(', '),
    )
  }

  for (const [codigo, x, y] of porClave(a.dosis ?? [], b.dosis ?? [], (d) => d.codigo)) {
    if (!x) agregar('dosis', 'agregado', `Dosis ${codigo}`, undefined, y.etiqueta)
    else if (!y) agregar('dosis', 'quitado', `Dosis ${codigo}`, x.etiqueta, undefined)
    else {
      if (x.etiqueta !== y.etiqueta) agregar('dosis', 'cambiado', `Etiqueta de ${codigo}`, x.etiqueta, y.etiqueta)
      const antes = textoDesagregacion(x.desagregacion)
      const despues = textoDesagregacion(y.desagregacion)
      if (antes !== despues) agregar('dosis', 'cambiado', `Desagregación de ${codigo}`, antes, despues)
    }
  }

  for (const [, x, y] of porClave(a.secciones ?? [], b.secciones ?? [], (s) => s.codigo)) {
    if (!x) agregar('secciones', 'agregado', `Sección «${y.titulo}»`, undefined, y.dosis.join(', '))
    else if (!y) agregar('secciones', 'quitado', `Sección «${x.titulo}»`, x.dosis.join(', '), undefined)
    else {
      if (x.titulo !== y.titulo) agregar('secciones', 'cambiado', `Título de «${x.titulo}»`, x.titulo, y.titulo)
      if (x.orden !== y.orden) agregar('secciones', 'cambiado', `Orden de «${y.titulo}»`, String(x.orden), String(y.orden))
      if (!iguales(x.dosis, y.dosis)) {
        agregar('secciones', 'cambiado', `Dosis de «${y.titulo}»`, x.dosis.join(', '), y.dosis.join(', '))
      }
    }
  }

  const incluirA = a.incluirPorDefecto ?? true
  const incluirB = b.incluirPorDefecto ?? true
  if (incluirA !== incluirB) {
    agregar('inclusion', 'cambiado', 'Incluir en los reportes nuevos', siNo(incluirA), siNo(incluirB))
  }

  return diferencias
}

// La versión que se compara por defecto con `id`: la de número inmediatamente menor, de cualquier territorio.
export function versionAnterior(versiones, id) {
  const actual = versiones.find((v) => v.id === id)
  if (!actual) return null
  return versiones
    .filter((v) => v.version < actual.version)
    .reduce((mayor, v) => (mayor === null || v.version > mayor.version ? v : mayor), null)
}
