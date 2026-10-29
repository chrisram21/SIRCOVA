import { useRef, useState } from 'react'
import {
  ArrowRight,
  Building2,
  ChartLine,
  ClipboardCheck,
  ClipboardPen,
  FlaskConical,
  Info,
  LoaderCircle,
  ShieldCheck,
  UserCog,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { iniciarSesion } from '@/api/auth.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import FondoMarca from '@/componentes/FondoMarca.jsx'
import MarcaSircova from '@/componentes/MarcaSircova.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import CampoContrasena from '@/componentes/contrasena/CampoContrasena.jsx'
import { cn } from '@/lib/utils'

const AYUDA_OLVIDO =
  'Pida al administrador del sistema de su DDRISS que restablezca su contraseña; le dará una contraseña temporal.'

function Logo({ className }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <MarcaSircova animada className="size-10" />
      <span className="text-[22px] font-bold tracking-wide">SIRCOVA</span>
    </div>
  )
}

const FUNCIONES = [
  { icono: ClipboardPen, titulo: 'Registro mensual', texto: 'Formularios por vacuna, generados desde su esquema de captura.' },
  { icono: ClipboardCheck, titulo: 'Revisión y cierre', texto: 'Cada reporte se revisa y aprueba; cada acción queda en la bitácora.' },
  { icono: ChartLine, titulo: 'Indicadores', texto: 'Cobertura, brecha, deserción y proyección por municipio.' },
]

// Solo en desarrollo (npm run dev): botones que entran con las cuentas de prueba de frontend/.env.local, que no se
// sube; uno sin usuario o contraseña queda deshabilitado. En el build, import.meta.env.DEV es false y ni el recuadro
// ni las credenciales llegan al código publicado.
function accesosRapidos() {
  if (!import.meta.env.DEV) return []
  const variables = import.meta.env
  return [
    {
      titulo: 'Administrador',
      icono: UserCog,
      usuario: variables.VITE_ACCESO_RAPIDO_ADMIN_USUARIO,
      contrasena: variables.VITE_ACCESO_RAPIDO_ADMIN_CONTRASENA,
    },
    {
      titulo: 'Personal del establecimiento',
      icono: Building2,
      usuario: variables.VITE_ACCESO_RAPIDO_ESTABLECIMIENTO_USUARIO,
      contrasena: variables.VITE_ACCESO_RAPIDO_ESTABLECIMIENTO_CONTRASENA,
    },
  ].map((acceso) => ({ ...acceso, configurado: Boolean(acceso.usuario && acceso.contrasena) }))
}

