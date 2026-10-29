import { toast } from 'sonner'
import { vaciarCache } from '@/api/almacenCache.js'
import { borrarSesion } from '@/api/sesion.js'

// Los toasts no se dibujan en las pruebas: se comprueba la llamada, p. ej. expect(toast.success).toHaveBeenCalledWith(…).
vi.mock('sonner', () => {
  const toast = Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    dismiss: vi.fn(),
  })
  return { toast, Toaster: () => null }
})

// Las pruebas no llegan a la API real: sin un fetch propio (vi.stubGlobal), la petición queda pendiente. Si llegaran,
// un 401 con el token falso cerraría la sesión en medio de otra prueba. /auth/refrescar sí responde, como un navegador
// sin cookie: si no, una app montada sin sesión se quedaría recuperándola.
globalThis.fetch = (url) => {
  if (String(url).endsWith('/auth/refrescar')) {
    const error = { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debe iniciar sesión.' } }
    return Promise.resolve(new Response(JSON.stringify(error), { status: 401 }))
  }
  return new Promise(() => {})
}

afterEach(() => {
  // La sesión vive en memoria y sobrevive entre las pruebas de un archivo; sessionStorage.clear() ya no la borra.
  borrarSesion()
  localStorage.removeItem('sircova.actividad')
  vaciarCache()
  for (const funcion of [toast, toast.success, toast.error, toast.info, toast.warning, toast.dismiss]) funcion.mockClear()
})

// jsdom no implementa scrollTo (solo avisa en la consola); App la usa al cambiar de pantalla.
window.scrollTo = () => {}

// jsdom no implementa ResizeObserver, que Radix usa para medir el Checkbox y el Select.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom no implementa matchMedia, y el Sidebar de shadcn lo usa (hook use-mobile) para saber si la pantalla es angosta.
// Las pruebas corren con movimiento reducido: las cifras animadas (componentes/efectos.js) muestran su valor final.
if (!window.matchMedia) {
  window.matchMedia = (consulta) => ({
    matches: consulta.includes('prefers-reduced-motion: reduce'),
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
