import { TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js'
import BarrasHorizontales from './BarrasHorizontales.jsx'
import { barrasDeDesercion, filaDeReferencia } from './panelIndicadores.js'
import TarjetaGrafica, { colorDeBarra, porcentaje, SinDatos } from './TarjetaGrafica.jsx'

// SPEC 49: las 8 deserciones más altas de los municipios visibles, con su semáforo y la meta como umbral. El título
// es el nombre del indicador: el resultado solo trae la dosis final.

export default function GraficaDesercion({ indicador, filas, visibles, red, vacuna, referencia, preliminar, className }) {
  if (!indicador) {
    return (
      <TarjetaGrafica titulo="Deserción" className={className}>
        <SinDatos>La corrida no tiene un indicador de {TIPOS_INDICADOR.DESERCION.etiqueta.toLowerCase()} de {vacuna}.</SinDatos>
      </TarjetaGrafica>
    )
  }
  const titulo = indicador.nombre ?? indicador.codigo
  const barras = barrasDeDesercion(filas, visibles)
  const fila = filaDeReferencia(filas, visibles, red)
  const meta = fila?.meta ?? barras[0]?.meta ?? null
  const subtitulo = fila?.calculable ? `${referencia}: ${porcentaje(fila.valor)}` : referencia
  return (
    <TarjetaGrafica
      titulo={titulo}
      subtitulo={subtitulo}
      preliminar={preliminar && barras.length > 0}
      className={className}
    >
      {barras.length === 0 ? (
        <SinDatos>Ningún municipio visible tuvo primeras dosis.</SinDatos>
      ) : (
        <BarrasHorizontales
          etiqueta={titulo}
          formato={porcentaje}
          datos={barras.map((r) => ({ nombre: r.municipio.nombre, valor: r.valor, relleno: colorDeBarra(r.color) }))}
          referencia={meta == null ? null : { valor: meta, etiqueta: `Umbral ${porcentaje(meta)}` }}
        />
      )}
    </TarjetaGrafica>
  )
}
