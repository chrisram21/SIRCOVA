import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { listarDdriss, listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { crearCuenta, listarRoles, registrarEmpleado } from '@/api/usuarios.js'
import CamposEmpleado, { CampoSeleccion, CampoTexto, NINGUNO } from './CamposEmpleado.jsx'
import DialogoContrasenaTemporal from './DialogoContrasenaTemporal.jsx'

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intente de nuevo.'
const NOMBRE_USUARIO = /^\S{3,50}$/

const EMPLEADO_VACIO = {
  nombres: '',
  apellidos: '',
  codigoEmpleado: '',
  cargo: '',
  correo: '',
  telefono: '',
  establecimientoId: NINGUNO,
  municipioId: NINGUNO,
}
const CUENTA_VACIA = { crear: false, nombreUsuario: '', rolId: '' }

const mensajeDe = (error) => (error instanceof ErrorApi ? error.mensaje : MENSAJE_INESPERADO)

function armarEmpleado(datos) {
  const cuerpo = { nombres: datos.nombres.trim(), apellidos: datos.apellidos.trim() }
  for (const campo of ['codigoEmpleado', 'cargo', 'correo', 'telefono']) {
    const valor = datos[campo].trim()
    if (valor) cuerpo[campo] = valor
  }
  // Con establecimiento, el backend toma el municipio de él.
  if (datos.establecimientoId !== NINGUNO) cuerpo.establecimientoId = Number(datos.establecimientoId)
  else if (datos.municipioId !== NINGUNO) cuerpo.municipioId = Number(datos.municipioId)
  return cuerpo
}

export default function PaginaRegistrarPersonal() {
  const [catalogos, setCatalogos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [empleado, setEmpleado] = useState(EMPLEADO_VACIO)
  const [cuenta, setCuenta] = useState(CUENTA_VACIA)
  // Empleado ya guardado cuando falló su cuenta: el formulario pasa a "solo cuenta".
  const [empleadoGuardado, setEmpleadoGuardado] = useState(null)
  const [resultado, setResultado] = useState(null)
  // Resultado con la contraseña generada, solo mientras el diálogo está abierto.
  const [porMostrar, setPorMostrar] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([listarDdriss(), listarRoles(), listarMunicipios(), listarEstablecimientos({ activo: true })])
      .then(([ddriss, roles, municipios, establecimientos]) => {
        if (vigente) setCatalogos({ ddriss, roles, municipios, establecimientos })
      })
      .catch((err) => {
        if (vigente) setErrorCarga(mensajeDe(err))
      })
    return () => {
      vigente = false
    }
  }, [])

  const cambiarEmpleado = (campo) => (valor) => setEmpleado((actual) => ({ ...actual, [campo]: valor }))
  const cambiarCuenta = (campo) => (valor) => setCuenta((actual) => ({ ...actual, [campo]: valor }))

  const establecimiento = catalogos?.establecimientos.find((e) => String(e.id) === empleado.establecimientoId)
  const rol = catalogos?.roles.find((r) => String(r.id) === cuenta.rolId)
  const tieneEstablecimiento = empleadoGuardado ? empleadoGuardado.establecimientoId != null : Boolean(establecimiento)
  const quiereCuenta = empleadoGuardado !== null || cuenta.crear

  const rolSinEstablecimiento = rol?.codigo === 'ESTABLECIMIENTO' && !tieneEstablecimiento
  const empleadoCompleto = empleado.nombres.trim() !== '' && empleado.apellidos.trim() !== ''
  const cuentaCompleta =
    NOMBRE_USUARIO.test(cuenta.nombreUsuario) &&
    rol !== undefined &&
    !rolSinEstablecimiento
  const puedeEnviar =
    catalogos !== null && !enviando && (empleadoGuardado || empleadoCompleto) && (!quiereCuenta || cuentaCompleta)

  async function enviar(evento) {
    evento.preventDefault()
    if (!puedeEnviar) return
    setEnviando(true)
    setError(null)

    let guardado = empleadoGuardado
    if (!guardado) {
      try {
        guardado = await registrarEmpleado(armarEmpleado(empleado))
      } catch (err) {
        setError(mensajeDe(err))
        setEnviando(false)
        return
      }
    }

    let cuentaCreada = null
    if (quiereCuenta) {
      try {
        cuentaCreada = await crearCuenta({
          empleadoId: guardado.id,
          nombreUsuario: cuenta.nombreUsuario,
          rolId: Number(cuenta.rolId),
        })
      } catch (err) {
        setEmpleadoGuardado(guardado)
        setError(`Se registró a ${guardado.nombres} ${guardado.apellidos}, pero no se pudo crear la cuenta: ${mensajeDe(err)}`)
        setEnviando(false)
        return
      }
    }

    setEnviando(false)
    if (cuentaCreada) {
      const { contrasenaTemporal, ...cuentaSinContrasena } = cuentaCreada
      setPorMostrar({ empleado: guardado, cuenta: cuentaSinContrasena, contrasenaTemporal })
    } else {
      setResultado({ empleado: guardado, cuenta: null })
    }
  }

  function cerrarDialogo() {
    setResultado({ empleado: porMostrar.empleado, cuenta: porMostrar.cuenta })
    setPorMostrar(null)
  }

  function registrarOtro() {
    setEmpleado(EMPLEADO_VACIO)
    setCuenta(CUENTA_VACIA)
    setEmpleadoGuardado(null)
    setResultado(null)
    setError(null)
  }

  if (resultado) {
    return (
      <section className="flex max-w-3xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold">Registrar personal</h1>
        <Alert role="status" className="border-ring/40 bg-accent text-accent-foreground">
          <CircleCheck />
          <AlertDescription className="text-accent-foreground">
            <p>
              Se registró a {resultado.empleado.nombres} {resultado.empleado.apellidos}.
            </p>
            {resultado.cuenta && <p>Se creó la cuenta {resultado.cuenta.nombreUsuario}.</p>}
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap gap-3">
          <Button onClick={registrarOtro}>Registrar otro</Button>
          <Button variant="outline" asChild>
            <Link to="/usuarios">Volver a Usuarios</Link>
          </Button>
        </div>
      </section>
    )
  }

  const deshabilitado = catalogos === null || enviando
  const ddriss = catalogos?.ddriss[0]

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Registrar personal</h1>

      {errorCarga && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudieron cargar los datos del formulario: {errorCarga}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Datos del empleado</CardTitle>
          </CardHeader>
          <CardContent>
            {empleadoGuardado ? (
              <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
                <dt className="text-muted-foreground">Empleado</dt>
                <dd>
                  {empleadoGuardado.nombres} {empleadoGuardado.apellidos}
                </dd>
                <dt className="text-muted-foreground">Establecimiento</dt>
                <dd>{establecimiento?.nombre ?? 'Sin establecimiento'}</dd>
              </dl>
            ) : (
              <CamposEmpleado
                empleado={empleado}
                alCambiar={cambiarEmpleado}
                establecimientos={catalogos?.establecimientos ?? []}
                municipios={catalogos?.municipios ?? []}
                ddrissNombre={ddriss?.nombre ?? null}
                deshabilitado={deshabilitado}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cuenta de acceso</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {!empleadoGuardado && (
              <div className="flex items-center gap-2">
                <Checkbox
                  id="crear-cuenta"
                  checked={cuenta.crear}
                  onCheckedChange={(marcado) => cambiarCuenta('crear')(marcado === true)}
                  disabled={deshabilitado}
                />
                <Label htmlFor="crear-cuenta">Crear cuenta de acceso</Label>
              </div>
            )}

            {quiereCuenta && (
              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto id="nombre-usuario" etiqueta="Nombre de usuario" obligatorio valor={cuenta.nombreUsuario}
                  alCambiar={cambiarCuenta('nombreUsuario')} deshabilitado={deshabilitado} maxLength={50}
                  autoComplete="off" />
                <CampoSeleccion
                  id="rol"
                  etiqueta="Rol"
                  obligatorio
                  valor={cuenta.rolId}
                  alCambiar={cambiarCuenta('rolId')}
                  deshabilitado={deshabilitado}
                  marcador="Elija un rol"
                  opciones={(catalogos?.roles ?? []).map((r) => ({ valor: String(r.id), texto: r.nombre }))}
                />

                <p className="text-sm text-muted-foreground md:col-span-2">
                  De 3 a 50 caracteres sin espacios para el usuario. El sistema genera la contraseña temporal y se la
                  muestra una sola vez; la persona deberá cambiarla al entrar.
                </p>
                {rolSinEstablecimiento && (
                  <p role="alert" className="text-sm text-destructive md:col-span-2">
                    Para el rol {rol.nombre}, el empleado debe tener un establecimiento.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={!puedeEnviar}>
            {enviando ? 'Registrando…' : empleadoGuardado ? 'Crear cuenta' : 'Registrar'}
          </Button>
          <Button variant="outline" asChild>
            <Link to="/usuarios">Cancelar</Link>
          </Button>
        </div>
      </form>

      {porMostrar && (
        <DialogoContrasenaTemporal
          nombreUsuario={porMostrar.cuenta.nombreUsuario}
          contrasena={porMostrar.contrasenaTemporal}
          alCerrar={cerrarDialogo}
        />
      )}
    </section>
  )
}
