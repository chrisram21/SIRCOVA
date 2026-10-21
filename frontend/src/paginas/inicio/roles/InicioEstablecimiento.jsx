import { TarjetasSinDatos } from '../TarjetaSinDatos.jsx'

const TARJETAS = [
  'Estado y fecha límite de mi reporte',
  'Validaciones pendientes',
  'Cobertura de mi municipio',
  'Tendencia mensual',
]

export default function InicioEstablecimiento() {
  return <TarjetasSinDatos titulos={TARJETAS} />
}
