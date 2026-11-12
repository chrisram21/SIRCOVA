import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { MESES } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'

const TODOS = 'todos'

export function Selector({ nombre, etiqueta, valor, alCambiar, opciones, className, placeholder }) {
  return (
    <Select name={nombre} value={valor} onValueChange={alCambiar}>
      <SelectTrigger aria-label={etiqueta} className={cn('w-full bg-card', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.texto}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function textoMunicipios(elegidos, total) {
  if (elegidos.length === 0) return `Todos (${total})`
  return elegidos.length === 1 ? '1 municipio' : `${elegidos.length} municipios`
}

function MenuMunicipios({ municipios, elegidos, alCambiar }) {
  const ids = elegidos.map((m) => m.id)
  const alternar = (id, marcado) => alCambiar(marcado ? [...ids, id] : ids.filter((otro) => otro !== id))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Municipios" className="w-full justify-between bg-card font-normal sm:w-56">
          <span className="truncate">{textoMunicipios(elegidos, municipios.length)}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 w-64 overflow-y-auto">
        <DropdownMenuItem onSelect={() => alCambiar([])}>Todos</DropdownMenuItem>
        <DropdownMenuSeparator />
        {municipios.map((m) => (
          <DropdownMenuCheckboxItem
            key={m.id}
            checked={ids.includes(m.id)}
            onCheckedChange={(marcado) => alternar(m.id, marcado)}
            // El menú queda abierto para marcar varios.
            onSelect={(evento) => evento.preventDefault()}
          >
            {m.nombre}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// La barra de filtros de «Indicadores». Todo lo elegido va en la URL (irA); este componente no carga nada.
export default function BarraFiltrosIndicadores({
  filtros,
  anios,
  ddriss,
  ddrissId,
  vacunas,
  vacuna,
  redes,
  redDeLaPestana,
  enRedes,
  distritos,
  municipios,
  elegidos,
  irA,
}) {
  return (
    // Dentro de un form, Radix agrega el <select> nativo de cada Select.
    <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
      {ddriss && (
        <Selector
          nombre="ddriss"
          etiqueta="DDRISS"
          placeholder="Elija la DDRISS"
          valor={ddrissId ? String(ddrissId) : undefined}
          alCambiar={(id) => irA({
            ddriss: Number(id), vacuna: undefined, indicador: undefined, red: undefined, distrito: undefined, municipios: [],
            anios: undefined, meses: undefined,
          })}
          opciones={ddriss.map((d) => ({ valor: String(d.id), texto: d.nombre }))}
          className="sm:w-56"
        />
      )}
      <Selector
        nombre="anio"
        etiqueta="Año"
        valor={String(filtros.anio)}
        alCambiar={(a) => irA({ anio: Number(a) })}
        opciones={anios.map((a) => ({ valor: String(a), texto: String(a) }))}
        className="sm:w-32"
      />
      <Selector
        nombre="mes"
        etiqueta="Mes de corte"
        valor={String(filtros.mes)}
        alCambiar={(m) => irA({ mes: Number(m) })}
        opciones={MESES.map((nombre, i) => ({ valor: String(i + 1), texto: nombre }))}
        className="sm:w-44"
      />
      {/* SPEC 60: en «Redes» solo cuentan el año, el mes y la red (obligatoria); vacuna, distrito y municipios no se
          ven, pero se conservan en la URL. */}
      {enRedes && redes && redes.length > 0 && (
        <Selector
          nombre="red"
          etiqueta="Red"
          valor={String(redDeLaPestana?.id)}
          alCambiar={(id) => irA({ red: Number(id) })}
          opciones={redes.map((r) => ({ valor: String(r.id), texto: r.nombre }))}
          className="sm:w-56"
        />
      )}
      {!enRedes && vacunas.length > 0 && (
        <Selector
          nombre="vacuna"
          etiqueta="Vacuna"
          valor={vacuna}
          alCambiar={(codigo) => irA({ vacuna: codigo, indicador: undefined })}
          opciones={vacunas.map((v) => ({ valor: v.codigo, texto: v.nombre }))}
          className="sm:w-48"
        />
      )}
      {/* SPEC 60: la red es un preset de municipios; elegirla limpia el distrito y los municipios, y al revés. */}
      {!enRedes && redes && redes.length > 0 && (
        <Selector
          nombre="red"
          etiqueta="Red"
          valor={filtros.red && redes.some((r) => r.id === filtros.red) ? String(filtros.red) : TODOS}
          alCambiar={(id) => irA({ red: id === TODOS ? undefined : Number(id), distrito: undefined, municipios: [] })}
          opciones={[{ valor: TODOS, texto: 'Todas las redes' }, ...redes.map((r) => ({ valor: String(r.id), texto: r.nombre }))]}
          className="sm:w-56"
        />
      )}
      {!enRedes && distritos && distritos.length > 0 && (
        <Selector
          nombre="distrito"
          etiqueta="Distrito"
          valor={filtros.distrito && distritos.some((d) => d.id === filtros.distrito) ? String(filtros.distrito) : TODOS}
          alCambiar={(id) => irA({ distrito: id === TODOS ? undefined : Number(id), red: undefined, municipios: [] })}
          opciones={[{ valor: TODOS, texto: 'Todos los distritos' }, ...distritos.map((d) => ({ valor: String(d.id), texto: d.nombre }))]}
          className="sm:w-64"
        />
      )}
      {!enRedes && municipios.length > 0 && (
        <MenuMunicipios municipios={municipios} elegidos={elegidos} alCambiar={(ids) => irA({ municipios: ids, red: undefined })} />
      )}
    </form>
  )
}