export default function PaginaLogin() {
  const { aviso, iniciar } = useSesion()
  const navegar = useNavigate()
  const refUsuario = useRef(null)
  const refContrasena = useRef(null)
  const [nombreUsuario, setNombreUsuario] = useState('')
  const [contrasena, setContrasena] = useState('')
  const [error, setError] = useState(null)
  const [bloqueo, setBloqueo] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [avisoVisible, setAvisoVisible] = useState(true)
  const [ayudaVisible, setAyudaVisible] = useState(false)
  // Los campos vacíos se señalan después de intentar entrar.
  const [intentado, setIntentado] = useState(false)

  const accesos = accesosRapidos()
  const faltaUsuario = intentado && nombreUsuario.trim() === ''
  const faltaContrasena = intentado && contrasena === ''

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando) return
    if (nombreUsuario.trim() === '' || contrasena === '') {
      setIntentado(true)
      const primero = nombreUsuario.trim() === '' ? refUsuario : refContrasena
      primero.current?.focus()
      return
    }
    await entrar(nombreUsuario.trim(), contrasena)
  }

  async function entrar(usuario, clave) {
    // Tras un error la contraseña se vacía; eso no es un campo olvidado.
    setIntentado(false)
    setEnviando(true)
    setError(null)
    setAvisoVisible(false)
    try {
      const respuesta = await iniciarSesion(usuario, clave)
      iniciar(respuesta)
      navegar('/inicio', { replace: true })
    } catch (err) {
      setContrasena('')
      if (err instanceof ErrorApi && err.status === 423) {
        setBloqueo(err.mensaje)
        return
      }
      setError(mensajeDeError(err))
      refContrasena.current?.focus()
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="flex min-h-screen">
      <aside className="relative isolate hidden w-[45%] max-w-[640px] shrink-0 flex-col justify-between gap-10 overflow-hidden p-12 text-primary-foreground lg:flex xl:p-16">
        <FondoMarca />
        {/* La línea celeste del borde, como la barra vertical del logo del MSPAS. */}
        <div aria-hidden="true" className="absolute inset-y-0 right-0 w-1 bg-linear-to-b from-transparent via-ring to-transparent" />
        <Logo className="animate-aparecer" />
        <div className="flex flex-col gap-8">
          <div className="flex animate-aparecer flex-col gap-4 [animation-delay:120ms]">
            {/* No es un encabezado: el h1 de la página es «Iniciar sesión», que también se ve en pantallas angostas. */}
            <p className="text-4xl leading-[1.15] font-bold tracking-tight text-balance xl:text-[42px]">
              Producción de vacunación del departamento de San Marcos,{' '}
              <span className="texto-degradado">en un solo lugar.</span>
            </p>
            <p className="max-w-[46ch] text-[17px] leading-relaxed text-primary-foreground/80">
              Registro mensual por establecimiento, revisión y cierre de periodos, e indicadores de cobertura para los
              30 municipios.
            </p>
          </div>
          <ul className="escalonado grid max-w-[480px] gap-3 [--retraso:250ms]">
            {FUNCIONES.map(({ icono: Icono, titulo, texto }) => (
              <li
                key={titulo}
                className="flex items-start gap-3.5 rounded-xl bg-primary-foreground/[0.06] p-3.5 ring-1 ring-primary-foreground/12 backdrop-blur-md transition-colors duration-300 hover:bg-primary-foreground/10"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-ring/25 text-primary-foreground ring-1 ring-ring/40">
                  <Icono className="size-4.5" aria-hidden="true" />
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{titulo}</span>
                  <span className="text-sm text-primary-foreground/70">{texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-col gap-1 text-[13px] text-primary-foreground/65">
          <span>Dirección Departamental de Redes Integradas de Servicios de Salud, San Marcos</span>
          <span>Ministerio de Salud Pública y Asistencia Social</span>
        </div>
      </aside>

      <main className="relative isolate flex flex-1 flex-col items-center justify-center gap-6 overflow-hidden p-4 sm:p-6">
        <div aria-hidden="true" className="fondo-cuadricula absolute inset-0 -z-10 text-primary/50" />
        <div aria-hidden="true" className="absolute -top-40 -right-40 -z-10 size-[28rem] rounded-full bg-ring/15 blur-3xl" />
        <form
          onSubmit={enviar}
          noValidate
          className="flex w-full max-w-[420px] animate-aparecer flex-col gap-5 rounded-2xl bg-card/95 p-6 shadow-elevada ring-1 ring-foreground/8 backdrop-blur sm:p-8"
        >
          <div className="lg:hidden">
            <Logo />
          </div>

          <div>
            <h1 className="text-[28px] font-bold tracking-tight">Iniciar sesión</h1>
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

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nombre-usuario" className="font-semibold">
              Usuario
            </Label>
            <Input
              id="nombre-usuario"
              name="nombreUsuario"
              autoComplete="username"
              ref={refUsuario}
              value={nombreUsuario}
              onChange={(evento) => setNombreUsuario(evento.target.value)}
              aria-invalid={error || faltaUsuario ? true : undefined}
              aria-describedby={faltaUsuario ? 'nombre-usuario-error' : undefined}
              className="h-11.5 bg-card px-3.5 md:text-[15px]"
            />
            {faltaUsuario && (
              <p id="nombre-usuario-error" className="text-sm text-destructive">
                Escriba su usuario.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="contrasena" className="font-semibold">
              Contraseña
            </Label>
            <CampoContrasena
              id="contrasena"
              name="contrasena"
              autoComplete="current-password"
              ref={refContrasena}
              value={contrasena}
              onChange={(evento) => setContrasena(evento.target.value)}
              aria-invalid={error || faltaContrasena ? true : undefined}
              aria-describedby={faltaContrasena ? 'contrasena-error' : undefined}
              className="h-11.5 bg-card px-3.5 md:text-[15px]"
            />
            {faltaContrasena && (
              <p id="contrasena-error" className="text-sm text-destructive">
                Escriba su contraseña.
              </p>
            )}
          </div>

          {/* No hay recuperación por cuenta propia: la contraseña la restablece el administrador (HU-63). */}
          <div className="flex flex-col items-end gap-1.5 text-sm">
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-enlace"
              aria-expanded={ayudaVisible}
              aria-controls="ayuda-olvido"
              onClick={() => setAyudaVisible((visible) => !visible)}
            >
              ¿Olvidó su contraseña?
            </Button>
            <p id="ayuda-olvido" hidden={!ayudaVisible} className="text-right text-muted-foreground">
              {AYUDA_OLVIDO}
            </p>
          </div>

          {error && <AvisoError>{error}</AvisoError>}

          <Button type="submit" disabled={enviando} className="group brillo-hover h-12 text-base font-semibold">
            {enviando ? (
              <>
                <LoaderCircle className="animate-spin" />
                Ingresando…
              </>
            ) : (
              <>
                Ingresar
                <ArrowRight className="transition-transform duration-300 group-hover:translate-x-1" />
              </>
            )}
          </Button>

          <p className="text-[13px] leading-normal text-muted-foreground">
            ¿No tiene cuenta? El administrador del sistema de la DDRISS registra a cada usuario y le asigna su rol.
          </p>
        </form>
        <p className="flex max-w-[420px] items-center gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0 text-enlace" aria-hidden="true" />
          Solo se registran cantidades de dosis: el sistema no guarda datos de pacientes.
        </p>
        {import.meta.env.DEV && accesos.length > 0 && (
          <section
            aria-labelledby="titulo-acceso-rapido"
            className="w-full max-w-[420px] rounded-xl border border-dashed border-advertencia-foreground/30 bg-advertencia/70 p-4"
          >
            <h2
              id="titulo-acceso-rapido"
              className="flex items-center gap-2 text-xs font-semibold tracking-wide text-advertencia-foreground uppercase"
            >
              <FlaskConical className="size-4" aria-hidden="true" />
              Acceso rápido · solo en desarrollo
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {accesos.map(({ titulo, icono: Icono, usuario, contrasena: clave, configurado }) => (
                <Button
                  key={titulo}
                  type="button"
                  variant="outline"
                  disabled={enviando || !configurado}
                  onClick={() => {
                    setNombreUsuario(usuario)
                    entrar(usuario, clave)
                  }}
                  className="h-auto justify-start bg-card py-2 text-left whitespace-normal"
                >
                  <Icono aria-hidden="true" />
                  {titulo}
                </Button>
              ))}
            </div>
            {accesos.some(({ configurado }) => !configurado) && (
              <p className="mt-3 text-xs text-advertencia-foreground">
                Los botones deshabilitados no tienen usuario o contraseña en <code>frontend/.env.local</code>. Después
                de llenarlo, reinicie <code>npm run dev</code>.
              </p>
            )}
          </section>
        )}
      </main>

      <AlertDialog open={bloqueo !== null} onOpenChange={(abierto) => !abierto && setBloqueo(null)}>
        <AlertDialogContent
          onCloseAutoFocus={(evento) => {
            evento.preventDefault()
            refContrasena.current?.focus()
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Usuario bloqueado</AlertDialogTitle>
            <AlertDialogDescription>{bloqueo}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Entendido</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
