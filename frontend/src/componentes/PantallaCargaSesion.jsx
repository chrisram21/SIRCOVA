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
// Una carga inmediata queda al menos esto, para que no se vea como un parpadeo si los datos llegan rápido. Es un
// objeto para que preparar-pruebas.js lo ponga en 0 y las pruebas no esperen un segundo cada una.
export const VISIBLE_MINIMO = { ms: 500 }

let visibles = 0
let ultimaVisibleHasta = -Infinity

const aparecerYa = () => visibles > 0 || Date.now() - ultimaVisibleHasta < CONTINUIDAD_MS

// A pantalla completa mientras se recupera la sesión con la cookie (en vez de mandar al login un instante y perder la
// dirección pedida), mientras llega el código de una pantalla y en la primera carga de las que tardan.
// `inmediata` la muestra sin el retraso: al entrar desde el menú, la página ya está oculta y esperar dejaría un tramo
// en blanco. `fondo="borroso"` desenfoca lo que hay detrás (el Layout), como el fondo de un diálogo; sin nada dibujado
// detrás (la sesión al recargar), conviene el de la marca.
export default function PantallaCargaSesion({ etiqueta = 'Recuperando la sesión', inmediata = false, fondo = 'marca' }) {
  const borroso = fondo === 'borroso'
  const [visible, setVisible] = useState(() => inmediata || aparecerYa())

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
        borroso
          ? 'bg-background/40 text-foreground supports-backdrop-filter:backdrop-blur-sm'
          : 'text-primary-foreground',
      )}
    >
      {!borroso && <FondoMarca />}
      <div aria-hidden="true" className="flex animate-aparecer items-center gap-3">
        <MarcaSircova animada className="size-12" />
        <span className={cn('text-2xl font-bold tracking-wide', borroso && 'text-primary')}>SIRCOVA</span>
      </div>
      {/* Con movimiento reducido, la barra quedaría quieta y parecería colgada: se cambia por el texto. */}
      <div
        aria-hidden="true"
        className={cn(
          'h-0.5 w-48 overflow-hidden rounded-full motion-reduce:hidden',
          borroso ? 'bg-primary/15' : 'bg-primary-foreground/20',
        )}
      >
        <div className={cn('h-full w-1/3 animate-barra-carga', borroso ? 'bg-primary' : 'bg-ring')} />
      </div>
      <p className="hidden text-sm motion-reduce:block">Cargando…</p>
    </div>,
    document.body,
  )
}

// true hasta la primera vez que `lista` es true; después, siempre false (los cambios de filtro usan sus esqueletos).
// Con `conMinimo`, además dura al menos VISIBLE_MINIMO.ms desde el montaje (para la pantalla `inmediata`).
export function usePrimeraCarga(lista, { conMinimo = false } = {}) {
  const [primera, setPrimera] = useState(!lista)
  const [minimoCumplido, setMinimoCumplido] = useState(() => !conMinimo || lista || VISIBLE_MINIMO.ms <= 0)

  useEffect(() => {
    if (minimoCumplido) return undefined
    const espera = setTimeout(() => setMinimoCumplido(true), VISIBLE_MINIMO.ms)
    return () => clearTimeout(espera)
  }, [minimoCumplido])

  const terminada = lista && minimoCumplido
  if (primera && terminada) setPrimera(false)
  return primera && !terminada
}
