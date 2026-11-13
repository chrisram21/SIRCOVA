import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { listarDdriss, listarRedes } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerInforme, obtenerOpcionesInformes } from '@/api/informes.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import PantallaCargaSesion, { usePrimeraCarga } from '@/componentes/PantallaCargaSesion.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import BarraFiltrosInformes from './BarraFiltrosInformes.jsx'
import {
  INFORMES, NIVELES, aTextoDeMes, avisoDeMeses, filtrosDeInforme, parametrosDeInforme, textoRango,
} from './informes.js'
import TablaInforme from './TablaInforme.jsx'

// SPEC 62 (HU-45): los informes de producción. Los filtros se editan en un borrador y solo «Generar» los pasa a la
// URL; el informe se pide cuando la URL trae informe, desde y hasta, así que recargar lo repite.

const CLASES_AVISO =
  'flex items-start gap-2 rounded-md bg-advertencia px-3 py-2 text-sm text-advertencia-foreground'

const id = (texto) => (/^[1-9]\d*$/.test(texto ?? '') ? Number(texto) : undefined)

function Esqueletos() {
  return (
    <div className="flex flex-col gap-2" aria-label="Cargando el informe">
      {[1, 2, 3].map((n) => (
        <Skeleton key={n} className="h-10 w-full" />
      ))}
    </div>
  )
}

