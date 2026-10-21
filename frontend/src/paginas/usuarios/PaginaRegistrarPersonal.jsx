import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listarDdriss, listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { crearCuenta, listarRoles, registrarEmpleado } from '@/api/usuarios.js'

const MENSAJE_INESPERADO = 'Ocurrió un error inesperado. Intente de nuevo.'
// Radix Select no acepta '' como valor de una opción.
const NINGUNO = 'ninguno'
const NOMBRE_USUARIO = /^\S{3,50}$/
const LARGO_MINIMO_CONTRASENA = 8

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
const CUENTA_VACIA = { crear: false, nombreUsuario: '', contrasena: '', confirmacion: '', rolId: '' }

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

function Campo({ id, etiqueta, obligatorio = false, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-semibold">
        {etiqueta}
        {obligatorio && <span aria-hidden="true">*</span>}
      </Label>
      {children}
    </div>
  )
}

function CampoTexto({ id, etiqueta, obligatorio, valor, alCambiar, deshabilitado, ...props }) {
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio={obligatorio}>
      <Input
        id={id}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        disabled={deshabilitado}
        className="bg-card"
        {...props}
      />
    </Campo>
  )
}

function CampoSeleccion({ id, etiqueta, obligatorio, valor, alCambiar, deshabilitado, marcador, opciones }) {
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio={obligatorio}>
      <Select value={valor} onValueChange={alCambiar} disabled={deshabilitado} name={id}>
        <SelectTrigger id={id} className="w-full bg-card">
          <SelectValue placeholder={marcador} />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </Campo>
  )
}

export default function PaginaRegistrarPersonal() {
  const [catalogos, setCatalogos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [empleado, setEmpleado] = useState(EMPLEADO_VACIO)
  const [cuenta, setCuenta] = useState(CUENTA_VACIA)
  // Empleado ya guardado cuando falló su cuenta: el formulario pasa a "solo cuenta".
  const [empleadoGuardado, setEmpleadoGuardado] = useState(null)
  const [resultado, setResultado] = useState(null)
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

  const contrasenasDistintas = cuenta.confirmacion !== '' && cuenta.confirmacion !== cuenta.contrasena
  const rolSinEstablecimiento = rol?.codigo === 'ESTABLECIMIENTO' && !tieneEstablecimiento
  const empleadoCompleto = empleado.nombres.trim() !== '' && empleado.apellidos.trim() !== ''
  const cuentaCompleta =
    NOMBRE_USUARIO.test(cuenta.nombreUsuario) &&
    cuenta.contrasena.length >= LARGO_MINIMO_CONTRASENA &&
    cuenta.contrasena === cuenta.confirmacion &&
    rol !== undefined &&
    !rolSinEstablecimiento
  const puedeEnviar =
    catalogos !== null && !enviando && (empleadoGuardado || empleadoCompleto) && (!quiereCuenta || cuentaCompleta)

  function vaciarContrasenas() {
    setCuenta((actual) => ({ ...actual, contrasena: '', confirmacion: '' }))
  }

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
        vaciarContrasenas()
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
          contrasenaTemporal: cuenta.contrasena,
          rolId: Number(cuenta.rolId),
        })
      } catch (err) {
        setEmpleadoGuardado(guardado)
        setError(`Se registró a ${guardado.nombres} ${guardado.apellidos}, pero no se pudo crear la cuenta: ${mensajeDe(err)}`)
        vaciarContrasenas()
        setEnviando(false)
        return
      }
    }

    setResultado({ empleado: guardado, cuenta: cuentaCreada })
    setEnviando(false)
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
              <div className="grid gap-4 md:grid-cols-2">
                <CampoTexto id="nombres" etiqueta="Nombres" obligatorio valor={empleado.nombres}
                  alCambiar={cambiarEmpleado('nombres')} deshabilitado={deshabilitado} maxLength={100} />
                <CampoTexto id="apellidos" etiqueta="Apellidos" obligatorio valor={empleado.apellidos}
                  alCambiar={cambiarEmpleado('apellidos')} deshabilitado={deshabilitado} maxLength={100} />
                <CampoTexto id="codigo-empleado" etiqueta="Código de empleado" valor={empleado.codigoEmpleado}
                  alCambiar={cambiarEmpleado('codigoEmpleado')} deshabilitado={deshabilitado} maxLength={20} />
                <CampoTexto id="cargo" etiqueta="Cargo" valor={empleado.cargo}
                  alCambiar={cambiarEmpleado('cargo')} deshabilitado={deshabilitado} maxLength={100} />
                <CampoTexto id="correo" etiqueta="Correo" type="email" valor={empleado.correo}
                  alCambiar={cambiarEmpleado('correo')} deshabilitado={deshabilitado} maxLength={150} />
                <CampoTexto id="telefono" etiqueta="Teléfono" type="tel" valor={empleado.telefono}
                  alCambiar={cambiarEmpleado('telefono')} deshabilitado={deshabilitado} maxLength={20} />

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold">DDRISS</span>
                  <span data-testid="ddriss" className="py-1.5 text-sm">{ddriss?.nombre ?? '—'}</span>
                </div>

                <CampoSeleccion
                  id="establecimiento"
                  etiqueta="Establecimiento"
                  valor={empleado.establecimientoId}
                  alCambiar={cambiarEmpleado('establecimientoId')}
                  deshabilitado={deshabilitado}
                  opciones={[
                    { valor: NINGUNO, texto: 'Sin establecimiento (personal de la DDRISS)' },
                    ...(catalogos?.establecimientos ?? []).map((e) => ({ valor: String(e.id), texto: e.nombre })),
                  ]}
                />

                {establecimiento ? (
                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold">Municipio</span>
                    <span data-testid="municipio-establecimiento" className="py-1.5 text-sm">
                      {establecimiento.municipioNombre}
                    </span>
                  </div>
                ) : (
                  <CampoSeleccion
                    id="municipio"
                    etiqueta="Municipio"
                    valor={empleado.municipioId}
                    alCambiar={cambiarEmpleado('municipioId')}
                    deshabilitado={deshabilitado}
                    opciones={[
                      { valor: NINGUNO, texto: 'Sin municipio' },
                      ...(catalogos?.municipios ?? []).map((m) => ({ valor: String(m.id), texto: m.nombre })),
                    ]}
                  />
                )}
              </div>
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
                <CampoTexto id="contrasena" etiqueta="Contraseña temporal" obligatorio type="password"
                  valor={cuenta.contrasena} alCambiar={cambiarCuenta('contrasena')} deshabilitado={deshabilitado}
                  autoComplete="new-password" />
                <CampoTexto id="confirmacion" etiqueta="Confirmar contraseña" obligatorio type="password"
                  valor={cuenta.confirmacion} alCambiar={cambiarCuenta('confirmacion')} deshabilitado={deshabilitado}
                  autoComplete="new-password" aria-invalid={contrasenasDistintas || undefined} />

                <p className="text-sm text-muted-foreground md:col-span-2">
                  De 3 a 50 caracteres sin espacios para el usuario y al menos {LARGO_MINIMO_CONTRASENA} para la
                  contraseña. La persona deberá cambiarla al entrar.
                </p>
                {contrasenasDistintas && (
                  <p role="alert" className="text-sm text-destructive md:col-span-2">
                    Las contraseñas no coinciden.
                  </p>
                )}
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
    </section>
  )
}
