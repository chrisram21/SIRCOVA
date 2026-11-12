import { useState } from 'react'
import { Selector } from './BarraFiltrosIndicadores.jsx'
import BarrasHorizontales from './BarrasHorizontales.jsx'
import GraficaPorMunicipio from './GraficaPorMunicipio.jsx'
import { filasDe } from './panelIndicadores.js'
import { filasDeLaRed } from './tablaRed.js'
import TarjetaGrafica, { colorDeBarra, porcentaje, SinDatos } from './TarjetaGrafica.jsx'

// SPEC 60: las gráficas de la pestaña «Redes»: el total de la red de cada trazadora contra la meta, y los municipios
// de la red en la trazadora elegida (la elección no va en la URL).

function TrazadorasContraMeta({ red, columnas, resultados, preliminar }) {
  const titulo = 'Trazadoras de la red contra la meta'
  const { total } = filasDeLaRed(red, columnas, resultados)
  const barras = columnas
    .map((c, i) => ({ columna: c, fila: total[i] }))
    .filter(({ fila }) => fila?.calculable)
  const metas = [...new Set(barras.map(({ fila }) => fila.meta))]
  const meta = metas.length === 1 ? metas[0] : null
  return (
    <TarjetaGrafica
      titulo={titulo}
      subtitulo={`Total de la ${red.nombre}${meta == null ? '' : ` · meta ${porcentaje(meta)}`}`}
      preliminar={preliminar && barras.length > 0}
    >
      {barras.length === 0 ? (
        <SinDatos>Ninguna trazadora de la red tiene cobertura anual calculada.</SinDatos>
      ) : (
        <BarrasHorizontales
          etiqueta={titulo}
          formato={porcentaje}
          anchoNombres={90}
          datos={barras.map(({ columna, fila }) => ({
            nombre: columna.etiqueta, valor: fila.valor, relleno: colorDeBarra(fila.color),
          }))}
          referencia={meta == null ? null : { valor: meta, etiqueta: `Meta ${porcentaje(meta)}` }}
        />
      )}
    </TarjetaGrafica>
  )
}

export default function GraficasRed({ red, columnas, resultados, preliminar }) {
  const conIndicador = columnas.filter((c) => c.indicador)
  const [elegida, setElegida] = useState(null)
  const columna = conIndicador.find((c) => c.clave === elegida) ?? conIndicador[0] ?? null

  return (
    <div className="grid gap-4 lg:grid-cols-2" aria-label="Gráficas de la red">
      <TrazadorasContraMeta red={red} columnas={columnas} resultados={resultados} preliminar={preliminar} />
      <div className="flex min-w-0 flex-col gap-3">
        {conIndicador.length > 1 && (
          // Dentro de un form, Radix agrega el <select> nativo del Select.
          <form onSubmit={(evento) => evento.preventDefault()} className="w-full sm:w-56">
            <Selector
              nombre="trazadora"
              etiqueta="Trazadora"
              valor={columna.clave}
              alCambiar={setElegida}
              opciones={conIndicador.map((c) => ({ valor: c.clave, texto: c.etiqueta }))}
            />
          </form>
        )}
        <GraficaPorMunicipio
          indicador={columna?.indicador ?? null}
          filas={columna ? filasDe(resultados, columna.indicador.codigo) : []}
          visibles={red.municipios}
          vacuna="las trazadoras de la red"
          preliminar={preliminar}
        />
      </div>
    </div>
  )
}
