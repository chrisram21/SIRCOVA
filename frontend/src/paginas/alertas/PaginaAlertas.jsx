import { useEffect, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarAlertas } from '@/api/alertas.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { cn } from '@/lib/utils'
import { SEVERIDADES, InsigniaSeveridad, desgloseDeSeveridades } from '@/paginas/inicio/TarjetaAlertas.jsx'
import { aFechaHora, mesDe } from '@/paginas/rectificaciones/formato.js'
import PaginacionUsuarios, { FILAS_POR_PAGINA } from '@/paginas/usuarios/PaginacionUsuarios.jsx'
import DialogoAtenderAlerta from './DialogoAtenderAlerta.jsx'

const POR_PAGINA_INICIAL = 20
const ESTADO_INICIAL = 'ACTIVA'
// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'

export const ESTADOS = { ACTIVA: 'Activas', ATENDIDA: 'Atendidas', DESCARTADA: 'Descartadas', TODAS: 'Todas' }
const ESTADO_DE_FILA = { ACTIVA: 'Activa', ATENDIDA: 'Atendida', DESCARTADA: 'Descartada' }
export const TIPOS = {
  REPORTE_PENDIENTE: 'Reporte pendiente',
  CALIDAD: 'Calidad',
  COBERTURA_BAJO_META: 'Cobertura bajo la meta',
  PROCESO: 'Proceso',
}

const ETIQUETAS_SEVERIDAD = Object.fromEntries(
  Object.entries(SEVERIDADES).map(([codigo, { etiqueta }]) => [codigo, etiqueta]),
)

const entero = (texto, minimo) => (/^\d+$/.test(texto ?? '') && Number(texto) >= minimo ? Number(texto) : undefined)

// Un valor inválido en la URL se ignora: a la API solo llegan filtros válidos. Sin estado vale «Activas».
export function filtrosDeUrl(parametros) {
  const porPagina = Number(parametros.get('porPagina'))
  const estado = parametros.get('estado')
  const tipo = parametros.get('tipo')
  const severidad = parametros.get('severidad')
  const filtros = {
    estado: Object.hasOwn(ESTADOS, estado ?? '') ? estado : ESTADO_INICIAL,
    tipo: Object.hasOwn(TIPOS, tipo ?? '') ? tipo : undefined,
    severidad: Object.hasOwn(SEVERIDADES, severidad ?? '') ? severidad : undefined,
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
    if (nombre === 'estado' && valor === ESTADO_INICIAL) continue
    if (nombre === 'pagina' && valor === 1) continue
    if (nombre === 'porPagina' && valor === POR_PAGINA_INICIAL) continue
    consulta.set(nombre, String(valor))
  }
  return consulta.toString()
}

// A dónde ir para resolverla, según lo que tenga la alerta y lo que el usuario puede abrir.
export function enlaceDe(alerta, tienePermiso) {
  if (alerta.reporteId != null && tienePermiso('REPORTE_REVISAR')) return `/revision/reportes/${alerta.reporteId}`
  if (alerta.periodo && tienePermiso('REPORTE_CREAR')) return `/registro?periodo=${alerta.periodo.id}`
  if (alerta.indicadorCodigo && alerta.periodo && tienePermiso('INDICADOR_CONSULTAR')) {
    const consulta = new URLSearchParams({
      anio: String(alerta.periodo.anio),
      mes: String(alerta.periodo.mes),
      indicador: alerta.indicadorCodigo,
    })
    if (alerta.municipio) consulta.set('municipios', String(alerta.municipio.id))
    return `/indicadores?${consulta}`
  }
  return null
}

