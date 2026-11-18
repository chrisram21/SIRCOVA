import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { mensajeDeError } from '@/api/cliente.js'
import { guardarArchivo } from '@/lib/archivos.js'

// SPEC 72 (HU-64): «Exportar Excel» de las pestañas de «Indicadores». El error se muestra encima de la tabla, así que
// el estado lo lleva la pantalla con este hook y el botón solo lo dibuja.
export function useExportarExcel() {
  const [exportando, setExportando] = useState(false)
  const [error, setError] = useState(null)

  async function exportar(descargar) {
    setExportando(true)
    setError(null)
    try {
      const { blob, nombre } = await descargar()
      guardarArchivo(blob, nombre ?? 'indicadores.xlsx')
    } catch (err) {
      setError(mensajeDeError(err))
    } finally {
      setExportando(false)
    }
  }

  return { exportando, error, exportar, limpiar: () => setError(null) }
}

export function BotonExportarExcel({ exportando, alExportar }) {
  return (
    <Button variant="outline" onClick={alExportar} disabled={exportando}>
      <FileSpreadsheet />
      {exportando ? 'Exportando…' : 'Exportar Excel'}
    </Button>
  )
}
