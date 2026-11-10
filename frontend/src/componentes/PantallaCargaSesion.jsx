import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import FondoMarca from '@/componentes/FondoMarca.jsx'
import MarcaSircova from '@/componentes/MarcaSircova.jsx'
import { cn } from '@/lib/utils'

// Una carga más corta no muestra nada, para que no parpadee.
export const RETRASO_MS = 300
// Si otra pantalla de carga se veía hace menos que esto, la nueva sale de inmediato: así Suspense → datos de la
// pantalla se ve como una sola carga, sin un tramo en blanco en medio.
export const CONTINUIDAD_MS = 150

let visibles = 0
let ultimaVisibleHasta = -Infinity

const aparecerYa = () => visibles > 0 || Date.now() - ultimaVisibleHasta < CONTINUIDAD_MS

// A pantalla completa mientras se recupera la sesión con la cookie (en vez de mandar al login un instante y perder la
// dirección pedida), mientras llega el código de una pantalla y en la primera carga de las que tardan.
export default function PantallaCargaSesion({ etiqueta = 'Recuperando la sesión' }) {
  const [visible, setVisible] = useState(aparecerYa)

  useEffect(() => {
    if (visible) return undefined
    const espera = setTimeout(() => setVisible(true), RETRASO_MS)
    return () => clearTimeout(espera)
  }, [visible])

  useEffect(() => {
    if (!visible) return undefined
    visibles += 1
    return () => {
      visibles -= 1
      ultimaVisibleHasta = Date.now()
    }
  }, [visible])

  if (!visible) return null

  // En un portal: dentro del Layout, el transform de animate-aparecer volvería relativa a la pantalla la capa fija.
  return createPortal(
    <div
      role="status"
      aria-label={etiqueta}
      className={cn(
        'fixed inset-0 isolate z-50 flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden',
        'text-primary-foreground',
      )}
    >
      <FondoMarca />
      <div aria-hidden="true" className="flex animate-aparecer items-center gap-3">
        <MarcaSircova animada className="size-12" />
        <span className="text-2xl font-bold tracking-wide">SIRCOVA</span>
      </div>
      {/* Con movimiento reducido, la barra quedaría quieta y parecería colgada: se cambia por el texto. */}
      <div aria-hidden="true" className="h-0.5 w-48 overflow-hidden rounded-full bg-primary-foreground/20 motion-reduce:hidden">
        <div className="h-full w-1/3 animate-barra-carga bg-ring" />
      </div>
      <p className="hidden text-sm motion-reduce:block">Cargando…</p>
    </div>,
    document.body,
  )
}

// true hasta la primera vez que `lista` es true; después, siempre false (los cambios de filtro usan sus esqueletos).
export function usePrimeraCarga(lista) {
  const [primera, setPrimera] = useState(!lista)
  if (primera && lista) setPrimera(false)
  return primera && !lista
}
