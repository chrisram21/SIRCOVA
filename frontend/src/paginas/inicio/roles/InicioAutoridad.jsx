import { TarjetasDelInicio } from '../TarjetaSinDatos.jsx'

// Sin endpoints de indicadores todavía: las agrega el spec de cada dato.
const TARJETAS = [{ titulo: 'Indicadores clave' }, { titulo: 'Avance y proyección' }, { titulo: 'Ranking de municipios' }]

export default function InicioAutoridad() {
  return <TarjetasDelInicio tarjetas={TARJETAS} />
}
