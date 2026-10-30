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
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { activarRegla, desactivarRegla } from '@/api/configuracion.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { validarMotivoCambio } from '@/validaciones/campos.js'

// Lo que pasa al desactivar o al activar, dicho antes de confirmar.
function consecuencia(fila, accion) {
  if (accion === 'activar') {
    return `Se publicará una versión nueva con el mismo contenido de la versión ${fila.ultimaDdriss.version}.`
  }
  if (fila.vigenteNacional) {
    return `Al desactivarla vuelve a aplicar la versión ${fila.vigenteNacional.version} nacional.`
  }
  return `Ninguna versión de esta regla revisará los reportes de ${fila.aplica.territorio.ddrissCodigo}.`
}

// Pide el motivo para desactivar el VIGENTE de la DDRISS o para activar su última versión. Quien lo abre lo monta de
// nuevo en cada apertura, así empieza vacío.
export default function DialogoEstadoRegla({ fila, accion, alDesactivar, alActivar, alRecargar, alCerrar }) {
  const [motivo, setMotivo] = useState('')
  const [intentado, setIntentado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // { mensaje, desactualizada }: un 409 ofrece «Recargar», porque la fila ya no es la que se ve.
  const [errorApi, setErrorApi] = useState(null)
  const [revisar, setRevisar] = useState(0)
  const campoMotivo = useRef(null)

  useEffect(() => {
    if (revisar > 0) campoMotivo.current?.focus()
  }, [revisar])

  const desactivar = accion === 'desactivar'
  const nombre = (fila.aplica ?? fila.ultimaDdriss).nombre
  const motivoRevisado = validarMotivoCambio(motivo)
  // Un motivo demasiado largo se avisa al escribir; uno vacío, al intentar confirmar.
  const errorMotivo = (intentado || motivo.trim() !== '') && motivoRevisado.error

  async function confirmar(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso o el error.
    evento.preventDefault()
    if (enviando) return
    setIntentado(true)
    if (motivoRevisado.error) {
      setRevisar((n) => n + 1)
      return
    }
    setEnviando(true)
    setErrorApi(null)
    try {
      const motivoCambio = motivoRevisado.valor
      if (desactivar) {
        alDesactivar(await desactivarRegla(fila.codigo, { version: fila.aplica.version, motivoCambio }))
      } else {
        alActivar(await activarRegla(fila.codigo, { version: fila.ultimaDdriss.version, motivoCambio }))
      }
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), desactualizada: err instanceof ErrorApi && err.status === 409 })
      setEnviando(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            ¿{desactivar ? 'Desactivar' : 'Activar'} la regla {nombre}?
          </AlertDialogTitle>
          <AlertDialogDescription>{consecuencia(fila, accion)}</AlertDialogDescription>
        </AlertDialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="estado-regla-motivo" className="font-semibold">
            Motivo del cambio
          </Label>
          <Textarea
            id="estado-regla-motivo"
            ref={campoMotivo}
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            disabled={enviando}
            aria-invalid={errorMotivo ? true : undefined}
            aria-describedby={errorMotivo ? 'estado-regla-motivo-error' : undefined}
          />
          {errorMotivo && (
            <p id="estado-regla-motivo-error" className="text-sm text-destructive">
              {errorMotivo}
            </p>
          )}
        </div>

        {errorApi && (
          <AvisoError
            onReintentar={errorApi.desactualizada ? alRecargar : undefined}
            textoReintentar="Recargar"
          >
            {errorApi.mensaje}
          </AvisoError>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            variant={desactivar ? 'destructive' : 'default'}
            disabled={enviando}
            onClick={confirmar}
          >
            {enviando ? (desactivar ? 'Desactivando…' : 'Activando…') : desactivar ? 'Desactivar' : 'Activar'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
