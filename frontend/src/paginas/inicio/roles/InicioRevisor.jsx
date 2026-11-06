import { listarPeriodos } from '@/api/catalogos.js'
import { listarRectificaciones } from '@/api/rectificaciones.js'
import { obtenerAvance, obtenerBandeja } from '@/api/revision.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { aDiaMesAnio, nombreDelMes, porFecha, textoPlazo } from '@/lib/fechas.js'
import AvanceCierre, { TarjetaEstadoReportes } from '../AvanceCierre.jsx'
import TarjetaResumen, { Cifra, useConsulta } from '../TarjetaResumen.jsx'
import { TarjetasDelInicio } from '../TarjetaSinDatos.jsx'

async function consultarAbiertos() {
  const abiertos = await listarPeriodos({ estado: 'ABIERTO' })
  return [...abiertos].sort(porFecha)
}

// Los meses que la DDRISS tiene abiertos: los que falta cerrar, con el plazo de envío del más antiguo.
function TarjetaPeriodos({ titulo, tono }) {
  const consulta = useConsulta(consultarAbiertos)
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={consulta}
      enlace={{ a: '/administracion/periodos', texto: 'Ver periodos' }}
    >
      {(abiertos) => {
        if (abiertos.length === 0) return <Cifra valor={0}>Ningún mes abierto.</Cifra>
        const [masAntiguo] = abiertos
        const plazo = masAntiguo.fechaLimiteEnvio
          ? `, envío hasta ${aDiaMesAnio(masAntiguo.fechaLimiteEnvio)} (${textoPlazo(masAntiguo.fechaLimiteEnvio)})`
          : ''
        return (
          <Cifra valor={abiertos.length}>
            {abiertos.length === 1 ? 'Mes abierto' : 'Meses abiertos'}: el más antiguo es {nombreDelMes(masAntiguo)}
            {plazo}.
          </Cifra>
        )
      }}
    </TarjetaResumen>
  )
}

// La bandeja del mes que se está cerrando: espera el mes que da el avance.
function TarjetaBandeja({ titulo, tono, consulta }) {
  const periodo = consulta.datos?.periodo
  const bandeja = useConsulta(() => obtenerBandeja({ periodoId: periodo.id, porPagina: 1 }), {
    activa: Boolean(periodo),
    clave: periodo?.id,
  })
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={periodo ? bandeja : consulta}
      enlace={periodo && { a: `/revision?periodo=${periodo.id}`, texto: 'Ir a revisión' }}
    >
      {({ conteos }) => {
        if (!periodo) return <p className="text-sm text-muted-foreground">No hay meses abiertos ni cerrados.</p>
        const asignados = conteos.ASIGNADOS_A_MI
        return (
          <Cifra valor={conteos.POR_ATENDER}>
            Por atender en {nombreDelMes(periodo)} · {asignados} {asignados === 1 ? 'asignado' : 'asignados'} a mí
          </Cifra>
        )
      }}
    </TarjetaResumen>
  )
}

const consultarPendientes = () => listarRectificaciones({ estado: 'PENDIENTE', porPagina: 1 })

function TarjetaRectificaciones({ titulo, tono }) {
  const consulta = useConsulta(consultarPendientes)
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={consulta}
      enlace={{ a: '/rectificaciones', texto: 'Ver rectificaciones' }}
    >
      {({ total }) => <Cifra valor={total}>{total === 1 ? 'Solicitud por resolver' : 'Solicitudes por resolver'}</Cifra>}
    </TarjetaResumen>
  )
}

const consultarAvance = () => obtenerAvance()

export default function InicioRevisor() {
  const { tienePermiso } = useSesion()
  const conAvance = tienePermiso('REPORTE_AVANCE_CONSULTAR')
  const avance = useConsulta(consultarAvance, { activa: conAvance })

  // Las alertas llegan con HU-50 a HU-52.
  const tarjetas = [
    {
      titulo: 'Estado de los reportes del periodo',
      Datos: TarjetaEstadoReportes,
      permisos: ['REPORTE_AVANCE_CONSULTAR'],
      props: { consulta: avance },
    },
    {
      titulo: 'Bandeja de pendientes',
      Datos: TarjetaBandeja,
      permisos: ['REPORTE_AVANCE_CONSULTAR', 'REPORTE_REVISAR'],
      props: { consulta: avance },
    },
    { titulo: 'Alertas de calidad y de proceso' },
    { titulo: 'Periodos por cerrar', Datos: TarjetaPeriodos, permisos: ['PERIODO_CONSULTAR'] },
    { titulo: 'Solicitudes de rectificación', Datos: TarjetaRectificaciones, permisos: ['RECTIFICACION_CONSULTAR'] },
  ]

  return (
    <>
      <TarjetasDelInicio tarjetas={tarjetas} />
      {conAvance && <AvanceCierre consulta={avance} puedeRevisar={tienePermiso('REPORTE_REVISAR')} />}
    </>
  )
}
