import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

export const MARCAS = {
  valor: {
    activo: { texto: 'Activo', ayuda: 'Se puede usar en esquemas nuevos.' },
    inactivo: { texto: 'Inactivo', ayuda: 'No se ofrece en esquemas nuevos. Lo guardado con él no cambia.' },
    enUso: { texto: 'En uso', ayuda: 'Lo usa un esquema vigente o en borrador, por eso no se puede desactivar.' },
    sinPoblacion: {
      texto: 'Sin población',
      ayuda: 'No tiene población objetivo: se registran sus dosis, pero no se calcula su cobertura.',
    },
  },
  dimension: {
    activo: { texto: 'Activa', ayuda: 'Se puede usar en esquemas nuevos.' },
    inactivo: { texto: 'Inactiva', ayuda: 'No se ofrece en esquemas nuevos. Lo guardado con ella no cambia.' },
    enUso: { texto: 'En uso', ayuda: 'La usa un esquema vigente o en borrador, por eso no se puede desactivar.' },
  },
}

// Necesita un TooltipProvider arriba. El tabIndex deja abrir el Tooltip con el teclado (un Badge no recibe el foco).
export default function MarcaDimension({ marca, de }) {
  const { texto, ayuda } = MARCAS[de][marca]
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Sin el data-slot propio, el TooltipTrigger le pondría el suyo. */}
        <Badge variant={marca === 'activo' ? 'secondary' : 'outline'} tabIndex={0} data-slot="badge">
          {texto}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{ayuda}</TooltipContent>
    </Tooltip>
  )
}
