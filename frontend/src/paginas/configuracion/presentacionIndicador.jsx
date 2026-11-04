import { Badge } from '@/components/ui/badge'
import { ASCENDENTE, DESCENDENTE, TIPOS_INDICADOR, aCortes } from './tiposIndicador.js'

// Lo que comparten la lista de indicadores, su historial y el editor (aparte, para que no se importen entre sí).

export const territorioDeIndicador = (territorio) =>
  territorio.nivel === 'NACIONAL' ? 'Nacional' : territorio.ddrissCodigo

export const etiquetaTipo = (tipo) => TIPOS_INDICADOR[tipo]?.etiqueta ?? tipo

const numero = (valor) => valor.toLocaleString('es-GT')

export function vacunaYDosis(indicador) {
  const { vacuna, dosis, dosisInicial, dosisFinal } = indicador
  if (dosisInicial) return `${vacuna.nombre} · ${dosisInicial} a ${dosisFinal}`
  return dosis ? `${vacuna.nombre} · ${dosis}` : vacuna.nombre
}

export function poblacionYEdad(indicador) {
  const partes = []
  if (indicador.clasificacionPoblacion) partes.push(`Población ${indicador.clasificacionPoblacion}`)
  if (indicador.tipoCalculo !== 'PROYECCION') {
    partes.push(indicador.grupoEdad ? `Edad ${indicador.grupoEdad}` : 'Todas las edades')
  }
  return partes.join(' · ')
}

const SIMBOLOS = { '>': '>', '>=': '≥', '<': '<', '<=': '≤' }

export function textoMeta(indicador) {
  const { meta, tipoCalculo } = indicador
  if (!meta) return '—'
  const texto = `${SIMBOLOS[meta.comparador] ?? meta.comparador} ${numero(meta.valor)} %`
  return tipoCalculo === 'AVANCE_META_MES' ? `${texto} del mes` : texto
}

export const textoProrrateo = (prorrateo) =>
  prorrateo === 'MENSUAL_LINEAL' ? 'Proporcional al mes' : prorrateo === 'NINGUNO' ? 'Población anual completa' : '—'

// El rojo es la variante destructive del Badge; los otros dos, los colores del tema para avisos.
const CLASES_COLOR = {
  amarillo: 'bg-advertencia text-advertencia-foreground',
  verde: 'bg-exito text-exito-foreground',
}
const NOMBRES_COLOR = { rojo: 'Rojo', amarillo: 'Amarillo', verde: 'Verde' }

export const sentidoDe = (tipo) => TIPOS_INDICADOR[tipo]?.semaforo ?? ASCENDENTE

// Las franjas con su rango escrito: con la forma de tres franjas, por los cortes; si no, tal como vienen.
export function franjasConRango(umbrales, sentido) {
  const cortes = aCortes(umbrales, sentido)
  if (cortes) {
    const [c1, c2] = cortes.map(numero)
    if (sentido === DESCENDENTE) {
      return [
        { color: 'verde', rango: `≤ ${c1}` },
        { color: 'amarillo', rango: `${c1} a ${c2}` },
        { color: 'rojo', rango: `> ${c2}` },
      ]
    }
    return [
      { color: 'rojo', rango: `< ${c1}` },
      { color: 'amarillo', rango: `${c1} a ${c2}` },
      { color: 'verde', rango: `≥ ${c2}` },
    ]
  }
  const rango = (u) => {
    if (u.desde === null) return `hasta ${numero(u.hasta)}`
    if (u.hasta === null) return `desde ${numero(u.desde)}`
    return `${numero(u.desde)} a ${numero(u.hasta)}`
  }
  return umbrales.map((u) => ({ color: u.color, rango: rango(u) }))
}

export function InsigniasSemaforo({ indicador }) {
  const { umbrales, umbralesProvisionales, tipoCalculo } = indicador
  if (umbrales.length === 0) return '—'
  return (
    <div className="flex flex-wrap items-center gap-1">
      {franjasConRango(umbrales, sentidoDe(tipoCalculo)).map((franja, i) => (
        <Badge
          key={i}
          variant={franja.color === 'rojo' ? 'destructive' : 'default'}
          className={CLASES_COLOR[franja.color]}
          title={NOMBRES_COLOR[franja.color] ?? franja.color}
        >
          {franja.rango}
        </Badge>
      ))}
      {umbralesProvisionales && <span className="text-xs text-muted-foreground">Provisional</span>}
    </div>
  )
}
