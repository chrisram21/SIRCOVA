import { obtenerAvance } from '@/api/revision.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import AvanceCierre, { TarjetaReportesCerrados } from '../AvanceCierre.jsx'
import { cargarIndicadoresDelInicio } from '../indicadoresDelInicio.js'
import { LineaDeCorte, TarjetaCobertura, TarjetaMunicipiosEnMeta, enlaceAIndicadores } from '../ResumenIndicadores.jsx'
import { useConsulta } from '../TarjetaResumen.jsx'
import { TarjetasDelInicio } from '../TarjetaSinDatos.jsx'

const consultarIndicadores = async () => ({ indicadores: await cargarIndicadoresDelInicio() })
const consultarAvance = () => obtenerAvance()

export default function InicioEpidemiologia() {
  const { tienePermiso } = useSesion()
  const indicadores = useConsulta(consultarIndicadores, { activa: tienePermiso('INDICADOR_CONSULTAR') })
  const conAvance = tienePermiso('REPORTE_AVANCE_CONSULTAR')
  const avance = useConsulta(consultarAvance, { activa: conAvance })
  const deIndicadores = { consulta: indicadores, enlace: enlaceAIndicadores(indicadores) }

  // Las alertas llegan con HU-50 a HU-52.
  const tarjetas = [
    { titulo: 'Cobertura departamental', Datos: TarjetaCobertura, permisos: ['INDICADOR_CONSULTAR'], props: deIndicadores },
    { titulo: 'Municipios en meta', Datos: TarjetaMunicipiosEnMeta, permisos: ['INDICADOR_CONSULTAR'], props: deIndicadores },
    {
      titulo: 'Reportes cerrados del mes',
      Datos: TarjetaReportesCerrados,
      permisos: ['REPORTE_AVANCE_CONSULTAR'],
      props: { consulta: avance },
    },
    { titulo: 'Alertas activas' },
  ]

  return (
    <>
      <LineaDeCorte consulta={indicadores} />
      <TarjetasDelInicio tarjetas={tarjetas} />
      {conAvance && <AvanceCierre consulta={avance} puedeRevisar={tienePermiso('REPORTE_REVISAR')} />}
    </>
  )
}
