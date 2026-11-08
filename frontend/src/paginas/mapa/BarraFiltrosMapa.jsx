import { MESES } from '@/lib/fechas.js'
import { Selector } from '@/paginas/indicadores/BarraFiltrosIndicadores.jsx'

// SPEC 50: año, mes, vacuna y, para la Autoridad nacional, la DDRISS. Todo va en la URL (irA); no carga nada.
export default function BarraFiltrosMapa({ filtros, anios, ddriss, ddrissId, vacunas, vacuna, irA }) {
  return (
    // Dentro de un form, Radix agrega el <select> nativo de cada Select.
    <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
      {ddriss && (
        <Selector
          nombre="ddriss"
          etiqueta="DDRISS"
          placeholder="Elija la DDRISS"
          valor={ddrissId ? String(ddrissId) : undefined}
          alCambiar={(id) => irA({ ddriss: Number(id), vacuna: undefined, municipio: undefined })}
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
        className="sm:w-28"
      />
      <Selector
        nombre="mes"
        etiqueta="Mes de corte"
        valor={String(filtros.mes)}
        alCambiar={(m) => irA({ mes: Number(m) })}
        opciones={MESES.map((nombre, i) => ({ valor: String(i + 1), texto: nombre }))}
        className="sm:w-40"
      />
      {vacunas.length > 0 && (
        <Selector
          nombre="vacuna"
          etiqueta="Vacuna"
          valor={vacuna ?? undefined}
          alCambiar={(codigo) => irA({ vacuna: codigo })}
          opciones={vacunas.map((v) => ({ valor: v.codigo, texto: v.nombre }))}
          className="sm:w-56"
        />
      )}
    </form>
  )
}
