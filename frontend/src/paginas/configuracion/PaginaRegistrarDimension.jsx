import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { crearDimension } from '@/api/configuracion.js'
import { mensajeDeError } from '@/api/cliente.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import {
  LARGOS,
  validarCodigoDimension,
  validarCodigoValorDimension,
  validarDescripcionDimension,
  validarEtiquetaValorDimension,
  validarNombreDimension,
} from '@/validaciones/campos.js'
import { Campo, CampoTexto } from '../usuarios/CamposEmpleado.jsx'

const LISTA = '/administracion/dimensiones'
const SIN_VALORES = 'Indique al menos un valor.'

const REGLAS = { codigo: validarCodigoDimension, nombre: validarNombreDimension, descripcion: validarDescripcionDimension }

function erroresDe(datos, filas) {
  const errores = {}
  for (const [campo, regla] of Object.entries(REGLAS)) {
    const { error } = regla(datos[campo])
    if (error) errores[campo] = error
  }
  if (filas.length === 0) errores.valores = SIN_VALORES
  const vistos = new Set()
  filas.forEach((fila) => {
    const codigo = validarCodigoValorDimension(fila.codigo)
    if (codigo.error) errores[`codigo-${fila.clave}`] = codigo.error
    else if (vistos.has(codigo.valor)) errores[`codigo-${fila.clave}`] = `El valor ${codigo.valor} está repetido.`
    else vistos.add(codigo.valor)
    const { error } = validarEtiquetaValorDimension(fila.etiqueta)
    if (error) errores[`etiqueta-${fila.clave}`] = error
  })
  return errores
}

function armarCuerpo(datos, filas) {
  const cuerpo = {
    codigo: validarCodigoDimension(datos.codigo).valor,
    nombre: validarNombreDimension(datos.nombre).valor,
    valores: filas.map((f) => ({
      codigo: validarCodigoValorDimension(f.codigo).valor,
      etiqueta: validarEtiquetaValorDimension(f.etiqueta).valor,
    })),
  }
  const descripcion = validarDescripcionDimension(datos.descripcion).valor
  if (descripcion) cuerpo.descripcion = descripcion
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

function FilaValor({ fila, numero, errorCodigo, errorEtiqueta, acciones, deshabilitado }) {
  const id = `valor-${fila.clave}`
  return (
    <li className="grid gap-3 rounded-lg border p-3 md:grid-cols-[14rem_1fr_auto] md:items-start">
      <div className="flex flex-col gap-1.5">
        <Input
          aria-label={`Código del valor ${numero}`}
          placeholder="Código"
          className="bg-card"
          value={fila.codigo}
          maxLength={LARGOS.codigoValorDimension}
          autoComplete="off"
          onChange={(evento) => acciones.cambiar('codigo', evento.target.value)}
          onBlur={acciones.tocar('codigo')}
          disabled={deshabilitado}
          aria-invalid={errorCodigo ? true : undefined}
          aria-describedby={errorCodigo ? `${id}-codigo-error` : undefined}
        />
        <MensajeError id={`${id}-codigo-error`} mensaje={errorCodigo} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          aria-label={`Etiqueta del valor ${numero}`}
          placeholder="Etiqueta"
          className="bg-card"
          value={fila.etiqueta}
          maxLength={LARGOS.etiquetaValorDimension}
          onChange={(evento) => acciones.cambiar('etiqueta', evento.target.value)}
          onBlur={acciones.tocar('etiqueta')}
          disabled={deshabilitado}
          aria-invalid={errorEtiqueta ? true : undefined}
          aria-describedby={errorEtiqueta ? `${id}-etiqueta-error` : undefined}
        />
        <MensajeError id={`${id}-etiqueta-error`} mensaje={errorEtiqueta} />
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`Quitar el valor ${numero}`}
        disabled={deshabilitado}
        onClick={acciones.quitar}
      >
        <Trash2 />
      </Button>
    </li>
  )
}

