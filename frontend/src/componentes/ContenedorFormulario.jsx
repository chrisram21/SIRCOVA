import { cn } from 'cn'

// El contenedor de una pantalla de formulario: centrado, con su ancho máximo (SPEC 75). Las clases van completas
// porque Tailwind solo genera las que encuentra escritas. Para volver a la izquierda, quitar `mx-auto`.
const ANCHOS = { xl: 'max-w-xl', '3xl': 'max-w-3xl', '4xl': 'max-w-4xl', '5xl': 'max-w-5xl', '6xl': 'max-w-6xl' }

export default function ContenedorFormulario({ ancho, className, children, ...resto }) {
  return (
    <section className={cn('mx-auto flex w-full flex-col gap-6 p-6', ANCHOS[ancho], className)} {...resto}>
      {children}
    </section>
  )
}
