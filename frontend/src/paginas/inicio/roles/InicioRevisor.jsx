import { TarjetasSinDatos } from '../TarjetaSinDatos.jsx'

const TARJETAS = [
  'Estado de los reportes del periodo',
  'Bandeja de pendientes',
  'Alertas de calidad y de proceso',
  'Periodos por cerrar',
  'Solicitudes de rectificación',
]

export default function InicioRevisor() {
  return <TarjetasSinDatos titulos={TARJETAS} />
}
