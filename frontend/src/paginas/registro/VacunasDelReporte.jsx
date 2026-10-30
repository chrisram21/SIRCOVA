import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { mensajeDeError } from '@/api/cliente.js'
import { listarVacunasDisponibles } from '@/api/produccion.js'
import { AvisoError } from '@/componentes/Avisos.jsx'

// Con estos dos errores lo que se ve ya no coincide con el reporte: solo queda volver a cargarlo.
const ERRORES_DE_RECARGA = ['REPORTE_DESACTUALIZADO', 'REPORTE_NO_EDITABLE']

// El error de agregar o quitar, dentro del diálogo; con uno de recarga, el mismo botón que al guardar.
function ErrorDeAccion({ error, alRecargar }) {
  return (
    <AvisoError
      onReintentar={ERRORES_DE_RECARGA.includes(error.codigo) ? alRecargar : undefined}
      textoReintentar="Recargar reporte"
    >
      {mensajeDeError(error)}
    </AvisoError>
  )
}

// «Agregar vacuna» (SPEC 31): abre la lista de las vacunas con esquema para el mes que el reporte no tiene. alAgregar
// recibe la elegida y hace el POST; si lanza, el error se ve en el diálogo, que sigue abierto.
export function AgregarVacuna({ reporteId, deshabilitado, alAgregar, alRecargar }) {
  const [abierto, setAbierto] = useState(false)
  const [disponibles, setDisponibles] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [agregando, setAgregando] = useState(null)
  const [errorAccion, setErrorAccion] = useState(null)

  useEffect(() => {
    if (!abierto) return undefined
    let vigente = true
    setDisponibles(null)
    setErrorCarga(null)
    listarVacunasDisponibles(reporteId)
      .then((lista) => vigente && setDisponibles(lista))
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [abierto, reporteId, intento])

  function cambiarAbierto(abrir) {
    if (agregando) return
    setAbierto(abrir)
    setErrorAccion(null)
  }

  async function agregar(disponible) {
    setAgregando(disponible.vacunaId)
    setErrorAccion(null)
    try {
      await alAgregar(disponible)
      setAbierto(false)
    } catch (err) {
      setErrorAccion(err)
    } finally {
      setAgregando(null)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" disabled={deshabilitado} onClick={() => cambiarAbierto(true)}>
        <Plus />
        Agregar vacuna
      </Button>
      <Dialog open={abierto} onOpenChange={cambiarAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Agregar vacuna al reporte</DialogTitle>
            <DialogDescription>Las vacunas con formulario de captura para este mes que el reporte no tiene.</DialogDescription>
          </DialogHeader>
          {errorAccion && (
            <ErrorDeAccion
              error={errorAccion}
              alRecargar={() => {
                setAbierto(false)
                alRecargar()
              }}
            />
          )}
          {errorCarga ? (
            <AvisoError onReintentar={() => setIntento((n) => n + 1)}>
              No se pudieron cargar las vacunas: {errorCarga}
            </AvisoError>
          ) : disponibles === null ? (
            <div aria-label="Cargando vacunas" className="flex flex-col gap-2">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-10 w-full" />
              ))}
            </div>
          ) : disponibles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay más vacunas con formulario para este mes.</p>
          ) : (
            <ul aria-label="Vacunas disponibles" className="flex max-h-80 flex-col divide-y overflow-y-auto rounded-lg border">
              {disponibles.map((disponible) => (
                <li key={disponible.vacunaId} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium">{disponible.nombre}</span>
                    <span className="text-xs text-muted-foreground">versión {disponible.esquema.version}</span>
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    aria-label={`Agregar ${disponible.nombre}`}
                    disabled={agregando !== null}
                    onClick={() => agregar(disponible)}
                  >
                    {agregando === disponible.vacunaId ? 'Agregando…' : 'Agregar'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}

// La confirmación de «Quitar vacuna». alConfirmar hace el DELETE; si lanza, el error se ve aquí y sigue abierto.
export function DialogoQuitarVacuna({ vacuna, conCantidades, alConfirmar, alCerrar, alRecargar }) {
  const [quitando, setQuitando] = useState(false)
  const [error, setError] = useState(null)

  async function confirmar(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar.
    evento.preventDefault()
    setQuitando(true)
    setError(null)
    try {
      await alConfirmar()
    } catch (err) {
      setError(err)
      setQuitando(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !quitando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Quitar {vacuna.vacuna.nombre} del reporte?</AlertDialogTitle>
          <AlertDialogDescription>
            {conCantidades
              ? 'Se borrarán sus cantidades y no se pueden recuperar.'
              : 'Podrá agregarla de nuevo mientras el reporte esté en borrador.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error && <ErrorDeAccion error={error} alRecargar={alRecargar} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={quitando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={quitando} onClick={confirmar}>
            {quitando ? 'Quitando…' : 'Quitar vacuna'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
