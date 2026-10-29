import { useId } from 'react'
import { cn } from '@/lib/utils'

// El cuadro azul marino con la cruz blanca del logo; con `animada`, la cruz se dibuja al aparecer.
export default function MarcaSircova({ className, animada = false }) {
  const id = `marca-${useId().replace(/[^a-zA-Z0-9]/g, '')}`
  const trazo = animada ? 'animate-trazo' : undefined

  return (
    <svg viewBox="0 0 30 30" aria-hidden="true" className={cn('shrink-0', className)}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--primary)' }} />
          <stop offset="1" style={{ stopColor: 'var(--marca-profundo)' }} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="28" height="28" rx="7" fill={`url(#${id})`} />
      <rect x="1.5" y="1.5" width="27" height="27" rx="6.5" fill="none" strokeWidth="1" className="stroke-ring/50" />
      <g strokeWidth="3.2" strokeLinecap="round" className="stroke-primary-foreground" style={{ strokeDasharray: 1 }}>
        <path d="M15 8v14" pathLength="1" className={trazo} />
        <path d="M8 15h14" pathLength="1" className={trazo} style={{ animationDelay: '0.25s' }} />
      </g>
      <circle cx="23.5" cy="6.5" r="1.6" className="fill-ring" />
    </svg>
  )
}
