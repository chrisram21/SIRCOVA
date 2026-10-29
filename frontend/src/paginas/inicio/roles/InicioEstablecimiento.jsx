import { Badge } from '@/components/ui/badge'
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
function TarjetaMiReporte({ titulo, tono }) {
  const consulta = useConsulta(consultarMiReporte)
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

const TARJETAS = [
  {
    titulo: 'Estado y fecha límite de mi reporte',
    Datos: TarjetaMiReporte,
    permisos: ['PERIODO_CONSULTAR', 'REPORTE_CONSULTAR'],
  },
  { titulo: 'Validaciones pendientes' },
  { titulo: 'Cobertura de mi municipio' },
  { titulo: 'Tendencia mensual' },
]

export default function InicioEstablecimiento() {
  return <TarjetasDelInicio tarjetas={TARJETAS} />
}
