import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleAlert, FilePlus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { listarPeriodos } from '@/api/catalogos.js'
import { crearReporte, listarReportes, obtenerReporte } from '@/api/produccion.js'
import CapturaReporte from './CapturaReporte.jsx'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

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

const nombreDelMes = (periodo) => `${MESES[periodo.mes - 1]} de ${periodo.anio}`
const porFecha = (a, b) => a.anio - b.anio || a.mes - b.mes

// La API manda AAAA-MM-DD; se muestra sin pasar por Date para no correrla un día por la zona horaria.
const aDiaMesAnio = (fecha) => (fecha ? fecha.split('-').reverse().join('/') : '—')

// El más antiguo sin reporte o con el reporte en borrador; si todos se enviaron, el más reciente.
function mesPendiente(periodos, reportes) {
  const pendiente = periodos.find((p) => !reportes.get(p.id) || reportes.get(p.id).estado === 'BORRADOR')
  return pendiente ?? periodos.at(-1)
}

function PasosDeEstado({ estado }) {
  const fuera = FUERA_DE_LOS_PASOS[estado]
  const actual = fuera?.paso ?? estado
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ol aria-label="Estado del reporte" className="flex flex-wrap gap-1.5 text-xs">
        {PASOS.map((paso) => (
          <li
            key={paso.estado}
            aria-current={paso.estado === actual ? 'step' : undefined}
            className={cn(
              'rounded-full px-3 py-1.5',
              paso.estado === actual ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted text-muted-foreground',
            )}
          >
            {paso.titulo}
          </li>
        ))}
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
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setDatos(null)
    setErrorCarga(null)
    listarPeriodos({ estado: 'ABIERTO' })
      .then(async (abiertos) => {
        const periodos = [...abiertos].sort(porFecha)
        const paginas = await Promise.all(periodos.map((p) => listarReportes({ periodoId: p.id })))
        const reportes = new Map(periodos.map((p, i) => [p.id, paginas[i].elementos[0] ?? null]))
        if (carga === cargaActual.current) setDatos({ periodos, reportes })
      })
      .catch((err) => {
        if (carga === cargaActual.current) setErrorCarga(err.mensaje)
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
    if (!resumen) return
    let vigente = true
    obtenerReporte(resumen.id)
      .then((reporte) => vigente && setDetalle(reporte))
      .catch((err) => vigente && setErrorAccion(err.mensaje))
    return () => {
      vigente = false
    }
  }, [resumen?.id])

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
        else setErrorAccion(err.mensaje)
      } else {
        setErrorAccion(err.mensaje)
      }
    } finally {
      setCreando(false)
    }
  }

  const titulo = periodo ? `Reporte mensual de ${nombreDelMes(periodo)}` : 'Registro de producción'
  const antetitulo = detalle ? `Registro de producción · ${detalle.establecimiento.nombre}` : 'Registro de producción'

  return (
    <section className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{antetitulo}</p>
          <h1 className="text-2xl font-semibold">{titulo}</h1>
        </div>
        {detalle && <PasosDeEstado estado={detalle.estado} />}
      </div>

      {errorCarga && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
            <CircleAlert />
            <AlertDescription>No se pudieron cargar los meses abiertos: {errorCarga}</AlertDescription>
          </Alert>
          <Button variant="outline" onClick={cargar}>
            Reintentar
          </Button>
        </div>
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
            <p className="text-sm text-muted-foreground">
              Fecha límite de envío: <span className="font-semibold text-foreground">{aDiaMesAnio(periodo.fechaLimiteEnvio)}</span>
            </p>
          </div>

          {errorAccion && (
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
              <CircleAlert />
              <AlertDescription>{errorAccion}</AlertDescription>
            </Alert>
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
          {detalle && <CapturaReporte key={detalle.id} reporte={detalle} />}
        </>
      )}
    </section>
  )
}
