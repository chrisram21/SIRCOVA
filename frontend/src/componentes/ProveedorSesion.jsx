import { createContext, useContext, useState } from 'react'
import { borrarSesion, guardarSesion, leerSesion } from '@/api/sesion.js'

const ContextoSesion = createContext(null)

export function ProveedorSesion({ children }) {
  const [sesion, setSesion] = useState(() => leerSesion())

  function iniciar(respuestaLogin) {
    guardarSesion(respuestaLogin)
    setSesion(respuestaLogin)
  }

  function cerrar() {
    borrarSesion()
    setSesion(null)
  }

  return <ContextoSesion.Provider value={{ sesion, iniciar, cerrar }}>{children}</ContextoSesion.Provider>
}

export function useSesion() {
  return useContext(ContextoSesion)
}
