import { listarPeriodos } from '@/api/catalogos.js'
import { aDiaMesAnio, nombreDelMes, porFecha, textoPlazo } from '@/lib/fechas.js'
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
      enlace={{ a: '/configuracion?pestana=periodos', texto: 'Ver periodos' }}
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

const TARJETAS = [
  { titulo: 'Estado de los reportes del periodo' },
  { titulo: 'Bandeja de pendientes' },
  { titulo: 'Alertas de calidad y de proceso' },
  { titulo: 'Periodos por cerrar', Datos: TarjetaPeriodos, permisos: ['PERIODO_CONSULTAR'] },
  { titulo: 'Solicitudes de rectificación' },
]

export default function InicioRevisor() {
  return <TarjetasDelInicio tarjetas={TARJETAS} />
}
