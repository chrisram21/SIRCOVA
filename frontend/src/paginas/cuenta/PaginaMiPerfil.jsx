import { useEffect, useState } from 'react'
import { Building2, Check, ChevronRight, CircleAlert, Copy, Info, KeyRound, TriangleAlert } from 'lucide-react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { obtenerPerfil } from '@/api/auth.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { RUTA_CAMBIO_CONTRASENA } from '@/componentes/RutaProtegida.jsx'
import { inicialesDe } from '@/componentes/layout/MenuUsuario.jsx'
import opcionesMenu from '@/componentes/layout/opcionesMenu.js'

const FECHA_HORA = new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short' })
const FECHA = new Intl.DateTimeFormat('es-GT', { dateStyle: 'long' })
const formatear = (formato, iso) => (iso ? formato.format(new Date(iso)) : null)

// Los datos que registra el administrador y que conviene tener completos.
const DATOS_DEL_PERFIL = [
  { nombre: 'cargo', tiene: (e) => Boolean(e.cargo) },
  { nombre: 'correo', tiene: (e) => Boolean(e.correo) },
  { nombre: 'teléfono', tiene: (e) => Boolean(e.telefono) },
  { nombre: 'CUI', tiene: (e) => e.cuiRegistrado },
]

// ['a', 'b', 'c'] → 'a, b y c'
const enLista = (nombres) =>
  nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')} y ${nombres.at(-1)}`

function BotonCopiar({ texto, que }) {
  const [copiado, setCopiado] = useState(false)

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      setCopiado(true)
      toast.success(`${que[0].toUpperCase()}${que.slice(1)} copiado.`)
      setTimeout(() => setCopiado(false), 1500)
    } catch {
      toast.error('No se pudo copiar.')
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={`Copiar ${que}`}
      onClick={copiar}
      className="-my-1.5 size-8 shrink-0 text-muted-foreground hover:text-foreground"
    >
      {copiado ? <Check className="text-enlace" /> : <Copy />}
    </Button>
  )
}

// Un dato: la etiqueta arriba y el valor abajo. Sin valor se dice con texto e ícono, no solo con color.
function Dato({ etiqueta, children, vacio = 'Sin registrar', ayuda, copiar, ancho = false }) {
  const sinValor = children === null || children === undefined || children === ''
  return (
    <div className={ancho ? 'sm:col-span-2' : undefined}>
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="mt-1 flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 items-center gap-1.5">
          {sinValor ? (
            <span className="inline-flex items-center gap-1.5 text-muted-foreground">
              <CircleAlert className="size-4 shrink-0 text-advertencia-foreground" aria-hidden="true" />
              {vacio}
            </span>
          ) : (
            <span className="min-w-0 font-medium break-words">{children}</span>
          )}
          {copiar && !sinValor && <BotonCopiar texto={copiar.texto} que={copiar.que} />}
        </span>
        {ayuda && <span className="text-sm text-muted-foreground">{ayuda}</span>}
      </dd>
    </div>
  )
}

// Una sección de la ficha: título y explicación arriba, datos debajo.
function Seccion({ id, titulo, descripcion, children }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3 px-6 py-4">
      <div>
        <h2 id={id} className="font-semibold">
          {titulo}
        </h2>
        {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children}
    </section>
  )
}

const Datos = ({ children }) => <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">{children}</dl>

// Mientras llega el perfil se usa la sesión, que ya trae el nombre y el rol.
function Cabecera({ usuario, perfil }) {
  const { empleado, rolNombre } = perfil ?? usuario
  const lugar = perfil
    ? (empleado.establecimientoNombre ?? empleado.ddrissNombre ?? 'Nivel nacional')
    : null
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 px-6 py-4">
      <span
        aria-hidden="true"
        className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-semibold tracking-wide text-primary-foreground"
      >
        {inicialesDe(empleado)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xl font-semibold tracking-tight">
          {empleado.nombres} {empleado.apellidos}
        </p>
        <p className="text-muted-foreground">{[empleado.cargo, rolNombre].filter(Boolean).join(' · ')}</p>
        {lugar && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Building2 className="size-4 shrink-0" aria-hidden="true" />
            {lugar}
          </p>
        )}
      </div>
      <Button asChild variant="outline">
        <Link to={RUTA_CAMBIO_CONTRASENA}>
          <KeyRound />
          Cambiar contraseña
        </Link>
      </Button>
    </div>
  )
}

