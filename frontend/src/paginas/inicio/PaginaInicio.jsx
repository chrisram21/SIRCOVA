import { useSesion } from '@/componentes/ProveedorSesion.jsx'

// Página provisional: el paso 6 del SPEC 06 la reemplaza por la pantalla inicial de cada rol.
export default function PaginaInicio() {
  const { sesion } = useSesion()
  const { nombres, apellidos } = sesion.usuario.empleado

  return (
    <section className="p-6">
      <h1 className="text-2xl font-semibold">
        Hola, {nombres} {apellidos}
      </h1>
    </section>
  )
}
