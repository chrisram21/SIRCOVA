import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Info, MapPinOff } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { listarDdriss } from '@/api/catalogos.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { cargarLimites } from '@/api/geo.js'
import { listarResultados } from '@/api/indicadores.js'
import { obtenerAvance } from '@/api/revision.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import PantallaCargaSesion, { usePrimeraCarga } from '@/componentes/PantallaCargaSesion.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { MESES, mesAnterior } from '@/lib/fechas.js'
import { TIPOS_INDICADOR } from '@/paginas/configuracion/tiposIndicador.js'
import MarcaPreliminar from '@/paginas/indicadores/MarcaPreliminar.jsx'
import { filasDe, vacunasDeLaCorrida, vistaDeTipo } from '@/paginas/indicadores/panelIndicadores.js'
import BarraFiltrosMapa from './BarraFiltrosMapa.jsx'
import ClasificacionMunicipios from './ClasificacionMunicipios.jsx'
import LeyendaMapa from './LeyendaMapa.jsx'
import {
  archivoDeLimites,
  filaDeLaDdriss,
  filasDelMapa,
  indicadorDelModo,
  MODO_POR_DEFECTO,
  MODOS,
  rotulosDeLeyenda,
  vacunaDelMapa,
} from './mapaTerritorial.js'
import PanelMunicipio from './PanelMunicipio.jsx'

// Leaflet solo se descarga cuando hay límites que dibujar.
const MapaMunicipios = lazy(() => import('./MapaMunicipios.jsx'))

// SPEC 50: los municipios de la DDRISS coloreados por Cobertura, Brecha, Deserción o Estado del reporte, con la
// clasificación y el panel del municipio elegido. Los filtros y el municipio van en la URL.

const ANIOS_HACIA_ATRAS = 6
const TIPO_DEL_MODO = { cobertura: 'cobertura', brecha: 'brecha de dosis', desercion: 'deserción entre dosis' }

const entero = (texto, minimo, maximo) =>
  /^\d+$/.test(texto ?? '') && Number(texto) >= minimo && Number(texto) <= maximo ? Number(texto) : undefined
const id = (texto) => entero(texto, 1, Number.MAX_SAFE_INTEGER)
const FORMATO_CODIGO = /^[A-Z0-9_]{1,40}$/

export function filtrosDelMapa(parametros, hoy) {
  const porDefecto = mesAnterior(hoy)
  const modo = parametros.get('modo')
  const vacuna = parametros.get('vacuna')
  return {
    anio: entero(parametros.get('anio'), 2000, 2100) ?? porDefecto.anio,
    mes: entero(parametros.get('mes'), 1, 12) ?? porDefecto.mes,
    ddriss: id(parametros.get('ddriss')),
    vacuna: FORMATO_CODIGO.test(vacuna ?? '') ? vacuna : undefined,
    modo: Object.hasOwn(MODOS, modo ?? '') ? modo : MODO_POR_DEFECTO,
    municipio: id(parametros.get('municipio')),
  }
}

function consultaDe(filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (nombre === 'modo' && valor === MODO_POR_DEFECTO) continue
    if (valor !== undefined && valor !== null && valor !== '') consulta.set(nombre, String(valor))
  }
  return consulta
}

// Una consulta con su estado: { datos, error, reintentar }. Sin `activa` no pide nada.
function useCarga(cargar, dependencias, activa = true) {
  const [estado, setEstado] = useState({ datos: null, error: null })
  const [intento, setIntento] = useState(0)
  useEffect(() => {
    if (!activa) return undefined
    let vigente = true
    setEstado({ datos: null, error: null })
    cargar()
      .then((datos) => vigente && setEstado({ datos, error: null }))
      .catch((err) => vigente && setEstado({ datos: null, error: err }))
    return () => {
      vigente = false
    }
    // Las dependencias las da quien llama; intento cambia con «Reintentar».
  }, [...dependencias, intento, activa])
  return { ...estado, reintentar: () => setIntento((n) => n + 1) }
}

