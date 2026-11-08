import { cn } from '@/lib/utils'
import { MarcaMayorACien } from '@/paginas/indicadores/MarcaMayorACien.jsx'
import { cifraDelModo, marcadaEnModo, ordenDeClasificacion } from './mapaTerritorial.js'

// SPEC 50: los municipios del más rezagado al menos según el modo. Cada fila es un botón, así se elige un municipio
// con el teclado (los polígonos del mapa no reciben el foco).
export default function ClasificacionMunicipios({ filas, modo, seleccionado, onElegir }) {
  const ordenadas = ordenDeClasificacion(filas, modo)
  if (ordenadas.length === 0) return <p className="text-sm text-muted-foreground">No hay municipios con datos.</p>

  return (
    <ol aria-label="Clasificación de municipios" className="flex flex-col gap-0.5">
      {ordenadas.map((fila, i) => {
        const elegido = fila.municipioId !== null && fila.municipioId === seleccionado
        return (
          <li key={fila.codigoIne}>
            <button
              type="button"
              aria-pressed={elegido}
              disabled={fila.municipioId === null}
              onClick={() => onElegir(fila)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors',
                'hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                'disabled:cursor-default disabled:hover:bg-transparent',
                elegido && 'bg-accent text-accent-foreground',
              )}
            >
              <span className="w-5 shrink-0 text-right font-mono text-xs text-muted-foreground">
                {fila.sinDatos ? '' : i + 1}
              </span>
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-[3px] ring-1 ring-foreground/10"
                style={{ backgroundColor: fila.color }}
              />
              <span className="min-w-0 flex-1 truncate">{fila.nombre}</span>
              {marcadaEnModo(modo, fila) && <MarcaMayorACien />}
              <span className={cn('shrink-0 font-mono text-xs', fila.sinDatos ? 'text-muted-foreground' : 'font-medium')}>
                {cifraDelModo(modo, fila)}
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
