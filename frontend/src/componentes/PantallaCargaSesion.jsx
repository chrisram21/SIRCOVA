import FondoMarca from '@/componentes/FondoMarca.jsx'
import MarcaSircova from '@/componentes/MarcaSircova.jsx'

// Mientras se recupera la sesión con la cookie, al recargar o al abrir otra pestaña: en vez de mandar al login un
// instante y perder la dirección pedida.
export default function PantallaCargaSesion() {
  return (
    <div
      role="status"
      aria-label="Recuperando la sesión"
      className="relative isolate flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden text-primary-foreground"
    >
      <FondoMarca />
      <div className="flex animate-aparecer items-center gap-3">
        <MarcaSircova animada className="size-12" />
        <span className="text-2xl font-bold tracking-wide">SIRCOVA</span>
      </div>
      <div aria-hidden="true" className="h-0.5 w-48 overflow-hidden rounded-full bg-primary-foreground/20">
        <div className="h-full w-1/3 animate-barra-carga bg-ring" />
      </div>
    </div>
  )
}
