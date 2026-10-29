import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarClock, Check, FilePlus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { aDiaMesAnio, diasHasta, nombreDelMes, textoPlazo } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'
import { mensajeDeError } from '@/api/cliente.js'
import { crearReporte, listarReportes, obtenerFormulario, obtenerReporte } from '@/api/produccion.js'
import CapturaReporte from './CapturaReporte.jsx'
import { cargarMesesAbiertos, mesPendiente } from './mesesAbiertos.js'

const PASOS = [
  { estado: 'BORRADOR', titulo: 'Borrador' },
  { estado: 'ENVIADO', titulo: 'Enviado' },
  { estado: 'EN_REVISION', titulo: 'En revisión' },
  { estado: 'APROBADO', titulo: 'Aprobado' },
  { estado: 'CERRADO', titulo: 'Cerrado' },
]

// Los dos estados que no son pasos se muestran como insignia junto al paso en que ocurren.
const FUERA_DE_LOS_PASOS = {
  CORRECCION_SOLICITADA: { paso: 'EN_REVISION', titulo: 'Corrección solicitada' },
  RECTIFICACION: { paso: 'CERRADO', titulo: 'Rectificación' },
}

function PasosDeEstado({ estado }) {
  const fuera = FUERA_DE_LOS_PASOS[estado]
  const actual = fuera?.paso ?? estado
  const indiceActual = PASOS.findIndex((paso) => paso.estado === actual)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol aria-label="Estado del reporte" className="flex flex-wrap gap-1.5 text-xs">
        {PASOS.map((paso, indice) => {
          const esActual = indice === indiceActual
          const hecho = indice < indiceActual
          return (
            <li
              key={paso.estado}
              aria-current={esActual ? 'step' : undefined}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors duration-300',
                esActual && 'bg-primary font-semibold text-primary-foreground shadow-tarjeta ring-4 ring-ring/20',
                hecho && 'bg-accent text-accent-foreground',
                !esActual && !hecho && 'bg-muted text-muted-foreground',
              )}
            >
              {hecho && <Check className="size-3.5" aria-hidden="true" />}
              {esActual && (
                <span aria-hidden="true" className="relative flex size-2">
                  <span className="absolute inset-0 animate-pulso-anillo rounded-full bg-ring" />
                  <span className="relative size-2 rounded-full bg-ring" />
                </span>
              )}
              {paso.titulo}
            </li>
          )
        })}
      </ol>
      {fuera && <Badge variant="outline">{fuera.titulo}</Badge>}
    </div>
  )
}

