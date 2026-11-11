import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

// Las mismas clases que SelectTrigger, para que se vea como los demás selects.
const CLASES_BOTON =
  'flex h-8 w-full items-center justify-between gap-1.5 rounded-lg border border-input bg-card py-2 pr-2 pl-2.5 text-left text-sm whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20'

// 'Concepción' → 'concepcion': sin mayúsculas ni tildes.
const normalizar = (texto) =>
  String(texto ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

// Las fijas («Todos», «Sin establecimiento»…) van primero y no se filtran; las demás, si el texto está en su texto o en
// su detalle (el código).
export function filtrarOpciones(opciones, busqueda) {
  const buscado = normalizar(busqueda).trim()
  const fijas = opciones.filter((o) => o.fija)
  const resto = opciones.filter((o) => !o.fija)
  if (buscado === '') return [...fijas, ...resto]
  return [...fijas, ...resto.filter((o) => normalizar(o.texto).includes(buscado) || normalizar(o.detalle).includes(buscado))]
}

// Un select con búsqueda para catálogos largos (SPEC 58). opciones: [{ valor, texto, detalle?, fija? }].
export default function SelectorConBusqueda({
  id,
  valor,
  alCambiar,
  opciones,
  marcador = 'Elija una opción',
  textoBuscar = 'Buscar…',
  textoVacio = 'Ninguna opción coincide.',
  deshabilitado = false,
  invalido = false,
  descritoPor,
  etiqueta,
  className,
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const elegida = opciones.find((o) => o.valor === valor)
  const visibles = filtrarOpciones(opciones, busqueda)
  const hayCoincidencias = visibles.some((o) => !o.fija)

  function cambiarAbierto(siguiente) {
    setAbierto(siguiente)
    if (!siguiente) setBusqueda('')
  }

  return (
    <Popover open={abierto} onOpenChange={cambiarAbierto}>
      <PopoverTrigger asChild disabled={deshabilitado}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={abierto}
          aria-label={etiqueta}
          aria-invalid={invalido || undefined}
          aria-describedby={descritoPor}
          className={cn(CLASES_BOTON, className)}
        >
          <span className={cn('truncate', !elegida && 'text-muted-foreground')}>{elegida?.texto ?? marcador}</span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput value={busqueda} onValueChange={setBusqueda} placeholder={textoBuscar} aria-label={textoBuscar} />
          <CommandList>
            {/* CommandEmpty solo se ve sin ninguna opción, y las fijas no se filtran. */}
            {!hayCoincidencias && busqueda.trim() !== '' && <p className="py-6 text-center text-sm">{textoVacio}</p>}
            <CommandGroup>
              {visibles.map((opcion) => (
                <CommandItem
                  key={opcion.valor}
                  value={opcion.valor}
                  data-checked={opcion.valor === valor}
                  onSelect={() => {
                    alCambiar(opcion.valor)
                    cambiarAbierto(false)
                  }}
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{opcion.texto}</span>
                    {opcion.detalle && <span className="text-xs text-muted-foreground">{opcion.detalle}</span>}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
