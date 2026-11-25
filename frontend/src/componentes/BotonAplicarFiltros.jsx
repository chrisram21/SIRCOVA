import { useId } from 'react'
import { cn } from 'cn'
import { Button } from '@/components/ui/button'

// Botón que envía una barra de filtros; en ámbar mientras haya filtros cambiados sin aplicar (SPEC 75).
export default function BotonAplicarFiltros({ pendiente, className, children }) {
  const idAviso = useId()
  return (
    <div className={cn('flex items-center gap-2', className)}>
      {pendiente && (
        <span id={idAviso} className="text-sm text-muted-foreground">
          Filtros sin aplicar
        </span>
      )}
      <Button
        type="submit"
        aria-describedby={pendiente ? idAviso : undefined}
        className={cn(
          'transition-colors',
          pendiente && 'bg-cambio-pendiente text-foreground hover:bg-cambio-pendiente/85',
        )}
      >
        {children}
      </Button>
    </div>
  )
}
