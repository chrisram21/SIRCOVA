import { Construction } from 'lucide-react'

export default function PaginaEnConstruccion({ titulo }) {
  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold">{titulo}</h1>
      <p className="mt-4 flex items-center gap-2 text-muted-foreground">
        <Construction className="size-5" />
        Esta pantalla está en construcción.
      </p>
    </section>
  )
}
