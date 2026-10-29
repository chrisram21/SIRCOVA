import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { cambiarRol, editarEmpleado, listarRoles, obtenerUsuario } from '@/api/usuarios.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import CamposEmpleado, {
  AvisoSalida,
  CampoSeleccion,
  camposConError,
  enfocarPrimero,
  erroresDeEmpleado,
  NINGUNO,
} from './CamposEmpleado.jsx'

const TEXTOS_OPCIONALES = ['cargo', 'correo', 'telefono']

const aOpcion = (id) => (id == null ? NINGUNO : String(id))

// El formulario trabaja con texto. Con establecimiento se guarda también su municipio, para que al quitarlo
// el Select muestre el que conserva el backend.
function aFormulario(empleado) {
  return {
    nombres: empleado.nombres,
    apellidos: empleado.apellidos,
    ...Object.fromEntries(TEXTOS_OPCIONALES.map((campo) => [campo, empleado[campo] ?? ''])),
    // El CUI guardado no se conoce: el campo siempre empieza vacío y solo se envía si se escribe.
    cui: '',
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
  if (actual.cui.trim()) cambios.cui = actual.cui.trim()
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
  const { state } = useLocation()
  const navegar = useNavigate()
  const { sesion } = useSesion()
  // La lista manda sus filtros y su página para volver a ellos.
  const volverA = state?.volverA?.pathname ? state.volverA : '/usuarios'

  const [cuenta, setCuenta] = useState(null)
  const [catalogos, setCatalogos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
  // Lo guardado en el backend; los cambios se calculan contra esto.
  const [base, setBase] = useState(null)
  const [formulario, setFormulario] = useState(null)
  const [rolId, setRolId] = useState('')
  const [reemplazandoCui, setReemplazandoCui] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState(null)
  const [intentado, setIntentado] = useState(false)
  const [guardado, setGuardado] = useState(false)

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
        if (vigente) setErrorCarga(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [id, intentoCarga])

  // Se navega después del render en que el formulario ya quedó igual a lo guardado; si no, el aviso de
  // cambios sin guardar todavía bloquearía la salida.
  useEffect(() => {
    if (guardado) navegar(volverA)
    // Solo al terminar de guardar; volverA es un objeto nuevo en cada render.
  }, [guardado])

  function reintentarCarga() {
    setErrorCarga(null)
    setIntentoCarga((intento) => intento + 1)
  }

  const propia = cuenta !== null && cuenta.id === sesion?.usuario?.id

  if (cuenta && !cuenta.activo) {
    return (
      <section className="flex max-w-3xl flex-col gap-6 p-6">
        <EncabezadoPagina titulo="Editar usuario" />
        <AvisoError>La cuenta {cuenta.nombreUsuario} está desactivada; restáurela para editarla.</AvisoError>
        <div>
          <Button variant="outline" asChild>
            <Link to={volverA}>Volver a Usuarios</Link>
          </Button>
        </div>
      </section>
    )
  }

  const cambiarCampo = (campo) => (valor) => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }))
    setError(null)
  }

  const cambios = base && formulario ? cambiosDe(base.empleado, formulario) : {}
  const hayCambiosEmpleado = Object.keys(cambios).length > 0
  // Como el backend, solo se revisan los campos que cambiaron: un dato viejo mal escrito no impide guardar otro.
  const erroresEmpleado = formulario ? erroresDeEmpleado(formulario, Object.keys(cambios)) : {}
  const cambioRol = base !== null && rolId !== base.rolId
  const rol = catalogos?.roles.find((r) => String(r.id) === rolId)
  const rolSinEstablecimiento = rol?.codigo === 'ESTABLECIMIENTO' && formulario?.establecimientoId === NINGUNO
  const hayCambios = hayCambiosEmpleado || cambioRol

  async function guardar(evento) {
    evento.preventDefault()
    if (catalogos === null || guardando) return

    // En la cuenta propia el rol no se cambia: se corrige con el establecimiento.
    const campoDelRol = propia ? 'establecimiento' : 'rol'
    const invalidos = [...camposConError(erroresEmpleado), ...(rolSinEstablecimiento ? [campoDelRol] : [])]
    if (invalidos.length > 0) {
      setIntentado(true)
      enfocarPrimero(invalidos)
      return
    }
    if (!hayCambios) {
      toast.info('No hay cambios que guardar.')
      return
    }

    setGuardando(true)
    setError(null)

    let empleado = cuenta.empleado
    let nuevaBase = base
    if (hayCambiosEmpleado) {
      try {
        empleado = await editarEmpleado(cuenta.empleadoId, cambios)
      } catch (err) {
        setError(mensajeDeError(err))
        setGuardando(false)
        return
      }
      nuevaBase = { ...base, empleado: aFormulario(empleado) }
      setBase(nuevaBase)
      setFormulario(nuevaBase.empleado)
      setReemplazandoCui(false)
    }

    let actualizada = { ...cuenta, empleado: { ...cuenta.empleado, ...empleado } }
    if (cambioRol) {
      try {
        actualizada = await cambiarRol(cuenta.id, Number(rolId))
      } catch (err) {
        const mensaje = hayCambiosEmpleado
          ? `Se guardaron los datos de ${empleado.nombres} ${empleado.apellidos}, pero no se pudo cambiar el rol: ${mensajeDeError(err)}`
          : mensajeDeError(err)
        setCuenta(actualizada)
        setError(mensaje)
        setGuardando(false)
        return
      }
      nuevaBase = { ...nuevaBase, rolId }
      setBase(nuevaBase)
    }

    setCuenta(actualizada)
    setGuardando(false)
    toast.success(`Se guardaron los cambios de ${empleado.nombres} ${empleado.apellidos}.`)
    setGuardado(true)
  }

  const deshabilitado = catalogos === null || guardando

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <EncabezadoPagina
        titulo="Editar usuario"
        descripcion={cuenta ? `${cuenta.empleado.nombres} ${cuenta.empleado.apellidos} · ${cuenta.nombreUsuario}` : undefined}
        volverA={volverA}
        textoVolver="Volver a Usuarios"
      />

      {errorCarga && (
        <AvisoError onReintentar={reintentarCarga}>No se pudieron cargar los datos de la cuenta: {errorCarga}</AvisoError>
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
              errores={erroresEmpleado}
              mostrarErrores={intentado}
              correoObligatorio={Boolean(base?.empleado.correo)}
              cuiRegistrado={Boolean(cuenta?.empleado.cuiRegistrado)}
              reemplazandoCui={reemplazandoCui}
              alReemplazarCui={(valor) => {
                setReemplazandoCui(valor)
                setError(null)
              }}
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
                setError(null)
              }}
              deshabilitado={deshabilitado || propia}
              marcador="Elija un rol"
              opciones={(catalogos?.roles ?? []).map((r) => ({ valor: String(r.id), texto: r.nombre }))}
              error={
                rolSinEstablecimiento ? `Para el rol ${rol.nombre}, el empleado debe tener un establecimiento.` : undefined
              }
            />
            {propia && <p className="text-sm text-muted-foreground md:col-span-2">No puede cambiar su propio rol.</p>}
          </CardContent>
        </Card>

        {error && <AvisoError>{error}</AvisoError>}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={deshabilitado}>
            {guardando ? 'Guardando…' : 'Guardar cambios'}
          </Button>
          <Button variant="outline" asChild>
            <Link to={volverA}>Cancelar</Link>
          </Button>
        </div>
      </form>

      {formulario && (
        <AvisoSalida hayCambios={hayCambios} descripcion="Si sale ahora, se pierden los cambios que no guardó." />
      )}
    </section>
  )
}
