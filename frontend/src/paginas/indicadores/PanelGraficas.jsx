import { useCallback, useEffect, useRef, useState } from 'react'
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerSerie } from '@/api/indicadores.js'
import GraficaAvanceProyeccion from './GraficaAvanceProyeccion.jsx'
import GraficaBrecha from './GraficaBrecha.jsx'
import GraficaDesercion from './GraficaDesercion.jsx'
import GraficaPorMunicipio from './GraficaPorMunicipio.jsx'
import GraficaPorVacuna from './GraficaPorVacuna.jsx'
import TarjetaComparacion from './TarjetaComparacion.jsx'
import {
  filaDeReferencia, filasDe, indicadoresDeLaVacuna, indicadoresDeLaVista, indicadoresDelPanel, puntosDeLinea,
} from './panelIndicadores.js'

// SPEC 49: el panel de gráficas de «Indicadores», sobre la tabla. Cada gráfica toma el indicador de su tipo de la
// vacuna elegida; solo la línea de avance pide algo más a la API (la serie del indicador base). SPEC 51: la tarjeta
// «Comparar periodos» comparte con la línea la serie del año de la corrida. SPEC 54: solo se dibujan las gráficas de
// la pestaña (vista); el panel sigue montado aunque la pestaña no tenga indicador, para conservar las series pedidas.
// SPEC 60: con red elegida, las barras toman «Total de la red»; la serie (línea y «Comparar periodos») no tiene
// versión por red, así que sigue con el total de la DDRISS, como con un distrito.

export default function PanelGraficas({
  corrida, indicadores, resultados, vacuna, vacunaNombre, vista, codigoElegido, visibles, red = null, ddrissId, comparacion,
}) {
  const panel = indicadoresDelPanel(indicadores, resultados, vacuna, codigoElegido)
  const hayIndicador = indicadoresDeLaVista(indicadoresDeLaVacuna(indicadores, resultados, vacuna), vista).length > 0
  const unSolo = visibles.length === 1 ? visibles[0] : null
  const referencia = unSolo ? unSolo.nombre : red ? 'Total de la red' : 'Total de la DDRISS'
  const referenciaDeSerie = unSolo ? unSolo.nombre : 'Total de la DDRISS'
  const base = panel.base?.codigo ?? null
  // La serie de la línea solo hace falta en «Proyección»; «Comparar periodos» pide las suyas.
  const baseDeLinea = vista === 'proyeccion' && hayIndicador ? base : null

  const [serie, setSerie] = useState(null)
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)

  // Una petición por serie distinta mientras no cambie la corrida; una que falla se olvida para poder reintentarla.
  const series = useRef(new Map())
  const pedirSerie = useCallback((consulta) => {
    const llave = JSON.stringify([corrida.id, consulta.anio, consulta.indicador, consulta.municipioId ?? null, consulta.ddrissId ?? null])
    if (!series.current.has(llave)) {
      series.current.set(llave, obtenerSerie(consulta).catch((err) => {
        series.current.delete(llave)
        throw err
      }))
    }
    return series.current.get(llave)
  }, [corrida.id])

  useEffect(() => {
    if (!baseDeLinea) return undefined
    let vigente = true
    setSerie(null)
    setError(null)
    pedirSerie({ anio: corrida.anio, indicador: baseDeLinea, municipioId: unSolo?.id, ddrissId })
      .then((recibida) => vigente && setSerie(recibida))
      .catch((err) => vigente && setError(mensajeDeError(err)))
    return () => {
      vigente = false
    }
    // La corrida cambia al calcular de nuevo; el municipio, al elegir uno solo.
  }, [corrida.id, corrida.anio, baseDeLinea, unSolo?.id, ddrissId, intento])

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

  if (!hayIndicador) return null
  const preliminar = corrida.parcial === true

  const porMunicipioYVacuna = (
    <div className="grid gap-4 lg:grid-cols-2">
      <GraficaPorMunicipio
        indicador={panel.cobertura}
        filas={filasCobertura}
        visibles={visibles}
        vacuna={vacunaNombre}
        preliminar={preliminar}
      />
      <GraficaPorVacuna
        tipo={panel.cobertura?.tipoCalculo ?? null}
        indicadores={indicadores}
        resultados={resultados}
        visibles={visibles}
        red={red}
        vacuna={vacuna}
        referencia={referencia}
        preliminar={preliminar}
      />
    </div>
  )

  return (
    <div className="flex flex-col gap-4" aria-label="Gráficas de los indicadores">
      {vista === 'avance' && porMunicipioYVacuna}
      {vista === 'cobertura' && (
        <>
          {porMunicipioYVacuna}
          <TarjetaComparacion
            corrida={corrida}
            base={panel.base}
            municipioId={unSolo?.id}
            referencia={referenciaDeSerie}
            vacunaNombre={vacunaNombre}
            ddrissId={ddrissId}
            pedirSerie={pedirSerie}
            {...comparacion}
          />
        </>
      )}
      {vista === 'brecha' && (
        <GraficaBrecha
          indicador={panel.brecha}
          filas={panel.brecha ? filasDe(resultados, panel.brecha.codigo) : []}
          visibles={visibles}
          vacuna={vacunaNombre}
          preliminar={preliminar}
        />
      )}
      {vista === 'desercion' && (
        <GraficaDesercion
          indicador={panel.desercion}
          filas={panel.desercion ? filasDe(resultados, panel.desercion.codigo) : []}
          visibles={visibles}
          red={red}
          vacuna={vacunaNombre}
          referencia={referencia}
          preliminar={preliminar}
        />
      )}
      {vista === 'proyeccion' && (
        <GraficaAvanceProyeccion
          linea={baseDeLinea ? linea : null}
          mesCorte={corrida.mesHasta}
          meta={metaDeLaLinea}
          referencia={referenciaDeSerie}
          vacuna={vacunaNombre}
          cargando={Boolean(baseDeLinea) && serie === null && error === null}
          error={error}
          onReintentar={() => setIntento((n) => n + 1)}
          preliminar={preliminar}
        />
      )}
    </div>
  )
}
