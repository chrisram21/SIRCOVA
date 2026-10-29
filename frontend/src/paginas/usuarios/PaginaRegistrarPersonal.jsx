import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { listarDdriss, listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { crearCuenta, listarRoles, registrarEmpleado } from '@/api/usuarios.js'
import { AvisoError, AvisoExito } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { validarNombreUsuario } from '@/validaciones/campos.js'
import CamposEmpleado, {
  AvisoSalida,
  CampoSeleccion,
  CampoTexto,
  camposConError,
  enfocarPrimero,
  erroresDeEmpleado,
  NINGUNO,
} from './CamposEmpleado.jsx'
import DialogoContrasenaTemporal from './DialogoContrasenaTemporal.jsx'

const EMPLEADO_VACIO = {
  nombres: '',
  apellidos: '',
  cui: '',
  cargo: '',
  correo: '',
  telefono: '',
  establecimientoId: NINGUNO,
  municipioId: NINGUNO,
}
const CUENTA_VACIA = { crear: false, nombreUsuario: '', rolId: '' }

function armarEmpleado(datos) {
  const cuerpo = { nombres: datos.nombres.trim(), apellidos: datos.apellidos.trim() }
  for (const campo of ['cui', 'cargo', 'correo', 'telefono']) {
    const valor = datos[campo].trim()
    if (valor) cuerpo[campo] = valor
  }
  // Con establecimiento, el backend toma el municipio de él.
  if (datos.establecimientoId !== NINGUNO) cuerpo.establecimientoId = Number(datos.establecimientoId)
  else if (datos.municipioId !== NINGUNO) cuerpo.municipioId = Number(datos.municipioId)
  return cuerpo
}

export default function PaginaRegistrarPersonal() {
  const { state } = useLocation()
  // La lista manda sus filtros y su página para volver a ellos.
  const volverA = state?.volverA?.pathname ? state.volverA : '/usuarios'

  const [catalogos, setCatalogos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [empleado, setEmpleado] = useState(EMPLEADO_VACIO)
  const [cuenta, setCuenta] = useState(CUENTA_VACIA)
  // Empleado ya guardado cuando falló su cuenta: el formulario pasa a "solo cuenta".
  const [empleadoGuardado, setEmpleadoGuardado] = useState(null)
  const [resultado, setResultado] = useState(null)
  // Resultado con la contraseña generada, solo mientras el diálogo está abierto.
  const [porMostrar, setPorMostrar] = useState(null)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  const [usuarioTocado, setUsuarioTocado] = useState(false)
  // Después de intentar enviar, se ven los errores de todos los campos.
  const [intentado, setIntentado] = useState(false)

  useEffect(() => {
    let vigente = true
    Promise.all([listarDdriss(), listarRoles(), listarMunicipios(), listarEstablecimientos({ activo: true })])
      .then(([ddriss, roles, municipios, establecimientos]) => {
        if (vigente) setCatalogos({ ddriss, roles, municipios, establecimientos })
      })
      .catch((err) => {
        if (vigente) setErrorCarga(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [intentoCarga])

  function reintentarCarga() {
    setErrorCarga(null)
    setIntentoCarga((intento) => intento + 1)
  }

  const cambiarEmpleado = (campo) => (valor) => setEmpleado((actual) => ({ ...actual, [campo]: valor }))
  const cambiarCuenta = (campo) => (valor) => setCuenta((actual) => ({ ...actual, [campo]: valor }))

  const establecimiento = catalogos?.establecimientos.find((e) => String(e.id) === empleado.establecimientoId)
  const rol = catalogos?.roles.find((r) => String(r.id) === cuenta.rolId)
  const tieneEstablecimiento = empleadoGuardado ? empleadoGuardado.establecimientoId != null : Boolean(establecimiento)
  const quiereCuenta = empleadoGuardado !== null || cuenta.crear

  const erroresEmpleado = empleadoGuardado ? {} : erroresDeEmpleado(empleado)
  const errorUsuario = quiereCuenta ? validarNombreUsuario(cuenta.nombreUsuario).error : undefined
  const rolSinEstablecimiento = rol?.codigo === 'ESTABLECIMIENTO' && !tieneEstablecimiento
  const rolInvalido = quiereCuenta && (rol === undefined || rolSinEstablecimiento)
  // Sin rol, el aviso espera al envío; el del establecimiento sale al elegir el rol.
  const errorRol = !rolInvalido
    ? undefined
    : rolSinEstablecimiento
      ? `Para el rol ${rol.nombre}, el empleado debe tener un establecimiento.`
      : intentado
        ? 'Elija un rol.'
        : undefined

  const cuentaEscrita = cuenta.nombreUsuario !== '' || cuenta.rolId !== ''
  const empleadoEscrito = Object.keys(EMPLEADO_VACIO).some((campo) => empleado[campo] !== EMPLEADO_VACIO[campo])
  const hayCambios = !resultado && !porMostrar && (cuentaEscrita || (!empleadoGuardado && empleadoEscrito))

  async function enviar(evento) {
    evento.preventDefault()
    if (catalogos === null || enviando) return

    const invalidos = [
      ...camposConError(erroresEmpleado),
      ...(errorUsuario ? ['nombre-usuario'] : []),
      ...(rolInvalido ? ['rol'] : []),
    ]
    if (invalidos.length > 0) {
      setIntentado(true)
      enfocarPrimero(invalidos)
      return
    }

    setEnviando(true)
    setError(null)

    let guardado = empleadoGuardado
    if (!guardado) {
      try {
        guardado = await registrarEmpleado(armarEmpleado(empleado))
      } catch (err) {
        setError(mensajeDeError(err))
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
        setError(`Se registró a ${guardado.nombres} ${guardado.apellidos}, pero no se pudo crear la cuenta: ${mensajeDeError(err)}`)
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
    setUsuarioTocado(false)
    setIntentado(false)
  }

  if (resultado) {
    return (
      <section className="flex max-w-3xl flex-col gap-6 p-6">
        <EncabezadoPagina titulo="Registrar personal" />
        <AvisoExito>
          <p>
            Se registró a {resultado.empleado.nombres} {resultado.empleado.apellidos}.
          </p>
          {resultado.cuenta && <p>Se creó la cuenta {resultado.cuenta.nombreUsuario}.</p>}
        </AvisoExito>
        <div className="flex flex-wrap gap-3">
          <Button onClick={registrarOtro}>Registrar otro</Button>
          <Button variant="outline" asChild>
            <Link to={volverA}>Volver a Usuarios</Link>
          </Button>
        </div>
      </section>
    )
  }

  const deshabilitado = catalogos === null || enviando
  const ddriss = catalogos?.ddriss[0]

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <EncabezadoPagina
        titulo="Registrar personal"
        descripcion="Registre al empleado y, si lo necesita, su cuenta de acceso. Los campos con * son obligatorios."
        volverA={volverA}
        textoVolver="Volver a Usuarios"
      />

      {errorCarga && (
        <AvisoError onReintentar={reintentarCarga}>No se pudieron cargar los datos del formulario: {errorCarga}</AvisoError>
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
                errores={erroresEmpleado}
                mostrarErrores={intentado}
                correoObligatorio
                cuiObligatorio
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
                  alCambiar={(valor) => cambiarCuenta('nombreUsuario')(valor.toLowerCase())}
                  onBlur={() => setUsuarioTocado(true)} error={usuarioTocado || intentado ? errorUsuario : undefined}
                  deshabilitado={deshabilitado} maxLength={50} autoComplete="off" />
                <CampoSeleccion
                  id="rol"
                  etiqueta="Rol"
                  obligatorio
                  valor={cuenta.rolId}
                  alCambiar={cambiarCuenta('rolId')}
                  deshabilitado={deshabilitado}
                  marcador="Elija un rol"
                  opciones={(catalogos?.roles ?? []).map((r) => ({ valor: String(r.id), texto: r.nombre }))}
                  error={errorRol}
                />

                <p className="text-sm text-muted-foreground md:col-span-2">
                  El usuario lleva de 4 a 50 caracteres: minúsculas, números, punto, guion o guion bajo. El sistema genera la contraseña temporal y se la
                  muestra una sola vez; la persona deberá cambiarla al entrar.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {error && <AvisoError>{error}</AvisoError>}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={deshabilitado}>
            {enviando ? 'Registrando…' : empleadoGuardado ? 'Crear cuenta' : 'Registrar'}
          </Button>
          <Button variant="outline" asChild>
            <Link to={volverA}>Cancelar</Link>
          </Button>
        </div>
      </form>

      {catalogos && (
        <AvisoSalida
          hayCambios={hayCambios}
          descripcion={
            empleadoGuardado
              ? `${empleadoGuardado.nombres} ${empleadoGuardado.apellidos} ya quedó registrado, pero si sale ahora no se crea su cuenta.`
              : 'Si sale ahora, se pierden los datos que escribió.'
          }
        />
      )}

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
