import { entradas } from './almacenCache.js'
import { solicitar } from './cliente.js'
import { leerSesion } from './sesion.js'

export { invalidarCache, vaciarCache } from './almacenCache.js'

const VIGENCIA_MS = 2 * 60_000

// Para catálogos que cambian poco y se piden en varias pantallas. La entrada es del token con que se pidió: con otra
// sesión (otro alcance) se vuelve a pedir. Cada llamada recibe su copia, para que nadie altere lo guardado.
export function consultarConCache(ruta) {
  const token = leerSesion()?.token ?? null
  const ahora = Date.now()
  let entrada = entradas.get(ruta)
  if (!entrada || entrada.token !== token || ahora >= entrada.hasta) {
    const promesa = solicitar(ruta)
    entrada = { token, promesa, hasta: ahora + VIGENCIA_MS }
    entradas.set(ruta, entrada)
    promesa.catch(() => {
      if (entradas.get(ruta)?.promesa === promesa) entradas.delete(ruta)
    })
  }
  return entrada.promesa.then((datos) => structuredClone(datos))
}