export default function PaginaInformes() {
  const [parametros, setParametros] = useSearchParams()
  const sesion = useSesion()
  const usuario = sesion?.sesion?.usuario
  const puedeVerRedes = sesion?.tienePermiso('RED_CONSULTAR') ?? false
  const nacional = usuario?.rol === 'AUTORIDAD' && (usuario?.empleado?.ddrissId ?? null) === null

  const [ddriss, setDdriss] = useState(null)
  const [errorDdriss, setErrorDdriss] = useState(null)
  const [intentoDdriss, setIntentoDdriss] = useState(0)
  const [opciones, setOpciones] = useState(null)
  const [errorOpciones, setErrorOpciones] = useState(null)
  const [intentoOpciones, setIntentoOpciones] = useState(0)
  const [redes, setRedes] = useState(null)
  const [errorRedes, setErrorRedes] = useState(null)
  const [intentoRedes, setIntentoRedes] = useState(0)
  const [informe, setInforme] = useState(null)
  const [errorInforme, setErrorInforme] = useState(null)
  const [intentoInforme, setIntentoInforme] = useState(0)
  const [borrador, setBorrador] = useState(null)

  const ddrissId = nacional ? (id(parametros.get('ddriss')) ?? ddriss?.[0]?.id) : undefined
  const esperandoDdriss = nacional && ddrissId === undefined
  const sinDdriss = Boolean(errorDdriss) || ddriss?.length === 0

  useEffect(() => {
    if (!nacional) return undefined
    let vigente = true
    setErrorDdriss(null)
    listarDdriss()
      .then((recibidas) => vigente && setDdriss(recibidas))
      .catch((err) => vigente && setErrorDdriss(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [nacional, intentoDdriss])

  useEffect(() => {
    if (esperandoDdriss) return undefined
    let vigente = true
    setOpciones(null)
    setErrorOpciones(null)
    obtenerOpcionesInformes({ ddrissId })
      .then((recibidas) => vigente && setOpciones(recibidas))
      .catch((err) => vigente && setErrorOpciones(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [ddrissId, esperandoDdriss, intentoOpciones])

  useEffect(() => {
    if (!puedeVerRedes || esperandoDdriss) return undefined
    let vigente = true
    setRedes(null)
    setErrorRedes(null)
    listarRedes({ activo: true, ddrissId })
      .then((recibidas) => vigente && setRedes(recibidas))
      .catch((err) => vigente && setErrorRedes(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [puedeVerRedes, ddrissId, esperandoDdriss, intentoRedes])

  // Al cambiar la URL (Generar, recargar) o las opciones, el borrador vuelve a lo que dice la URL.
  const textoUrl = parametros.toString()
  useEffect(() => {
    setBorrador(null)
  }, [textoUrl, opciones])

  const deUrl = filtrosDeInforme(parametros, opciones)
  const valores = borrador ?? deUrl
  const opcionesRed = redes?.filter((r) => r.municipios.length > 0) ?? null
  // Una red de la URL espera a las redes para saber si existe; si no está, se ignora.
  const esperandoRedes = deUrl.red !== null && puedeVerRedes && redes === null && !errorRedes
  const redPedida = opcionesRed?.find((r) => r.id === deUrl.red)

  const pedido = opciones && deUrl.generado && deUrl.hasta && !esperandoRedes
    ? {
      informe: deUrl.informe,
      desde: aTextoDeMes(deUrl.desde),
      hasta: aTextoDeMes(deUrl.hasta),
      nivel: deUrl.nivel,
      vacuna: deUrl.vacuna ?? undefined,
      redId: redPedida?.id,
      municipioIds: deUrl.municipios,
      incluirAprobados: deUrl.aprobados,
      ddrissId,
    }
    : null
  const clave = pedido ? JSON.stringify(pedido) : null

  useEffect(() => {
    if (clave === null) {
      setInforme(null)
      return undefined
    }
    let vigente = true
    setInforme(null)
    setErrorInforme(null)
    obtenerInforme(JSON.parse(clave))
      .then((recibido) => vigente && setInforme(recibido))
      .catch((err) => vigente && setErrorInforme(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [clave, intentoInforme])

  const sinMeses = opciones?.meses.length === 0
  const primeraCarga = usePrimeraCarga(
    Boolean(sinDdriss || errorOpciones || sinMeses || (opciones && (clave === null || informe || errorInforme))),
    { conMinimo: true },
  )

  function generar() {
    setParametros(parametrosDeInforme({ ...valores, ddriss: nacional ? ddrissId : null }))
    setIntentoInforme((n) => n + 1)
  }

  const nombreDelInforme = informe && INFORMES.find((i) => i.valor === informe.informe)?.nombre
  const nombreDelNivel = informe && NIVELES.find((n) => n.valor === informe.nivel)?.nombre
  const aviso = informe ? avisoDeMeses(informe.mesesSinCerrar, informe.preliminar) : null

  return (
    <>
      {primeraCarga && <PantallaCargaSesion etiqueta="Cargando los informes" inmediata fondo="borroso" />}
      <section hidden={primeraCarga} className="flex flex-col gap-6 p-6 contain-inline-size">
        <EncabezadoPagina titulo="Informes" descripcion="La producción de la DDRISS por territorio, vacuna y dosis." />

        {errorDdriss && (
          <AvisoError onReintentar={() => setIntentoDdriss((n) => n + 1)}>
            No se pudieron cargar las DDRISS: {errorDdriss}
          </AvisoError>
        )}
        {errorOpciones && (
          <AvisoError onReintentar={() => setIntentoOpciones((n) => n + 1)}>
            No se pudieron cargar las opciones de los informes: {errorOpciones}
          </AvisoError>
        )}
        {errorRedes && (
          <AvisoError onReintentar={() => setIntentoRedes((n) => n + 1)}>
            No se pudieron cargar las redes: {errorRedes}
          </AvisoError>
        )}

        {sinMeses ? (
          <p className="text-muted-foreground">La DDRISS no tiene meses habilitados.</p>
        ) : (
          opciones && valores.hasta && (
            <BarraFiltrosInformes
              opciones={{
                ddriss: nacional ? ddriss : null,
                ddrissId,
                meses: opciones.meses,
                vacunas: opciones.vacunas,
                redes: opcionesRed,
                municipios: opciones.municipios,
              }}
              valores={valores}
              alCambiar={(cambios) => setBorrador({ ...valores, ...cambios })}
              alCambiarDdriss={(nuevo) => setParametros({ ddriss: String(nuevo) })}
              alGenerar={generar}
            />
          )
        )}

        {!sinMeses && opciones && (
          errorInforme ? (
            <AvisoError onReintentar={() => setIntentoInforme((n) => n + 1)}>
              No se pudo generar el informe: {errorInforme}
            </AvisoError>
          ) : clave === null ? (
            !esperandoRedes && (
              <p className="text-muted-foreground">Elige el informe y los filtros y pulsa «Generar».</p>
            )
          ) : informe === null ? (
            <Esqueletos />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-semibold">{nombreDelInforme} · {nombreDelNivel}</h2>
                  {informe.preliminar && (
                    <Badge variant="outline" className="border-advertencia-foreground text-advertencia-foreground">
                      Preliminar
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{textoRango(informe.desde, informe.hasta)}</p>
              </div>
              {aviso && (
                <p role="status" className={CLASES_AVISO}>
                  <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  {aviso}
                </p>
              )}
              <TablaInforme informe={informe} />
            </div>
          )
        )}
      </section>
    </>
  )
}
