import { useRef, useState } from 'react'
import { CircleAlert, Info } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { iniciarSesion } from '@/api/auth.js'
import { ErrorApi } from '@/api/cliente.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intente de nuevo.'

function Logo() {
  return (
    <div className="flex items-center gap-3">
      <svg width="40" height="40" viewBox="0 0 30 30" aria-hidden="true">
        <rect x="1" y="1" width="28" height="28" rx="7" className="fill-primary" />
        <path d="M15 7v16M7 15h16" strokeWidth="3" strokeLinecap="round" className="stroke-primary-foreground" />
      </svg>
      <span className="text-[22px] font-bold tracking-wide">SIRCOVA</span>
    </div>
  )
}

export default function PaginaLogin() {
  const { aviso, iniciar } = useSesion()
  const navegar = useNavigate()
  const refContrasena = useRef(null)
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [avisoVisible, setAvisoVisible] = useState(true)

  const completo = nombreUsuario.trim() !== '' && contrasena !== ''

  async function enviar(evento) {
    evento.preventDefault()
    if (!completo || enviando) return
    setEnviando(true)
    setError(null)
    setAvisoVisible(false)
    try {
      const respuesta = await iniciarSesion(nombreUsuario.trim(), contrasena)
      iniciar(respuesta)
      navegar('/inicio', { replace: true })
    } catch (err) {
      setError(err instanceof ErrorApi ? err.mensaje : MENSAJE_INESPERADO)
      setContrasena('')
      refContrasena.current?.focus()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[43%] max-w-[620px] shrink-0 flex-col justify-between border-r-3 border-ring bg-sidebar p-16 lg:flex">
        <Logo />
        <div className="flex flex-col gap-4.5">
          <h1 className="text-[40px] leading-tight font-bold">
            Producción de vacunación del departamento de San Marcos, en un solo lugar.
          </h1>
          <p className="text-[17px] leading-relaxed text-foreground/80">
            Registro mensual por establecimiento, revisión y cierre de periodos, e indicadores de cobertura para los 30
            municipios.
          </p>
        </div>
        <div className="flex flex-col gap-1 text-[13px] text-muted-foreground">
          <span>Dirección Departamental de Redes Integradas de Servicios de Salud, San Marcos</span>
          <span>Ministerio de Salud Pública y Asistencia Social</span>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center p-6">
        <form onSubmit={enviar} noValidate className="flex w-full max-w-[400px] flex-col gap-5">
          <div className="lg:hidden">
            <Logo />
          </div>

          <div>
            <h2 className="text-[28px] font-bold">Iniciar sesión</h2>
            <p className="mt-1.5 text-[15px] text-muted-foreground">
              Use las credenciales que le asignó el administrador.
            </p>
          </div>

          {aviso && avisoVisible && (
            <Alert role="status" className="border-ring/40 bg-accent text-accent-foreground">
              <Info />
              <AlertDescription className="text-accent-foreground">{aviso}</AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
              <CircleAlert />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre-usuario" className="font-semibold">
              Usuario
            </Label>
            <Input
              id="nombre-usuario"
              name="nombreUsuario"
              autoComplete="username"
              value={nombreUsuario}
              onChange={(evento) => setNombreUsuario(evento.target.value)}
              aria-invalid={error ? true : undefined}
              className="h-11.5 bg-card px-3.5 md:text-[15px]"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contrasena" className="font-semibold">
              Contraseña
            </Label>
            <Input
              id="contrasena"
              name="contrasena"
              type="password"
              autoComplete="current-password"
              ref={refContrasena}
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
              aria-invalid={error ? true : undefined}
              className="h-11.5 bg-card px-3.5 md:text-[15px]"
            />
          </div>

          {/* Deshabilitado hasta que exista la recuperación de contraseña. */}
          <div className="flex justify-end text-sm">
            <a aria-disabled="true" className="cursor-not-allowed text-enlace opacity-50">
              ¿Olvidó su contraseña?
            </a>
          </div>

          <Button type="submit" disabled={!completo || enviando} className="h-12 text-base font-semibold">
            {enviando ? 'Ingresando…' : 'Ingresar'}
          </Button>

          <p className="text-[13px] leading-normal text-muted-foreground">
            ¿No tiene cuenta? El administrador del sistema de la DDRISS registra a cada usuario y le asigna su rol.
          </p>
        </form>
      </main>
    </div>
  )
}
