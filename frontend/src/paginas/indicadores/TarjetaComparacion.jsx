import { useEffect, useState } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { MESES } from '@/lib/fechas.js'
import {
  MINIMO_PERIODOS,
  MODOS,
  aniosNecesarios,
  conDatos,
  etiquetaDelMes,
  filasPorAnio,
  filasPorMes,
  leerPeriodos,
  puntosPorAnio,
  textoDeAnios,
  textoDeMeses,
  textoDelMotivo,
} from './comparacionPeriodos.js'
import GraficaComparacionAnios from './GraficaComparacionAnios.jsx'
import GraficaComparacionMeses from './GraficaComparacionMeses.jsx'
import SelectorPeriodos from './SelectorPeriodos.jsx'
import { TablaPorAnio, TablaPorMes } from './TablaComparacion.jsx'
import TarjetaGrafica, { SinDatos, formatoEntero, formatoPorcentaje } from './TarjetaGrafica.jsx'

// SPEC 51: compara la cobertura real del indicador de cobertura del panel (base) entre años, o lo vacunado entre
// meses, para la vacuna y la fila de referencia de los filtros. Pide una serie por año con pedirSerie, que comparte
// la petición con la línea de avance cuando coinciden.

const TITULO = 'Comparar periodos'
const AVISO_MINIMO = 'Elija al menos dos periodos con cálculo para comparar.'
const conSigno = (valor, formato) => `${valor > 0 ? '+' : valor < 0 ? '−' : ''}${formato.format(Math.abs(valor))}`

function resumenPorAnio(filas, anios) {
  const ultima = [...filas].reverse().find((f) => f.diferencia)
  if (!ultima) return null
  const presentes = anios.filter((a) => ultima.porAnio[a])
  const [primero, ultimo] = [presentes[0], presentes.at(-1)]
  const pp = conSigno(ultima.diferencia.pp, formatoPorcentaje)
  return `A ${MESES[ultima.mes - 1]}: ${ultimo} ${formatoPorcentaje.format(ultima.porAnio[ultimo].porcentaje)} % contra `
    + `${primero} ${formatoPorcentaje.format(ultima.porAnio[primero].porcentaje)} % (${pp} pp).`
}

function resumenPorMes(filas) {
  const conValor = filas.filter((f) => f.motivo === null)
  if (conValor.length < 2) return null
  const [primero, ultimo] = [conValor[0], conValor.at(-1)]
  return `${etiquetaDelMes(ultimo)}: ${formatoEntero.format(ultimo.dosis)} dosis contra ${etiquetaDelMes(primero)}: `
    + `${formatoEntero.format(primero.dosis)} (${conSigno(ultimo.dosis - primero.dosis, formatoEntero)} dosis).`
}