export default function PaginaRegistro() {
  const [parametros, setParametros] = useSearchParams()
  // periodos: los meses abiertos, del más antiguo al más reciente; reportes: periodoId → resumen o null.
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [detalle, setDetalle] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)
  const [creando, setCreando] = useState(false)
  // El formulario se pide junto con el detalle, sin esperarlo: CapturaReporte lo toma al montarse.
  const [formularioPedido, setFormularioPedido] = useState(null)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)
  const [intentoDetalle, setIntentoDetalle] = useState(0)

  function cargar() {
    const carga = ++cargaActual.current
    setDatos(null)
    setErrorCarga(null)
    cargarMesesAbiertos()
      .then((cargados) => {
        if (carga === cargaActual.current) setDatos(cargados)
      })
      .catch((err) => {
        if (carga === cargaActual.current) setErrorCarga(mensajeDeError(err))
      })
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [])

  const pedido = Number(parametros.get('periodo'))
  const periodo = datos && (datos.periodos.find((p) => p.id === pedido) ?? mesPendiente(datos.periodos, datos.reportes))
  const resumen = periodo ? datos.reportes.get(periodo.id) : null

  useEffect(() => {
    // Recién creado, el detalle ya llegó con la respuesta del POST.
    if (resumen && detalle?.id === resumen.id) return
    setDetalle(null)
    setErrorAccion(null)
    setFormularioPedido(null)
    if (!resumen) return
    let vigente = true
    const pedido = { reporteId: resumen.id, promesa: obtenerFormulario(resumen.id) }
    // Si falla, CapturaReporte lo muestra al usarlo; aquí solo se evita el aviso de promesa sin atender.
    pedido.promesa.catch(() => {})
    setFormularioPedido(pedido)
    obtenerReporte(resumen.id)
      .then((reporte) => vigente && setDetalle(reporte))
      .catch((err) => vigente && setErrorAccion(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [resumen?.id, intentoDetalle])

  // El mes va en la URL para que siga elegido al recargar.
  function elegirPeriodo(id) {
    setParametros({ periodo: id }, { replace: true })
  }

  function anotarReporte(periodoId, reporte) {
    setDatos((actuales) => ({ ...actuales, reportes: new Map(actuales.reportes).set(periodoId, reporte) }))
  }

  async function crear() {
    setCreando(true)
    setErrorAccion(null)
    try {
      const reporte = await crearReporte(periodo.id)
      anotarReporte(periodo.id, reporte)
      setDetalle(reporte)
    } catch (err) {
      if (err.codigo === 'REPORTE_EXISTENTE') {
        // Otra sesión lo creó: se muestra el que ya existe.
        const { elementos } = await listarReportes({ periodoId: periodo.id }).catch(() => ({ elementos: [] }))
        if (elementos[0]) anotarReporte(periodo.id, elementos[0])
        else setErrorAccion(mensajeDeError(err))
      } else {
        setErrorAccion(mensajeDeError(err))
      }
    } finally {
      setCreando(false)
    }
  }

  const titulo = periodo ? `Reporte mensual de ${nombreDelMes(periodo)}` : 'Registro de producción'
  const antetitulo = detalle ? `Registro de producción · ${detalle.establecimiento.nombre}` : 'Registro de producción'

  const pendiente = !resumen || resumen.estado === 'BORRADOR'
  const vencido = periodo?.fechaLimiteEnvio && pendiente && diasHasta(periodo.fechaLimiteEnvio) < 0

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo={antetitulo}
        titulo={titulo}
        acciones={detalle && <PasosDeEstado estado={detalle.estado} />}
      />

      {errorCarga && (
        <AvisoError onReintentar={cargar}>No se pudieron cargar los meses abiertos: {errorCarga}</AvisoError>
      )}

      {!errorCarga && datos === null && (
        <div aria-label="Cargando registro" className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-8 w-full" />
          ))}
        </div>
      )}

      {datos && datos.periodos.length === 0 && (
        <p className="text-muted-foreground">No hay meses abiertos para reportar. La DDRISS abre cada mes en Configuración.</p>
      )}

      {periodo && (
        <>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            {/* Dentro de un form, Radix agrega el <select> nativo del Select. */}
            <form onSubmit={(evento) => evento.preventDefault()}>
              <Select name="periodo" value={String(periodo.id)} onValueChange={elegirPeriodo}>
                <SelectTrigger aria-label="Mes" className="w-full bg-card sm:w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {datos.periodos.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {nombreDelMes(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </form>
            <p className={cn('flex items-center gap-1.5 text-sm', vencido ? 'text-destructive' : 'text-muted-foreground')}>
              <CalendarClock className="size-4" aria-hidden="true" />
              Fecha límite de envío:{' '}
              <span className={cn('font-semibold', vencido ? 'text-destructive' : 'text-foreground')}>
                {aDiaMesAnio(periodo.fechaLimiteEnvio)}
              </span>
              {periodo.fechaLimiteEnvio && pendiente && <span> ({textoPlazo(periodo.fechaLimiteEnvio)})</span>}
            </p>
          </div>

          {errorAccion && (
            <AvisoError onReintentar={resumen && !detalle ? () => setIntentoDetalle((n) => n + 1) : undefined}>
              {errorAccion}
            </AvisoError>
          )}

          {!resumen && (
            <Card>
              <CardHeader>
                <CardTitle>Todavía no hay reporte de {nombreDelMes(periodo)}</CardTitle>
                <CardDescription>
                  Al crearlo, el reporte queda en Borrador con las vacunas y las versiones de formulario vigentes para este mes.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button onClick={crear} disabled={creando}>
                  <FilePlus />
                  {creando ? 'Creando…' : `Crear reporte de ${nombreDelMes(periodo)}`}
                </Button>
              </CardContent>
            </Card>
          )}

          {resumen && !detalle && !errorAccion && <Skeleton aria-label="Cargando reporte" className="h-40 w-full" />}
          {detalle && (
            <CapturaReporte
              key={detalle.id}
              reporte={detalle}
              formularioPedido={formularioPedido?.reporteId === detalle.id ? formularioPedido.promesa : null}
            />
          )}
        </>
      )}
    </section>
  )
}
