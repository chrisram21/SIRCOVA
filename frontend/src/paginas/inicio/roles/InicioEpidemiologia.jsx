import { TarjetasSinDatos } from '../TarjetaSinDatos.jsx'

const TARJETAS = ['Cobertura departamental', 'Municipios en meta', 'Reportes cerrados del mes', 'Alertas activas']

export default function InicioEpidemiologia() {
  return <TarjetasSinDatos titulos={TARJETAS} />
}
