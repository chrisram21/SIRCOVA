import { Badge } from '@/components/ui/badge'
import { CLASES_COLOR } from './InsigniaValor.jsx'

// Sí y No llevan su texto además del color, para no depender solo de él.
export default function InsigniaCumple({ cumple }) {
  if (cumple === null || cumple === undefined) return <span className="text-muted-foreground">—</span>
  return (
    <Badge variant="outline" className={cumple ? CLASES_COLOR.verde : CLASES_COLOR.rojo}>
      {cumple ? 'Sí' : 'No'}
    </Badge>
  )
}