function CargandoSecciones() {
  return (
    <div aria-label="Cargando perfil" className="grid border-t lg:grid-cols-2 lg:divide-x">
      {[0, 1].map((n) => (
        <div key={n} className="flex flex-col gap-3 px-6 py-4">
          <Skeleton className="h-5 w-32" />
          <div className="grid gap-3 sm:grid-cols-2">
            {[0, 1, 2, 3].map((m) => (
              <div key={m} className="flex flex-col gap-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-5 w-40" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function Secciones({ perfil }) {
  const { empleado } = perfil
  const accesos = opcionesMenu.filter((opcion) => opcion.permiso && perfil.permisos.includes(opcion.permiso))
  const establecimiento = empleado.establecimientoNombre
    ? [empleado.establecimientoCodigo, empleado.establecimientoNombre].filter(Boolean).join(' · ')
    : null
  const faltan = DATOS_DEL_PERFIL.filter(({ tiene }) => !tiene(empleado)).map(({ nombre }) => nombre)

  return (
    <>
      {faltan.length > 0 && (
        <p
          role="status"
          className="flex items-start gap-2.5 border-t bg-advertencia px-6 py-2.5 text-sm text-advertencia-foreground"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Faltan datos en su perfil: {enLista(faltan)}. El administrador del sistema de su DDRISS puede registrarlos.
          </span>
        </p>
      )}

      <div className="grid divide-y border-t lg:grid-cols-2 lg:divide-x lg:divide-y-0">
        <div className="divide-y">
          <Seccion id="seccion-personales" titulo="Datos personales" descripcion="Con estos datos el sistema lo identifica.">
            <Datos>
              <Dato etiqueta="Nombres">{empleado.nombres}</Dato>
              <Dato etiqueta="Apellidos">{empleado.apellidos}</Dato>
              <Dato etiqueta="Cargo">{empleado.cargo}</Dato>
              <Dato etiqueta="CUI" ayuda={empleado.cuiRegistrado ? 'Por seguridad, el sistema no muestra el número.' : null}>
                {empleado.cuiRegistrado ? 'Registrado' : null}
              </Dato>
            </Datos>
          </Seccion>

          <Seccion id="seccion-contacto" titulo="Contacto" descripcion="Para que la DDRISS se comunique con usted.">
            <Datos>
              <Dato etiqueta="Correo" copiar={{ texto: empleado.correo, que: 'correo' }}>
                {empleado.correo}
              </Dato>
              <Dato etiqueta="Teléfono">{empleado.telefono}</Dato>
            </Datos>
          </Seccion>
        </div>
        <div className="divide-y">
          <Seccion
            id="seccion-lugar"
            titulo="Lugar de trabajo"
            descripcion="Define qué reportes y qué datos puede ver en el sistema."
          >
            <Datos>
              <Dato etiqueta="DDRISS" vacio="Nivel nacional (todas las DDRISS)">
                {empleado.ddrissNombre}
              </Dato>
              <Dato etiqueta="Municipio" vacio="Sin municipio">
                {empleado.municipioNombre}
              </Dato>
              <Dato etiqueta="Establecimiento" vacio="Sin establecimiento" ancho>
                {establecimiento}
              </Dato>
            </Datos>
          </Seccion>

          <Seccion id="seccion-cuenta" titulo="Cuenta" descripcion="Su acceso a SIRCOVA.">
            <Datos>
              <Dato etiqueta="Usuario" copiar={{ texto: perfil.nombreUsuario, que: 'usuario' }}>
                <span className="font-mono">{perfil.nombreUsuario}</span>
              </Dato>
              <Dato etiqueta="Rol">{perfil.rolNombre}</Dato>
              <Dato etiqueta="Último ingreso" vacio="Sin ingresos">
                {formatear(FECHA_HORA, perfil.ultimoAcceso)}
              </Dato>
              <Dato etiqueta="Cuenta creada">{formatear(FECHA, perfil.creadoEn)}</Dato>
            </Datos>
          </Seccion>
        </div>
      </div>

      <section
        aria-labelledby="titulo-acceso"
        className="flex flex-col gap-3 border-t px-6 py-4 md:flex-row md:items-center md:gap-8"
      >
        <div className="md:w-60 md:shrink-0">
          <h2 id="titulo-acceso" className="font-semibold">
            Lo que puede hacer en SIRCOVA
          </h2>
          <p className="text-sm text-muted-foreground">Las pantallas que permite su rol.</p>
        </div>
        {accesos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Su rol todavía no tiene pantallas asignadas.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {accesos.map(({ titulo, ruta, icono: Icono }) => (
              <li key={ruta}>
                <Link
                  to={ruta}
                  className="group inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors duration-200 hover:border-ring/50 hover:bg-accent/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  <Icono className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
                  {titulo}
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

export default function PaginaMiPerfil() {
  const { sesion } = useSesion()
  const [perfil, setPerfil] = useState(null)
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    setError(null)
    obtenerPerfil()
      .then((recibido) => vigente && setPerfil(recibido))
      .catch((err) => vigente && setError(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [intento])

  return (
    <section className="mx-auto w-full max-w-6xl p-4 sm:p-6">
      {/* La miga del encabezado ya dice «Mi perfil»: el h1 queda solo para lectores de pantalla. */}
      <h1 className="sr-only">Mi perfil</h1>
      <Card className="gap-0 py-0">
        <Cabecera usuario={sesion.usuario} perfil={perfil} />
        {error ? (
          <div className="border-t px-6 py-4">
            <AvisoError onReintentar={() => setIntento((n) => n + 1)}>No se pudo cargar su perfil: {error}</AvisoError>
          </div>
        ) : perfil ? (
          <Secciones perfil={perfil} />
        ) : (
          <CargandoSecciones />
        )}
        <p className="flex items-start gap-2 border-t bg-muted/50 px-6 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Si algún dato no es correcto, pida al administrador del sistema de su DDRISS que lo corrija.
        </p>
      </Card>
    </section>
  )
}
