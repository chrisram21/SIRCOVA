import { TIPOS_INDICADOR } from '../configuracion/tiposIndicador.js'
import BarrasHorizontales from './BarrasHorizontales.jsx'
import { barrasPorMunicipio } from './panelIndicadores.js'
import TarjetaGrafica, { colorDeBarra, COLOR_SEMAFORO, NombresSinPoblacion, porcentaje, SinDatos } from './TarjetaGrafica.jsx'

// SPEC 49: la cobertura (o el avance) de cada municipio visible, de mayor a menor, con su semáforo y la meta.

const FRANJAS = [['verde', 'Verde'], ['amarillo', 'Amarillo'], ['rojo', 'Rojo']]

export default function GraficaPorMunicipio({ indicador, filas, visibles, vacuna, preliminar, className }) {
  const nombreTipo = indicador?.tipoCalculo === 'COBERTURA' ? 'Cobertura' : 'Avance'
  const titulo = `${indicador ? nombreTipo : 'Cobertura'} por municipio`
  if (!indicador) {
    return (
      <TarjetaGrafica titulo={titulo} className={className}>
        <SinDatos>La corrida no tiene un indicador de {TIPOS_INDICADOR.COBERTURA.etiqueta.toLowerCase()} de {vacuna}.</SinDatos>
      </TarjetaGrafica>
    )
  }
  const { barras, sinPoblacion } = barrasPorMunicipio(filas, visibles)
  const meta = barras[0]?.meta ?? null
  const resumen = barras.length > 0
    ? `Mayor: ${barras[0].municipio.nombre} (${porcentaje(barras[0].valor)}). Menor: ${barras.at(-1).municipio.nombre} (${porcentaje(barras.at(-1).valor)}).`
    : null
  return (
    <TarjetaGrafica
      titulo={titulo}
      subtitulo={indicador.nombre ?? indicador.codigo}
      resumen={resumen}
      preliminar={preliminar && barras.length > 0}
      className={className}
    >
      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label="Franjas del semáforo">
        {FRANJAS.map(([color, nombre]) => (
          <li key={color} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: COLOR_SEMAFORO[color] }} aria-hidden="true" />
            {nombre}
          </li>
        ))}
      </ul>
      {barras.length === 0 ? (
        <SinDatos>Ningún municipio visible tiene población registrada.</SinDatos>
      ) : (
        <BarrasHorizontales
          etiqueta={titulo}
          formato={porcentaje}
          datos={barras.map((r) => ({ nombre: r.municipio.nombre, valor: r.valor, relleno: colorDeBarra(r.color) }))}
          referencia={meta == null ? null : { valor: meta, etiqueta: `Meta ${porcentaje(meta)}` }}
        />
      )}
      <NombresSinPoblacion nombres={sinPoblacion} />
    </TarjetaGrafica>
  )
}
