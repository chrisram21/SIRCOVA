import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarMunicipios, listarPeriodos } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerBandeja } from '@/api/revision.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import InsigniaEstadoReporte from '@/componentes/InsigniaEstadoReporte.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { nombreDelMes, porFecha } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'
import PaginacionUsuarios, { FILAS_POR_PAGINA } from '@/paginas/usuarios/PaginacionUsuarios.jsx'
import DialogoAsignarRevisor from './DialogoAsignarRevisor.jsx'

const POR_PAGINA_INICIAL = 20
const GRUPO_INICIAL = 'POR_ATENDER'
// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS_LOS_MUNICIPIOS = 'todos'
// Los chips, en el orden de Revision.html (más «Asignados a mí»).
const GRUPOS = [
  ['POR_ATENDER', 'Por atender'],
  ['ASIGNADOS_A_MI', 'Asignados a mí'],
  ['EN_REVISION', 'En revisión'],
  ['ENVIADO', 'Enviado'],
  ['CORRECCION_SOLICITADA', 'Corrección solicitada'],
  ['SIN_ENVIAR', 'Sin enviar'],
  ['APROBADO', 'Aprobado'],
  ['CERRADO', 'Cerrado'],
  ['TODOS', 'Todos'],
]
const ESTADOS_ABIERTOS = ['ABIERTO', 'EN_CIERRE']

