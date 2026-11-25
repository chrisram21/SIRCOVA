import { useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { CLASES_BOTON, filtrarOpciones } from './SelectorConBusqueda.jsx'

// El valor de cmdk de la opción fija; el de cada opción lleva un prefijo para no chocar con él.
const TODAS = 'todas'
const valorDeItem = (valor) => `opcion:${valor}`

// Un select con búsqueda que elige varias opciones con casillas (SPEC 73). valores: los elegidos ([] = la opción fija
// textoTodas). opciones: [{ valor, texto, detalle? }]. alCambiar recibe los elegidos en el orden de `opciones`.
export default function SelectorMultipleConBusqueda({
  id,
  etiqueta,
  valores,
  alCambiar,
  opciones,
  textoTodas = 'Todas',
  textoVarias = (n) => `${n} elegidas`,
  textoBuscar = 'Buscar…',
  textoVacio = 'Ninguna opción coincide.',
  deshabilitado = false,
  className,
}) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const elegidos = new Set(valores)
  const visibles = filtrarOpciones([{ valor: TODAS, texto: textoTodas, fija: true }, ...opciones], busqueda)
  const hayCoincidencias = visibles.some((o) => !o.fija)

  let textoBoton = textoTodas
  if (valores.length === 1) textoBoton = opciones.find((o) => o.valor === valores[0])?.texto ?? valores[0]
  else if (valores.length > 1) textoBoton = textoVarias(valores.length)

  function cambiarAbierto(siguiente) {
    setAbierto(siguiente)
    if (!siguiente) setBusqueda('')
  }

  function alternar(valor) {
    const siguientes = new Set(elegidos)
    if (siguientes.has(valor)) siguientes.delete(valor)
    else siguientes.add(valor)
    alCambiar(opciones.filter((o) => siguientes.has(o.valor)).map((o) => o.valor))
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
          className={cn(CLASES_BOTON, className)}
        >
          <span className="truncate">{textoBoton}</span>
          <ChevronDownIcon className="pointer-events-none size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-64 p-0">
        <Command shouldFilter={false}>
          <CommandInput
            value={busqueda}
            onValueChange={setBusqueda}
            placeholder={textoBuscar}
            aria-label={textoBuscar}
          />
          <CommandList aria-multiselectable="true">
            {/* Como en SelectorConBusqueda: CommandEmpty no se ve mientras esté la opción fija. */}
            {!hayCoincidencias && busqueda.trim() !== '' && <p className="py-6 text-center text-sm">{textoVacio}</p>}
            <CommandGroup>
              {visibles.map((opcion) =>
                opcion.fija ? (
                  <CommandItem
                    key={TODAS}
                    value={TODAS}
                    data-checked={valores.length === 0}
                    aria-checked={valores.length === 0}
                    onSelect={() => alCambiar([])}
                  >
                    <span className="truncate">{opcion.texto}</span>
                  </CommandItem>
                ) : (
                  <CommandItem
                    key={opcion.valor}
                    value={valorDeItem(opcion.valor)}
                    aria-checked={elegidos.has(opcion.valor)}
                    onSelect={() => alternar(opcion.valor)}
                  >
                    {/* La casilla solo muestra el estado: el clic y el teclado van por el CommandItem. */}
                    <Checkbox
                      checked={elegidos.has(opcion.valor)}
                      tabIndex={-1}
                      aria-hidden="true"
                      className="pointer-events-none"
                    />
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate">{opcion.texto}</span>
                      {opcion.detalle && <span className="text-xs text-muted-foreground">{opcion.detalle}</span>}
                    </span>
                  </CommandItem>
                ),
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
