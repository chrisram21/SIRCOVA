import { cn } from '@/lib/utils'

// Fondo decorativo de las superficies azul marino (panel del login, banner del Inicio): luces que se mueven
// despacio y una cuadrícula tenue. El contenedor debe ser `relative isolate overflow-hidden`.
export default function FondoMarca({ className }) {
  return (
    <div aria-hidden="true" className={cn('pointer-events-none absolute inset-0 -z-10 bg-primary', className)}>
      <div className="absolute -top-1/3 -left-1/4 size-[75%] animate-aurora rounded-full bg-ring/45 blur-3xl" />
      <div className="absolute -right-1/4 -bottom-1/3 size-[80%] animate-aurora rounded-full bg-marca-profundo blur-3xl [animation-delay:-7s]" />
      <div className="absolute top-1/4 right-[5%] size-[35%] animate-aurora rounded-full bg-accent/25 blur-3xl [animation-delay:-13s]" />
      <div className="fondo-cuadricula absolute inset-0 text-primary-foreground opacity-70" />
    </div>
  )
}
