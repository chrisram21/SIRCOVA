import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { cambiarRol, editarEmpleado, listarRoles, obtenerUsuario } from '@/api/usuarios.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import CamposEmpleado, { CampoSeleccion, NINGUNO } from './CamposEmpleado.jsx'

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intente de nuevo.'
const TEXTOS_OPCIONALES = ['codigoEmpleado', 'cargo', 'correo', 'telefono']

const mensajeDe = (error) => (error instanceof ErrorApi ? error.mensaje : MENSAJE_INESPERADO)
const aOpcion = (id) => (id == null ? NINGUNO : String(id))

// El formulario trabaja con texto. Con establecimiento se guarda también su municipio, para que al quitarlo
// el Select muestre el que conserva el backend.
function aFormulario(empleado) {
  return {
    nombres: empleado.nombres,
    apellidos: empleado.apellidos,
    ...Object.fromEntries(TEXTOS_OPCIONALES.map((campo) => [campo, empleado[campo] ?? ''])),
    establecimientoId: aOpcion(empleado.establecimientoId),
    municipioId: aOpcion(empleado.municipioId),
  }
}

// Solo los campos que cambiaron, como los espera PATCH /empleados/{id}.
function cambiosDe(base, actual) {
  const cambios = {}
  for (const campo of ['nombres', 'apellidos']) {
    if (actual[campo].trim() !== base[campo].trim()) cambios[campo] = actual[campo].trim()
  }
  for (const campo of TEXTOS_OPCIONALES) {
    if (actual[campo].trim() !== base[campo].trim()) cambios[campo] = actual[campo].trim() || null
  }
  if (actual.establecimientoId !== base.establecimientoId) {
    cambios.establecimientoId = actual.establecimientoId === NINGUNO ? null : Number(actual.establecimientoId)
  }
  // Con establecimiento, el backend toma el municipio de él.
  if (actual.establecimientoId === NINGUNO && actual.municipioId !== base.municipioId) {
    cambios.municipioId = actual.municipioId === NINGUNO ? null : Number(actual.municipioId)
  }
  return cambios
}