function Aviso({ icono: Icono = Info, children }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-sm text-muted-foreground">
      <Icono className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

// SPEC 54: con el indicador que colorea el mapa (en «Estado del reporte» no hay), abre la pestaña de su tipo; en
// «Cobertura» puede ser un avance.
function enlaceAIndicadores({ anio, mes, vacuna, indicador, municipioId, ddrissId }) {
  const consulta = new URLSearchParams({ anio: String(anio), mes: String(mes) })
  if (ddrissId) consulta.set('ddriss', String(ddrissId))
  if (vacuna) consulta.set('vacuna', vacuna)
  const vista = indicador ? vistaDeTipo(indicador.tipoCalculo) : null
  if (vista) {
    consulta.set('vista', vista)
    consulta.set('indicador', indicador.codigo)
  }
  if (municipioId) consulta.set('municipios', String(municipioId))
  return `/indicadores?${consulta}`
}

export default function PaginaMapa({ hoy }) {
  const [parametros, setParametros] = useSearchParams()
  const sesion = useSesion()
  const usuario = sesion?.sesion?.usuario
  const tienePermiso = (codigo) => sesion?.tienePermiso(codigo) ?? false
  const veIndicadores = tienePermiso('INDICADOR_CONSULTAR')
  const veAvance = tienePermiso('REPORTE_AVANCE_CONSULTAR')
  const nacional = usuario?.rol === 'AUTORIDAD' && (usuario?.empleado?.ddrissId ?? null) === null
  const [pestana, setPestana] = useState('municipio')

  const filtros = filtrosDelMapa(parametros, hoy)
  const irA = (cambios) => setParametros(consultaDe({ ...filtros, ...cambios }))

  const ddriss = useCarga(() => listarDdriss(), [], nacional)
  const ddrissId = nacional ? (filtros.ddriss ?? ddriss.datos?.[0]?.id) : undefined
  const listo = !nacional || ddrissId !== undefined
  const clave = `${filtros.anio}-${filtros.mes}-${ddrissId ?? ''}`

  const indicadores = useCarga(
    () => listarResultados({ anio: filtros.anio, mes: filtros.mes, ddrissId }),
    [clave],
    listo && veIndicadores,
  )
  // Un mes que no está en el calendario de la DDRISS (404) no es un error: no tiene reportes que contar.
  const avance = useCarga(
    () => obtenerAvance({ anio: filtros.anio, mes: filtros.mes, ddrissId, desglose: 'municipio' }).catch((err) => {
      if (err instanceof ErrorApi && err.status === 404) return { periodo: null, esperados: 0, conteos: null, municipios: [] }
      throw err
    }),
    [clave],
    listo && veAvance,
  )

  const modo = filtros.modo === 'estado' && !veAvance ? MODO_POR_DEFECTO : filtros.modo
  const corrida = indicadores.datos?.corrida ?? null
  const todos = indicadores.datos?.resultados ?? []
  const conResultados = corrida ? corrida.indicadores.filter((i) => todos.some((r) => r.indicadorCodigo === i.codigo)) : []
  const vacunas = vacunasDeLaCorrida(todos)
  const vacuna = vacunaDelMapa(conResultados, todos, filtros.vacuna)
  const vacunaNombre = vacunas.find((v) => v.codigo === vacuna)?.nombre ?? vacuna
  const indicador = indicadorDelModo(conResultados, todos, vacuna, modo)
  const delTipo = (tipoModo) => indicadorDelModo(conResultados, todos, vacuna, tipoModo)
  const indicadorCobertura = delTipo('cobertura')
  // El panel muestra la brecha del indicador BRECHA aparte; sin él, no la muestra.
  const indicadorBrecha = delTipo('brecha')?.tipoCalculo === 'BRECHA' ? delTipo('brecha') : null
  const indicadorDesercion = delTipo('desercion')

  // El archivo de límites sale de los municipios de los datos; mientras no lleguen, no se pide.
  const codigos = [
    ...todos.filter((r) => r.municipio).map((r) => r.municipio.codigoIne),
    ...(avance.datos?.municipios ?? []).map((m) => m.municipio.codigoIne),
  ]
  const archivo = archivoDeLimites(codigos)
  const limites = useCarga(() => cargarLimites(archivo), [archivo], archivo !== null)
  const datosListos = (!veIndicadores || indicadores.datos || indicadores.error) && (!veAvance || avance.datos || avance.error)
  // Sin ningún municipio en los datos no se sabe de qué departamento son los límites.
  const sinMunicipios = datosListos && codigos.length === 0
  const sinLimites = datosListos && codigos.length > 0 && archivo === null

  const mesNombre = `${MESES[filtros.mes - 1]} de ${filtros.anio}`
  const { filas, clases } = filasDelMapa({
    resultados: todos,
    indicador,
    avance: avance.datos,
    features: limites.datos?.features ?? [],
    modo,
  })
  const leyenda = rotulosDeLeyenda(modo, { indicador, clases, mesNombre, mes: filtros.mes })
  const seleccionada = filas.find((f) => f.municipioId !== null && f.municipioId === filtros.municipio) ?? null
  const filaPanel = seleccionada ?? filaDeLaDdriss({ resultados: todos, indicador, avance: avance.datos, modo })
  const franja = leyenda.franjas.find((f) => f.color === filaPanel.color && f.texto !== 'Sin datos')?.texto ?? null
  const municipioId = seleccionada?.municipioId ?? null
  const filaDe = (ind) => (ind ? filasDe(todos, ind.codigo).find((r) => (r.municipio?.id ?? null) === municipioId) ?? null : null)

  function elegir(fila) {
    if (fila.municipioId === null) return
    setPestana('municipio')
    irA({ municipio: fila.municipioId })
  }

  const porDefecto = mesAnterior(hoy)
  const anios = [...new Set([
    ...Array.from({ length: ANIOS_HACIA_ATRAS + 1 }, (_, i) => porDefecto.anio - i),
    filtros.anio,
  ])].sort((a, b) => b - a)

  const corte = filtros.mes === 1 ? MESES[0] : `ene a ${MESES[filtros.mes - 1].slice(0, 3)}`
  const antetitulo = modo === 'estado'
    ? `Mapa territorial · Estado de los reportes · ${mesNombre}`
    : `Mapa territorial${indicador?.nombre ? ` · ${indicador.nombre}` : ''} · ${corte} ${filtros.anio}`

  const avisoDelModo = (() => {
    if (modo === 'estado') {
      if (avance.datos && avance.datos.periodo === null) return `${mesNombre} no está en el calendario de la DDRISS.`
      return null
    }
    if (!indicadores.datos) return null
    if (corrida === null) return 'sin-corrida'
    if (indicador === null) return `La corrida no tiene un indicador de ${TIPO_DEL_MODO[modo]} de ${vacunaNombre ?? 'la vacuna elegida'}.`
    return null
  })()

  const enlaceDelMes = enlaceAIndicadores({ anio: filtros.anio, mes: filtros.mes, ddrissId })
  const cargando = listo && ((veIndicadores && !indicadores.datos && !indicadores.error) || (veAvance && !avance.datos && !avance.error))
  // La primera visita espera las DDRISS, los datos y los límites; después, cada cambio usa sus esqueletos. Sin
  // DDRISS (error o lista vacía) no se pide nada más.
  const limitesListos = archivo === null || limites.datos || limites.error
  const sinDdriss = ddriss.error || ddriss.datos?.length === 0
  const primeraCarga = usePrimeraCarga(Boolean(sinDdriss || (listo && datosListos && limitesListos)), { conMinimo: true })

  return (
    <>
      {primeraCarga && <PantallaCargaSesion etiqueta="Cargando el mapa" inmediata fondo="borroso" />}
      <section hidden={primeraCarga} className="flex flex-col gap-5 p-4 sm:p-6">
        <EncabezadoPagina
          antetitulo={antetitulo}
          titulo={MODOS[modo].pregunta}
          acciones={
            <Tabs value={modo} onValueChange={(nuevo) => irA({ modo: nuevo })} className="max-sm:w-full">
              {/* En el teléfono, dos filas de dos a todo el ancho: las cuatro en una no caben en 390 px. */}
              <TabsList
                aria-label="Qué colorea el mapa"
                className="grid h-auto! w-full grid-cols-2 bg-pestanas-mapa sm:inline-flex sm:h-8! sm:w-fit"
              >
                {Object.entries(MODOS)
                  .filter(([codigo]) => codigo !== 'estado' || veAvance)
                  .map(([codigo, { etiqueta }]) => (
                    <TabsTrigger key={codigo} value={codigo} className="px-3 aria-selected:bg-card aria-selected:shadow-sm">
                      {etiqueta}
                    </TabsTrigger>
                  ))}
              </TabsList>
            </Tabs>
          }
        />

        {ddriss.error && (
          <AvisoError onReintentar={ddriss.reintentar}>No se pudieron cargar las DDRISS: {mensajeDeError(ddriss.error)}</AvisoError>
        )}

        <BarraFiltrosMapa
          filtros={filtros}
          anios={anios}
          ddriss={nacional ? ddriss.datos : null}
          ddrissId={ddrissId}
          vacunas={vacunas}
          vacuna={vacuna}
          irA={irA}
        />

        {indicadores.error && (
          <AvisoError onReintentar={indicadores.reintentar}>
            No se pudieron cargar los indicadores: {mensajeDeError(indicadores.error)}
          </AvisoError>
        )}
        {avance.error && (
          <AvisoError onReintentar={avance.reintentar}>
            No se pudo cargar el estado de los reportes: {mensajeDeError(avance.error)}
          </AvisoError>
        )}
        {avisoDelModo === 'sin-corrida' ? (
          <Aviso>
            No hay un cálculo vigente de {mesNombre}.{' '}
            <Link to={enlaceDelMes} className="font-medium text-enlace underline-offset-4 hover:underline">
              Ir a Indicadores
            </Link>
          </Aviso>
        ) : (
          avisoDelModo && <Aviso>{avisoDelModo}</Aviso>
        )}

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="gap-3 py-4">
            <CardContent className="flex flex-col gap-3 px-4">
              <p className="text-sm text-muted-foreground">Toque o haga clic en un municipio para ver su detalle.</p>
              {limites.error ? (
                <AvisoError onReintentar={limites.reintentar}>
                  No se pudieron cargar los límites de los municipios: {mensajeDeError(limites.error)}
                </AvisoError>
              ) : sinLimites ? (
                <Aviso icono={MapPinOff}>No hay límites cargados para los municipios de esta DDRISS.</Aviso>
              ) : sinMunicipios ? (
                <Aviso icono={MapPinOff}>No hay datos de los municipios de {mesNombre}.</Aviso>
              ) : (
                // isolate: los z-index de Leaflet (hasta 1000) y de la leyenda quedan dentro del mapa y no tapan los menús.
                <div className="relative isolate">
                  {limites.datos && !cargando ? (
                    <Suspense fallback={<Skeleton className="h-[420px] w-full sm:h-[560px]" />}>
                      {/* SPEC 55: «Estado del reporte» no sale de una corrida, así que no lleva la marca. */}
                      <MarcaPreliminar activa={modo !== 'estado' && corrida?.parcial === true}>
                        <MapaMunicipios
                          limites={limites.datos}
                          filas={filas}
                          modo={modo}
                          indicador={indicador}
                          seleccionado={seleccionada?.codigoIne ?? null}
                          onElegir={elegir}
                          className="h-[420px] sm:h-[560px]"
                        />
                      </MarcaPreliminar>
                    </Suspense>
                  ) : (
                    <Skeleton aria-label="Cargando el mapa" className="h-[420px] w-full sm:h-[560px]" />
                  )}
                  <LeyendaMapa
                    {...leyenda}
                    className="mt-3 sm:pointer-events-auto sm:absolute sm:bottom-3 sm:left-3 sm:z-[1000] sm:mt-0 sm:max-w-60"
                  />
                </div>
              )}
              {sinLimites && <LeyendaMapa {...leyenda} className="self-start" />}
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent className="px-4">
              <Tabs value={pestana} onValueChange={setPestana} className="gap-4">
                <TabsList className="w-full">
                  <TabsTrigger value="municipio">Municipio</TabsTrigger>
                  <TabsTrigger value="clasificacion">Clasificación</TabsTrigger>
                </TabsList>
                <TabsContent value="municipio">
                  {cargando ? (
                    <div className="flex flex-col gap-3" aria-label="Cargando el municipio">
                      {[1, 2, 3, 4].map((n) => (
                        <Skeleton key={n} className="h-8 w-full" />
                      ))}
                    </div>
                  ) : (
                    <PanelMunicipio
                      fila={filaPanel}
                      esDdriss={seleccionada === null}
                      modo={modo}
                      franja={franja}
                      cobertura={filaDe(indicadorCobertura)}
                      brecha={filaDe(indicadorBrecha)}
                      nombreBrecha={indicadorBrecha?.nombre ?? null}
                      desercion={filaDe(indicadorDesercion)}
                      mesNombre={mesNombre}
                      enlaceIndicadores={
                        veIndicadores && corrida
                          ? enlaceAIndicadores({ anio: filtros.anio, mes: filtros.mes, vacuna, indicador, municipioId, ddrissId })
                          : null
                      }
                    />
                  )}
                </TabsContent>
                <TabsContent value="clasificacion" className="lg:max-h-[600px] lg:overflow-y-auto">
                  {cargando ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <ClasificacionMunicipios filas={filas} modo={modo} seleccionado={municipioId} onElegir={elegir} />
                  )}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </section>
    </>
  )
}
