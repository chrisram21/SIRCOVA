import { useRef, useState } from 'react'
import { CircleAlert, Plus, Trash2 } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { crearDimension } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import {
  LARGOS,
  validarCodigoDimension,
  validarCodigoValorDimension,
  validarDescripcionDimension,
  validarEtiquetaValorDimension,
  validarNombreDimension,
} from '@/validaciones/campos.js'
import { Campo, CampoTexto } from '../usuarios/CamposEmpleado.jsx'

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intente de nuevo.'
// Ruta de la pestaña si se llegó al formulario sin pasar por ella (p. ej. con la dirección escrita a mano).
const PESTANA = '?pestana=dimensiones'
const SIN_VALORES = 'Indique al menos un valor.'

const mensajeDe = (error) => (error instanceof ErrorApi ? error.mensaje : MENSAJE_INESPERADO)

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
  // La pestaña manda su filtro al abrir el formulario, para volver a ella con el mismo.
  const volverA = `/configuracion${state?.volverA || PESTANA}`

  const siguienteClave = useRef(1)
  const filaNueva = () => ({ clave: siguienteClave.current++, codigo: '', etiqueta: '' })
  const [datos, setDatos] = useState({ codigo: '', nombre: '', descripcion: '' })
  const [filas, setFilas] = useState(() => [filaNueva()])
  // Un mensaje aparece cuando la persona sale del campo por primera vez, o al intentar guardar.
  const [tocados, setTocados] = useState({})
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  const errores = erroresDe(datos, filas)
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
    if (enviando || Object.keys(errores).length > 0) return
    setEnviando(true)
    setError(null)
    try {
      const dimension = await crearDimension(armarCuerpo(datos, filas))
      navigate(volverA, { state: { aviso: `Dimensión ${dimension.nombre} registrada.` } })
    } catch (err) {
      setError(mensajeDe(err))
      setEnviando(false)
    }
  }

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Registrar dimensión</h1>

      {error && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
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
              <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
                <CircleAlert />
                <AlertDescription>{errores.valores}</AlertDescription>
              </Alert>
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

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={enviando}>
            {enviando ? 'Guardando…' : 'Registrar dimensión'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(volverA)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </form>
    </section>
  )
}
