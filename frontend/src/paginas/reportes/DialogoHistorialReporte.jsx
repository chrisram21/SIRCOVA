import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { mensajeDeError } from '@/api/cliente.js'
import { listarHistorial } from '@/api/produccion.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import HistorialEstadosReporte from '@/componentes/HistorialEstadosReporte.jsx'
import { nombreDelMes } from '@/lib/fechas.js'

// Abierto mientras haya `reporte`; el historial se pide cada vez que se abre.
export default function DialogoHistorialReporte({ reporte, alCerrar }) {
  const [cambios, setCambios] = useState(null)
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)
  const reporteId = reporte?.id

  useEffect(() => {
    if (!reporteId) return undefined
    let vigente = true
    setCambios(null)
    setError(null)
    listarHistorial(reporteId)
      .then((lista) => vigente && setCambios(lista))
      .catch((err) => vigente && setError(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [reporteId, intento])

  return (
    <Dialog open={Boolean(reporte)} onOpenChange={(abierto) => !abierto && alCerrar()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Historial · {reporte ? nombreDelMes(reporte.periodo) : ''}</DialogTitle>
          <DialogDescription>Quién cambió el estado del reporte y cuándo.</DialogDescription>
        </DialogHeader>
        {error ? (
          <AvisoError onReintentar={() => setIntento((n) => n + 1)}>No se pudo cargar el historial: {error}</AvisoError>
        ) : cambios ? (
          <HistorialEstadosReporte cambios={cambios} />
        ) : (
          <Skeleton aria-label="Cargando historial" className="h-24 w-full" />
        )}
      </DialogContent>
    </Dialog>
  )
}
