import { useEffect, useState } from 'react'
import { TriangleAlert } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerOpcionesProduccion, obtenerProduccion } from '@/api/indicadores.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import PantallaCargaSesion, { usePrimeraCarga } from '@/componentes/PantallaCargaSesion.jsx'
import { BarraFiltrosProduccion } from './BarraFiltrosIndicadores.jsx'
import GraficaProduccion from './GraficaProduccion.jsx'
import { establecimientosVisibles, filtrosDeProduccion, mesDeProduccion, textoPreliminar } from './produccion.js'
import TablaProduccion from './TablaProduccion.jsx'

// SPEC 61: la pestaña «Producción» de Indicadores. No depende de la corrida: carga sus opciones y la producción
// del rango. Comparte con las demás pestañas año, mes, DDRISS, red, distrito y municipios de la URL (filtros), y
// agrega agrupar, periodo, establecimientos y vacuna=todas, que cambia sin tocar lo demás.

const AYUDA = 'Dosis aplicadas por el municipio o establecimiento, sin importar la residencia de la persona. '
  + 'Incluye Migrantes.'

const CLASES_AVISO =
  'flex items-start gap-2 rounded-md bg-advertencia px-3 py-2 text-sm text-advertencia-foreground'

function Esqueletos({ etiqueta }) {
  return (
    <div className="flex flex-col gap-2" aria-label={etiqueta}>
      {[1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-10 w-full" />
      ))}
    </div>
  )
}

