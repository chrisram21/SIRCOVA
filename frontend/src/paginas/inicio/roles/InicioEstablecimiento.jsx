import { Badge } from '@/components/ui/badge'
import { obtenerValidacionGuardada } from '@/api/produccion.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import InsigniaEstadoReporte from '@/componentes/InsigniaEstadoReporte.jsx'
import { aDiaMesAnio, diasHasta, nombreDelMes, textoPlazo } from '@/lib/fechas.js'
import { cn } from '@/lib/utils'
import { cargarMesesAbiertos, mesPendiente } from '@/paginas/registro/mesesAbiertos.js'
import TarjetaResumen, { useConsulta } from '../TarjetaResumen.jsx'
import { TarjetasDelInicio } from '../TarjetaSinDatos.jsx'

async function consultarMiReporte() {
  const { periodos, reportes } = await cargarMesesAbiertos()
  if (periodos.length === 0) return { periodo: null }
  const periodo = mesPendiente(periodos, reportes)
  return { periodo, reporte: reportes.get(periodo.id) }
}

// El mes que toca reportar (el mismo que abre Registro), su estado y cuánto falta para la fecha límite.
function TarjetaMiReporte({ titulo, tono, consulta }) {
  const periodo = consulta.datos?.periodo
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={consulta}
      enlace={periodo && { a: `/registro?periodo=${periodo.id}`, texto: 'Ir al registro' }}
    >
      {({ periodo: mes, reporte }) => {
        if (!mes) return <p className="text-sm text-muted-foreground">No hay meses abiertos para reportar.</p>
        const pendiente = !reporte || reporte.estado === 'BORRADOR'
        const vencido = pendiente && mes.fechaLimiteEnvio && diasHasta(mes.fechaLimiteEnvio) < 0
        return (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xl font-semibold first-letter:uppercase">{nombreDelMes(mes)}</p>
              {reporte ? <InsigniaEstadoReporte estado={reporte.estado} /> : <Badge variant="outline">Sin crear</Badge>}
            </div>
            {mes.fechaLimiteEnvio && (
              <p className={cn('text-sm', vencido ? 'font-medium text-destructive' : 'text-muted-foreground')}>
                Fecha límite: <span className="font-mono">{aDiaMesAnio(mes.fechaLimiteEnvio)}</span>
                {pendiente && ` · ${textoPlazo(mes.fechaLimiteEnvio)}`}
              </p>
            )}
          </div>
        )
      }}
    </TarjetaResumen>
  )
}

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`

// Las observaciones ABIERTO de la última validación del reporte del mes que toca (las justificadas ya se atendieron).
function TarjetaValidaciones({ titulo, tono, consulta }) {
  const reporte = consulta.datos?.reporte
  const validacion = useConsulta(() => obtenerValidacionGuardada(reporte.id), {
    activa: Boolean(reporte),
    clave: reporte?.id,
  })
  const periodo = consulta.datos?.periodo
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={reporte ? validacion : consulta}
      enlace={periodo && { a: `/registro?periodo=${periodo.id}`, texto: 'Ir al registro' }}
    >
      {(datos) => {
        if (!periodo) return <p className="text-sm text-muted-foreground">No hay meses abiertos para reportar.</p>
        if (!reporte) return <p className="text-sm text-muted-foreground">Todavía no ha creado el reporte de {nombreDelMes(periodo)}.</p>
        if (datos.validadoEn === null) return <p className="text-sm text-muted-foreground">Sin validar todavía.</p>
        const abiertos = datos.resultados.filter((r) => r.estado === 'ABIERTO')
        const errores = abiertos.filter((r) => r.severidad === 'ERROR').length
        const advertencias = abiertos.length - errores
        if (abiertos.length === 0) return <p className="text-sm text-muted-foreground">Sin observaciones pendientes.</p>
        return (
          <p className={cn('text-sm', errores > 0 ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {plural(errores, 'error', 'errores')} · {plural(advertencias, 'advertencia', 'advertencias')}
          </p>
        )
      }}
    </TarjetaResumen>
  )
}

const PERMISOS_MI_REPORTE = ['PERIODO_CONSULTAR', 'REPORTE_CONSULTAR']

export default function InicioEstablecimiento() {
  const { tienePermiso } = useSesion()
  const miReporte = useConsulta(consultarMiReporte, { activa: PERMISOS_MI_REPORTE.every(tienePermiso) })

  // «Cobertura de mi municipio» y «Tendencia mensual» todavía no tienen de dónde leer (SPEC 48).
  const tarjetas = [
    {
      titulo: 'Estado y fecha límite de mi reporte',
      Datos: TarjetaMiReporte,
      permisos: PERMISOS_MI_REPORTE,
      props: { consulta: miReporte },
    },
    { titulo: 'Validaciones pendientes', Datos: TarjetaValidaciones, permisos: PERMISOS_MI_REPORTE, props: { consulta: miReporte } },
    { titulo: 'Cobertura de mi municipio' },
    { titulo: 'Tendencia mensual' },
  ]

  return <TarjetasDelInicio tarjetas={tarjetas} />
}
