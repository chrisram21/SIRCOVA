import { CircleAlert, CircleCheck, RotateCw } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Error en la página. Con onReintentar, lleva el botón «Reintentar» (por ejemplo, cuando falló una carga).
export function AvisoError({ children, onReintentar, textoReintentar = 'Reintentar', className }) {
  const aviso = (
    <Alert variant="destructive" className={cn('border-destructive/20 bg-destructive/10', !onReintentar && className)}>
      <CircleAlert />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
  if (!onReintentar) return aviso
  return (
    <div className={cn('flex flex-col items-start gap-3', className)}>
      {aviso}
      <Button variant="outline" onClick={onReintentar}>
        <RotateCw />
        {textoReintentar}
      </Button>
    </div>
  )
}

const TONOS_EXITO = {
  marca: { alerta: 'border-ring/40 bg-accent text-accent-foreground', texto: 'text-accent-foreground' },
  verde: { alerta: 'border-exito-foreground/20 bg-exito text-exito-foreground', texto: 'text-exito-foreground' },
}

// Un resultado que debe quedar a la vista; los avisos de guardado van con toast (sonner). tono="verde" para uno que
// debe resaltar más que el celeste común.
export function AvisoExito({ children, className, tono = 'marca' }) {
  const { alerta, texto } = TONOS_EXITO[tono]
  return (
    <Alert role="status" className={cn(alerta, className)}>
      <CircleCheck />
      <AlertDescription className={texto}>{children}</AlertDescription>
    </Alert>
  )
}
