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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listarPeriodos } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { calcularIndicadores } from '@/api/indicadores.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { MESES } from '@/lib/fechas.js'

const unirMeses = (meses) => {
  const nombres = meses.map((mes) => MESES[mes - 1])
  return nombres.length === 1 ? nombres[0] : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`
}

// Los meses de enero al corte que no están CERRADO en la DDRISS: con alguno, la corrida sale parcial.
export function mesesSinCerrar(periodos, anio, mesHasta) {
  const cerrados = new Set(periodos.filter((p) => p.anio === anio && p.estado === 'CERRADO').map((p) => p.mes))
  return Array.from({ length: mesHasta }, (_, i) => i + 1).filter((mes) => !cerrados.has(mes))
}

export function avisoDeMesesSinCerrar(meses) {
  if (meses.length === 0) return null
  const verbo = meses.length === 1 ? 'no está cerrado' : 'no están cerrados'
  const sujeto = unirMeses(meses)
  return `${sujeto.charAt(0).toUpperCase()}${sujeto.slice(1)} ${verbo}: solo se cuentan los reportes ya cerrados.`
}

// SPEC 44: calcula en el momento los indicadores de la DDRISS del usuario con corte al mes elegido. Quien lo abre lo
// monta de nuevo en cada apertura; alHecho(corrida) llega después del aviso.
export default function DialogoCalcularIndicadores({ anio, mes, alHecho, alCerrar }) {
  const [periodos, setPeriodos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [elegido, setElegido] = useState({ anio, mes })
  const [enviando, setEnviando] = useState(false)
  const [errorApi, setErrorApi] = useState(null)

  useEffect(() => {
    let vigente = true
    setErrorCarga(null)
    listarPeriodos()
      .then((recibidos) => vigente && setPeriodos(recibidos))
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [intento])

  const anios = periodos ? [...new Set(periodos.map((p) => p.anio))].sort((a, b) => b - a) : []
  const mesesDelAnio = periodos ? periodos.filter((p) => p.anio === elegido.anio).map((p) => p.mes).sort((a, b) => a - b) : []
  const enCalendario = mesesDelAnio.includes(elegido.mes)
  const aviso = periodos && enCalendario ? avisoDeMesesSinCerrar(mesesSinCerrar(periodos, elegido.anio, elegido.mes)) : null

  function elegirAnio(valor) {
    const nuevo = Number(valor)
    const meses = periodos.filter((p) => p.anio === nuevo).map((p) => p.mes)
    setElegido({ anio: nuevo, mes: meses.includes(elegido.mes) ? elegido.mes : Math.max(...meses) })
  }

  async function calcular(evento) {
    // Radix cierra el diálogo al pulsar; se cierra al terminar, para mostrar el progreso o el error.
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setErrorApi(null)
    try {
      const corrida = await calcularIndicadores({ anio: elegido.anio, mesHasta: elegido.mes })
      const n = corrida.totalResultados
      toast.success(
        `Indicadores de ${MESES[elegido.mes - 1]} de ${elegido.anio} calculados: ${n === 1 ? '1 resultado' : `${n} resultados`}.`,
      )
      alHecho(corrida)
    } catch (err) {
      setErrorApi(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(abierto) => !abierto && !enviando && alCerrar()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Calcular indicadores</AlertDialogTitle>
          <AlertDialogDescription>
            Se calculan los indicadores que aplican a su DDRISS, con las dosis acumuladas de enero al mes elegido. El
            cálculo nuevo reemplaza al anterior del mismo mes.
          </AlertDialogDescription>
        </AlertDialogHeader>

        {errorCarga && <AvisoError onReintentar={() => setIntento((n) => n + 1)}>{errorCarga}</AvisoError>}

        {periodos && (
          // Dentro de un form, Radix agrega el <select> nativo de cada Select.
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={(evento) => evento.preventDefault()}>
            <div className="flex flex-col gap-2">
              <Label htmlFor="calcular-anio">Año</Label>
              <Select name="anio" value={String(elegido.anio)} onValueChange={elegirAnio}>
                <SelectTrigger id="calcular-anio" className="w-full">
                  <SelectValue placeholder="Elija el año" />
                </SelectTrigger>
                <SelectContent>
                  {anios.map((a) => (
                    <SelectItem key={a} value={String(a)}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="calcular-mes">Mes de corte</Label>
              <Select
                name="mes"
                value={enCalendario ? String(elegido.mes) : undefined}
                onValueChange={(valor) => setElegido({ ...elegido, mes: Number(valor) })}
              >
                <SelectTrigger id="calcular-mes" className="w-full">
                  <SelectValue placeholder="Elija el mes" />
                </SelectTrigger>
                <SelectContent>
                  {mesesDelAnio.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {MESES[m - 1]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </form>
        )}

        {aviso && (
          <p id="aviso-calculo" className="rounded-md bg-advertencia px-3 py-2 text-sm text-advertencia-foreground">
            {aviso}
          </p>
        )}
        {errorApi && <AvisoError>{errorApi}</AvisoError>}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={enviando || !periodos || !enCalendario}
            aria-describedby={aviso ? 'aviso-calculo' : undefined}
            onClick={calcular}
          >
            {enviando ? 'Calculando…' : 'Calcular'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
