// Los límites de public/geo (SPEC 50) son archivos estáticos, no la API: no pasan por solicitar ni llevan sesión. Se
// guardan en memoria del módulo; uno que falla se olvida para que «Reintentar» lo vuelva a pedir.
const cargados = new Map()

export function cargarLimites(ruta) {
  if (!cargados.has(ruta)) {
    const promesa = fetch(`${import.meta.env.BASE_URL}${ruta}`).then((respuesta) => {
      if (!respuesta.ok) throw new Error(`No se pudieron cargar los límites (${respuesta.status}).`)
      return respuesta.json()
    })
    promesa.catch(() => cargados.delete(ruta))
    cargados.set(ruta, promesa)
  }
  return cargados.get(ruta)
}
