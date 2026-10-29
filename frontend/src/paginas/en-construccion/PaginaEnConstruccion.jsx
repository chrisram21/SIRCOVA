import { Construction, House } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

export default function PaginaEnConstruccion({ titulo }) {
  return (
    <section className="flex flex-col gap-6 p-4 sm:p-6">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{titulo}</h1>
      <div className="relative isolate flex flex-col items-center gap-5 overflow-hidden rounded-2xl border border-dashed border-input bg-card px-6 py-16 text-center shadow-tarjeta">
        <div aria-hidden="true" className="fondo-cuadricula absolute inset-0 -z-10 text-primary/60" />
        <span className="relative flex size-14 animate-flotar items-center justify-center rounded-2xl bg-accent text-accent-foreground ring-1 ring-ring/30">
          <Construction className="size-7" aria-hidden="true" />
        </span>
        <div className="flex max-w-md flex-col gap-1.5">
          <p className="text-base font-medium text-foreground">Esta pantalla está en construcción.</p>
          <p className="text-sm text-muted-foreground">
            Estará disponible en una próxima versión del sistema. Mientras tanto, puede seguir trabajando desde el inicio.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/inicio">
            <House />
            Volver al inicio
          </Link>
        </Button>
      </div>
    </section>
  )
}
