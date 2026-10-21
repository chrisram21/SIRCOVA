// jsdom no implementa ResizeObserver, que Radix usa para medir el Checkbox y el Select.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

// jsdom no implementa matchMedia, y el Sidebar de shadcn lo usa (hook use-mobile) para saber si la pantalla es angosta.
if (!window.matchMedia) {
  window.matchMedia = (consulta) => ({
    matches: false,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })
}
