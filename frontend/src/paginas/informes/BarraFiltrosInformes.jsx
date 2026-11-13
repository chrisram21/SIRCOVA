import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import SelectorConBusqueda from '@/componentes/SelectorConBusqueda.jsx'
import { MESES } from '@/lib/fechas.js'
import { MenuMunicipios, Selector } from '@/paginas/indicadores/BarraFiltrosIndicadores.jsx'
import { INFORMES, NIVELES, nivelPermitido } from './informes.js'

// SPEC 62: los filtros de «Informes». Cambiar un filtro no genera nada: el informe sale al pulsar «Generar», que
// escribe los filtros en la URL. Elegir una red borra los municipios elegidos, y al revés.

const TODAS = 'todas'

// Un mes del rango con un select «Año» + un select «Mes» (SPEC 58). meses: los habilitados de la DDRISS.
function MesDelRango({ nombre, etiqueta, meses, valor, alCambiar, primero }) {
  const anios = [...new Set(meses.map((m) => m.anio))].sort((a, b) => b - a)
  const mesesDe = (anio) => meses.filter((m) => m.anio === anio).map((m) => m.mes).sort((a, b) => a - b)
  // Un año sin el mes elegido abre en su primer mes (Desde) o en el último (Hasta).
  function alCambiarAnio(anio) {
    const delAnio = mesesDe(anio)
    alCambiar({ anio, mes: delAnio.includes(valor.mes) ? valor.mes : primero ? delAnio[0] : delAnio.at(-1) })
  }
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium text-muted-foreground">{etiqueta}</legend>
      <div className="flex gap-2">
        <Selector
          nombre={`${nombre}-anio`}
          etiqueta={`Año ${etiqueta.toLowerCase()}`}
          valor={String(valor.anio)}
          alCambiar={(a) => alCambiarAnio(Number(a))}
          opciones={anios.map((a) => ({ valor: String(a), texto: String(a) }))}
          className="w-24"
        />
        <Selector
          nombre={`${nombre}-mes`}
          etiqueta={`Mes ${etiqueta.toLowerCase()}`}
          valor={String(valor.mes)}
          alCambiar={(m) => alCambiar({ anio: valor.anio, mes: Number(m) })}
          opciones={mesesDe(valor.anio).map((m) => ({ valor: String(m), texto: MESES[m - 1] }))}
          className="w-36"
        />
      </div>
    </fieldset>
  )
}

export default function BarraFiltrosInformes({ opciones, valores, alCambiar, alCambiarDdriss, alGenerar }) {
  const { ddriss, ddrissId, meses, vacunas, redes, municipios } = opciones
  const red = redes?.find((r) => r.id === valores.red) ?? null
  const delRecorte = red ? municipios.filter((m) => red.municipios.some((x) => x.id === m.id)) : municipios
  const elegidos = delRecorte.filter((m) => valores.municipios.includes(m.id))
  const ayuda = INFORMES.find((i) => i.valor === valores.informe)?.ayuda
  const conCampo = (texto, campo) => (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-muted-foreground">{texto}</span>
      {campo}
    </div>
  )

  return (
    // Dentro de un form, Radix agrega el <select> nativo de cada Select.
    <form
      role="search"
      aria-label="Filtros del informe"
      className="flex flex-col gap-4 rounded-lg border bg-card p-4"
      onSubmit={(evento) => {
        evento.preventDefault()
        alGenerar()
      }}
    >
      <div className="flex flex-wrap items-end gap-4">
        {ddriss && conCampo('DDRISS', (
          <Selector
            nombre="ddriss"
            etiqueta="DDRISS"
            placeholder="Elija la DDRISS"
            valor={ddrissId ? String(ddrissId) : undefined}
            alCambiar={(id) => alCambiarDdriss(Number(id))}
            opciones={ddriss.map((d) => ({ valor: String(d.id), texto: d.nombre }))}
            className="sm:w-56"
          />
        ))}
        {conCampo('Informe', (
          <Selector
            nombre="informe"
            etiqueta="Informe"
            valor={valores.informe}
            alCambiar={(informe) => alCambiar({ informe, nivel: nivelPermitido(informe, valores.nivel) })}
            opciones={INFORMES.map((i) => ({ valor: i.valor, texto: i.nombre }))}
            className="sm:w-80"
          />
        ))}
        <MesDelRango
          nombre="desde"
          etiqueta="Desde"
          meses={meses}
          valor={valores.desde}
          alCambiar={(desde) => alCambiar({ desde })}
          primero
        />
        <MesDelRango
          nombre="hasta"
          etiqueta="Hasta"
          meses={meses}
          valor={valores.hasta}
          alCambiar={(hasta) => alCambiar({ hasta })}
        />
      </div>
      {ayuda && <p className="-mt-2 text-sm text-muted-foreground">{ayuda}</p>}

      <div className="flex flex-wrap items-end gap-4">
        {conCampo('Nivel', (
          <Select name="nivel" value={valores.nivel} onValueChange={(nivel) => alCambiar({ nivel })}>
            <SelectTrigger aria-label="Nivel" className="w-full bg-card sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NIVELES.map((n) => (
                <SelectItem
                  key={n.valor}
                  value={n.valor}
                  disabled={nivelPermitido(valores.informe, n.valor) !== n.valor}
                >
                  {n.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
        {conCampo('Vacuna', (
          <SelectorConBusqueda
            etiqueta="Vacuna"
            valor={valores.vacuna ?? TODAS}
            alCambiar={(codigo) => alCambiar({ vacuna: codigo === TODAS ? null : codigo })}
            opciones={[
              { valor: TODAS, texto: 'Todas las vacunas', fija: true },
              ...vacunas.map((v) => ({ valor: v.codigo, texto: v.activa ? v.nombre : `${v.nombre} (inactiva)` })),
            ]}
            textoBuscar="Buscar vacuna…"
            textoVacio="Ninguna vacuna coincide."
            className="w-full sm:w-64"
          />
        ))}
        {redes && redes.length > 0 && conCampo('Red', (
          <Selector
            nombre="red"
            etiqueta="Red"
            valor={red ? String(red.id) : TODAS}
            alCambiar={(id) => alCambiar({ red: id === TODAS ? null : Number(id), municipios: [] })}
            opciones={[
              { valor: TODAS, texto: 'Todas las redes' },
              ...redes.map((r) => ({ valor: String(r.id), texto: r.nombre })),
            ]}
            className="sm:w-56"
          />
        ))}
        {delRecorte.length > 0 && conCampo('Municipios', (
          <MenuMunicipios
            municipios={delRecorte}
            elegidos={elegidos}
            alCambiar={(ids) => alCambiar({ municipios: ids, red: null })}
          />
        ))}
        <div className="flex items-center gap-2 pb-2">
          <Checkbox
            id="incluir-aprobados"
            checked={valores.aprobados}
            onCheckedChange={(marcado) => alCambiar({ aprobados: marcado === true })}
          />
          <Label htmlFor="incluir-aprobados" className="font-normal">Incluir aprobados sin cerrar</Label>
        </div>
        <Button type="submit" className="sm:ml-auto">Generar</Button>
      </div>
    </form>
  )
}