const dosCifras = (numero) => String(numero).padStart(2, '0')
// En la hora local del navegador.
const aFecha = (iso) => {
  const fecha = new Date(iso)
  return `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
}
const formatoDosis = new Intl.NumberFormat('es-GT')

const entero = (texto, minimo, maximo = Number.MAX_SAFE_INTEGER) =>
  /^\d+$/.test(texto ?? '') && Number(texto) >= minimo && Number(texto) <= maximo ? Number(texto) : undefined

// Un valor inválido en la URL se ignora; el mes se valida contra la lista de meses al cargarla.
export function filtrosDeUrl(parametros) {
  const porPagina = Number(parametros.get('porPagina'))
  const grupo = parametros.get('grupo')
  return {
    periodo: entero(parametros.get('periodo'), 1),
    municipio: entero(parametros.get('municipio'), 1),
    grupo: GRUPOS.some(([codigo]) => codigo === grupo) ? grupo : GRUPO_INICIAL,
    pagina: entero(parametros.get('pagina'), 1) ?? 1,
    porPagina: FILAS_POR_PAGINA.includes(porPagina) ? porPagina : POR_PAGINA_INICIAL,
  }
}

// Los valores por defecto no se escriben en la URL.
function consultaDe(filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === null || valor === '') continue
    if (nombre === 'grupo' && valor === GRUPO_INICIAL) continue
    if (nombre === 'pagina' && valor === 1) continue
    if (nombre === 'porPagina' && valor === POR_PAGINA_INICIAL) continue
    consulta.set(nombre, String(valor))
  }
  return consulta.toString()
}

// Los meses con cierre_periodo de la DDRISS (estado no nulo), del más reciente al más antiguo. Por defecto, el
// abierto o en cierre más antiguo: es el que se revisa para cerrar; sin ninguno, el más reciente.
export function mesesDeLaDdriss(periodos) {
  return periodos.filter((p) => p.estado !== null).sort((a, b) => porFecha(b, a))
}
export function mesPorDefecto(meses) {
  const abiertos = meses.filter((p) => ESTADOS_ABIERTOS.includes(p.estado))
  return abiertos.at(-1) ?? meses[0] ?? null
}

function textoValidacion(fila) {
  if (fila.estado === null || fila.estado === 'BORRADOR') return '—'
  if (fila.advertencias === 0) return 'Sin advertencias'
  return fila.advertencias === 1 ? '1 advertencia' : `${fila.advertencias} advertencias`
}

export default function PaginaBandejaRevision() {
  const { pathname, search } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const sesion = useSesion()
  const usuarioId = sesion?.sesion?.usuario?.id ?? null
  const puedeAsignar = sesion?.tienePermiso('REPORTE_ASIGNAR') ?? false

  const [meses, setMeses] = useState(null)
  const [municipios, setMunicipios] = useState([])
  const [errorCatalogos, setErrorCatalogos] = useState(null)
  const [intentoCatalogos, setIntentoCatalogos] = useState(0)
  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  // { modo: 'asignar' | 'reasignar', fila } mientras el diálogo está abierto.
  const [dialogo, setDialogo] = useState(null)

  const deUrl = filtrosDeUrl(parametros)
  const periodo = meses && (meses.find((p) => p.id === deUrl.periodo) ?? mesPorDefecto(meses))
  const filtros = { ...deUrl, periodo: periodo?.id }
  const clave = consultaDe(filtros)

  // Cualquier cambio que no sea de página vuelve a la página 1.
  function irA(cambios) {
    setParametros(new URLSearchParams(consultaDe({ ...filtros, pagina: 1, ...cambios })))
  }

  function hrefDe(pagina) {
    const consulta = consultaDe({ ...filtros, pagina })
    return consulta ? `${pathname}?${consulta}` : pathname
  }

  useEffect(() => {
    let vigente = true
    setErrorCatalogos(null)
    Promise.all([listarPeriodos(), listarMunicipios()])
      .then(([periodos, recibidos]) => {
        if (!vigente) return
        setMeses(mesesDeLaDdriss(periodos))
        setMunicipios(recibidos)
      })
      .catch((err) => vigente && setErrorCatalogos(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [intentoCatalogos])

  useEffect(() => {
    if (!filtros.periodo) return undefined
    // Al cambiar la URL antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true
    const pedidos = filtrosDeUrl(new URLSearchParams(clave))
    setCargando(true)
    setErrorCarga(null)
    obtenerBandeja({
      periodoId: pedidos.periodo,
      municipioId: pedidos.municipio,
      grupo: pedidos.grupo,
      pagina: pedidos.pagina,
      porPagina: pedidos.porPagina,
    })
      .then((respuesta) => {
        if (!vigente) return
        if (respuesta.elementos.length === 0 && respuesta.total > 0) {
          const ultima = Math.ceil(respuesta.total / respuesta.porPagina)
          setParametros(new URLSearchParams(consultaDe({ ...pedidos, pagina: ultima })), { replace: true })
          return
        }
        setResultado(respuesta)
        setCargando(false)
      })
      .catch((err) => {
        if (!vigente) return
        setErrorCarga(mensajeDeError(err))
        setCargando(false)
      })
    return () => {
      vigente = false
    }
    // Sin setParametros: React Router crea uno nuevo en cada cambio de URL. intento cambia al recargar.
  }, [clave, intento])

  function recargar() {
    setDialogo(null)
    setIntento((n) => n + 1)
  }

  function hecho(mensaje) {
    toast.success(mensaje)
    recargar()
  }

  const antetitulo = periodo ? `Revisión y cierre · Periodo ${nombreDelMes(periodo)}` : 'Revisión y cierre'
  const conteos = resultado?.conteos

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo={antetitulo} titulo="Bandeja de revisión" />

      {errorCatalogos && (
        <AvisoError onReintentar={() => setIntentoCatalogos((n) => n + 1)}>
          No se pudieron cargar los meses y los municipios: {errorCatalogos}
        </AvisoError>
      )}

      {meses && meses.length === 0 && (
        <p className="text-muted-foreground">La DDRISS todavía no ha abierto ningún mes. Se abren en Administración · Periodos.</p>
      )}

      {periodo && (
        <>
          <div className="flex flex-col gap-3">
            {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
            <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
              <Select name="periodo" value={String(periodo.id)} onValueChange={(id) => irA({ periodo: Number(id) })}>
                <SelectTrigger aria-label="Mes" className="w-full bg-card sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {meses.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {nombreDelMes(p)}
                      {p.estado === 'CERRADO' ? ' · cerrado' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                name="municipio"
                value={filtros.municipio ? String(filtros.municipio) : TODOS_LOS_MUNICIPIOS}
                onValueChange={(id) => irA({ municipio: id === TODOS_LOS_MUNICIPIOS ? undefined : Number(id) })}
              >
                <SelectTrigger aria-label="Municipio" className="w-full bg-card sm:w-64">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={TODOS_LOS_MUNICIPIOS}>Todos los municipios</SelectItem>
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </form>

            <div role="group" aria-label="Estado de los reportes" className="flex flex-wrap gap-2">
              {GRUPOS.map(([codigo, etiqueta]) => {
                const activo = filtros.grupo === codigo
                return (
                  <Button
                    key={codigo}
                    type="button"
                    size="sm"
                    variant={activo ? 'default' : 'outline'}
                    className="rounded-full"
                    aria-pressed={activo}
                    onClick={() => irA({ grupo: codigo })}
                  >
                    {etiqueta}
                    {conteos && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 font-mono text-xs',
                          activo ? 'bg-primary-foreground/20' : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {conteos[codigo]}
                      </span>
                    )}
                  </Button>
                )
              })}
            </div>
          </div>

          {errorCarga ? (
            <AvisoError onReintentar={() => setIntento((n) => n + 1)}>No se pudo cargar la bandeja: {errorCarga}</AvisoError>
          ) : resultado === null ? (
            <div className="flex flex-col gap-2" aria-label="Cargando bandeja">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-10 w-full" />
              ))}
            </div>
          ) : resultado.elementos.length === 0 ? (
            <p className="text-muted-foreground">No hay reportes en este grupo.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Mientras llega otra página o filtro se sigue viendo la anterior, atenuada. */}
              <div
                className={cn('overflow-x-auto rounded-lg border bg-card transition-opacity', cargando && 'opacity-60')}
                aria-busy={cargando}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Municipio · establecimiento</TableHead>
                      <TableHead>Enviado</TableHead>
                      <TableHead>Estado</TableHead>
                      <TableHead>Validación</TableHead>
                      <TableHead className="text-right">Dosis totales</TableHead>
                      <TableHead>Revisor</TableHead>
                      <TableHead className="text-right">
                        <span className="sr-only">Acciones</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {resultado.elementos.map((fila) => {
                      const esMio = fila.revisor?.id === usuarioId
                      const asignar = puedeAsignar && fila.estado === 'ENVIADO'
                      const reasignar = puedeAsignar && fila.estado === 'EN_REVISION' && esMio
                      return (
                        <TableRow key={fila.establecimiento.id}>
                          <TableCell>
                            <div className="font-medium">{fila.municipio.nombre}</div>
                            {/* Solo lo enviado se revisa: un borrador o un establecimiento sin reporte no abren nada. */}
                            {fila.reporteId && fila.estado !== 'BORRADOR' ? (
                              <Link
                                to={`/revision/reportes/${fila.reporteId}`}
                                state={{ volverA: search }}
                                className="text-sm text-enlace underline-offset-4 hover:underline"
                              >
                                {fila.establecimiento.nombre}
                              </Link>
                            ) : (
                              <div className="text-sm text-muted-foreground">{fila.establecimiento.nombre}</div>
                            )}
                          </TableCell>
                          <TableCell>{fila.enviadoEn ? aFecha(fila.enviadoEn) : '—'}</TableCell>
                          <TableCell>
                            {fila.estado ? (
                              <InsigniaEstadoReporte estado={fila.estado} />
                            ) : (
                              <Badge variant="outline">Sin reporte</Badge>
                            )}
                          </TableCell>
                          <TableCell
                            className={cn(fila.advertencias > 0 && fila.estado !== 'BORRADOR' && 'text-advertencia-foreground')}
                          >
                            {textoValidacion(fila)}
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {fila.dosisTotales === null ? '—' : formatoDosis.format(fila.dosisTotales)}
                          </TableCell>
                          <TableCell>{fila.revisor ? `${fila.revisor.nombre}${esMio ? ' (usted)' : ''}` : '—'}</TableCell>
                          <TableCell className="text-right">
                            {asignar && (
                              <Button size="sm" onClick={() => setDialogo({ modo: 'asignar', fila })}>
                                Asignar
                              </Button>
                            )}
                            {reasignar && (
                              <Button size="sm" variant="outline" onClick={() => setDialogo({ modo: 'reasignar', fila })}>
                                Reasignar
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
              <PaginacionUsuarios
                total={resultado.total}
                pagina={resultado.pagina}
                porPagina={resultado.porPagina}
                hrefDe={hrefDe}
                alCambiarPagina={(pagina) => irA({ pagina })}
                alCambiarPorPagina={(porPagina) => irA({ porPagina })}
              />
            </div>
          )}
        </>
      )}

      {!meses && !errorCatalogos && (
        <div className="flex flex-col gap-2" aria-label="Cargando meses">
          <Skeleton className="h-9 w-56" />
          <Skeleton className="h-8 w-full" />
        </div>
      )}

      {dialogo && (
        <DialogoAsignarRevisor
          modo={dialogo.modo}
          fila={dialogo.fila}
          usuarioId={usuarioId}
          alHecho={hecho}
          alRecargar={recargar}
          alCerrar={() => setDialogo(null)}
        />
      )}
    </section>
  )
}
