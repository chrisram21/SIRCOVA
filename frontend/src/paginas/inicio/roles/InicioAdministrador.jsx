import { TarjetasSinDatos } from '../TarjetaSinDatos.jsx'

const TARJETAS = [
  'Usuarios activos',
  'Esquemas de captura vigentes o por vencer',
  'Cambios en catálogos',
  'Actividad de la bitácora',
]

export default function InicioAdministrador() {
  return <TarjetasSinDatos titulos={TARJETAS} />
}
