import { listarAlertas } from '@/api/alertas.js'
import { Badge } from '@/components/ui/badge'
import TarjetaResumen, { Cifra, useConsulta } from './TarjetaResumen.jsx'

export const SEVERIDADES = {
  CRITICA: { etiqueta: 'Crítica', singular: 'crítica', plural: 'críticas', variante: 'destructive' },
  ADVERTENCIA: {
    etiqueta: 'Advertencia',
    singular: 'advertencia',
    plural: 'advertencias',
    variante: 'default',
    clase: 'bg-advertencia text-advertencia-foreground',
  },
  INFO: { etiqueta: 'Informativa', singular: 'informativa', plural: 'informativas', variante: 'secondary' },
}

// «9 críticas, 2 advertencias, 1 informativa», sin las severidades en cero.
export function desgloseDeSeveridades(porSeveridad) {
  return Object.entries(SEVERIDADES)
    .filter(([codigo]) => porSeveridad[codigo] > 0)
    .map(([codigo, { singular, plural }]) => {
      const n = porSeveridad[codigo]
      return `${n} ${n === 1 ? singular : plural}`
    })
    .join(', ')
}

export function InsigniaSeveridad({ severidad }) {
  const { etiqueta, variante, clase } = SEVERIDADES[severidad] ?? SEVERIDADES.INFO
  return (
    <Badge variant={variante} className={clase}>
      {etiqueta}
    </Badge>
  )
}

// Solo la más importante, para que mida como las demás tarjetas: la API ya las ordena por severidad y, en la misma
// severidad, de la más reciente a la más antigua. «Ver alertas» abre la pantalla de HU-52.
export default function TarjetaAlertas({ titulo, tono }) {
  const consulta = useConsulta(listarAlertas)
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta} enlace={{ a: '/alertas', texto: 'Ver alertas' }}>
      {({ total, porSeveridad, alertas: [principal] }) => {
        if (total === 0) return <p className="text-sm text-muted-foreground">No hay alertas activas.</p>
        return (
          <>
            <Cifra valor={total}>{desgloseDeSeveridades(porSeveridad)}</Cifra>
            <div role="group" aria-label="Alerta más importante" className="flex flex-col items-start gap-1 text-sm">
              <InsigniaSeveridad severidad={principal.severidad} />
              <p className="line-clamp-2" title={principal.mensaje}>
                {principal.mensaje}
              </p>
            </div>
          </>
        )
      }}
    </TarjetaResumen>
  )
}
