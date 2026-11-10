import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, Info, TriangleAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarDdriss, listarDistritos } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { listarCorridas, listarResultados, obtenerMesesCalculados } from '@/api/indicadores.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import PantallaCargaSesion, { usePrimeraCarga } from '@/componentes/PantallaCargaSesion.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { MESES, mesAnterior } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'
import BarraFiltrosIndicadores, { Selector } from './BarraFiltrosIndicadores.jsx'
import DialogoCalcularIndicadores, { avisoDeMesesSinCerrar } from './DialogoCalcularIndicadores.jsx'
import InsigniaCumple from './InsigniaCumple.jsx'
import InsigniaValor from './InsigniaValor.jsx'
import { AvisoMayorACien, MarcaMayorACien } from './MarcaMayorACien.jsx'
import PanelGraficas from './PanelGraficas.jsx'
import {
  filasDe,
  filasVisibles,
  indicadoresDeLaVacuna,
  indicadoresDeLaVista,
  municipiosDeLaCorrida,
  municipiosVisibles,
  vacunaElegida,
  vacunasDeLaCorrida,
  VISTAS,
  vistaDeTipo,
  vistaElegida,
  vistaPorDefecto,
} from './panelIndicadores.js'
import TablaBrecha from './TablaBrecha.jsx'
import TablaDesercion from './TablaDesercion.jsx'
import TablaProyeccion from './TablaProyeccion.jsx'

// SPEC 44: la corrida vigente de un mes, sus resultados por municipio y el historial de corridas del año. SPEC 45 a
// 47 agregan las tablas de brecha, deserción y proyección; SPEC 49, los filtros de vacuna, distrito y municipios; SPEC
// 51, los periodos de «Comparar periodos» (comparar, anios, meses), que valida comparacionPeriodos.js. SPEC 54, la
// pestaña (vista), que elige qué tipo de indicador se mira.

const ANIOS_HACIA_ATRAS = 6
const MOTIVOS = {
  MANUAL: 'Cálculo manual',
  CIERRE_PERIODO: 'Cierre del mes',
  RECTIFICACION: 'Rectificación',
  PROGRAMADA: 'Cálculo programado',
}
const ESTADOS_CORRIDA = { COMPLETADA: 'Completada', FALLIDA: 'Fallida', EN_PROCESO: 'En proceso' }

const formatoEntero = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 0 })
const formatoDecimal = new Intl.NumberFormat('es-GT', { maximumFractionDigits: 2 })
const formatoPorcentaje = new Intl.NumberFormat('es-GT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const dosCifras = (n) => String(n).padStart(2, '0')
// En la hora local del navegador.
export function aFechaHora(iso) {
  const f = new Date(iso)
  return `${dosCifras(f.getDate())}/${dosCifras(f.getMonth() + 1)}/${f.getFullYear()} ${dosCifras(f.getHours())}:${dosCifras(f.getMinutes())}`
}

const entero = (texto, minimo, maximo) =>
  /^\d+$/.test(texto ?? '') && Number(texto) >= minimo && Number(texto) <= maximo ? Number(texto) : undefined

// Por defecto, el mes anterior al actual: el último que puede estar cerrado.
export const mesPorDefecto = mesAnterior

const FORMATO_CODIGO = /^[A-Z0-9_]{1,40}$/
const codigo = (texto) => (FORMATO_CODIGO.test(texto ?? '') ? texto : undefined)
const id = (texto) => entero(texto, 1, Number.MAX_SAFE_INTEGER)
const lista = (texto) => (/^[\d,-]{1,80}$/.test(texto ?? '') ? texto : undefined)

export function filtrosDeUrl(parametros, hoy) {
  const porDefecto = mesPorDefecto(hoy)
  const municipios = (parametros.get('municipios') ?? '').split(',').map(id).filter((m) => m !== undefined)
  return {
    anio: entero(parametros.get('anio'), 2000, 2100) ?? porDefecto.anio,
    mes: entero(parametros.get('mes'), 1, 12) ?? porDefecto.mes,
    indicador: codigo(parametros.get('indicador')),
    vista: Object.hasOwn(VISTAS, parametros.get('vista') ?? '') ? parametros.get('vista') : undefined,
    ddriss: id(parametros.get('ddriss')),
    vacuna: codigo(parametros.get('vacuna')),
    distrito: id(parametros.get('distrito')),
    municipios: [...new Set(municipios)],
    comparar: parametros.get('comparar') === 'mes' ? 'mes' : undefined,
    anios: lista(parametros.get('anios')),
    meses: lista(parametros.get('meses')),
  }
}

function consultaDe(filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    const texto = Array.isArray(valor) ? valor.join(',') : valor
    if (texto !== undefined && texto !== null && texto !== '') consulta.set(nombre, String(texto))
  }
  return consulta
}

