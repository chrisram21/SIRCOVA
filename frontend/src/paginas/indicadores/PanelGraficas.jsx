import { useEffect, useState } from 'react'
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerSerie } from '@/api/indicadores.js'
import GraficaAvanceProyeccion from './GraficaAvanceProyeccion.jsx'
import GraficaBrecha from './GraficaBrecha.jsx'
import GraficaDesercion from './GraficaDesercion.jsx'
import GraficaPorMunicipio from './GraficaPorMunicipio.jsx'
import GraficaPorVacuna from './GraficaPorVacuna.jsx'
import { filaDeReferencia, filasDe, indicadoresDelPanel, puntosDeLinea } from './panelIndicadores.js'

// SPEC 49: el panel de gráficas de «Indicadores», sobre la tabla. Cada gráfica toma el indicador de su tipo de la
// vacuna elegida; solo la línea de avance pide algo más a la API (la serie del indicador base).

export default function PanelGraficas({ corrida, indicadores, resultados, vacuna, vacunaNombre, codigoElegido, visibles, ddrissId }) {
  const panel = indicadoresDelPanel(indicadores, resultados, vacuna, codigoElegido)
  const unSolo = visibles.length === 1 ? visibles[0] : null
  const referencia = unSolo ? unSolo.nombre : 'Total de la DDRISS'
  const base = panel.base?.codigo ?? null

  const [serie, setSerie] = useState(null)
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!base) return undefined
    let vigente = true
    setSerie(null)
    setError(null)
    obtenerSerie({ anio: corrida.anio, indicador: base, municipioId: unSolo?.id, ddrissId })
      .then((recibida) => vigente && setSerie(recibida))
      .catch((err) => vigente && setError(mensajeDeError(err)))
    return () => {
      vigente = false
    }
    // La corrida cambia al calcular de nuevo; el municipio, al elegir uno solo.
  }, [corrida.id, corrida.anio, base, unSolo?.id, ddrissId, intento])

  const filaBase = base ? filaDeReferencia(filasDe(resultados, base), visibles) : null
  const filaProyeccion = panel.proyeccion ? filaDeReferencia(filasDe(resultados, panel.proyeccion.codigo), visibles) : null
  const linea = serie
    ? puntosDeLinea({
      puntos: serie.puntos,
      mesCorte: corrida.mesHasta,
      metaBase: filaBase?.meta ?? serie.puntos.at(-1)?.resultado.meta ?? null,
      filaProyeccion,
    })
    : null
  // La pregunta del título usa la meta de la proyección cuando la línea va contra la población anual.
  const metaDeLaLinea = linea?.[11]?.proyeccion != null ? filaProyeccion.meta : filaBase?.meta ?? null
  const filasCobertura = panel.cobertura ? filasDe(resultados, panel.cobertura.codigo) : []

  return (
    <div className="flex flex-col gap-4" aria-label="Gráficas de los indicadores">
      <div className="grid gap-4 lg:grid-cols-3">
        <GraficaAvanceProyeccion
          className="lg:col-span-2"
          linea={base ? linea : null}
          mesCorte={corrida.mesHasta}
          meta={metaDeLaLinea}
          referencia={referencia}
          vacuna={vacunaNombre}
          cargando={Boolean(base) && serie === null && error === null}
          error={error}
          onReintentar={() => setIntento((n) => n + 1)}
        />
        <GraficaPorVacuna
          tipo={panel.cobertura?.tipoCalculo ?? null}
          indicadores={indicadores}
          resultados={resultados}
          visibles={visibles}
          vacuna={vacuna}
          referencia={referencia}
        />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <GraficaPorMunicipio indicador={panel.cobertura} filas={filasCobertura} visibles={visibles} vacuna={vacunaNombre} />
        <div className="flex min-w-0 flex-col gap-4">
          <GraficaBrecha
            indicador={panel.brecha}
            filas={panel.brecha ? filasDe(resultados, panel.brecha.codigo) : []}
            visibles={visibles}
            vacuna={vacunaNombre}
          />
          <GraficaDesercion
            indicador={panel.desercion}
            filas={panel.desercion ? filasDe(resultados, panel.desercion.codigo) : []}
            visibles={visibles}
            vacuna={vacunaNombre}
            referencia={referencia}
          />
        </div>
      </div>
    </div>
  )
}