// Registra una dimensión CATEGORICA con sus valores, en el orden de la lista.
export default function PaginaRegistrarDimension() {
  const navigate = useNavigate()
  const { state } = useLocation()
  // La lista manda su filtro al abrir el formulario, para volver a ella con el mismo.
  const volverA = `${LISTA}${state?.volverA ?? ''}`

  const siguienteClave = useRef(1)
  const filaNueva = () => ({ clave: siguienteClave.current++, codigo: '', etiqueta: '' })
  const [datos, setDatos] = useState({ codigo: '', nombre: '', descripcion: '' })
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
  const avisoValores = useRef(null)
  const avisoError = useRef(null)

  const errores = erroresDe(datos, filas)
  const hayCambios =
    Object.values(datos).some((valor) => valor !== '') ||
    filas.length !== 1 ||
    filas[0].codigo !== '' ||
    filas[0].etiqueta !== ''
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !guardado)

  useEffect(() => {
    if (guardado) navigate(volverA)
  }, [guardado, navigate, volverA])

  // «Indique al menos un valor» no es de un campo: si es el único error, se lleva a la vista.
  useEffect(() => {
    if (revisar === 0) return
    const campo = formulario.current?.querySelector('[aria-invalid="true"]')
    if (campo) campo.focus()
    else avisoValores.current?.scrollIntoView?.({ block: 'nearest' })
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

  async function enviar(evento) {
    evento.preventDefault()
    setIntentado(true)
    if (enviando) return
    if (Object.keys(errores).length > 0) {
      setRevisar((n) => n + 1)
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const dimension = await crearDimension(armarCuerpo(datos, filas))
      toast.success(`Dimensión ${dimension.nombre} registrada.`)
      setGuardado(true)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Administración" titulo="Registrar dimensión" volverA={volverA} />

      <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos de la dimensión</CardTitle>
            <CardDescription>
              Catálogo nacional: la dimensión queda para todas las DDRISS. Las dimensiones nuevas son categóricas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <CampoTexto
              id="codigo"
              etiqueta="Código"
              obligatorio
              {...texto('codigo')}
              maxLength={LARGOS.codigoDimension}
              autoComplete="off"
              ayuda="Minúsculas, números y guion bajo; empieza con una letra. El código no se puede cambiar después."
            />
            <CampoTexto
              id="nombre"
              etiqueta="Nombre"
              obligatorio
              {...texto('nombre')}
              maxLength={LARGOS.nombreDimension}
            />
            <div className="md:col-span-2">
              <Campo id="descripcion" etiqueta="Descripción">
                <Textarea
                  id="descripcion"
                  className="bg-card"
                  value={datos.descripcion}
                  maxLength={LARGOS.descripcionDimension}
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
            <CardTitle>Valores</CardTitle>
            <CardDescription>
              Los códigos se guardan en mayúsculas y no se pueden cambiar después. El orden de la lista es el orden en
              que se muestran.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {intentado && errores.valores && (
              <div ref={avisoValores}>
                <AvisoError>{errores.valores}</AvisoError>
              </div>
            )}
            {filas.length > 0 && (
              <ol className="flex flex-col gap-3" aria-label="Valores de la dimensión">
                {filas.map((fila, i) => (
                  <FilaValor
                    key={fila.clave}
                    fila={fila}
                    numero={i + 1}
                    errorCodigo={errorDe(`codigo-${fila.clave}`)}
                    errorEtiqueta={errorDe(`etiqueta-${fila.clave}`)}
                    deshabilitado={enviando}
                    acciones={{
                      cambiar: (campo, valor) => cambiarFila(fila.clave, { [campo]: valor }),
                      tocar: (campo) => tocar(`${campo}-${fila.clave}`),
                      quitar: () => setFilas((actuales) => actuales.filter((f) => f.clave !== fila.clave)),
                    }}
                  />
                ))}
              </ol>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFilas((actuales) => [...actuales, filaNueva()])}
                disabled={enviando}
              >
                <Plus />
                Agregar valor
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
            {enviando ? 'Guardando…' : 'Registrar dimensión'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(volverA)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </form>

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Si sale ahora, se pierden los datos de la dimensión." />
    </section>
  )
}
