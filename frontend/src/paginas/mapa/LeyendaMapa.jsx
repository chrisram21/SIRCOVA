import { cn } from '@/lib/utils'

// SPEC 50: las franjas del modo, de rotulosDeLeyenda. Sobre el mapa en pantallas anchas y debajo en el teléfono (lo
// decide quien la monta con className).
export default function LeyendaMapa({ titulo, franjas, provisional, className }) {
  return (
    <div
      className={cn('flex flex-col gap-1.5 rounded-lg border bg-card/95 px-3 py-2.5 text-xs shadow-tarjeta', className)}
      aria-label={`Leyenda: ${titulo}`}
      role="group"
    >
      <p className="font-semibold text-foreground">{titulo}</p>
      <ul className="flex flex-col gap-1">
        {franjas.map(({ color, texto }) => (
          <li key={texto} className="flex items-center gap-2 text-muted-foreground">
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-[3px] ring-1 ring-foreground/10"
              style={{ backgroundColor: color }}
            />
            {texto}
          </li>
        ))}
      </ul>
      {provisional && <p className="text-muted-foreground italic">Rangos provisionales</p>}
    </div>
  )
}
