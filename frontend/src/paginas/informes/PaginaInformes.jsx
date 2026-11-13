import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FileSpreadsheet, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { listarDdriss, listarRedes } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { descargarInformeExcel, obtenerInforme, obtenerOpcionesInformes } from '@/api/informes.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import PantallaCargaSesion, { usePrimeraCarga } from '@/componentes/PantallaCargaSesion.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { Selector } from '@/paginas/indicadores/BarraFiltrosIndicadores.jsx'
import BarraFiltrosInformes from './BarraFiltrosInformes.jsx'
import {
  INFORMES, NIVELES, aTextoDeMes, agrupacionDeUrl, avisoDeAgrupacion, avisoDeMeses, conAgrupacion, filtrosDeInforme,
  parametrosDeInforme, textoRango,
} from './informes.js'
import TablaInforme from './TablaInforme.jsx'

// SPEC 62 (HU-45): los informes de producción. Los filtros se editan en un borrador y solo «Generar» los pasa a la
// URL; el informe se pide cuando la URL trae informe, desde y hasta, así que recargar lo repite.
// SPEC 63 (HU-46): «Agrupar por» cambia `agrupacion` en la URL y vuelve a pedir el informe sin tocar el borrador.
// SPEC 64 (HU-47): «Exportar Excel» pide el mismo informe de la URL (no el borrador) como .xlsx.

// Radix no acepta un valor vacío en un Select: la opción por defecto lleva este.
const POR_SECCION = 'seccion'

const CLASES_AVISO =
  'flex items-start gap-2 rounded-md bg-advertencia px-3 py-2 text-sm text-advertencia-foreground'

// El navegador guarda el archivo con un enlace temporal.
function guardarArchivo(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombre
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
  URL.revokeObjectURL(url)
}

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
  const [exportando, setExportando] = useState(false)
  const [errorExportar, setErrorExportar] = useState(null)

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

  // Al cambiar los filtros de la URL (Generar, recargar) o las opciones, el borrador vuelve a lo que dice la URL;
  // cambiar solo la agrupación no lo toca.
  const textoUrl = conAgrupacion(parametros, null).toString()
  useEffect(() => {
    setBorrador(null)
  }, [textoUrl, opciones])

  const deUrl = filtrosDeInforme(parametros, opciones)
  const agrupacion = agrupacionDeUrl(parametros, opciones)
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
      agrupacion: agrupacion ?? undefined,
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

  // Un error de exportación es de ese informe: otro informe no lo arrastra.
  useEffect(() => {
    setErrorExportar(null)
  }, [clave])

  const sinMeses = opciones?.meses.length === 0
  const primeraCarga = usePrimeraCarga(
    Boolean(sinDdriss || errorOpciones || sinMeses || (opciones && (clave === null || informe || errorInforme))),
    { conMinimo: true },
  )

  function generar() {
    setParametros(conAgrupacion(parametrosDeInforme({ ...valores, ddriss: nacional ? ddrissId : null }), agrupacion))
    setIntentoInforme((n) => n + 1)
  }

  async function exportar() {
    setExportando(true)
    setErrorExportar(null)
    try {
      const { blob, nombre } = await descargarInformeExcel(JSON.parse(clave))
      guardarArchivo(blob, nombre ?? 'informe.xlsx')
    } catch (err) {
      setErrorExportar(mensajeDeError(err))
    } finally {
      setExportando(false)
    }
  }

  function agrupar(valor) {
    setParametros(conAgrupacion(parametros, valor === POR_SECCION ? null : valor))
  }

  const nombreDelInforme = informe && INFORMES.find((i) => i.valor === informe.informe)?.nombre
  const nombreDelNivel = informe && NIVELES.find((n) => n.valor === informe.nivel)?.nombre
  const aviso = informe ? avisoDeMeses(informe.mesesSinCerrar, informe.preliminar) : null
  const avisoAgrupacion = informe ? avisoDeAgrupacion(informe, pedido?.vacuna === undefined) : null
  const sinColumnas = Boolean(informe?.agrupacion) && informe.columnas.length === 0

  const selectorAgrupacion = (
    <form className="flex flex-col gap-1 sm:w-56" onSubmit={(evento) => evento.preventDefault()}>
      <span className="text-xs font-medium text-muted-foreground">Agrupar por</span>
      <Selector
        nombre="agrupacion"
        etiqueta="Agrupar por"
        valor={agrupacion ?? POR_SECCION}
        alCambiar={agrupar}
        opciones={[
          { valor: POR_SECCION, texto: 'Sección del 5C' },
          ...(opciones?.dimensiones ?? []).map((d) => ({ valor: d.codigo, texto: d.nombre })),
        ]}
      />
    </form>
  )

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
          clave === null ? (
            errorInforme ? (
              <AvisoError onReintentar={() => setIntentoInforme((n) => n + 1)}>
                No se pudo generar el informe: {errorInforme}
              </AvisoError>
            ) : (
              !esperandoRedes && (
                <p className="text-muted-foreground">Elige el informe y los filtros y pulsa «Generar».</p>
              )
            )
          ) : (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                {informe && !errorInforme ? (
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold">
                        {nombreDelInforme} · {nombreDelNivel}
                        {informe.agrupacion && ` · por ${informe.agrupacion.nombre}`}
                      </h2>
                      {informe.preliminar && (
                        <Badge variant="outline" className="border-advertencia-foreground text-advertencia-foreground">
                          Preliminar
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{textoRango(informe.desde, informe.hasta)}</p>
                  </div>
                ) : (
                  <div />
                )}
                <div className="flex flex-wrap items-end gap-3">
                  {selectorAgrupacion}
                  {informe && !errorInforme && informe.columnas.length > 0 && (
                    <Button variant="outline" onClick={exportar} disabled={exportando}>
                      <FileSpreadsheet />
                      {exportando ? 'Exportando…' : 'Exportar Excel'}
                    </Button>
                  )}
                </div>
              </div>
              {errorInforme ? (
                <AvisoError onReintentar={() => setIntentoInforme((n) => n + 1)}>
                  No se pudo generar el informe: {errorInforme}
                </AvisoError>
              ) : informe === null ? (
                <Esqueletos />
              ) : (
                <>
                  {errorExportar && <AvisoError>No se pudo exportar el informe: {errorExportar}</AvisoError>}
                  {aviso && (
                    <p role="status" className={CLASES_AVISO}>
                      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                      {aviso}
                    </p>
                  )}
                  {avisoAgrupacion && (
                    <p role="status" className={cn('text-muted-foreground', !sinColumnas && 'text-sm')}>
                      {avisoAgrupacion}
                    </p>
                  )}
                  {!sinColumnas && <TablaInforme informe={informe} />}
                </>
              )}
            </div>
          )
        )}
      </section>
    </>
  )
}
