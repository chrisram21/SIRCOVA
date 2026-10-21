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

export default function PaginaInicio() {
  const { sesion } = useSesion()
  const { rol, empleado } = sesion.usuario
  const InicioDelRol = INICIO_POR_ROL[rol]

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold">{saludo(new Date().getHours())}</h1>
      <p className="mt-1 text-muted-foreground">
        {empleado.nombres} {empleado.apellidos}
      </p>
      {InicioDelRol && (
        <div className="mt-6">
          <InicioDelRol />
        </div>
      )}
      <AccesosRapidos />
    </section>
  )
}
