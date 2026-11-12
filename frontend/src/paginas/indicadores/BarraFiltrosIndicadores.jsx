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
import SelectorConBusqueda from '@/componentes/SelectorConBusqueda.jsx'
import { MESES } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'
import { TODAS_LAS_VACUNAS } from './produccion.js'

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

export function MenuMunicipios({ municipios, elegidos, alCambiar }) {
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

// SPEC 61: los filtros de «Producción». Las opciones salen de GET /indicadores/produccion/opciones; elegir una red
// limpia el distrito, los municipios y el establecimiento, y al revés (como en las demás pestañas).
export function BarraFiltrosProduccion({ opciones, valores, irA, alCambiarAnio, alCambiarDdriss }) {
  const { ddriss, anios, meses, vacunas, redes, distritos, municipios, establecimientos } = opciones
  const sinRecorte = { municipios: [], establecimientos: undefined }
  return (
    <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
      {ddriss && (
        <Selector
          nombre="ddriss"
          etiqueta="DDRISS"
          placeholder="Elija la DDRISS"
          valor={valores.ddrissId ? String(valores.ddrissId) : undefined}
          alCambiar={(id) => alCambiarDdriss(Number(id))}
          opciones={ddriss.map((d) => ({ valor: String(d.id), texto: d.nombre }))}
          className="sm:w-56"
        />
      )}
      <Selector
        nombre="anio"
        etiqueta="Año"
        valor={String(valores.anio)}
        alCambiar={(a) => alCambiarAnio(Number(a))}
        opciones={anios.map((a) => ({ valor: String(a), texto: String(a) }))}
        className="sm:w-32"
      />
      <Selector
        nombre="mes"
        etiqueta="Mes de corte"
        valor={String(valores.mes)}
        alCambiar={(m) => irA({ mes: Number(m) })}
        opciones={meses.map((m) => ({ valor: String(m), texto: MESES[m - 1] }))}
        className="sm:w-44"
      />
      <Selector
        nombre="periodo"
        etiqueta="Periodo"
        valor={valores.acumulado ? 'acumulado' : 'mes'}
        alCambiar={(p) => irA({ periodo: p === 'mes' ? 'mes' : undefined })}
        opciones={[{ valor: 'acumulado', texto: 'Acumulado' }, { valor: 'mes', texto: 'Solo el mes' }]}
        className="sm:w-40"
      />
      <Selector
        nombre="vacuna"
        etiqueta="Vacuna"
        valor={valores.vacuna ?? TODAS_LAS_VACUNAS}
        alCambiar={(codigo) => irA({ vacuna: codigo, indicador: undefined })}
        opciones={[
          { valor: TODAS_LAS_VACUNAS, texto: 'Todas las vacunas' },
          ...vacunas.map((v) => ({ valor: v.codigo, texto: v.activa ? v.nombre : `${v.nombre} (inactiva)` })),
        ]}
        className="sm:w-52"
      />
      <Selector
        nombre="agrupar"
        etiqueta="Agrupar por"
        valor={valores.agrupar}
        alCambiar={(a) => irA({ agrupar: a === 'establecimiento' ? a : undefined })}
        opciones={[
          { valor: 'municipio', texto: 'Municipio de aplicación' },
          { valor: 'establecimiento', texto: 'Establecimiento' },
        ]}
        className="sm:w-56"
      />
      {redes && redes.length > 0 && (
        <Selector
          nombre="red"
          etiqueta="Red"
          valor={valores.red ? String(valores.red) : TODOS}
          alCambiar={(id) => irA({ red: id === TODOS ? undefined : Number(id), distrito: undefined, ...sinRecorte })}
          opciones={[
            { valor: TODOS, texto: 'Todas las redes' },
            ...redes.map((r) => ({ valor: String(r.id), texto: r.nombre })),
          ]}
          className="sm:w-56"
        />
      )}
      {distritos.length > 0 && (
        <Selector
          nombre="distrito"
          etiqueta="Distrito"
          valor={valores.distrito ? String(valores.distrito) : TODOS}
          alCambiar={(id) => irA({ distrito: id === TODOS ? undefined : Number(id), red: undefined, ...sinRecorte })}
          opciones={[
            { valor: TODOS, texto: 'Todos los distritos' },
            ...distritos.map((d) => ({ valor: String(d.id), texto: d.nombre })),
          ]}
          className="sm:w-64"
        />
      )}
      {municipios.length > 0 && (
        <MenuMunicipios
          municipios={municipios}
          elegidos={valores.elegidos}
          alCambiar={(ids) => irA({ municipios: ids, red: undefined, establecimientos: undefined })}
        />
      )}
      <SelectorConBusqueda
        etiqueta="Establecimiento"
        valor={valores.establecimiento ? String(valores.establecimiento) : TODOS}
        alCambiar={(id) => irA({ establecimientos: id === TODOS ? undefined : id })}
        opciones={[
          { valor: TODOS, texto: 'Todos los establecimientos', fija: true },
          ...establecimientos.map((e) => ({ valor: String(e.id), texto: e.nombre, detalle: e.codigo })),
        ]}
        textoBuscar="Buscar establecimiento…"
        textoVacio="Ningún establecimiento coincide."
        className="w-full sm:w-72"
      />
    </form>
  )
}