export default function PestanaProduccion({
  filtros,
  parametros,
  setParametros,
  ddriss,
  ddrissId,
  esperandoDdriss,
  sinDdriss,
  redes,
  esperandoRedes,
  pestanas,
  avisos,
}) {
  const [opciones, setOpciones] = useState(null)
  const [errorOpciones, setErrorOpciones] = useState(null)
  const [intentoOpciones, setIntentoOpciones] = useState(0)
  const [produccion, setProduccion] = useState(null)
  const [errorProduccion, setErrorProduccion] = useState(null)
  const [intentoProduccion, setIntentoProduccion] = useState(0)

  useEffect(() => {
    if (esperandoDdriss) return undefined
    let vigente = true
    setOpciones(null)
    setErrorOpciones(null)
    obtenerOpcionesProduccion({ ddrissId })
      .then((recibidas) => vigente && setOpciones(recibidas))
      .catch((err) => vigente && setErrorOpciones(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [ddrissId, esperandoDdriss, intentoOpciones])

  const deProduccion = filtrosDeProduccion(parametros, opciones)
  const periodo = opciones ? mesDeProduccion(opciones.meses, filtros) : null
  // La red manda sobre el distrito, como en las demás pestañas; dentro del recorte, los municipios elegidos.
  const red = redes?.find((r) => r.id === filtros.red) ?? null
  const distrito = red ? undefined : opciones?.distritos.find((d) => d.id === filtros.distrito)
  const recorte = red ? red.municipios.map((m) => m.id) : distrito ? [distrito.municipioId] : null
  const opcionesMunicipio = (opciones?.municipios ?? []).filter((m) => recorte === null || recorte.includes(m.id))
  const elegidos = red ? [] : opcionesMunicipio.filter((m) => filtros.municipios.includes(m.id))
  const visibles = elegidos.length > 0 ? elegidos.map((m) => m.id) : recorte
  const opcionesEstablecimiento = establecimientosVisibles(opciones?.establecimientos ?? [], visibles)
  const establecimiento = opcionesEstablecimiento.find((e) => deProduccion.establecimientos.includes(e.id)) ?? null

  const pedido = periodo && !esperandoRedes
    ? {
      anio: periodo.anio,
      mes: periodo.mes,
      acumulado: deProduccion.acumulado,
      agrupar: deProduccion.agrupar,
      vacuna: deProduccion.vacuna ?? undefined,
      distritoId: distrito?.id,
      redId: red?.id,
      municipioIds: elegidos.map((m) => m.id),
      establecimientoIds: establecimiento ? [establecimiento.id] : [],
      ddrissId,
    }
    : null
  const clave = pedido ? JSON.stringify(pedido) : null

  useEffect(() => {
    if (clave === null) return undefined
    let vigente = true
    setProduccion(null)
    setErrorProduccion(null)
    obtenerProduccion(JSON.parse(clave))
      .then((recibida) => vigente && setProduccion(recibida))
      .catch((err) => vigente && setErrorProduccion(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [clave, intentoProduccion])

  const sinMeses = opciones?.meses.length === 0
  const primeraCarga = usePrimeraCarga(
    Boolean(sinDdriss || errorOpciones || sinMeses || produccion || errorProduccion),
    { conMinimo: true },
  )

  // Cambia solo lo pedido y conserva el resto de la URL (vacuna=todas incluida).
  function irA(cambios) {
    const siguiente = new URLSearchParams(parametros)
    for (const [nombre, valor] of Object.entries(cambios)) {
      const texto = Array.isArray(valor) ? valor.join(',') : valor
      if (texto === undefined || texto === null || texto === '') siguiente.delete(nombre)
      else siguiente.set(nombre, String(texto))
    }
    setParametros(siguiente)
  }

  const anios = [...new Set((opciones?.meses ?? []).map((m) => m.anio))].sort((a, b) => b - a)
  const mesesDe = (anio) =>
    (opciones?.meses ?? []).filter((m) => m.anio === anio).map((m) => m.mes).sort((a, b) => a - b)
  // Un año sin el mes elegido abre en su mes más reciente.
  function alCambiarAnio(anio) {
    const meses = mesesDe(anio)
    irA({ anio, mes: meses.includes(periodo?.mes) ? periodo.mes : meses.at(-1) })
  }

  const vacunaNombre = opciones?.vacunas.find((v) => v.codigo === deProduccion.vacuna)?.nombre
  const titulo = deProduccion.vacuna ? `Producción de ${vacunaNombre}` : 'Producción de todas las vacunas'
  const aviso = produccion ? textoPreliminar(produccion.mesesSinCerrar) : null

  return (
    <>
      {primeraCarga && <PantallaCargaSesion etiqueta="Cargando la producción" inmediata fondo="borroso" />}
      <section hidden={primeraCarga} className="flex flex-col gap-6 p-6 contain-inline-size">
        <EncabezadoPagina antetitulo="Indicadores" titulo={titulo} descripcion={AYUDA} />

        {avisos}

        {errorOpciones && (
          <AvisoError onReintentar={() => setIntentoOpciones((n) => n + 1)}>
            No se pudieron cargar las opciones de la producción: {errorOpciones}
          </AvisoError>
        )}

        {opciones && periodo && (
          <BarraFiltrosProduccion
            opciones={{
              ddriss,
              anios,
              meses: mesesDe(periodo.anio),
              vacunas: opciones.vacunas,
              redes,
              distritos: opciones.distritos,
              municipios: opcionesMunicipio,
              establecimientos: opcionesEstablecimiento,
            }}
            valores={{
              ddrissId,
              anio: periodo.anio,
              mes: periodo.mes,
              acumulado: deProduccion.acumulado,
              vacuna: deProduccion.vacuna,
              agrupar: deProduccion.agrupar,
              red: red?.id,
              distrito: distrito?.id,
              elegidos,
              establecimiento: establecimiento?.id,
            }}
            irA={irA}
            alCambiarAnio={alCambiarAnio}
            alCambiarDdriss={(id) => irA({
              ddriss: id, red: undefined, distrito: undefined, municipios: undefined, establecimientos: undefined,
            })}
          />
        )}

        {pestanas}

        {sinMeses ? (
          <p className="text-muted-foreground">La DDRISS no tiene meses habilitados.</p>
        ) : errorProduccion ? (
          <AvisoError onReintentar={() => setIntentoProduccion((n) => n + 1)}>
            No se pudo cargar la producción: {errorProduccion}
          </AvisoError>
        ) : produccion === null ? (
          !errorOpciones && !esperandoDdriss && <Esqueletos etiqueta="Cargando la producción" />
        ) : (
          <>
            {aviso && (
              <p role="status" className={CLASES_AVISO}>
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                {aviso}
              </p>
            )}
            <GraficaProduccion produccion={produccion} />
            <TablaProduccion produccion={produccion} />
          </>
        )}
      </section>
    </>
  )
}
