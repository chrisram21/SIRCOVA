import { TarjetasSinDatos } from '../TarjetaSinDatos.jsx'

const TARJETAS = ['Indicadores clave', 'Avance y proyección', 'Ranking de municipios']

export default function InicioAutoridad() {
  return <TarjetasSinDatos titulos={TARJETAS} />
}
