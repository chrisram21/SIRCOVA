import { useEffect, useRef, useState } from 'react'
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
import { mensajeDeError } from '@/api/cliente.js'
import { obtenerEsquema, publicarEsquema } from '@/api/configuracion.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { validarMotivoCambio } from '@/validaciones/campos.js'
import { problemasDeCoherencia } from './coherenciaEsquema.js'
import { cargarReferencias, contenidoDe } from './EditorEsquema.jsx'
import VistaPreviaEsquema from './VistaPreviaEsquema.jsx'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// El mismo "hoy" que usa el backend.
const hoyGuatemala = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date())

// AAAA-MM-DD → DD/MM/AAAA.
export const aDiaMesAnio = (fecha) => fecha.split('-').reverse().join('/')

// El aviso con que vuelven a la lista la fila y el editor.
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

// Publicar en dos pasos (SPEC 30): este diálogo pide la vigencia y el motivo, y «Continuar» abre la vista previa de lo
// guardado, que es la única que publica. Quien lo abre lo monta de nuevo en cada apertura, así empieza vacío y vuelve
// a pedir los meses.
export default function DialogoPublicarEsquema({ vacuna, borrador, vigente, alPublicar, alCerrar }) {
  const [paso, setPaso] = useState('datos')
  // { esquema, vacuna, dimensiones, contenido, problemas }: lo que muestra el paso 2.
  const [previa, setPrevia] = useState(null)
  const [cargandoPrevia, setCargandoPrevia] = useState(false)
  const [errorPrevia, setErrorPrevia] = useState(null)
  const [meses, setMeses] = useState(null)
  const [errorMeses, setErrorMeses] = useState(null)
  const [desde, setDesde] = useState('')
  const [motivo, setMotivo] = useState('')
  const [errorApi, setErrorApi] = useState(null)
  const [publicando, setPublicando] = useState(false)
  const [intentado, setIntentado] = useState(false)
  // Cada intento con errores sube este número; un efecto lleva el foco al primer campo inválido.
  const [revisar, setRevisar] = useState(0)
  // Cada «Reintentar» sube este número y vuelve a pedir los meses.
  const [intentoMeses, setIntentoMeses] = useState(0)
  const formulario = useRef(null)

  useEffect(() => {
    let vigenteCarga = true
    const anio = Number(hoyGuatemala().slice(0, 4))
    Promise.all([listarPeriodos({ anio }), listarPeriodos({ anio: anio + 1 })])
      .then(([actual, siguiente]) => {
        if (vigenteCarga) setMeses(mesesValidos([...actual, ...siguiente], vigente))
      })
      .catch((err) => {
        if (vigenteCarga) setErrorMeses(mensajeDeError(err))
      })
    return () => {
      vigenteCarga = false
    }
  }, [vigente, intentoMeses])

  useEffect(() => {
    if (revisar > 0) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  const motivoRevisado = validarMotivoCambio(motivo)
  const errorDesde = intentado && desde === '' ? 'Elija el mes desde el que rige la versión.' : null
  // Un motivo demasiado largo se avisa al escribir; uno vacío, al intentar publicar.
  const errorMotivo = (intentado || motivo.trim() !== '') && motivoRevisado.error

  function reintentarMeses() {
    setErrorMeses(null)
    setMeses(null)
    setIntentoMeses((n) => n + 1)
  }

  // También es el «Reintentar» de la carga: su botón está dentro del form, y preventDefault evita que además lo envíe.
  async function continuar(evento) {
    evento.preventDefault()
    if (cargandoPrevia) return
    setIntentado(true)
    if (desde === '' || motivoRevisado.error) {
      setRevisar((n) => n + 1)
      return
    }
    setCargandoPrevia(true)
    setErrorPrevia(null)
    try {
      const esquema = await obtenerEsquema(borrador.id)
      const referencias = await cargarReferencias(esquema.vacuna.id)
      const contenido = contenidoDe(esquema)
      const problemas = problemasDeCoherencia(contenido, { ...referencias, dosis: referencias.vacuna.dosis })
      setPrevia({ esquema, ...referencias, contenido, problemas })
      setErrorApi(null)
      setPaso('vista')
    } catch (err) {
      setErrorPrevia(mensajeDeError(err))
    } finally {
      setCargandoPrevia(false)
    }
  }

  async function confirmar() {
    if (publicando) return
    setPublicando(true)
    setErrorApi(null)
    try {
      alPublicar(await publicarEsquema(borrador.id, { vigenciaDesde: desde, motivoCambio: motivoRevisado.valor }))
    } catch (err) {
      // La vista previa sigue abierta y conserva lo elegido.
      setErrorApi(mensajeDeError(err))
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

  if (paso === 'vista') {
    const elegido = meses?.find((p) => p.fechaInicio === desde)
    return (
      <VistaPreviaEsquema
        abierta
        alCambiarAbierta={(abierta) => !abierta && alCerrar()}
        esquema={previa.esquema}
        contenido={previa.contenido}
        vacuna={previa.vacuna}
        dimensiones={previa.dimensiones}
        problemas={previa.problemas}
        publicacion={{
          vigencia: elegido ? `${MESES[elegido.mes - 1]} ${elegido.anio}` : aDiaMesAnio(desde),
          motivo: motivoRevisado.valor,
          publicando,
          errorApi,
          alVolver: () => setPaso('datos'),
          alConfirmar: confirmar,
        }}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !cargandoPrevia && alCerrar()}>
      <DialogContent>
        <form ref={formulario} className="flex flex-col gap-4" onSubmit={continuar} noValidate>
          <DialogHeader>
            <DialogTitle>
              Publicar la versión {borrador.version} de {vacuna.nombre}
            </DialogTitle>
            <DialogDescription>
              {reemplazo} Los reportes ya capturados conservan su versión. Una versión publicada no se puede editar
              ni descartar.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-2">
            <Label htmlFor="publicar-vigencia" className="font-semibold">
              Vigente desde
            </Label>
            {errorMeses ? (
              <AvisoError onReintentar={reintentarMeses}>No se pudieron cargar los meses: {errorMeses}</AvisoError>
            ) : meses !== null && meses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay meses disponibles en el calendario; agréguelos en «Administración › Periodos».
              </p>
            ) : (
              <>
                <Select name="vigenciaDesde" value={desde} onValueChange={setDesde} disabled={meses === null || cargandoPrevia}>
                  <SelectTrigger
                    id="publicar-vigencia"
                    className="w-full"
                    aria-invalid={errorDesde ? true : undefined}
                    aria-describedby={errorDesde ? 'publicar-vigencia-error' : undefined}
                  >
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
                {errorDesde && (
                  <p id="publicar-vigencia-error" className="text-sm text-destructive">
                    {errorDesde}
                  </p>
                )}
              </>
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
              disabled={cargandoPrevia}
              aria-invalid={errorMotivo ? true : undefined}
              aria-describedby={errorMotivo ? 'publicar-motivo-error' : undefined}
            />
            {errorMotivo && (
              <p id="publicar-motivo-error" className="text-sm text-destructive">
                {errorMotivo}
              </p>
            )}
          </div>

          {errorPrevia && (
            <AvisoError onReintentar={continuar}>No se pudo cargar la vista previa: {errorPrevia}</AvisoError>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={cargandoPrevia}>
              Cancelar
            </Button>
            <Button type="submit" disabled={cargandoPrevia}>
              {cargandoPrevia ? 'Cargando vista previa…' : 'Continuar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
