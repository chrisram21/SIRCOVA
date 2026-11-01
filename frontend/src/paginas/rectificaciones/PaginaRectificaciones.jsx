import { useEffect, useState } from 'react'
import { FilePenLine } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { mensajeDeError } from '@/api/cliente.js'
import { listarRectificaciones } from '@/api/rectificaciones.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import InsigniaEstadoRectificacion, { ESTADOS_RECTIFICACION } from '@/componentes/InsigniaEstadoRectificacion.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { cn } from '@/lib/utils'
import PaginacionUsuarios, { FILAS_POR_PAGINA } from '@/paginas/usuarios/PaginacionUsuarios.jsx'
import { aFechaHora, mesDe } from './formato.js'

const POR_PAGINA_INICIAL = 20
// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'

const entero = (texto, minimo) => (/^\d+$/.test(texto ?? '') && Number(texto) >= minimo ? Number(texto) : undefined)

// Un valor inválido en la URL se ignora: a la API solo llegan filtros válidos.
export function filtrosDeUrl(parametros) {
  const porPagina = Number(parametros.get('porPagina'))
  const filtros = {
    estado: parametros.get('estado') in ESTADOS_RECTIFICACION ? parametros.get('estado') : undefined,
    pagina: entero(parametros.get('pagina'), 1) ?? 1,
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

export default function PaginaRectificaciones() {
  const { pathname, search } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const filtros = filtrosDeUrl(parametros)
  const clave = consultaDe(filtros)
  const puedeSolicitar = useSesion()?.tienePermiso('RECTIFICACION_SOLICITAR') ?? false

  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)

  // Cualquier cambio que no sea de página vuelve a la página 1.
  function irA(cambios) {
    setParametros(new URLSearchParams(consultaDe({ ...filtros, pagina: 1, ...cambios })))
  }

  function hrefDe(pagina) {
    const consulta = consultaDe({ ...filtros, pagina })
    return consulta ? `${pathname}?${consulta}` : pathname
  }

  useEffect(() => {
    // Al cambiar la URL antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true
    const pedidos = filtrosDeUrl(new URLSearchParams(clave))
    setCargando(true)
    setErrorCarga(null)
    listarRectificaciones(pedidos)
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

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Rectificaciones"
        titulo="Solicitudes de rectificación"
        descripcion="Correcciones pedidas a reportes ya cerrados."
        acciones={
          puedeSolicitar && (
            <Button asChild>
              <Link to="/rectificaciones/nueva">
                <FilePenLine />
                Nueva solicitud
              </Link>
            </Button>
          )
        }
      />

      {/* Dentro de un form, Radix agrega el <select> nativo del Select. */}
      <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
        <Select
          name="estado"
          value={filtros.estado ?? TODOS}
          onValueChange={(elegido) => irA({ estado: elegido === TODOS ? undefined : elegido })}
        >
          <SelectTrigger aria-label="Filtrar por estado" className="w-full bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los estados</SelectItem>
            {Object.entries(ESTADOS_RECTIFICACION).map(([valor, { titulo }]) => (
              <SelectItem key={valor} value={valor}>
                {titulo}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {filtros.estado && (
          <Button type="button" variant="ghost" onClick={() => setParametros(new URLSearchParams())}>
            Limpiar filtros
          </Button>
        )}
      </form>

      {errorCarga ? (
        <AvisoError onReintentar={() => setIntento((n) => n + 1)}>
          No se pudieron cargar las solicitudes: {errorCarga}
        </AvisoError>
      ) : resultado === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando solicitudes">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : resultado.elementos.length === 0 ? (
        <p className="text-muted-foreground">
          {filtros.estado ? 'No hay solicitudes con este estado.' : 'Todavía no hay solicitudes de rectificación.'}
        </p>
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
                  <TableHead>Establecimiento</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Solicitada por</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Celdas</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.elementos.map((solicitud) => (
                  <TableRow key={solicitud.id}>
                    <TableCell className="font-medium">{mesDe(solicitud.reporte.periodo)}</TableCell>
                    <TableCell>{solicitud.reporte.establecimiento.nombre}</TableCell>
                    <TableCell>
                      <InsigniaEstadoRectificacion estado={solicitud.estado} />
                    </TableCell>
                    <TableCell>{solicitud.solicitadoPor.nombre}</TableCell>
                    <TableCell>{aFechaHora(solicitud.solicitadoEn)}</TableCell>
                    <TableCell className="text-right tabular-nums">{solicitud.cambios}</TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" asChild>
                        <Link
                          to={`/rectificaciones/${solicitud.id}`}
                          state={{ volverA: search }}
                          aria-label={`Ver la solicitud de ${mesDe(solicitud.reporte.periodo)}, ${
                            solicitud.reporte.establecimiento.nombre
                          }`}
                        >
                          Ver
                        </Link>
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
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
