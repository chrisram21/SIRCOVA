import { useEffect, useRef, useState } from 'react'

export const menosMovimiento = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

// Para la utilidad `foco-luz` de index.css: la luz sigue al puntero dentro del elemento (o de su hijo).
export function seguirPuntero(evento) {
  const caja = evento.currentTarget.getBoundingClientRect()
  evento.currentTarget.style.setProperty('--x', `${evento.clientX - caja.left}px`)
  evento.currentTarget.style.setProperty('--y', `${evento.clientY - caja.top}px`)
}

// Un entero sube desde 0 (o desde el valor anterior) hasta `valor`; cualquier otro valor se muestra tal cual.
// Con movimiento reducido, y en las pruebas, se muestra el valor final desde el inicio.
export function useCifraAnimada(valor, duracion = 900) {
  const [mostrado, setMostrado] = useState(() => (Number.isInteger(valor) && !menosMovimiento() ? 0 : valor))
  const ultimo = useRef(mostrado)

  useEffect(() => {
    if (!Number.isInteger(valor) || menosMovimiento()) {
      ultimo.current = valor
      setMostrado(valor)
      return
    }
    const origen = Number.isInteger(ultimo.current) ? ultimo.current : 0
    const inicio = performance.now()
    let cuadro
    const avanzar = (ahora) => {
      const t = Math.min((ahora - inicio) / duracion, 1)
      const actual = Math.round(origen + (valor - origen) * (1 - (1 - t) ** 3))
      ultimo.current = actual
      setMostrado(actual)
      if (t < 1) cuadro = requestAnimationFrame(avanzar)
    }
    cuadro = requestAnimationFrame(avanzar)
    return () => cancelAnimationFrame(cuadro)
  }, [valor, duracion])

  return mostrado
}
