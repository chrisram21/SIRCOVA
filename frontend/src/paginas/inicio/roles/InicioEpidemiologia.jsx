import { TarjetasDelInicio } from '../TarjetaSinDatos.jsx'

// Sin endpoints de indicadores ni de alertas todavía: las agrega el spec de cada dato.
const TARJETAS = [
  { titulo: 'Cobertura departamental' },
  { titulo: 'Municipios en meta' },
  { titulo: 'Reportes cerrados del mes' },
  { titulo: 'Alertas activas' },
]

export default function InicioEpidemiologia() {
  return <TarjetasDelInicio tarjetas={TARJETAS} />
}
