import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, CircleCheck, Plus, Trash2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { crearVacuna } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import {
  LARGOS,
  validarCodigoVacuna,
  validarDescripcionVacuna,
  validarNombreDosis,
  validarNombreVacuna,
} from '@/validaciones/campos.js'
import { Campo, CampoTexto } from '../usuarios/CamposEmpleado.jsx'
import { codigosDeLista, errorDeSecuencia, nombreSugerido, queCompleta, TIPOS_DOSIS } from './secuenciaDosis.js'

// Ruta de la pestaña si se llegó al formulario sin pasar por ella (p. ej. con la dirección escrita a mano).
const PESTANA = '?pestana=vacunas'
export const ORDEN_INFORME_MAXIMO = 65535
export const MENSAJE_ORDEN = `El orden en el informe debe ser un número entero entre 0 y ${ORDEN_INFORME_MAXIMO}.`

// Vacío es válido: al registrar, el backend pone la vacuna al final del informe.
export function validarOrdenInforme(valor) {
  const texto = valor.trim()
  if (texto === '') return { valor: null }
  if (!/^\d+$/.test(texto) || Number(texto) > ORDEN_INFORME_MAXIMO) return { error: MENSAJE_ORDEN }
  return { valor: Number(texto) }
}

const REGLAS = {
  codigo: validarCodigoVacuna,
  nombre: validarNombreVacuna,
  descripcion: validarDescripcionVacuna,
  ordenInforme: validarOrdenInforme,
}

function erroresDe(datos, filas) {
  const errores = {}
  for (const [campo, regla] of Object.entries(REGLAS)) {
    const { error } = regla(datos[campo])
    if (error) errores[campo] = error
  }
  filas.forEach((fila) => {
    if (!fila.tipo) errores[`tipo-${fila.clave}`] = 'Elija el tipo de la dosis.'
    const { error } = validarNombreDosis(fila.nombre)
    if (error) errores[`nombre-${fila.clave}`] = error
  })
  return errores
}

function armarCuerpo(datos, filas) {
  const cuerpo = {
    codigo: datos.codigo.trim(),
    nombre: datos.nombre.trim(),
    dosis: filas.map((f) => ({ tipo: f.tipo, nombre: f.nombre.trim(), esTrazadora: f.esTrazadora })),
  }
  if (datos.descripcion.trim()) cuerpo.descripcion = datos.descripcion.trim()
  const orden = validarOrdenInforme(datos.ordenInforme).valor
  if (orden !== null) cuerpo.ordenInforme = orden
  return cuerpo
}

function MensajeError({ id, mensaje }) {
  if (!mensaje) return null
  return (
    <p id={id} className="text-sm text-destructive">
      {mensaje}
    </p>
  )
}

