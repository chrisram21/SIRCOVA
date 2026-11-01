import { MessageSquareWarning, PencilLine } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const dosCifras = (numero) => String(numero).padStart(2, '0')
const aFecha = (iso) => {
  const fecha = new Date(iso)
  return `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
}
const aFechaHora = (iso) => {
  const fecha = new Date(iso)
  return `${aFecha(iso)} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}

const CLASES_AVISO = 'border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground'

// SPEC 37: una observación pendiente de la última devolución (GET /reportes/{id}/observaciones).
export function ObservacionRevisor({ observacion, titulo }) {
  return (
    <Alert role="note" aria-label={titulo} className={CLASES_AVISO}>
      <MessageSquareWarning />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription className="text-advertencia-foreground">
        <p className="whitespace-pre-line text-foreground">{observacion.texto}</p>
        <p className="text-xs">
          {observacion.autor.nombre} · {aFechaHora(observacion.creadoEn)}
        </p>
      </AlertDescription>
    </Alert>
  )
}

// En CORRECCION_SOLICITADA, en lugar del aviso «Solo consulta». Las observaciones de una devolución comparten autor y
// fecha, así que basta con la primera.
export function AvisoDevolucion({ observaciones, puedeCorregir, corrigiendo, alCorregir }) {
  const [primera] = observaciones
  return (
    <Alert className={CLASES_AVISO}>
      <MessageSquareWarning />
      <AlertTitle>Devuelto para corrección</AlertTitle>
      <AlertDescription className="flex flex-col gap-3 text-advertencia-foreground sm:flex-row sm:items-center sm:justify-between">
        <p>
          {primera
            ? `${primera.autor.nombre} devolvió el reporte el ${aFecha(primera.creadoEn)}. Revise las observaciones y corríjalo.`
            : 'El revisor devolvió el reporte. Revise las observaciones y corríjalo.'}
        </p>
        {puedeCorregir && (
          <Button className="shrink-0" onClick={alCorregir} disabled={corrigiendo}>
            <PencilLine />
            {corrigiendo ? 'Abriendo…' : 'Corregir reporte'}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  )
}
