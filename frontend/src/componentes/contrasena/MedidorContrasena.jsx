import { cn } from '@/lib/utils'

const NIVELES = [
  { etiqueta: 'Muy débil', color: 'bg-destructive' },
  { etiqueta: 'Débil', color: 'bg-destructive' },
  { etiqueta: 'Aceptable', color: 'bg-chart-3' },
  { etiqueta: 'Fuerte', color: 'bg-chart-1' },
  { etiqueta: 'Muy fuerte', color: 'bg-chart-5' },
]
const BARRAS = 4

// resultado: { puntaje, motivos } de la política, o null mientras zxcvbn carga.
export default function MedidorContrasena({ contrasena, resultado, id }) {
  if (!contrasena) return null
  if (!resultado) {
    return (
      <p id={id} className="text-xs text-muted-foreground" aria-live="polite">
        Revisando…
      </p>
    )
  }

  const nivel = NIVELES[resultado.puntaje]
  return (
    <div id={id} className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1" aria-hidden="true">
        {Array.from({ length: BARRAS }, (_, indice) => (
          <span
            key={indice}
            className={cn('h-1.5 flex-1 rounded-full', indice < Math.max(resultado.puntaje, 1) ? nivel.color : 'bg-muted')}
          />
        ))}
      </div>
      <p className="text-xs font-medium">Fortaleza: {nivel.etiqueta}</p>
      {resultado.motivos.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-xs text-destructive">
          {resultado.motivos.map((motivo) => (
            <li key={motivo}>{motivo}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