function FilaDosis({ fila, numero, codigo, completa, primera, ultima, unica, errorTipo, errorNombre, acciones, deshabilitado }) {
  const id = `dosis-${fila.clave}`
  return (
    <li className="flex flex-col gap-3 rounded-lg border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Dosis {numero}</span>
        <Badge variant="outline" aria-label={`Código de la dosis ${numero}`}>
          {codigo ?? '—'}
        </Badge>
        {completa && (
          <Badge variant="secondary">
            <CircleCheck aria-hidden="true" />
            Completa el esquema
          </Badge>
        )}
        <div className="ml-auto flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Subir la dosis ${numero}`}
            disabled={deshabilitado || primera}
            onClick={acciones.subir}
          >
            <ArrowUp />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Bajar la dosis ${numero}`}
            disabled={deshabilitado || ultima}
            onClick={acciones.bajar}
          >
            <ArrowDown />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`Quitar la dosis ${numero}`}
            disabled={deshabilitado || unica}
            onClick={acciones.quitar}
          >
            <Trash2 />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[12rem_1fr_auto] md:items-start">
        <div className="flex flex-col gap-1.5">
          <Select name={`${id}-tipo`} value={fila.tipo} onValueChange={acciones.cambiarTipo} disabled={deshabilitado}>
            <SelectTrigger
              aria-label={`Tipo de la dosis ${numero}`}
              className="w-full bg-card"
              aria-invalid={errorTipo ? true : undefined}
              aria-describedby={errorTipo ? `${id}-tipo-error` : undefined}
            >
              <SelectValue placeholder="Elija el tipo" />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_DOSIS.map((t) => (
                <SelectItem key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <MensajeError id={`${id}-tipo-error`} mensaje={errorTipo} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Input
            aria-label={`Nombre de la dosis ${numero}`}
            placeholder="Nombre de la dosis"
            className="bg-card"
            value={fila.nombre}
            maxLength={LARGOS.nombreDosis}
            onChange={(evento) => acciones.cambiar('nombre', evento.target.value)}
            onBlur={acciones.tocar}
            disabled={deshabilitado}
            aria-invalid={errorNombre ? true : undefined}
            aria-describedby={errorNombre ? `${id}-nombre-error` : undefined}
          />
          <MensajeError id={`${id}-nombre-error`} mensaje={errorNombre} />
        </div>
        <div className="flex h-8 items-center gap-2">
          <Checkbox
            id={`${id}-trazadora`}
            checked={fila.esTrazadora}
            onCheckedChange={(valor) => acciones.cambiar('esTrazadora', valor === true)}
            disabled={deshabilitado}
            aria-label={`Trazadora (dosis ${numero})`}
          />
          <Label htmlFor={`${id}-trazadora`}>Trazadora</Label>
        </div>
      </div>
    </li>
  )
}

// Registra una vacuna con sus dosis. El orden de las filas es el orden del esquema.
export default function FormularioVacuna() {
  const navigate = useNavigate()
  const { state } = useLocation()
  // La pestaña manda sus filtros al abrir el formulario, para volver a ella con los mismos.
  const volverA = `/configuracion${state?.volverA || PESTANA}`

  const siguienteClave = useRef(1)
  const filaNueva = () => ({ clave: siguienteClave.current++, tipo: '', nombre: '', esTrazadora: false })
  const [datos, setDatos] = useState({ codigo: '', nombre: '', descripcion: '', ordenInforme: '' })
  const [filas, setFilas] = useState(() => [filaNueva()])
  // Un mensaje aparece cuando la persona sale del campo por primera vez, o al intentar guardar.
  const [tocados, setTocados] = useState({})
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  // Tras guardar se sale en un efecto, cuando el aviso de cambios sin guardar ya no bloquea.
  const [guardado, setGuardado] = useState(false)
  // Cada intento de envío con errores sube este número; un efecto lleva el foco al primer campo inválido.
  const [revisar, setRevisar] = useState(0)
  const formulario = useRef(null)
  const avisoSecuencia = useRef(null)
  const avisoError = useRef(null)

  const codigos = codigosDeLista(filas.map((f) => f.tipo))
  const completa = queCompleta(codigos)
  const errorSecuencia = errorDeSecuencia(filas.map((f) => f.tipo))
  const errores = erroresDe(datos, filas)
  const hayCambios =
    Object.values(datos).some((valor) => valor !== '') ||
    filas.length !== 1 ||
    filas[0].tipo !== '' ||
    filas[0].nombre !== '' ||
    filas[0].esTrazadora
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !guardado)

  useEffect(() => {
    if (guardado) navigate(volverA)
  }, [guardado, navigate, volverA])

  // El error de secuencia no es de un campo: si es el único, se lleva a la vista.
  useEffect(() => {
    if (revisar === 0) return
    const campo = formulario.current?.querySelector('[aria-invalid="true"]')
    if (campo) campo.focus()
    else avisoSecuencia.current?.scrollIntoView?.({ block: 'nearest' })
  }, [revisar])

  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView?.({ block: 'nearest' })
  }, [error])
  const errorDe = (campo) => (intentado || tocados[campo] ? errores[campo] : undefined)

  const tocar = (campo) => () => setTocados((actual) => (actual[campo] ? actual : { ...actual, [campo]: true }))
  const texto = (campo) => ({
    valor: datos[campo],
    alCambiar: (valor) => setDatos((actual) => ({ ...actual, [campo]: valor })),
    onBlur: tocar(campo),
    error: errorDe(campo),
    deshabilitado: enviando,
  })

  const cambiarFila = (clave, cambios) =>
    setFilas((actuales) => actuales.map((f) => (f.clave === clave ? { ...f, ...cambios } : f)))

  // El nombre sugerido reemplaza al que había si estaba vacío o era el sugerido del tipo anterior.
  function cambiarTipo(indice, tipo) {
    const fila = filas[indice]
    const anterior = codigos[indice].codigo
    const nuevo = codigosDeLista(filas.map((f, i) => (i === indice ? tipo : f.tipo)))[indice].codigo
    const nombre = fila.nombre.trim()
    const usaSugerido = nombre === '' || (anterior !== null && nombre === nombreSugerido(anterior))
    cambiarFila(fila.clave, { tipo, ...(usaSugerido ? { nombre: nombreSugerido(nuevo) } : {}) })
  }

  function mover(indice, desplazamiento) {
    setFilas((actuales) => {
      const nuevas = [...actuales]
      ;[nuevas[indice], nuevas[indice + desplazamiento]] = [nuevas[indice + desplazamiento], nuevas[indice]]
      return nuevas
    })
  }

  async function enviar(evento) {
    evento.preventDefault()
    setIntentado(true)
    if (enviando) return
    if (errorSecuencia || Object.keys(errores).length > 0) {
      setRevisar((n) => n + 1)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const vacuna = await crearVacuna(armarCuerpo(datos, filas))
      toast.success(`Vacuna ${vacuna.codigo} registrada. Falta crear su esquema de captura para que aparezca en el formulario.`)
      setGuardado(true)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Configuración" titulo="Registrar vacuna" volverA={volverA} />

      <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la vacuna</CardTitle>
            <CardDescription>Catálogo nacional: la vacuna queda para todas las DDRISS.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <CampoTexto
              id="codigo"
              etiqueta="Código"
              obligatorio
              {...texto('codigo')}
              maxLength={LARGOS.codigoVacuna}
              autoComplete="off"
              ayuda="Letras sin tildes, números y guion bajo. Se guarda en mayúsculas y no se puede cambiar después."
            />
            <CampoTexto
              id="orden-informe"
              etiqueta="Orden en el informe"
              {...texto('ordenInforme')}
              type="number"
              min={0}
              max={ORDEN_INFORME_MAXIMO}
              inputMode="numeric"
              ayuda="Vacío: al final del informe."
            />
            <div className="md:col-span-2">
              <CampoTexto
                id="nombre"
                etiqueta="Nombre"
                obligatorio
                {...texto('nombre')}
                maxLength={LARGOS.nombreVacuna}
              />
            </div>
            <div className="md:col-span-2">
              <Campo id="descripcion" etiqueta="Descripción">
                <Textarea
                  id="descripcion"
                  className="bg-card"
                  value={datos.descripcion}
                  maxLength={LARGOS.descripcionVacuna}
                  onChange={(evento) => texto('descripcion').alCambiar(evento.target.value)}
                  onBlur={tocar('descripcion')}
                  disabled={enviando}
                  aria-invalid={errorDe('descripcion') ? true : undefined}
                  aria-describedby={errorDe('descripcion') ? 'descripcion-error' : undefined}
                />
                <MensajeError id="descripcion-error" mensaje={errorDe('descripcion')} />
              </Campo>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dosis</CardTitle>
            <CardDescription>
              La dosis que completa el esquema la calcula el sistema: la última que no es refuerzo, o el último refuerzo
              si la vacuna solo tiene refuerzos.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {errorSecuencia && (
              <div ref={avisoSecuencia}>
                <AvisoError>{errorSecuencia}</AvisoError>
              </div>
            )}
            <ol className="flex flex-col gap-3" aria-label="Dosis de la vacuna">
              {filas.map((fila, i) => (
                <FilaDosis
                  key={fila.clave}
                  fila={fila}
                  numero={i + 1}
                  codigo={codigos[i].codigo}
                  completa={i === completa}
                  primera={i === 0}
                  ultima={i === filas.length - 1}
                  unica={filas.length === 1}
                  errorTipo={errorDe(`tipo-${fila.clave}`)}
                  errorNombre={errorDe(`nombre-${fila.clave}`)}
                  deshabilitado={enviando}
                  acciones={{
                    cambiarTipo: (tipo) => cambiarTipo(i, tipo),
                    cambiar: (campo, valor) => cambiarFila(fila.clave, { [campo]: valor }),
                    tocar: tocar(`nombre-${fila.clave}`),
                    subir: () => mover(i, -1),
                    bajar: () => mover(i, 1),
                    quitar: () => setFilas((actuales) => actuales.filter((f) => f.clave !== fila.clave)),
                  }}
                />
              ))}
            </ol>
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilas((actuales) => [...actuales, filaNueva()])}
                disabled={enviando}
              >
                <Plus />
                Agregar dosis
              </Button>
            </div>
          </CardContent>
        </Card>

        {error && (
          <div ref={avisoError}>
            <AvisoError>{error}</AvisoError>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar vacuna'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(volverA)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </form>

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Si sale ahora, se pierden los datos de la vacuna." />
    </section>
  )
}
