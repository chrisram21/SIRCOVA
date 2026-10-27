import { createContext, useContext, useState } from 'react'

// Sin proveedor (pruebas que no montan el Layout) no hay cambios que consultar.
const SIN_PROVEEDOR = { hayCambios: false, anotarCambios: () => {} }

const ContextoCambiosPendientes = createContext(SIN_PROVEEDOR)

// La pantalla con un formulario anota si tiene cambios sin guardar; el Encabezado lo consulta al cerrar sesión.
export function ProveedorCambiosPendientes({ children }) {
  const [hayCambios, anotarCambios] = useState(false)
  return (
    <ContextoCambiosPendientes.Provider value={{ hayCambios, anotarCambios }}>{children}</ContextoCambiosPendientes.Provider>
  )
}

export function useCambiosPendientes() {
  return useContext(ContextoCambiosPendientes)
}
