import { useParams } from 'react-router-dom'
import FormularioEstablecimiento from './FormularioEstablecimiento.jsx'

export default function PaginaEditarEstablecimiento() {
  const { id } = useParams()
  return <FormularioEstablecimiento id={id} />
}
