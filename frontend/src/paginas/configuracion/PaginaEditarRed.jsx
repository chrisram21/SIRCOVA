import { useParams } from 'react-router-dom'
import FormularioRed from './FormularioRed.jsx'

export default function PaginaEditarRed() {
  const { id } = useParams()
  return <FormularioRed id={id} />
}
