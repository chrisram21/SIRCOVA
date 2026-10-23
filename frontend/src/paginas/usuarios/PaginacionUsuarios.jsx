import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export const FILAS_POR_PAGINA = [10, 20, 50]

// La primera, la última, la actual y una a cada lado; null marca un salto (elipsis).
export function paginasVisibles(actual, ultima) {
  const numeros = [...new Set([1, actual - 1, actual, actual + 1, ultima])]
    .filter((n) => n >= 1 && n <= ultima)
    .sort((a, b) => a - b)
  return numeros.flatMap((n, i) => (i > 0 && n - numeros[i - 1] > 1 ? [null, n] : [n]))
}

export default function PaginacionUsuarios({ total, pagina, porPagina, hrefDe, alCambiarPagina, alCambiarPorPagina }) {
  const ultima = Math.max(1, Math.ceil(total / porPagina))
  const desde = (pagina - 1) * porPagina + 1
  const hasta = Math.min(pagina * porPagina, total)

  // Los enlaces llevan su URL real (para abrirla en otra pestaña), pero navegan con React Router.
  function enlace(destino, deshabilitado) {
    return {
      href: hrefDe(destino),
      'aria-disabled': deshabilitado || undefined,
      tabIndex: deshabilitado ? -1 : undefined,
      className: deshabilitado ? 'pointer-events-none opacity-50' : undefined,
      onClick: (evento) => {
        evento.preventDefault()
        if (!deshabilitado) alCambiarPagina(destino)
      },
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
      <p>
        Mostrando {desde} a {hasta} de {total}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        {/* Dentro de un form, Radix agrega el <select> nativo con el que las pruebas cambian el valor. */}
        <form className="flex items-center gap-2" onSubmit={(evento) => evento.preventDefault()}>
          <label htmlFor="porPagina">Filas por página</label>
          <Select value={String(porPagina)} onValueChange={(valor) => alCambiarPorPagina(Number(valor))} name="porPagina">
            <SelectTrigger id="porPagina" size="sm" className="w-20 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILAS_POR_PAGINA.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </form>

        {ultima > 1 && (
          <Pagination aria-label="Paginación" className="mx-0 w-auto">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious text="Anterior" aria-label="Anterior" {...enlace(pagina - 1, pagina === 1)} />
              </PaginationItem>
              {paginasVisibles(pagina, ultima).map((n, i) =>
                n === null ? (
                  <PaginationItem key={`salto-${i}`}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={n}>
                    <PaginationLink isActive={n === pagina} aria-label={`Página ${n}`} {...enlace(n, false)}>
                      {n}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext text="Siguiente" aria-label="Siguiente" {...enlace(pagina + 1, pagina === ultima)} />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>
    </div>
  )
}