export default function PaginaEditarUsuario() {
  const { id } = useParams()
  const { sesion } = useSesion()
  const [cuenta, setCuenta] = useState(null)
  const [catalogos, setCatalogos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  // Lo guardado en el backend; los cambios se calculan contra esto.
  const [base, setBase] = useState(null)
  const [formulario, setFormulario] = useState(null)
  const [rolId, setRolId] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)

  useEffect(() => {
    let vigente = true
    Promise.all([obtenerUsuario(id), listarRoles(), listarMunicipios(), listarEstablecimientos({ activo: true })])
      .then(([detalle, roles, municipios, establecimientos]) => {
        if (!vigente) return
        const inicial = { empleado: aFormulario(detalle.empleado), rolId: String(roles.find((r) => r.codigo === detalle.rol)?.id ?? '') }
        setCuenta(detalle)
        setCatalogos({ roles, municipios, establecimientos })
        setBase(inicial)
        setFormulario(inicial.empleado)
        setRolId(inicial.rolId)
      })
      .catch((err) => {
        if (vigente) setErrorCarga(mensajeDe(err))
      })
    return () => {
      vigente = false
    }
  }, [id])

  const propia = cuenta !== null && cuenta.id === sesion?.usuario?.id

  if (cuenta && !cuenta.activo) {
    return (
      <section className="flex max-w-3xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold">Editar usuario</h1>
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>La cuenta {cuenta.nombreUsuario} está desactivada; restáurela para editarla.</AlertDescription>
        </Alert>
        <div>
          <Button variant="outline" asChild>
            <Link to="/usuarios">Volver a Usuarios</Link>
          </Button>
        </div>
      </section>
    )
  }

  const cambiarCampo = (campo) => (valor) => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
    setAviso(null)
  }

  const cambios = base && formulario ? cambiosDe(base.empleado, formulario) : {}
  const hayCambiosEmpleado = Object.keys(cambios).length > 0
  const cambioRol = base !== null && rolId !== base.rolId
  const rol = catalogos?.roles.find((r) => String(r.id) === rolId)
  const rolSinEstablecimiento = rol?.codigo === 'ESTABLECIMIENTO' && formulario?.establecimientoId === NINGUNO
  const datosCompletos = formulario !== null && formulario.nombres.trim() !== '' && formulario.apellidos.trim() !== ''
  const puedeGuardar =
    catalogos !== null && !guardando && datosCompletos && !rolSinEstablecimiento && (hayCambiosEmpleado || cambioRol)

  async function guardar(evento) {
    evento.preventDefault()
    if (!puedeGuardar) return
    setGuardando(true)
    setAviso(null)

    let empleado = cuenta.empleado
    let nuevaBase = base
    if (hayCambiosEmpleado) {
      try {
        empleado = await editarEmpleado(cuenta.empleadoId, cambios)
      } catch (err) {
        setAviso({ tipo: 'error', mensaje: mensajeDe(err) })
        setGuardando(false)
        return
      }
      nuevaBase = { ...base, empleado: aFormulario(empleado) }
      setBase(nuevaBase)
      setFormulario(nuevaBase.empleado)
    }

    let actualizada = { ...cuenta, empleado: { ...cuenta.empleado, ...empleado } }
    if (cambioRol) {
      try {
        actualizada = await cambiarRol(cuenta.id, Number(rolId))
      } catch (err) {
        const mensaje = hayCambiosEmpleado
          ? `Se guardaron los datos de ${empleado.nombres} ${empleado.apellidos}, pero no se pudo cambiar el rol: ${mensajeDe(err)}`
          : mensajeDe(err)
        setCuenta(actualizada)
        setAviso({ tipo: 'error', mensaje })
        setGuardando(false)
        return
      }
      nuevaBase = { ...nuevaBase, rolId }
      setBase(nuevaBase)
    }

    setCuenta(actualizada)
    setAviso({ tipo: 'exito', mensaje: `Se guardaron los cambios de ${empleado.nombres} ${empleado.apellidos}.` })
    setGuardando(false)
  }

  const deshabilitado = catalogos === null || guardando

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Editar usuario</h1>

      {errorCarga && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudieron cargar los datos de la cuenta: {errorCarga}</AlertDescription>
        </Alert>
      )}

      {aviso?.tipo === 'exito' && (
        <Alert role="status" className="border-ring/40 bg-accent text-accent-foreground">
          <CircleCheck />
          <AlertDescription className="text-accent-foreground">
            <p>{aviso.mensaje}</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link to="/usuarios">Volver a Usuarios</Link>
            </Button>
          </AlertDescription>
        </Alert>
      )}
      {aviso?.tipo === 'error' && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>{aviso.mensaje}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={guardar} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos del empleado</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CamposEmpleado
              empleado={formulario ?? aFormulario({ nombres: '', apellidos: '' })}
              alCambiar={cambiarCampo}
              establecimientos={catalogos?.establecimientos ?? []}
              municipios={catalogos?.municipios ?? []}
              deshabilitado={deshabilitado}
            />
            {propia && (
              <p className="text-sm text-muted-foreground">
                Si cambia su propio establecimiento o municipio, deberá iniciar sesión de nuevo.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuenta de acceso</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-semibold">Nombre de usuario</span>
              <span data-testid="nombre-usuario" className="py-1.5 text-sm">{cuenta?.nombreUsuario ?? '—'}</span>
            </div>
            <CampoSeleccion
              id="rol"
              etiqueta="Rol"
              obligatorio
              valor={rolId}
              alCambiar={(valor) => {
                setRolId(valor)
                setAviso(null)
              }}
              deshabilitado={deshabilitado || propia}
              marcador="Elija un rol"
              opciones={(catalogos?.roles ?? []).map((r) => ({ valor: String(r.id), texto: r.nombre }))}
            />
            {propia && <p className="text-sm text-muted-foreground md:col-span-2">No puede cambiar su propio rol.</p>}
            {rolSinEstablecimiento && (
              <p role="alert" className="text-sm text-destructive md:col-span-2">
                Para el rol {rol.nombre}, el empleado debe tener un establecimiento.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!puedeGuardar}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/usuarios">Cancelar</Link>
          </Button>
        </div>
      </form>
    </section>
  )
}