export default function TarjetaComparacion({
  corrida, base, municipioId, referencia, vacunaNombre, ddrissId, calculados, errorCalculados, onReintentarCalculados,
  filtros, irA, pedirSerie,
}) {
  const periodos = calculados
    ? leerPeriodos(filtros, calculados.anios, { anio: corrida.anio, mes: corrida.mesHasta })
    : null
  const necesarios = periodos ? aniosNecesarios(periodos) : []
  const codigo = base?.codigo ?? null
  const clave = `${necesarios.join(',')}|${codigo}|${municipioId ?? ''}|${ddrissId ?? ''}|${corrida.id}`

  const [cargadas, setCargadas] = useState(null)
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    if (!codigo || !calculados) return undefined
    let vigente = true
    setCargadas(null)
    setError(null)
    Promise.all(necesarios.map((anio) => pedirSerie({ anio, indicador: codigo, municipioId, ddrissId })))
      .then((series) => vigente && setCargadas({ clave, series: new Map(series.map((s, i) => [necesarios[i], s.puntos])) }))
      .catch((err) => vigente && setError(mensajeDeError(err)))
    return () => {
      vigente = false
    }
    // clave resume los años, el indicador, el municipio, la DDRISS y la corrida.
  }, [clave, calculados, intento])

  const subtitulo = `${vacunaNombre} · ${referencia}`
  let contenido
  if (errorCalculados) {
    contenido = (
      <AvisoError onReintentar={onReintentarCalculados}>No se pudieron cargar los periodos calculados: {errorCalculados}</AvisoError>
    )
  } else if (!codigo) {
    contenido = <SinDatos>La corrida no tiene un indicador de cobertura de {vacunaNombre}.</SinDatos>
  } else if (error) {
    contenido = <AvisoError onReintentar={() => setIntento((n) => n + 1)}>No se pudo cargar la comparación: {error}</AvisoError>
  } else if (!periodos || cargadas?.clave !== clave) {
    contenido = <Skeleton className="h-64 w-full" aria-label="Cargando la comparación" />
  } else {
    contenido = (
      <Comparacion
        periodos={periodos}
        series={cargadas.series}
        codigo={codigo}
        corte={{ anio: corrida.anio, mes: corrida.mesHasta }}
      />
    )
  }

  const controles = periodos && codigo && !errorCalculados && (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Tabs value={periodos.modo} onValueChange={(modo) => irA({ comparar: modo === 'mes' ? 'mes' : undefined })}>
        <TabsList aria-label="Comparar por">
          {Object.entries(MODOS).map(([valor, texto]) => <TabsTrigger key={valor} value={valor}>{texto}</TabsTrigger>)}
        </TabsList>
      </Tabs>
      <SelectorPeriodos
        modo={periodos.modo}
        calculados={calculados.anios}
        anios={periodos.anios}
        meses={periodos.meses}
        alCambiarAnios={(anios) => irA({ anios: anios.length > 0 ? textoDeAnios([...anios].sort((a, b) => a - b)) : undefined })}
        alCambiarMeses={(meses) => irA({ meses: meses.length > 0 ? textoDeMeses(meses) : undefined })}
      />
    </div>
  )

  return (
    <TarjetaGrafica titulo={TITULO} subtitulo={subtitulo}>
      {controles}
      {contenido}
    </TarjetaGrafica>
  )
}

function Avisos({ textos }) {
  if (textos.length === 0) return null
  return (
    <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
      {textos.map((t) => <li key={t}>{t}</li>)}
    </ul>
  )
}

function Comparacion({ periodos, series, codigo, corte }) {
  if (periodos.modo === 'anio') {
    const lineas = puntosPorAnio(series, periodos.anios, corte)
    const motivos = lineas.filter((l) => l.motivo).map((l) => textoDelMotivo(l.motivo, { codigo, anio: l.anio }))
    const validas = lineas.filter((l) => l.motivo === null)
    const avisos = conDatos(lineas) < MINIMO_PERIODOS ? [...motivos, AVISO_MINIMO] : motivos
    if (validas.length === 0) return <Avisos textos={avisos} />
    const filas = filasPorAnio(lineas)
    const anios = validas.map((l) => l.anio)
    const resumen = resumenPorAnio(filas, anios)
    return (
      <>
        {resumen && <p className="text-sm">{resumen}</p>}
        <Avisos textos={avisos} />
        <GraficaComparacionAnios lineas={validas} titulo="Cobertura real acumulada por año" />
        <TablaPorAnio filas={filas} anios={anios} />
      </>
    )
  }
  const filas = filasPorMes(series, periodos.meses)
  const avisos = conDatos(filas) < MINIMO_PERIODOS ? [AVISO_MINIMO] : []
  if (conDatos(filas) === 0) return <Avisos textos={avisos} />
  const resumen = resumenPorMes(filas)
  return (
    <>
      {resumen && <p className="text-sm">{resumen}</p>}
      <Avisos textos={avisos} />
      <GraficaComparacionMeses filas={filas} titulo="Vacunado en cada mes" />
      <TablaPorMes filas={filas} codigo={codigo} />
    </>
  )
}
