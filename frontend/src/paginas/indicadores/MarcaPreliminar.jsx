import { cn } from '@/lib/utils'

export const TEXTO_PRELIMINAR = 'Datos preliminares: el cálculo incluye meses sin cerrar.'

// isolate: el z-index de la capa (sobre los paneles de Leaflet, que llegan a 400) no sale del contenedor ni tapa
// el encabezado o los menús. container-type: size hace que el texto siga el ancho y el alto de la capa, para que
// rotado quepa también en una gráfica ancha y baja.
const CLASES_CAPA = cn(
  'pointer-events-none absolute inset-0 z-[450] flex flex-col select-none items-center justify-evenly',
  'overflow-hidden [container-type:size]',
)
// En una gráfica alta (por municipio, o en el teléfono) una sola copia deja datos sin cubrir: hasta cinco copias en
// columna, y index.css (.marca-copia) muestra las que caben según la proporción de la capa.
const COPIAS_EXTRA = [2, 3, 4, 5]
const CLASES_TEXTO = cn(
  '-rotate-30 text-[min(13cqw,20cqh,4.5rem)] leading-none font-bold tracking-widest',
  'text-marca-preliminar/15',
)

// SPEC 55: la marca va encima de una gráfica o del mapa de un cálculo parcial, para que también quede en una captura.
// No recibe el puntero: tooltips, clics y arrastre siguen llegando a lo de abajo.
export default function MarcaPreliminar({ activa, className, children }) {
  if (!activa) return children
  return (
    <div className={cn('relative isolate', className)}>
      {children}
      <div aria-hidden="true" data-marca="preliminar" className={CLASES_CAPA}>
        <span className={CLASES_TEXTO}>PRELIMINAR</span>
        {COPIAS_EXTRA.map((n) => (
          <span key={n} data-copia={n} className={cn('marca-copia', CLASES_TEXTO)}>PRELIMINAR</span>
        ))}
      </div>
      <p className="sr-only">{TEXTO_PRELIMINAR}</p>
    </div>
  )
}
