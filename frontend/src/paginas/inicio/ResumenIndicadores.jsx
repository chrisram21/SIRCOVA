import { Badge } from '@/components/ui/badge'
import { MESES } from '@/lib/fechas.js'
import InsigniaValor from '@/paginas/indicadores/InsigniaValor.jsx'
import { indicadorDelTipo, menorAvance, municipiosEnMeta, puntosContraMeta } from './indicadoresDelInicio.js'
import TarjetaResumen, { Cifra } from './TarjetaResumen.jsx'

// SPEC 48: las tarjetas de indicadores del Inicio. consulta es un useConsulta que da { indicadores }, donde
// indicadores es lo de cargarIndicadoresDelInicio (null si no hay corrida).

const unDecimal = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const hastaUnDecimal = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 1 })
const porcentaje = (valor) => `${unDecimal.format(valor)} %`
const meta = (valor) => `${hastaUnDecimal.format(valor)} %`
const dosCifras = (n) => String(n).padStart(2, '0')
// En la hora local del navegador, como «Indicadores».
const aFecha = (iso) => {
  const f = new Date(iso)
  return `${dosCifras(f.getDate())}/${dosCifras(f.getMonth() + 1)}/${f.getFullYear()}`
}

function SinIndicadores() {
  return <p className="text-sm text-muted-foreground">Todavía no hay indicadores calculados.</p>
}

function textoContraMeta(fila) {
  const puntos = puntosContraMeta(fila)
  if (puntos === null) return null
  const deLaMeta = meta(fila.meta)
  if (Math.abs(puntos) < 0.05) return `En la meta del mes de ${deLaMeta}`
  return `${unDecimal.format(Math.abs(puntos))} puntos ${puntos < 0 ? 'bajo' : 'sobre'} la meta del mes de ${deLaMeta}`
}

// El avance departamental del primer AVANCE_META_MES, con su semáforo y la distancia a la meta.
function AvanceDepartamental({ indicadores }) {
  const avance = indicadorDelTipo(indicadores, 'AVANCE_META_MES')
  if (!avance) return <SinIndicadores />
  const fila = avance.departamental
  return (
    <div className="flex flex-col gap-2">
      {fila?.calculable ? (
        <>
          <InsigniaValor resultado={fila} className="self-start px-2.5 py-1 text-2xl" />
          <p className="text-sm text-muted-foreground">{textoContraMeta(fila)}</p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Sin población registrada.</p>
      )}
      {avance.indicador.nombre && <p className="text-xs text-muted-foreground">{avance.indicador.nombre}</p>}
    </div>
  )
}

function textoMunicipios({ conBrecha, sinPoblacion }) {
  return [
    `${conBrecha} ${conBrecha === 1 ? 'municipio' : 'municipios'} con brecha`,
    sinPoblacion > 0 && `${sinPoblacion} sin población`,
  ]
    .filter(Boolean)
    .join(' · ')
}

export function TarjetaCobertura({ titulo, tono, consulta, enlace }) {
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta} enlace={enlace}>
      {({ indicadores }) => <AvanceDepartamental indicadores={indicadores} />}
    </TarjetaResumen>
  )
}

export function TarjetaMunicipiosEnMeta({ titulo, tono, consulta, enlace }) {
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta} enlace={enlace}>
      {({ indicadores }) => {
        const avance = indicadorDelTipo(indicadores, 'AVANCE_META_MES')
        if (!avance) return <SinIndicadores />
        const conteo = municipiosEnMeta(avance.municipios)
        return (
          <Cifra valor={conteo.enMeta} de={conteo.total}>
            {textoMunicipios(conteo)}
          </Cifra>
        )
      }}
    </TarjetaResumen>
  )
}

// Autoridad: el avance departamental y, debajo, los municipios en meta.
export function TarjetaIndicadoresClave({ titulo, tono, consulta, enlace }) {
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta} enlace={enlace}>
      {({ indicadores }) => {
        const avance = indicadorDelTipo(indicadores, 'AVANCE_META_MES')
        if (!avance) return <SinIndicadores />
        const { enMeta, total } = municipiosEnMeta(avance.municipios)
        return (
          <div className="flex flex-col gap-3">
            <AvanceDepartamental indicadores={indicadores} />
            <p className="text-sm">
              <span className="font-mono font-medium">{enMeta}</span> de {total} municipios en meta
            </p>
          </div>
        )
      }}
    </TarjetaResumen>
  )
}

