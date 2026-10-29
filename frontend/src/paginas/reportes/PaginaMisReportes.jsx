import { useEffect, useState } from 'react'
import { ClipboardPen } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarPeriodos } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { listarReportes } from '@/api/produccion.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import InsigniaEstadoReporte, { ESTADOS_REPORTE } from '@/componentes/InsigniaEstadoReporte.jsx'
import { cn } from '@/lib/utils'
import PaginacionUsuarios, { FILAS_POR_PAGINA } from '@/paginas/usuarios/PaginacionUsuarios.jsx'

const POR_PAGINA_INICIAL = 20
// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'
const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

const nombreDelMes = (periodo) => `${MESES[periodo.mes - 1]} de ${periodo.anio}`
const dosCifras = (numero) => String(numero).padStart(2, '0')
// En la hora local del navegador.
const aFechaHora = (iso) => {
  const fecha = new Date(iso)
  return `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}

const entero = (texto, minimo, maximo) =>
  /^\d+$/.test(texto ?? '') && Number(texto) >= minimo && Number(texto) <= maximo ? Number(texto) : undefined

// Un valor inválido en la URL se ignora: a la API solo llegan filtros válidos.
export function filtrosDeUrl(parametros) {
  const porPagina = Number(parametros.get('porPagina'))
  const filtros = {
    anio: entero(parametros.get('anio'), 2000, 2100),
    estado: parametros.get('estado') in ESTADOS_REPORTE ? parametros.get('estado') : undefined,
    pagina: entero(parametros.get('pagina'), 1, Number.MAX_SAFE_INTEGER) ?? 1,
    porPagina: FILAS_POR_PAGINA.includes(porPagina) ? porPagina : POR_PAGINA_INICIAL,
  }
  return Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== undefined))
}

// Los valores por defecto no se escriben en la URL.
function consultaDe(filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === '') continue
    if (nombre === 'pagina' && valor === 1) continue
    if (nombre === 'porPagina' && valor === POR_PAGINA_INICIAL) continue
    consulta.set(nombre, String(valor))
  }
  return consulta.toString()
}

function Filtro({ nombre, etiqueta, valor, alCambiar, opciones, deshabilitado }) {
  return (
    <Select
      name={nombre}
      value={valor === undefined ? TODOS : String(valor)}
      onValueChange={(elegido) => alCambiar(elegido === TODOS ? undefined : elegido)}
      disabled={deshabilitado}
    >
      <SelectTrigger aria-label={etiqueta} className="w-full bg-card sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((opcion) => (
          <SelectItem key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function PaginaMisReportes() {
  const { pathname } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const filtros = filtrosDeUrl(parametros)
  const clave = consultaDe(filtros)
  const hayFiltros = Boolean(filtros.anio || filtros.estado)

  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [anios, setAnios] = useState([])
  const [errorAnios, setErrorAnios] = useState(null)
  const [intentoAnios, setIntentoAnios] = useState(0)

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
    setErrorAnios(null)
    listarPeriodos()
      .then((periodos) => vigente && setAnios([...new Set(periodos.map((p) => p.anio))].sort((a, b) => b - a)))
      .catch((err) => vigente && setErrorAnios(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [intentoAnios])

  useEffect(() => {
    // Al cambiar la URL antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true
    const pedidos = filtrosDeUrl(new URLSearchParams(clave))
    setCargando(true)
    setErrorCarga(null)
    listarReportes(pedidos)
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
    // Sin setParametros: React Router crea uno nuevo en cada cambio de URL. intento cambia con «Reintentar».
  }, [clave, intento])

  const establecimiento = resultado?.elementos[0]?.establecimiento.nombre
  const antetitulo = establecimiento ? `Mis reportes · ${establecimiento}` : 'Mis reportes'

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo={antetitulo} titulo="Reportes mensuales" />

      <div className="flex flex-col gap-3">
        {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
        <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
          <Filtro
            nombre="anio"
            etiqueta="Filtrar por año"
            valor={filtros.anio}
            alCambiar={(anio) => irA({ anio: anio && Number(anio) })}
            deshabilitado={errorAnios !== null}
            opciones={[
              { valor: TODOS, etiqueta: 'Todos los años' },
              // El año de la URL se conserva aunque no esté en el calendario, para que el Select lo muestre.
              ...[...new Set([...anios, ...(filtros.anio ? [filtros.anio] : [])])]
                .sort((a, b) => b - a)
                .map((anio) => ({ valor: String(anio), etiqueta: String(anio) })),
            ]}
          />
          <Filtro
            nombre="estado"
            etiqueta="Filtrar por estado"
            valor={filtros.estado}
            alCambiar={(estado) => irA({ estado })}
            opciones={[
              { valor: TODOS, etiqueta: 'Todos los estados' },
              ...Object.entries(ESTADOS_REPORTE).map(([valor, { titulo }]) => ({ valor, etiqueta: titulo })),
            ]}
          />
          {hayFiltros && (
            <Button type="button" variant="ghost" onClick={() => setParametros(new URLSearchParams())}>
              Limpiar filtros
            </Button>
          )}
        </form>
        {errorAnios && (
          <AvisoError onReintentar={() => setIntentoAnios((n) => n + 1)}>
            No se pudieron cargar los años: {errorAnios}
          </AvisoError>
        )}
      </div>

      {errorCarga ? (
        <AvisoError onReintentar={() => setIntento((n) => n + 1)}>
          No se pudieron cargar los reportes: {errorCarga}
        </AvisoError>
      ) : resultado === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando reportes">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : resultado.elementos.length === 0 ? (
        hayFiltros ? (
          <p className="text-muted-foreground">No hay reportes con estos filtros.</p>
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed bg-card p-6">
            <p className="text-muted-foreground">
              Todavía no tiene reportes. Cree el del mes en{' '}
              <Link to="/registro" className="text-enlace underline-offset-4 hover:underline">
                Registro de producción
              </Link>
              .
            </p>
            <Button asChild>
              <Link to="/registro">
                <ClipboardPen />
                Ir al registro
              </Link>
            </Button>
          </div>
        )
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
                  <TableHead>Mes</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Último cambio</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.elementos.map((reporte) => {
                  const devuelto = reporte.estado === 'CORRECCION_SOLICITADA'
                  return (
                    <TableRow key={reporte.id} className={cn(devuelto && 'bg-advertencia hover:bg-advertencia')}>
                      <TableCell>
                        <div className="font-medium">{nombreDelMes(reporte.periodo)}</div>
                        {devuelto && (
                          <div className="text-sm whitespace-normal text-advertencia-foreground">
                            {reporte.correccion?.comentario
                              ? `Devuelto para corrección: ${reporte.correccion.comentario}`
                              : 'Devuelto para corrección'}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <InsigniaEstadoReporte estado={reporte.estado} />
                      </TableCell>
                      <TableCell>{aFechaHora(reporte.estadoDesde)}</TableCell>
                      <TableCell className="text-right">
                        {reporte.periodo.estado === 'ABIERTO' && (
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/registro?periodo=${reporte.periodo.id}`}>Abrir</Link>
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
    </section>
  )
}
