import FondoMarca from '@/componentes/FondoMarca.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import AccesosRapidos from './AccesosRapidos.jsx'
import InicioAdministrador from './roles/InicioAdministrador.jsx'
import InicioAutoridad from './roles/InicioAutoridad.jsx'
import InicioEpidemiologia from './roles/InicioEpidemiologia.jsx'
import InicioEstablecimiento from './roles/InicioEstablecimiento.jsx'
import InicioRevisor from './roles/InicioRevisor.jsx'

// Se elige por el rol porque es un perfil de trabajo, no una función protegida: los datos los protegerán sus endpoints.
const INICIO_POR_ROL = {
  ESTABLECIMIENTO: InicioEstablecimiento,
  REVISOR: InicioRevisor,
  EPIDEMIOLOGIA: InicioEpidemiologia,
  AUTORIDAD: InicioAutoridad,
  ADMINISTRADOR: InicioAdministrador,
}

function saludo(hora) {
  if (hora >= 5 && hora < 12) return 'Buenos días'
  if (hora >= 12 && hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

// Emblema decorativo del banner: anillos alrededor de la cruz del logo.
function Emblema() {
  return (
    <svg
      viewBox="0 0 200 200"
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 right-6 hidden size-56 -translate-y-1/2 animate-flotar text-primary-foreground md:block lg:right-12 lg:size-64"
    >
      <circle cx="100" cy="100" r="96" fill="none" stroke="currentColor" strokeOpacity="0.08" strokeWidth="1" />
      <circle cx="100" cy="100" r="74" fill="none" stroke="currentColor" strokeOpacity="0.12" strokeWidth="1" strokeDasharray="4 6" />
      <circle cx="100" cy="100" r="52" className="fill-primary-foreground/5 stroke-ring/50" strokeWidth="1.5" />
      <path d="M100 76v48M76 100h48" stroke="currentColor" strokeOpacity="0.9" strokeWidth="10" strokeLinecap="round" />
      <circle cx="170" cy="58" r="5" className="fill-ring" />
      <circle cx="34" cy="146" r="3" className="fill-ring/60" />
    </svg>
  )
}

export default function PaginaInicio() {
  const { sesion } = useSesion()
  const { rol, rolNombre, empleado } = sesion.usuario
  const InicioDelRol = INICIO_POR_ROL[rol]

  return (
    <section className="flex flex-col gap-8 p-4 sm:p-6">
      <header className="relative isolate overflow-hidden rounded-2xl px-6 py-7 text-primary-foreground shadow-elevada sm:px-8 sm:py-9">
        <FondoMarca />
        <Emblema />
        <div className="flex max-w-2xl flex-col gap-3">
          <p className="inline-flex items-center gap-2 self-start rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium ring-1 ring-primary-foreground/15 backdrop-blur">
            <span aria-hidden="true" className="relative flex size-2">
              <span className="absolute inset-0 animate-pulso-anillo rounded-full bg-ring" />
              <span className="relative size-2 rounded-full bg-ring" />
            </span>
            {rolNombre ?? rol}
          </p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{saludo(new Date().getHours())}</h1>
          <p className="text-lg text-primary-foreground/85">
            {empleado.nombres} {empleado.apellidos}
          </p>
        </div>
      </header>
      {InicioDelRol && (
        <section aria-labelledby="titulo-resumen" className="flex flex-col gap-4">
          <h2 id="titulo-resumen" className="text-lg font-semibold">
            Resumen
          </h2>
          <InicioDelRol />
        </section>
      )}
      <AccesosRapidos />
    </section>
  )
}
