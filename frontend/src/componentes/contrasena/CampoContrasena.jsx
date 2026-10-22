import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

// La contraseña solo se ve mientras se mantiene presionado el botón (ratón, dedo o Espacio).
export default function CampoContrasena({ className, ...props }) {
  const [visible, setVisible] = useState(false)
  const mostrar = () => setVisible(true)
  const ocultar = () => setVisible(false)

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className={cn('pr-9', className)} />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="absolute top-1/2 right-0.5 -translate-y-1/2 touch-none select-none"
        aria-label="Mantener presionado para ver la contraseña"
        aria-pressed={visible}
        disabled={props.disabled}
        onPointerDown={(evento) => {
          // Sin esto el botón le quitaría el foco al campo.
          evento.preventDefault()
          mostrar()
        }}
        onPointerUp={ocultar}
        onPointerLeave={ocultar}
        onPointerCancel={ocultar}
        onContextMenu={(evento) => evento.preventDefault()}
        onKeyDown={(evento) => {
          if (evento.key !== ' ') return
          evento.preventDefault()
          mostrar()
        }}
        onKeyUp={(evento) => {
          if (evento.key === ' ') ocultar()
        }}
        onBlur={ocultar}
      >
        {visible ? <EyeOff /> : <Eye />}
      </Button>
    </div>
  )
}