// El indicador que se ve, entre los de la pestaña: el de la URL si es de ella; si no, el primero.
export function indicadorElegido(deLaVista, codigo) {
  return deLaVista.find((i) => i.codigo === codigo) ?? deLaVista[0] ?? null
}


export function textoDosisQueFaltan({ brechaDosis, excedenteDosis }) {
  if (brechaDosis === null) return '—'
  if (brechaDosis === 0 && excedenteDosis > 0) return `0 (+${formatoEntero.format(excedenteDosis)} de excedente)`
  return formatoEntero.format(brechaDosis)
}

function TablaResultados({ resultados, tipoCalculo }) {
  const etiquetaValor = tipoCalculo === 'COBERTURA' ? 'Cobertura' : 'Avance'
  return (
    <div className="flex flex-col gap-2">
      <AvisoMayorACien resultados={resultados} />
      <div className="overflow-x-auto rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Municipio</TableHead>
              <TableHead className="text-right">Dosis acumuladas</TableHead>
              <TableHead className="text-right">{tipoCalculo === 'COBERTURA' ? 'Población' : 'Meta del mes'}</TableHead>
              <TableHead className="text-right">Dosis que faltan</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead className="text-right">{etiquetaValor}</TableHead>
              <TableHead>Cumple</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {resultados.map((r) => {
              const departamental = r.municipio === null
              return (
                <TableRow key={r.municipio?.id ?? 'ddriss'} className={cn(departamental && 'bg-muted/50 font-semibold')}>
                  <TableCell>{departamental ? 'Total de la DDRISS' : r.municipio.nombre}</TableCell>
                  <TableCell className="text-right font-mono">{formatoEntero.format(r.numerador ?? 0)}</TableCell>
                  <TableCell className="text-right font-mono">
                    {r.denominador === null ? '—' : formatoEntero.format(r.denominador)}
                  </TableCell>
                  <TableCell className="text-right font-mono">{textoDosisQueFaltan(r)}</TableCell>
                  <TableCell className="text-right font-mono">{r.meta === null ? '—' : `${formatoDecimal.format(r.meta)} %`}</TableCell>
                  <TableCell className="text-right">
                    <span className="inline-flex items-center justify-end gap-1.5">
                      <InsigniaValor resultado={r} />
                      {r.mayorACien && <MarcaMayorACien />}
                    </span>
                  </TableCell>
                  <TableCell><InsigniaCumple cumple={r.cumpleMeta} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

function Aviso({ children }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

function PestanasIndicadores({ vista, alCambiar }) {
  return (
    <Tabs value={vista} onValueChange={alCambiar} className="max-sm:w-full">
      {/* En el teléfono, tres arriba y dos abajo a todo el ancho: las cinco en una fila no caben en 390 px. */}
      <TabsList
        aria-label="Tipo de indicador"
        className="grid h-auto! w-full grid-cols-3 bg-accent sm:inline-flex sm:h-8! sm:w-fit"
      >
        {Object.entries(VISTAS).map(([codigo, { etiqueta }]) => (
          <TabsTrigger
            key={codigo}
            value={codigo}
            // aria-selected: las variantes data-active de shadcn tienen especificidad 0.
            className="px-3 text-accent-foreground hover:text-accent-foreground aria-selected:bg-pestana-activa aria-selected:text-pestana-activa-foreground"
          >
            {etiqueta}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

function TarjetaCorrida({ corrida }) {
  const aviso = corrida.parcial ? avisoDeMesesSinCerrar(corrida.mesesSinCerrar) : null
  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">
          Calculada el {aFechaHora(corrida.finalizadaEn ?? corrida.iniciadaEn)}
          {corrida.disparadaPor ? ` por ${corrida.disparadaPor.nombre}` : ''} · {MOTIVOS[corrida.motivo] ?? corrida.motivo}
        </p>
        {aviso && (
          <p role="status" className="flex items-start gap-2 rounded-md bg-advertencia px-3 py-2 text-sm text-advertencia-foreground">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Cálculo parcial. {aviso}
          </p>
        )}
        {corrida.omitidos.length > 0 && (
          <div className="text-sm text-muted-foreground">
            <p>No se calcularon:</p>
            <ul className="list-disc pl-5">
              {corrida.omitidos.map((o) => (
                <li key={o.codigo}>
                  <span className="font-mono">{o.codigo}</span>: {o.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HistorialCorridas({ corridas }) {
  const [abierto, setAbierto] = useState(false)
  return (
    <Collapsible open={abierto} onOpenChange={setAbierto} className="flex flex-col gap-3">
      <CollapsibleTrigger asChild>
        <Button variant="outline" className="self-start">
          Historial de corridas del año
          <ChevronDown className={cn('transition-transform', abierto && 'rotate-180')} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        {corridas.elementos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Este año todavía no tiene corridas.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Corte</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Quién</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {corridas.elementos.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>{aFechaHora(c.iniciadaEn)}</TableCell>
                    <TableCell>{MESES[c.mesHasta - 1]}</TableCell>
                    <TableCell>{MOTIVOS[c.motivo] ?? c.motivo}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Badge variant={c.estado === 'FALLIDA' ? 'destructive' : 'outline'}>{ESTADOS_CORRIDA[c.estado]}</Badge>
                        {c.vigente && <Badge>Vigente</Badge>}
                        {c.parcial && c.estado === 'COMPLETADA' && <Badge variant="secondary">Parcial</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>{c.disparadaPor?.nombre ?? 'Automático'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  )
}

export default function PaginaIndicadores({ hoy }) {
  const [parametros, setParametros] = useSearchParams()
  const sesion = useSesion()
  const usuario = sesion?.sesion?.usuario
  const puedeCalcular = sesion?.tienePermiso('INDICADOR_CALCULAR') ?? false
  const puedeVerDistritos = sesion?.tienePermiso('DISTRITO_CONSULTAR') ?? false
  const nacional = usuario?.rol === 'AUTORIDAD' && (usuario?.empleado?.ddrissId ?? null) === null

  const [ddriss, setDdriss] = useState(null)
  const [errorDdriss, setErrorDdriss] = useState(null)
  const [intentoDdriss, setIntentoDdriss] = useState(0)
  const [distritos, setDistritos] = useState(null)
  const [errorDistritos, setErrorDistritos] = useState(null)
  const [intentoDistritos, setIntentoDistritos] = useState(0)
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [calculando, setCalculando] = useState(false)
  const [calculados, setCalculados] = useState(null)
  const [errorCalculados, setErrorCalculados] = useState(null)
  const [intentoCalculados, setIntentoCalculados] = useState(0)

  const filtros = filtrosDeUrl(parametros, hoy)
  const ddrissId = nacional ? (filtros.ddriss ?? ddriss?.[0]?.id) : undefined
  const esperandoDdriss = nacional && ddrissId === undefined
  const clave = `${filtros.anio}-${filtros.mes}-${ddrissId ?? ''}`
  // La primera visita espera las DDRISS y los resultados; después, cada cambio usa sus esqueletos. Sin DDRISS (error
  // o lista vacía) no se pide nada más.
  const sinDdriss = errorDdriss || ddriss?.length === 0
  const primeraCarga = usePrimeraCarga(Boolean(sinDdriss || (!esperandoDdriss && (datos || errorCarga))))

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
    if (!puedeVerDistritos) return undefined
    let vigente = true
    setErrorDistritos(null)
    listarDistritos({ activo: true })
      .then((recibidos) => vigente && setDistritos(recibidos))
      .catch((err) => vigente && setErrorDistritos(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [puedeVerDistritos, intentoDistritos])

  useEffect(() => {
    if (esperandoDdriss) return undefined
    let vigente = true
    setDatos(null)
    setErrorCarga(null)
    Promise.all([
      listarResultados({ anio: filtros.anio, mes: filtros.mes, ddrissId }),
      listarCorridas({ anio: filtros.anio, ddrissId }),
    ])
      .then(([vigentes, corridas]) => vigente && setDatos({ ...vigentes, corridas }))
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
    // clave resume año, mes y DDRISS; intento cambia al recargar.
  }, [clave, intento, esperandoDdriss])

  // Los años y meses con corrida de la DDRISS; un cálculo nuevo (intento) puede agregar uno.
  useEffect(() => {
    if (esperandoDdriss) return undefined
    let vigente = true
    setCalculados(null)
    setErrorCalculados(null)
    obtenerMesesCalculados({ ddrissId })
      .then((recibidos) => vigente && setCalculados(recibidos))
      .catch((err) => vigente && setErrorCalculados(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [ddrissId, esperandoDdriss, intento, intentoCalculados])

  function calculado(corrida) {
    setCalculando(false)
    if (corrida.anio === filtros.anio && corrida.mesHasta === filtros.mes) setIntento((n) => n + 1)
    else irA({ anio: corrida.anio, mes: corrida.mesHasta })
  }

  const porDefecto = mesPorDefecto(hoy)
  const anios = [...new Set([
    ...Array.from({ length: ANIOS_HACIA_ATRAS + 1 }, (_, i) => porDefecto.anio - i),
    filtros.anio,
  ])].sort((a, b) => b - a)

  const corrida = datos?.corrida ?? null
  const todos = datos?.resultados ?? []
  const conResultados = corrida ? corrida.indicadores.filter((i) => todos.some((r) => r.indicadorCodigo === i.codigo)) : []
  const vacunas = vacunasDeLaCorrida(todos)
  const vacuna = vacunaElegida(conResultados, todos, filtros)
  const vacunaNombre = vacunas.find((v) => v.codigo === vacuna)?.nombre ?? vacuna
  const deLaVacuna = indicadoresDeLaVacuna(conResultados, todos, vacuna)
  const vista = vistaElegida(deLaVacuna, filtros)
  const deLaVista = indicadoresDeLaVista(deLaVacuna, vista)
  const indicador = indicadorElegido(deLaVista, filtros.indicador)

  // La pestaña se conserva al cambiar otros filtros; elegir un indicador lleva a la de su tipo. En la URL se omite la
  // pestaña por defecto de la vacuna de destino.
  function irA(cambios) {
    const destino = { ...filtros, vista, ...cambios }
    if (cambios.indicador && !Object.hasOwn(cambios, 'vista')) {
      destino.vista = vistaDeTipo(conResultados.find((i) => i.codigo === cambios.indicador)?.tipoCalculo) ?? vista
    }
    const deLaVacunaDestino = indicadoresDeLaVacuna(conResultados, todos, vacunaElegida(conResultados, todos, destino))
    if (destino.vista === vistaPorDefecto(deLaVacunaDestino)) destino.vista = undefined
    setParametros(consultaDe(destino))
  }

  // Solo los distritos cuyo municipio está en la corrida: así quedan los de la DDRISS.
  const municipiosCorrida = municipiosDeLaCorrida(todos)
  const opcionesDistrito = distritos?.filter((d) => municipiosCorrida.some((m) => m.id === d.municipioId)) ?? null
  const distrito = opcionesDistrito?.find((d) => d.id === filtros.distrito)
  const delDistrito = distrito ? [distrito.municipioId] : null
  const opcionesMunicipio = municipiosVisibles(municipiosCorrida, { delDistrito })
  const elegidos = opcionesMunicipio.filter((m) => filtros.municipios.includes(m.id))
  const visibles = municipiosVisibles(municipiosCorrida, { delDistrito, elegidos: filtros.municipios })

  const resultados = indicador ? filasVisibles(filasDe(todos, indicador.codigo), visibles) : []
  const muestra = resultados[0]
  const titulo = corrida && vacuna ? `${VISTAS[vista].etiqueta} de ${vacunaNombre}` : 'Indicadores'

  return (
    <>
      {primeraCarga && <PantallaCargaSesion etiqueta="Cargando indicadores" />}
      {/* contain-inline-size: una tabla ancha (la de proyección) se desplaza en su recuadro y no ensancha la página. */}
      <section hidden={primeraCarga} className="flex flex-col gap-6 p-6 contain-inline-size">
        <EncabezadoPagina
          antetitulo="Indicadores"
          titulo={titulo}
          descripcion={`Dosis acumuladas de enero a ${MESES[filtros.mes - 1]} de ${filtros.anio}, por municipio de residencia.`}
          acciones={puedeCalcular && !nacional && <Button onClick={() => setCalculando(true)}>Calcular indicadores</Button>}
        />

        {errorDdriss && (
          <AvisoError onReintentar={() => setIntentoDdriss((n) => n + 1)}>No se pudieron cargar las DDRISS: {errorDdriss}</AvisoError>
        )}

        {errorDistritos && (
          <AvisoError onReintentar={() => setIntentoDistritos((n) => n + 1)}>
            No se pudieron cargar los distritos: {errorDistritos}
          </AvisoError>
        )}

        <BarraFiltrosIndicadores
          filtros={filtros}
          anios={anios}
          ddriss={nacional ? ddriss : null}
          ddrissId={ddrissId}
          vacunas={vacunas}
          vacuna={vacuna}
          distritos={opcionesDistrito}
          municipios={opcionesMunicipio}
          elegidos={elegidos}
          irA={irA}
        />

        {errorCarga ? (
          <AvisoError onReintentar={() => setIntento((n) => n + 1)}>No se pudieron cargar los indicadores: {errorCarga}</AvisoError>
        ) : datos === null ? (
          !esperandoDdriss && (
            <div className="flex flex-col gap-2" aria-label="Cargando indicadores">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-10 w-full" />
              ))}
            </div>
          )
        ) : (
          <>
            {corrida === null ? (
              <p className="text-muted-foreground">Este mes todavía no tiene indicadores calculados.</p>
            ) : (
              <>
                <TarjetaCorrida corrida={corrida} />
                {conResultados.length === 0 ? (
                  <p className="text-muted-foreground">La corrida no tiene resultados de cobertura, avance, brecha, deserción ni proyección.</p>
                ) : (
                  <>
                    <PestanasIndicadores vista={vista} alCambiar={(nueva) => irA({ vista: nueva, indicador: undefined })} />
                    {indicador === null ? (
                      <Aviso>La corrida no tiene un indicador de {VISTAS[vista].nombreDelTipo} de {vacunaNombre}.</Aviso>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        {deLaVista.length > 1 && (
                          // Dentro de un form, Radix agrega el <select> nativo del Select.
                          <form onSubmit={(evento) => evento.preventDefault()} className="w-full sm:w-80">
                            <Selector
                              nombre="indicador"
                              etiqueta="Indicador"
                              valor={indicador.codigo}
                              alCambiar={(codigo) => irA({ indicador: codigo })}
                              opciones={deLaVista.map((i) => ({ valor: i.codigo, texto: i.nombre ?? i.codigo }))}
                            />
                          </form>
                        )}
                        <p className="text-sm text-muted-foreground">
                          <span className="font-mono">{indicador.codigo}</span> · {muestra.vacuna.nombre}
                          {muestra.dosis ? ` · ${muestra.dosis}` : ''} · versión {muestra.indicadorVersion}
                        </p>
                      </div>
                    )}
                    {/* Siempre en el mismo lugar, para que no se desmonte al pasar por una pestaña sin indicador. */}
                    <PanelGraficas
                      corrida={corrida}
                      indicadores={conResultados}
                      resultados={todos}
                      vacuna={vacuna}
                      vacunaNombre={vacunaNombre}
                      vista={vista}
                      codigoElegido={indicador?.codigo}
                      visibles={visibles}
                      ddrissId={ddrissId}
                      comparacion={{
                        calculados,
                        errorCalculados,
                        onReintentarCalculados: () => setIntentoCalculados((n) => n + 1),
                        filtros,
                        irA,
                      }}
                    />
                    {indicador?.tipoCalculo === 'BRECHA' ? (
                      <TablaBrecha resultados={resultados} />
                    ) : indicador?.tipoCalculo === 'DESERCION' ? (
                      <TablaDesercion resultados={resultados} />
                    ) : indicador?.tipoCalculo === 'PROYECCION' ? (
                      <TablaProyeccion resultados={resultados} />
                    ) : indicador ? (
                      <TablaResultados resultados={resultados} tipoCalculo={indicador.tipoCalculo} />
                    ) : null}
                  </>
                )}
              </>
            )}
            <HistorialCorridas corridas={datos.corridas} />
          </>
        )}

        {calculando && (
          <DialogoCalcularIndicadores
            anio={filtros.anio}
            mes={filtros.mes}
            alHecho={calculado}
            alCerrar={() => setCalculando(false)}
          />
        )}
      </section>
    </>
  )
}
