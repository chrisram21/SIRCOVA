// Lo guardado por consultarConCache (cache.js): ruta → { token, promesa, hasta }. Va aparte, sin depender del
// cliente, para que las pruebas lo vacíen sin cargar cliente.js antes que sus vi.mock.
export const entradas = new Map()

// Tras una escritura propia: '/establecimientos' borra también '/establecimientos?activo=true' y '/establecimientos/4'.
export function invalidarCache(...prefijos) {
  for (const ruta of [...entradas.keys()]) {
    if (prefijos.some((prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}?`) || ruta.startsWith(`${prefijo}/`))) {
      entradas.delete(ruta)
    }
  }
}

export function vaciarCache() {
  entradas.clear()
}
