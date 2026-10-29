import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { cambiarContrasena } from '@/api/auth.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import CampoContrasena from '@/componentes/contrasena/CampoContrasena.jsx'
import MedidorContrasena from '@/componentes/contrasena/MedidorContrasena.jsx'
import { cargarEvaluador } from '@/componentes/contrasena/politicaContrasena.js'

const MOTIVO_IGUAL = 'Debe ser distinta de la actual.'

function MensajeError({ id, children }) {
  if (!children) return null
  return (
    <p id={id} className="text-xs text-destructive">
      {children}
    </p>
  )
}

// obligatoria: la cuenta tiene la contraseña temporal pendiente; se muestra sola, sin menú.
export default function PaginaCambiarContrasena({ obligatoria = false }) {
  const { sesion, cerrar, actualizarTrasCambioContrasena } = useSesion()
  const navegar = useNavigate()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmacion, setConfirmacion] = useState('')
  const [evaluador, setEvaluador] = useState(null)
  const [errorCarga, setErrorCarga] = useState(false)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [tocados, setTocados] = useState({})
  // Después de intentar enviar, se ven los errores de todos los campos.
  const [intentado, setIntentado] = useState(false)

  const { nombreUsuario, empleado } = sesion.usuario
  const necesitaEvaluador = nueva !== '' && evaluador === null

  useEffect(() => {
    if (!necesitaEvaluador) return undefined
    let vigente = true
    cargarEvaluador()
      .then((funcion) => vigente && setEvaluador(() => funcion))
      .catch(() => vigente && setErrorCarga(true))
    return () => {
      vigente = false
    }
  }, [necesitaEvaluador, intentoCarga])

  function reintentarCarga() {
    setErrorCarga(false)
    setIntentoCarga((intento) => intento + 1)
  }

  const resultado = useMemo(() => {
    if (!evaluador || nueva === '') return null
    const { puntaje, motivos } = evaluador(nueva, { nombreUsuario, nombres: empleado.nombres, apellidos: empleado.apellidos })
    return { puntaje, motivos: nueva === actual ? [...motivos, MOTIVO_IGUAL] : motivos }
  }, [evaluador, nueva, actual, nombreUsuario, empleado.nombres, empleado.apellidos])

  // El medidor muestra los motivos de la nueva; aquí solo se marca como inválida.
  const nuevaInvalida = nueva === '' || resultado === null || resultado.motivos.length > 0
  const verError = (campo) => tocados[campo] || intentado
  const errorActual = verError('actual') && actual === '' ? 'Escriba su contraseña actual.' : null
  const errorNueva = verError('nueva') && nueva === '' ? 'Escriba la contraseña nueva.' : null
  let errorConfirmacion = null
  if (confirmacion !== '' && confirmacion !== nueva) errorConfirmacion = 'Las contraseñas no coinciden.'
  else if (verError('confirmacion') && confirmacion === '') errorConfirmacion = 'Confirme la contraseña nueva.'

  const cambiar = (asignar) => (evento) => {
    asignar(evento.target.value)
    setError(null)
  }
  const tocar = (campo) => () => setTocados((previos) => (previos[campo] ? previos : { ...previos, [campo]: true }))

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando) return

    const invalidos = [
      actual === '' && 'contrasena-actual',
      nuevaInvalida && 'contrasena-nueva',
      (confirmacion === '' || confirmacion !== nueva) && 'contrasena-confirmacion',
    ].filter(Boolean)
    if (invalidos.length > 0) {
      setIntentado(true)
      document.getElementById(invalidos[0])?.focus()
      return
    }

    setEnviando(true)
    setError(null)
    try {
      await cambiarContrasena({ contrasenaActual: actual, contrasenaNueva: nueva })
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
      return
    }
    // La sesión sigue. Si no se pudo renovar tras el cambio obligatorio, ya se cerró y el login muestra por qué.
    if (obligatoria && !(await actualizarTrasCambioContrasena())) return
    toast.success('Contraseña cambiada.')
    navegar('/inicio', { replace: true })
  }

  function salir() {
    if (obligatoria) {
      cerrar()
      navegar('/login', { replace: true })
    } else {
      navegar('/inicio')
    }
  }

  const describeNueva = ['medidor-contrasena', errorNueva && 'nueva-error'].filter(Boolean).join(' ')

  const formulario = (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-5">
      {errorCarga && (
        <AvisoError onReintentar={reintentarCarga}>No se pudo cargar el medidor de contraseñas.</AvisoError>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contrasena-actual">Contraseña actual</Label>
        <CampoContrasena
          id="contrasena-actual"
          autoComplete="current-password"
          value={actual}
          onChange={cambiar(setActual)}
          onBlur={tocar('actual')}
          aria-describedby={errorActual ? 'actual-error' : undefined}
          aria-invalid={errorActual ? true : undefined}
        />
        <MensajeError id="actual-error">{errorActual}</MensajeError>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contrasena-nueva">Contraseña nueva</Label>
        <CampoContrasena
          id="contrasena-nueva"
          autoComplete="new-password"
          value={nueva}
          onChange={cambiar(setNueva)}
          onBlur={tocar('nueva')}
          aria-describedby={describeNueva}
          aria-invalid={errorNueva || (resultado && resultado.motivos.length > 0) ? true : undefined}
        />
        <MensajeError id="nueva-error">{errorNueva}</MensajeError>
        <MedidorContrasena id="medidor-contrasena" contrasena={nueva} resultado={errorCarga ? null : resultado} />
        <p className="text-xs text-muted-foreground">
          Al menos 12 caracteres. Una frase de varias palabras es más fácil de recordar y difícil de adivinar.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="contrasena-confirmacion">Confirmar contraseña nueva</Label>
        <CampoContrasena
          id="contrasena-confirmacion"
          autoComplete="new-password"
          value={confirmacion}
          onChange={cambiar(setConfirmacion)}
          onBlur={tocar('confirmacion')}
          aria-describedby={errorConfirmacion ? 'confirmacion-error' : undefined}
          aria-invalid={errorConfirmacion ? true : undefined}
        />
        <MensajeError id="confirmacion-error">{errorConfirmacion}</MensajeError>
      </div>

      {error && <AvisoError>{error}</AvisoError>}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={enviando}>
          {enviando ? 'Cambiando…' : 'Cambiar contraseña'}
        </Button>
        <Button type="button" variant="outline" onClick={salir}>
          {obligatoria ? 'Cerrar sesión' : 'Cancelar'}
        </Button>
      </div>
    </form>
  )

  if (obligatoria) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <Card className="w-full max-w-[440px]">
          <CardHeader>
            <CardTitle>
              <h1 className="text-xl font-semibold">Cambiar contraseña</h1>
            </CardTitle>
            <CardDescription>Debe cambiar la contraseña temporal que le dieron antes de continuar.</CardDescription>
          </CardHeader>
          <CardContent>{formulario}</CardContent>
        </Card>
      </main>
    )
  }

  return (
    <section className="flex max-w-xl flex-col gap-6 p-6">
      <EncabezadoPagina
        titulo="Cambiar contraseña"
        descripcion="Después del cambio, deberá iniciar sesión con la contraseña nueva."
      />
      <Card>
        <CardContent>{formulario}</CardContent>
      </Card>
    </section>
  )
}