function Filtro({ nombre, etiqueta, valor, opciones, todos, alCambiar }) {
  return (
    <Select
      name={nombre}
      value={valor ?? TODOS}
      onValueChange={(elegido) => alCambiar(elegido === TODOS ? undefined : elegido)}
    >
      <SelectTrigger aria-label={etiqueta} className="w-full bg-card sm:w-52">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {todos && <SelectItem value={TODOS}>{todos}</SelectItem>}
        {Object.entries(opciones).map(([codigo, texto]) => (
          <SelectItem key={codigo} value={codigo}>
            {texto}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export default function PaginaAlertas() {
  const { pathname } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const sesion = useSesion()
  const tienePermiso = (codigo) => sesion?.tienePermiso(codigo) ?? false
  const puedeAtender = tienePermiso('ALERTA_ATENDER')
  const filtros = filtrosDeUrl(parametros)
  const clave = consultaDe(filtros)
  const conFiltros = filtros.estado !== ESTADO_INICIAL || Boolean(filtros.tipo) || Boolean(filtros.severidad)

  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [atendiendo, setAtendiendo] = useState(null)
  const [aviso, setAviso] = useState(null)

  // Cualquier cambio que no sea de página vuelve a la página 1.
  function irA(cambios) {
    setAviso(null)
    setParametros(new URLSearchParams(consultaDe({ ...filtros, pagina: 1, ...cambios })))
  }

  function hrefDe(pagina) {
    const consulta = consultaDe({ ...filtros, pagina })
    return consulta ? `${pathname}?${consulta}` : pathname
  }

  const recargar = () => setIntento((n) => n + 1)

  useEffect(() => {
    // Al cambiar la URL antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true
    const pedidos = filtrosDeUrl(new URLSearchParams(clave))
    setCargando(true)
    setErrorCarga(null)
    listarAlertas(pedidos)
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

  const desglose = resultado && desgloseDeSeveridades(resultado.activas.porSeveridad)

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        titulo="Alertas"
        descripcion={
          resultado === null
            ? 'Avisos de calidad de los datos y del proceso dirigidos a su rol.'
            : resultado.activas.total === 0
              ? 'No tiene alertas activas.'
              : `Activas: ${desglose}.`
        }
      />

      {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
      <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
        <Filtro
          nombre="estado"
          etiqueta="Filtrar por estado"
          valor={filtros.estado}
          opciones={ESTADOS}
          alCambiar={(estado) => irA({ estado })}
        />
        <Filtro
          nombre="tipo"
          etiqueta="Filtrar por tipo"
          valor={filtros.tipo}
          opciones={TIPOS}
          todos="Todos los tipos"
          alCambiar={(tipo) => irA({ tipo })}
        />
        <Filtro
          nombre="severidad"
          etiqueta="Filtrar por severidad"
          valor={filtros.severidad}
          opciones={ETIQUETAS_SEVERIDAD}
          todos="Todas las severidades"
          alCambiar={(severidad) => irA({ severidad })}
        />
        {conFiltros && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => irA({ estado: undefined, tipo: undefined, severidad: undefined })}
          >
            Limpiar filtros
          </Button>
        )}
      </form>

      {aviso && <AvisoError>{aviso}</AvisoError>}

      {errorCarga ? (
        <AvisoError onReintentar={recargar}>No se pudieron cargar las alertas: {errorCarga}</AvisoError>
      ) : resultado === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando alertas">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : resultado.elementos.length === 0 ? (
        <p className="text-muted-foreground">
          {conFiltros ? 'No hay alertas con estos filtros.' : 'No hay alertas activas.'}
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
                  <TableHead>Severidad</TableHead>
                  <TableHead>Alerta</TableHead>
                  <TableHead>Periodo</TableHead>
                  <TableHead>Generada</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.elementos.map((alerta) => {
                  const enlace = enlaceDe(alerta, tienePermiso)
                  return (
                    <TableRow key={alerta.id}>
                      <TableCell>
                        <InsigniaSeveridad severidad={alerta.severidad} />
                      </TableCell>
                      <TableCell className="min-w-64 whitespace-normal">
                        <p className="font-medium">{alerta.titulo}</p>
                        <p className="text-sm text-muted-foreground">{alerta.mensaje}</p>
                      </TableCell>
                      <TableCell>{alerta.periodo ? mesDe(alerta.periodo) : '—'}</TableCell>
                      <TableCell className="tabular-nums">{aFechaHora(alerta.generadaEn)}</TableCell>
                      <TableCell className="whitespace-normal">
                        {alerta.estado === 'ATENDIDA' && alerta.atendidaPor ? (
                          <span className="text-sm">
                            Atendida por {alerta.atendidaPor.nombre} el {aFechaHora(alerta.atendidaEn)}
                          </span>
                        ) : (
                          ESTADO_DE_FILA[alerta.estado]
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          {enlace && (
                            <Button variant="outline" size="sm" asChild>
                              <Link to={enlace} aria-label={`Ver «${alerta.titulo}»`}>
                                Ver
                              </Link>
                            </Button>
                          )}
                          {puedeAtender && alerta.estado === 'ACTIVA' && (
                            <Button size="sm" onClick={() => setAtendiendo(alerta)}>
                              Marcar como atendida
                            </Button>
                          )}
                        </div>
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

      {atendiendo && (
        <DialogoAtenderAlerta
          alerta={atendiendo}
          alAtender={() => {
            setAtendiendo(null)
            toast.success('Alerta marcada como atendida.')
            setAviso(null)
            recargar()
          }}
          alYaNoActiva={(mensaje) => {
            setAtendiendo(null)
            setAviso(mensaje)
            recargar()
          }}
          alCerrar={() => setAtendiendo(null)}
        />
      )}
    </section>
  )
}
