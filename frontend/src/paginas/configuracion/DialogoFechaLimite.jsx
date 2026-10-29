import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { abrirPeriodo, cambiarFechaLimite } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'

const dosDigitos = (numero) => String(numero).padStart(2, '0')

// La sugerida al abrir: el día 10 del mes siguiente, como en la semilla.
function fechaSugerida({ anio, mes }) {
  return mes === 12 ? `${anio + 1}-01-10` : `${anio}-${dosDigitos(mes + 1)}-10`
}

// Las mismas reglas del backend; las fechas AAAA-MM-DD se comparan como texto.
function validarFecha(fecha, fechaFin) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Indique la fecha límite de envío.'
  if (fecha <= fechaFin) return `La fecha límite debe ser posterior al ${fechaFin}.`
  return null
}

// Sin estado, abre el mes en la DDRISS del usuario; con estado (abierto o en cierre), cambia su fecha límite.
// Quien lo abre lo monta de nuevo en cada apertura, así empieza con la fecha del mes.
export default function DialogoFechaLimite({ periodo, nombreMes, alGuardar, alCerrar }) {
  const abriendo = periodo.estado === null
  const [fecha, setFecha] = useState(abriendo ? fechaSugerida(periodo) : periodo.fechaLimiteEnvio)
  const [error, setError] = useState(null)
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(evento) {
    evento.preventDefault()
    const errorFecha = validarFecha(fecha, periodo.fechaFin)
    setError(errorFecha)
    if (errorFecha) return

    setGuardando(true)
    setErrorApi(null)
    try {
      alGuardar(abriendo ? await abrirPeriodo(periodo.id, fecha) : await cambiarFechaLimite(periodo.id, fecha))
    } catch (err) {
      // El Dialog sigue abierto y conserva la fecha escrita.
      setErrorApi(mensajeDeError(err))
      setGuardando(false)
    }
  }

  const titulo = abriendo
    ? `Abrir ${nombreMes} ${periodo.anio}`
    : `Cambiar la fecha límite de ${nombreMes} ${periodo.anio}`

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !guardando && alCerrar()}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>
              {abriendo
                ? 'Al abrirlo, los establecimientos de su DDRISS pueden reportar este mes hasta la fecha límite.'
                : 'La fecha límite es solo la de su DDRISS.'}
            </DialogDescription>
          </DialogHeader>

          {errorApi && <AvisoError>{errorApi}</AvisoError>}

          {periodo.estado === 'EN_CIERRE' && (
            <p className="text-sm text-muted-foreground">
              Si la nueva fecha es hoy o posterior, el mes vuelve a Abierto y los establecimientos pueden enviar de
              nuevo.
            </p>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="periodo-fecha-limite" className="font-semibold">
              Fecha límite de envío
            </Label>
            <Input
              id="periodo-fecha-limite"
              type="date"
              value={fecha}
              onChange={(evento) => setFecha(evento.target.value)}
              disabled={guardando}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? 'periodo-fecha-limite-error' : undefined}
            />
            {error && (
              <p id="periodo-fecha-limite-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : abriendo ? 'Abrir mes' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
