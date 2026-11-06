import { ESTADOS_REPORTE } from '@/componentes/InsigniaEstadoReporte.jsx'
import { aDiaMesAnio, nombreDelMes } from '@/lib/fechas.js'
import TarjetaResumen, { Cifra } from './TarjetaResumen.jsx'

// SPEC 48: lo que muestra GET /revision/avance (el mes que se está cerrando). consulta es un useConsulta de
// obtenerAvance: { periodo, esperados, conteos }.

const ESTADOS_PERIODO = { ABIERTO: 'abierto', EN_CIERRE: 'en cierre', CERRADO: 'cerrado' }

// El orden de la barra: de lo más avanzado a lo que falta.
const TRAMOS = [
  { estado: 'CERRADO', titulo: ESTADOS_REPORTE.CERRADO.titulo, clase: 'bg-estado-cerrado' },
  { estado: 'APROBADO', titulo: ESTADOS_REPORTE.APROBADO.titulo, clase: 'bg-estado-aprobado' },
  { estado: 'EN_REVISION', titulo: ESTADOS_REPORTE.EN_REVISION.titulo, clase: 'bg-estado-revision' },
  { estado: 'CORRECCION_SOLICITADA', titulo: ESTADOS_REPORTE.CORRECCION_SOLICITADA.titulo, clase: 'bg-estado-correccion' },
  { estado: 'ENVIADO', titulo: ESTADOS_REPORTE.ENVIADO.titulo, clase: 'bg-estado-enviado' },
  { estado: 'SIN_ENVIAR', titulo: 'Sin enviar', clase: 'bg-muted' },
]

const conMayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1)

const SIN_MESES ='No hay meses abiertos ni cerrados.'

function SinMeses() {
  return <p className="text-sm text-muted-foreground">{SIN_MESES}</p>
}

// Epidemiología: cuántos reportes del mes ya se cerraron.
export function TarjetaReportesCerrados({ titulo, tono, consulta }) {
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta}>
      {({ periodo, esperados, conteos }) =>
        periodo ? (
          <Cifra valor={conteos.CERRADO} de={esperados}>
            {conMayuscula(nombreDelMes(periodo))} · envío hasta {aDiaMesAnio(periodo.fechaLimiteEnvio)}
          </Cifra>
        ) : (
          <SinMeses />
        )
      }
    </TarjetaResumen>
  )
}

// Revisor: los reportes cerrados del mes y en qué estado está el mes.
export function TarjetaEstadoReportes({ titulo, tono, consulta }) {
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta}>
      {({ periodo, esperados, conteos }) =>
        periodo ? (
          <Cifra valor={conteos.CERRADO} de={esperados}>
            Cerrados de {nombreDelMes(periodo)}, mes {ESTADOS_PERIODO[periodo.estado] ?? periodo.estado}.
          </Cifra>
        ) : (
          <SinMeses />
        )
      }
    </TarjetaResumen>
  )
}

// La barra apilada del cierre con su leyenda, hecha con CSS: el Inicio no lleva gráficas.
export default function AvanceCierre({ consulta, puedeRevisar }) {
  const periodo = consulta.datos?.periodo
  const titulo = periodo ? `Avance del cierre de ${nombreDelMes(periodo)}` : 'Avance del cierre del mes'
  return (
    <TarjetaResumen
      titulo={titulo}
      consulta={consulta}
      enlace={puedeRevisar && periodo ? { a: `/revision?periodo=${periodo.id}`, texto: 'Ir a revisión' } : undefined}
    >
      {({ periodo: mes, esperados, conteos }) => {
        if (!mes) return <SinMeses />
        if (esperados === 0) return <p className="text-sm text-muted-foreground">No hay establecimientos que reporten en este mes.</p>
        return (
          <div className="flex flex-col gap-4">
            <div role="img" aria-label="Reportes del mes por estado" className="flex h-3 overflow-hidden rounded-full bg-muted">
              {TRAMOS.filter((t) => conteos[t.estado] > 0).map((t) => (
                <span
                  key={t.estado}
                  aria-label={`${t.titulo}: ${conteos[t.estado]}`}
                  className={t.clase}
                  style={{ width: `${(conteos[t.estado] / esperados) * 100}%` }}
                />
              ))}
            </div>
            <ul aria-label="Leyenda del avance" className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
              {TRAMOS.map((t) => (
                <li key={t.estado} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className={`size-2.5 rounded-full ring-1 ring-border ${t.clase}`} />
                    {t.titulo}
                  </span>
                  <span className="font-mono">{conteos[t.estado]}</span>
                </li>
              ))}
            </ul>
          </div>
        )
      }}
    </TarjetaResumen>
  )
}
