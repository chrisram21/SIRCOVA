import { TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js'
import BarrasHorizontales from './BarrasHorizontales.jsx'
import { barrasDeBrecha } from './panelIndicadores.js'
import TarjetaGrafica, { formatoEntero, SinDatos } from './TarjetaGrafica.jsx'

// SPEC 49: los 8 municipios visibles con más dosis por aplicar para la meta.

export default function GraficaBrecha({ indicador, filas, visibles, vacuna, className }) {
  if (!indicador) {
    return (
      <TarjetaGrafica titulo="Brecha a la meta" className={className}>
        <SinDatos>La corrida no tiene un indicador de {TIPOS_INDICADOR.BRECHA.etiqueta.toLowerCase()} de {vacuna}.</SinDatos>
      </TarjetaGrafica>
    )
  }
  const { barras, total } = barrasDeBrecha(filas, visibles)
  const titulo = `Brecha a la meta · ${formatoEntero.format(total)} dosis`
  return (
    <TarjetaGrafica
      titulo={titulo}
      subtitulo={`${indicador.nombre ?? indicador.codigo} · los municipios con más dosis por aplicar`}
      className={className}
    >
      {barras.length === 0 ? (
        <SinDatos>Ningún municipio tiene dosis por aplicar para la meta.</SinDatos>
      ) : (
        <BarrasHorizontales
          etiqueta={titulo}
          formato={(v) => formatoEntero.format(v)}
          datos={barras.map((r) => ({ nombre: r.municipio.nombre, valor: r.brechaDosis, relleno: 'var(--chart-4)' }))}
        />
      )}
    </TarjetaGrafica>
  )
}
