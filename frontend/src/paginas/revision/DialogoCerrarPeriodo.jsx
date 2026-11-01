import { useEffect, useState } from 'react'
import { toast } from 'sonner'
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
import { mensajeDeError } from '@/api/cliente.js'
import { cerrarPeriodo, obtenerBandeja } from '@/api/revision.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { aDiaMesAnio, nombreDelMes } from '@/lib/fechas.js'

// Con estos errores el mes ya no es el que se ve: solo queda volver a cargar.
const ERRORES_DE_RECARGA = ['PERIODO_CON_PENDIENTES', 'PERIODO_NO_EN_CIERRE', 'PERIODO_YA_CERRADO']

const textoFaltan = (n) => (n === 1 ? 'Falta 1 reporte por aprobar.' : `Faltan ${n} reportes por aprobar.`)

function textoAprobados(n) {
  if (n === 0) return 'No hay reportes aprobados. El mes ya no admitirá cambios, solo rectificaciones.'
  if (n === 1) return 'El reporte aprobado pasa a Cerrado y el mes ya no admite cambios, solo rectificaciones.'
  return `Los ${n} reportes aprobados pasan a Cerrado y el mes ya no admite cambios, solo rectificaciones.`
}

// Por qué no se puede cerrar, o null si se puede; también la nota del botón de la bandeja.
export function impedimentoDeCierre(cierre) {
  if (cierre.estado === 'ABIERTO') {
    return `Se puede cerrar cuando venza la fecha límite (${aDiaMesAnio(cierre.fechaLimiteEnvio)}).`
  }
  if (cierre.estado === 'CERRADO') return 'El mes ya está cerrado.'
  return cierre.faltanPorAprobar > 0 ? textoFaltan(cierre.faltanPorAprobar) : null
}

// SPEC 39: confirma el cierre del mes, que no se deshace. Al abrirse pide el resumen fresco del mes (lo usan la bandeja
// y «Periodos»). Quien lo abre lo monta de nuevo en cada apertura; alHecho(periodo) llega después del aviso.
export default function DialogoCerrarPeriodo({ periodo, alHecho, alRecargar, alCerrar }) {
  const [cierre, setCierre] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [enviando, setEnviando] = useState(false)
  // { mensaje, recargar }
  const [errorApi, setErrorApi] = useState(null)

  useEffect(() => {
    let vigente = true
    setCierre(null)
    setErrorCarga(null)
    obtenerBandeja({ periodoId: periodo.id, porPagina: 1 })
      .then((bandeja) => vigente && setCierre(bandeja.cierre))
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [periodo.id, intento])

  function recargar() {
    setErrorApi(null)
    setIntento((n) => n + 1)
    alRecargar?.()
  }

  async function cerrar(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso o el error.
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setErrorApi(null)
    try {
      const cerrado = await cerrarPeriodo(periodo.id)
      const n = cerrado.reportesCerrados
      toast.success(
        `Periodo de ${nombreDelMes(periodo)} cerrado: ${n === 1 ? '1 reporte cerrado' : `${n} reportes cerrados`}.`,
      )
      alHecho(cerrado)
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), recargar: ERRORES_DE_RECARGA.includes(err.codigo) })
      setEnviando(false)
    }
  }

  const motivo = cierre && impedimentoDeCierre(cierre)

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Cerrar el periodo de {nombreDelMes(periodo)}?</AlertDialogTitle>
          <AlertDialogDescription>
            {cierre ? textoAprobados(cierre.aprobados) : 'Revisando los reportes del mes…'}
          </AlertDialogDescription>
          {motivo && (
            <p id="motivo-cierre" className="text-sm text-advertencia-foreground">
              {motivo}
            </p>
          )}
        </AlertDialogHeader>

        {errorCarga && (
          <AvisoError onReintentar={() => setIntento((n) => n + 1)}>{errorCarga}</AvisoError>
        )}
        {errorApi && (
          <AvisoError onReintentar={errorApi.recargar ? recargar : undefined} textoReintentar="Recargar">
            {errorApi.mensaje}
          </AvisoError>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={enviando || !cierre || Boolean(motivo)}
            aria-describedby={motivo ? 'motivo-cierre' : undefined}
            onClick={cerrar}
          >
            {enviando ? 'Cerrando…' : 'Cerrar periodo'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