// Autoridad: el avance de hoy y la cobertura estimada a diciembre del primer PROYECCION.
export function TarjetaProyeccion({ titulo, tono, consulta, enlace }) {
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta} enlace={enlace}>
      {({ indicadores }) => {
        const avance = indicadorDelTipo(indicadores, 'AVANCE_META_MES')
        const proyeccion = indicadorDelTipo(indicadores, 'PROYECCION')?.departamental
        if (!avance && !proyeccion) return <SinIndicadores />
        return (
          <dl className="flex flex-col gap-3 text-sm">
            {avance && (
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Avance actual</dt>
                <dd>
                  <InsigniaValor resultado={avance.departamental ?? { calculable: false }} />
                </dd>
              </div>
            )}
            {proyeccion && (
              <div className="flex flex-col gap-1">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  Proyección a diciembre <Badge variant="secondary">Estimación</Badge>
                </dt>
                {proyeccion.calculable && proyeccion.valor !== null ? (
                  <dd className="flex flex-col gap-0.5">
                    <span className="font-mono text-xl font-medium">{porcentaje(proyeccion.valor)}</span>
                    <span className="text-muted-foreground">
                      {proyeccion.cumpleMeta ? 'Llega' : 'No llega'} a la meta de {meta(proyeccion.meta)}
                    </span>
                  </dd>
                ) : (
                  <dd className="text-muted-foreground">Sin datos suficientes para estimar.</dd>
                )}
              </div>
            )}
          </dl>
        )
      }}
    </TarjetaResumen>
  )
}

// Autoridad: los 5 municipios de menor avance.
export function TarjetaRanking({ titulo, tono, consulta, enlace }) {
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta} enlace={enlace}>
      {({ indicadores }) => {
        const avance = indicadorDelTipo(indicadores, 'AVANCE_META_MES')
        if (!avance) return <SinIndicadores />
        const ultimos = menorAvance(avance.municipios)
        if (ultimos.length === 0) return <p className="text-sm text-muted-foreground">Ningún municipio tiene población registrada.</p>
        return (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">Menor avance</p>
            <ol aria-label="Municipios de menor avance" className="flex flex-col gap-1.5 text-sm">
              {ultimos.map((fila) => (
                <li key={fila.municipio.id} className="flex items-center justify-between gap-2">
                  <span>{fila.municipio.nombre}</span>
                  <InsigniaValor resultado={fila} />
                </li>
              ))}
            </ol>
          </div>
        )
      }}
    </TarjetaResumen>
  )
}

// La línea sobre las tarjetas: el mes de corte, la fecha del cálculo, si es parcial y, si viene, la DDRISS.
export function LineaDeCorte({ consulta, children }) {
  const datos = consulta.datos?.indicadores
  if (!datos && !children) return null
  const partes = [
    children,
    datos && `Datos con corte a ${MESES[datos.mes - 1]} de ${datos.anio}`,
    datos?.corrida.finalizadaEn && `calculado ${aFecha(datos.corrida.finalizadaEn)}`,
  ].filter(Boolean)
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <p>{partes.join(' · ')}</p>
      {datos?.corrida.parcial && <Badge variant="secondary">Parcial</Badge>}
    </div>
  )
}

// El enlace a «Indicadores» con el mes del resumen (y la DDRISS de la Autoridad nacional).
export function enlaceAIndicadores(consulta, ddrissId) {
  const datos = consulta.datos?.indicadores
  if (!datos) return undefined
  const busqueda = new URLSearchParams({ anio: String(datos.anio), mes: String(datos.mes) })
  if (ddrissId) busqueda.set('ddriss', String(ddrissId))
  return { a: `/indicadores?${busqueda}`, texto: 'Ver indicadores' }
}
