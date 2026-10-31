import { useEffect, useRef, useState } from 'react'
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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { asignarRevisor, listarRevisores, reasignarRevisor } from '@/api/revision.js'
import { AvisoError } from '@/componentes/Avisos.jsx'

// Asignar un reporte ENVIADO (a sí mismo o a otro revisor) o pasar uno EN_REVISION propio a otro revisor. Quien lo
// abre lo monta de nuevo en cada apertura y, con alHecho(mensaje), avisa y recarga la bandeja.
export default function DialogoAsignarRevisor({ modo, fila, usuarioId, alHecho, alRecargar, alCerrar }) {
  const reasignar = modo === 'reasignar'
  const [revisores, setRevisores] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [elegido, setElegido] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // { mensaje, desactualizado }: un 409 ofrece «Recargar», porque la fila ya no es la que se ve.
  const [errorApi, setErrorApi] = useState(null)
  const selector = useRef(null)

  function cargar() {
    setErrorCarga(null)
    setRevisores(null)
    listarRevisores()
      .then(setRevisores)
      .catch((err) => setErrorCarga(mensajeDeError(err)))
  }

  useEffect(cargar, [])

  // El usuario no aparece en la lista: para sí mismo está «Asignármelo», y al reasignar es el revisor actual.
  const otros = (revisores ?? []).filter((r) => r.id !== usuarioId)
  const errorElegido = intentado && elegido === '' ? 'Elija un revisor.' : null
  const establecimiento = fila.establecimiento.nombre

  async function confirmar(revisorId, nombre) {
    setEnviando(true)
    setErrorApi(null)
    try {
      const cuerpo = { versionFila: fila.versionFila, revisorId }
      if (reasignar) await reasignarRevisor(fila.reporteId, cuerpo)
      else await asignarRevisor(fila.reporteId, cuerpo)
      alHecho(
        revisorId === usuarioId
          ? `El reporte de ${establecimiento} quedó asignado a usted.`
          : `El reporte de ${establecimiento} quedó asignado a ${nombre}.`,
      )
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), desactualizado: err instanceof ErrorApi && err.status === 409 })
      setEnviando(false)
    }
  }

  function confirmarElegido(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso o el error.
    evento.preventDefault()
    if (enviando) return
    setIntentado(true)
    if (elegido === '') {
      selector.current?.focus()
      return
    }
    const revisor = otros.find((r) => String(r.id) === elegido)
    confirmar(revisor.id, revisor.nombre)
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{reasignar ? 'Pasar a otro revisor' : 'Asignar el reporte'}</AlertDialogTitle>
          <AlertDialogDescription>
            {reasignar
              ? `El reporte de ${establecimiento} sigue en revisión, a cargo del revisor que elija.`
              : `El reporte de ${establecimiento} pasa a «En revisión» a cargo del revisor que elija.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {errorCarga ? (
          <AvisoError onReintentar={cargar}>No se pudieron cargar los revisores: {errorCarga}</AvisoError>
        ) : (
          // Dentro de un form, Radix agrega el <select> nativo del Select.
          <form className="flex flex-col gap-2" onSubmit={(evento) => evento.preventDefault()}>
            <Label htmlFor="revisor-elegido" className="font-semibold">
              {reasignar ? 'Revisor nuevo' : 'Otro revisor'}
            </Label>
            <Select name="revisor" value={elegido} onValueChange={setElegido} disabled={revisores === null || enviando}>
              <SelectTrigger
                id="revisor-elegido"
                ref={selector}
                className="w-full"
                aria-invalid={errorElegido ? true : undefined}
                aria-describedby={errorElegido ? 'revisor-elegido-error' : undefined}
              >
                <SelectValue placeholder={revisores === null ? 'Cargando revisores…' : 'Elija un revisor'} />
              </SelectTrigger>
              <SelectContent>
                {otros.map((r) => (
                  <SelectItem key={r.id} value={String(r.id)}>
                    {r.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {revisores !== null && otros.length === 0 && (
              <p className="text-sm text-muted-foreground">No hay otros revisores activos en la DDRISS.</p>
            )}
            {errorElegido && (
              <p id="revisor-elegido-error" className="text-sm text-destructive">
                {errorElegido}
              </p>
            )}
          </form>
        )}

        {errorApi && (
          <AvisoError onReintentar={errorApi.desactualizado ? alRecargar : undefined} textoReintentar="Recargar">
            {errorApi.mensaje}
          </AvisoError>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          {!reasignar && (
            <Button variant="outline" disabled={enviando} onClick={() => confirmar(usuarioId, null)}>
              Asignármelo
            </Button>
          )}
          <AlertDialogAction disabled={enviando || errorCarga !== null} onClick={confirmarElegido}>
            {enviando ? 'Guardando…' : reasignar ? 'Reasignar' : 'Asignar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
