import { useEffect, useState } from 'react'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { listarPeriodos } from '@/api/catalogos.js'
import { publicarEsquema } from '@/api/configuracion.js'
import { validarMotivoCambio } from '@/validaciones/campos.js'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// El mismo "hoy" que usa el backend.
const hoyGuatemala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())

// AAAA-MM-DD → DD/MM/AAAA.
export const aDiaMesAnio = (fecha) => fecha.split('-').reverse().join('/')

// El aviso con que vuelven a la pestaña la fila y el editor.
export const avisoDePublicacion = (esquema) =>
  `Versión ${esquema.version} de ${esquema.vacuna.nombre} publicada; vigente desde ${aDiaMesAnio(esquema.vigencia.desde)}.`

// El último día del mes anterior a una fecha AAAA-MM-01: el "hasta" de la versión que se reemplaza.
function diaAnterior(fecha) {
  const [anio, mes] = fecha.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, 0)).toISOString().slice(0, 10)
}

// Las reglas de la vigencia del backend: un mes del calendario, desde el actual y, si el vigente que aplica es de la
// DDRISS, después de su inicio. El vigente nacional no limita.
export function mesesValidos(periodos, vigente, hoy = hoyGuatemala()) {
  const desdeMinimo = `${hoy.slice(0, 7)}-01`
  const deLaDdriss = vigente?.territorio.nivel === 'DDRISS'
  return periodos
    .filter((p) => p.fechaInicio >= desdeMinimo && (!deLaDdriss || p.fechaInicio > vigente.vigenciaDesde))
    .sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio))
}

// Quien lo abre lo monta de nuevo en cada apertura, así empieza vacío y vuelve a pedir los meses.
export default function DialogoPublicarEsquema({ vacuna, borrador, vigente, alPublicar, alCerrar }) {
  const [meses, setMeses] = useState(null)
  const [errorMeses, setErrorMeses] = useState(null)
  const [desde, setDesde] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errorApi, setErrorApi] = useState(null)
  const [publicando, setPublicando] = useState(false)

  useEffect(() => {
    let vigenteCarga = true
    const anio = Number(hoyGuatemala().slice(0, 4))
    Promise.all([listarPeriodos({ anio }), listarPeriodos({ anio: anio + 1 })])
      .then(([actual, siguiente]) => {
        if (vigenteCarga) setMeses(mesesValidos([...actual, ...siguiente], vigente))
      })
      .catch((err) => {
        if (vigenteCarga) setErrorMeses(err.mensaje)
      })
    return () => {
      vigenteCarga = false
    }
  }, [vigente])

  const motivoRevisado = validarMotivoCambio(motivo)
  // Vacío no se marca: el botón queda deshabilitado; solo se avisa de un motivo demasiado largo.
  const errorMotivo = motivo.trim() !== '' && motivoRevisado.error
  const listo = desde !== '' && !motivoRevisado.error && !publicando

  async function confirmar(evento) {
    evento.preventDefault()
    if (!listo) return
    setPublicando(true)
    setErrorApi(null)
    try {
      alPublicar(await publicarEsquema(borrador.id, { vigenciaDesde: desde, motivoCambio: motivoRevisado.valor }))
    } catch (err) {
      // El Dialog sigue abierto y conserva lo elegido.
      setErrorApi(err.mensaje)
      setPublicando(false)
    }
  }

  let reemplazo = null
  if (vigente?.territorio.nivel === 'DDRISS') {
    reemplazo = desde
      ? `La versión ${vigente.version} dejará de usarse el ${aDiaMesAnio(diaAnterior(desde))}.`
      : `La versión ${vigente.version} dejará de usarse el día anterior a la vigencia.`
  } else if (vigente) {
    reemplazo = `Desde esa fecha, su DDRISS usará esta versión en lugar de la nacional ${vigente.version}.`
  } else {
    reemplazo = 'Desde esa fecha, su DDRISS usará esta versión.'
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !publicando && alCerrar()}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={confirmar} noValidate>
          <DialogHeader>
            <DialogTitle>
              Publicar la versión {borrador.version} de {vacuna.nombre}
            </DialogTitle>
            <DialogDescription>
              {reemplazo} Los reportes ya capturados conservan su versión. Una versión publicada no se puede editar
              ni descartar.
            </DialogDescription>
          </DialogHeader>

          {errorApi && (
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
              <CircleAlert />
              <AlertDescription>{errorApi}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="publicar-vigencia" className="font-semibold">
              Vigente desde
            </Label>
            {errorMeses ? (
              <p className="text-sm text-destructive">No se pudieron cargar los meses: {errorMeses}</p>
            ) : meses !== null && meses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay meses disponibles en el calendario; agréguelos en la pestaña «Periodos».
              </p>
            ) : (
              <Select name="vigenciaDesde" value={desde} onValueChange={setDesde} disabled={meses === null || publicando}>
                <SelectTrigger id="publicar-vigencia" className="w-full">
                  <SelectValue placeholder={meses === null ? 'Cargando meses…' : 'Elija el mes'} />
                </SelectTrigger>
                <SelectContent>
                  {(meses ?? []).map((p) => (
                    <SelectItem key={p.fechaInicio} value={p.fechaInicio}>
                      {MESES[p.mes - 1]} {p.anio}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="publicar-motivo" className="font-semibold">
              Motivo del cambio
            </Label>
            <Textarea
              id="publicar-motivo"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              disabled={publicando}
              aria-invalid={errorMotivo ? true : undefined}
              aria-describedby={errorMotivo ? 'publicar-motivo-error' : undefined}
            />
            {errorMotivo && (
              <p id="publicar-motivo-error" className="text-sm text-destructive">
                {errorMotivo}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={publicando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!listo}>
              {publicando ? 'Publicando…' : 'Publicar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
