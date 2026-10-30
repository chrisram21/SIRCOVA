import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  crearEstablecimiento,
  editarEstablecimiento,
  listarDdriss,
  listarDistritos,
  listarMunicipios,
  listarTiposEstablecimiento,
  obtenerEstablecimiento,
} from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import {
  LARGOS,
  validarCorreo,
  validarDireccion,
  validarNombreContacto,
  validarNombreEstablecimiento,
  validarTelefono,
} from '@/validaciones/campos.js'
import { Campo, CampoTexto } from '../usuarios/CamposEmpleado.jsx'

const MIGRANTES = '9999'
const LISTA = '/administracion/establecimientos'

const TEXTOS = ['nombre', 'direccion', 'telefono', 'correo', 'nombreContacto']
const MARCAS = ['reportaProduccion', 'reporta5c', 'soloCobertura']

const VACIO = {
  tipoEstablecimientoId: '',
  municipioId: '',
  distritoSaludId: '',
  nombre: '',
  direccion: '',
  telefono: '',
  correo: '',
  nombreContacto: '',
  reportaProduccion: true,
  reporta5c: false,
  soloCobertura: false,
}

// En un establecimiento el correo es opcional; con texto, sigue la regla del correo.
const correoOpcional = (valor) => (valor.trim() === '' ? { valor: null } : validarCorreo(valor))

const REGLAS = {
  nombre: validarNombreEstablecimiento,
  direccion: validarDireccion,
  telefono: validarTelefono,
  correo: correoOpcional,
  nombreContacto: validarNombreContacto,
}

// `campos` limita la revisión: al editar, solo los que cambiaron, como el backend.
function erroresDe(datos, { externo, editando, campos = TEXTOS }) {
  const errores = {}
  for (const campo of campos) {
    const { error } = REGLAS[campo]?.(datos[campo]) ?? {}
    if (error) errores[campo] = error
  }
  if (editando) return errores
  if (!datos.tipoEstablecimientoId) errores.tipoEstablecimientoId = 'Elija el tipo de establecimiento.'
  if (!datos.municipioId) errores.municipioId = 'Elija el municipio.'
  else if (!externo && !datos.distritoSaludId) errores.distritoSaludId = 'Elija el distrito de salud.'
  return errores
}

function armarCuerpo(datos, externo) {
  const cuerpo = {
    tipoEstablecimientoId: Number(datos.tipoEstablecimientoId),
    municipioId: Number(datos.municipioId),
    nombre: datos.nombre.trim(),
    reportaProduccion: datos.reportaProduccion,
    reporta5c: datos.reporta5c,
    soloCobertura: datos.soloCobertura,
  }
  // Un externo no lleva distrito: el backend lo deduce del municipio.
  if (!externo) cuerpo.distritoSaludId = Number(datos.distritoSaludId)
  for (const campo of ['direccion', 'telefono', 'correo', 'nombreContacto']) {
    const valor = datos[campo].trim()
    if (valor) cuerpo[campo] = valor
  }
  return cuerpo
}

// Solo los campos que cambiaron, como los espera PATCH /establecimientos/{id}. Un texto vacío lo borra.
function cambiosDe(base, actual) {
  const cambios = {}
  for (const campo of TEXTOS) {
    if (actual[campo].trim() !== base[campo].trim()) cambios[campo] = actual[campo].trim() || null
  }
  for (const campo of MARCAS) {
    if (actual[campo] !== base[campo]) cambios[campo] = actual[campo]
  }
  return cambios
}

// Lo que devuelve la API, en la forma del formulario: los Input no aceptan null.
function aDatos(establecimiento) {
  const datos = { ...VACIO }
  for (const campo of TEXTOS) datos[campo] = establecimiento[campo] ?? ''
  for (const campo of MARCAS) datos[campo] = establecimiento[campo]
  return datos
}

function Seleccion({ id, etiqueta, valor, alCambiar, deshabilitado, marcador, error, children }) {
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio>
      <Select value={valor} onValueChange={alCambiar} disabled={deshabilitado} name={id}>
        <SelectTrigger
          id={id}
          className="w-full bg-card"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        >
          <SelectValue placeholder={marcador} />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Campo>
  )
}

function Marca({ id, etiqueta, marcado, alCambiar, deshabilitado }) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={marcado}
        onCheckedChange={(valor) => alCambiar(valor === true)}
        disabled={deshabilitado}
      />
      <Label htmlFor={id}>{etiqueta}</Label>
    </div>
  )
}

// El código, el tipo, el municipio y el distrito no cambian al editar: se muestran como texto.
function DatosFijos({ establecimiento: e }) {
  return (
    <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
      <dt className="text-muted-foreground">Código</dt>
      <dd>{e.codigo}</dd>
      <dt className="text-muted-foreground">Tipo</dt>
      <dd>{e.tipoEstablecimientoNombre}</dd>
      <dt className="text-muted-foreground">Municipio</dt>
      <dd>{e.municipioNombre}</dd>
      <dt className="text-muted-foreground">Distrito de salud</dt>
      <dd>
        {e.esExterno
          ? 'Establecimiento externo: no lleva distrito de salud.'
          : `${e.distritoSaludCodigo} · ${e.distritoSaludNombre}`}
      </dd>
    </dl>
  )
}

// Sin `id` registra uno nuevo; con `id` edita ese establecimiento.
export default function FormularioEstablecimiento({ id }) {
  const editando = id !== undefined
  const navigate = useNavigate()
  const { state } = useLocation()
  // La lista manda sus filtros al abrir el formulario, para volver a ella con los mismos.
  const volverA = `${LISTA}${state?.volverA ?? ''}`

  const [catalogos, setCatalogos] = useState(null)
  // Al editar, lo guardado en el backend; los cambios se calculan contra esto.
  const [base, setBase] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [datos, setDatos] = useState(VACIO)
  // Un mensaje aparece cuando la persona sale del campo por primera vez, o al intentar guardar.
  const [tocados, setTocados] = useState({})
  const [intentado, setIntentado] = useState(false)
  const [error, setError] = useState(null)
  const [enviando, setEnviando] = useState(false)
  // Tras guardar se sale en un efecto, cuando el aviso de cambios sin guardar ya no bloquea.
  const [guardado, setGuardado] = useState(false)
  // Cada intento de envío con errores sube este número; un efecto lleva el foco al primer campo inválido.
  const [revisar, setRevisar] = useState(0)
  // Cada «Reintentar» sube este número y vuelve a cargar.
  const [intentoCarga, setIntentoCarga] = useState(0)
  const formulario = useRef(null)
  const avisoError = useRef(null)

  useEffect(() => {
    let vigente = true
    const fallo = (err) => {
      if (vigente) setErrorCarga(mensajeDeError(err))
    }
    if (editando) {
      obtenerEstablecimiento(id)
        .then((establecimiento) => {
          if (!vigente) return
          setBase(establecimiento)
          setDatos(aDatos(establecimiento))
        })
        .catch(fallo)
    } else {
      Promise.all([
        listarTiposEstablecimiento(),
        listarMunicipios({ alcance: 'todos' }),
        listarDdriss(),
        listarDistritos({ activo: true }),
      ])
        .then(([tipos, municipios, ddriss, distritos]) => {
          if (vigente) setCatalogos({ tipos, municipios, ddriss, distritos })
        })
        .catch(fallo)
    }
    return () => {
      vigente = false
    }
  }, [editando, id, intentoCarga])

  const departamentosSede = new Set((catalogos?.ddriss ?? []).map((d) => d.departamentoId))
  const municipios = (catalogos?.municipios ?? []).filter((m) => m.codigoIne !== MIGRANTES)
  const municipiosSede = municipios.filter((m) => departamentosSede.has(m.departamentoId))
  const municipiosFuera = municipios.filter((m) => !departamentosSede.has(m.departamentoId))
  const municipio = municipios.find((m) => String(m.id) === datos.municipioId)
  const externo = municipio !== undefined && !departamentosSede.has(municipio.departamentoId)
  const distritos = (catalogos?.distritos ?? []).filter((d) => String(d.municipioId) === datos.municipioId)

  const cambios = base ? cambiosDe(aDatos(base), datos) : {}
  const hayCambios = editando
    ? Object.keys(cambios).length > 0
    : Object.keys(VACIO).some((campo) => datos[campo] !== VACIO[campo])
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !guardado)
  const errores = erroresDe(datos, { externo, editando, campos: editando ? Object.keys(cambios) : TEXTOS })
  const errorDe = (campo) => (intentado || tocados[campo] ? errores[campo] : undefined)
  const cargado = editando ? base !== null : catalogos !== null
  const deshabilitado = !cargado || enviando

  const cambiar = (campo) => (valor) => setDatos((actual) => ({ ...actual, [campo]: valor }))
  const tocar = (campo) => () => setTocados((actual) => (actual[campo] ? actual : { ...actual, [campo]: true }))
  const texto = (campo) => ({
    valor: datos[campo],
    alCambiar: cambiar(campo),
    onBlur: tocar(campo),
    error: errorDe(campo),
    deshabilitado,
  })

  // El distrito elegido es de otro municipio: se borra al cambiar de municipio.
  const cambiarMunicipio = (valor) => setDatos((actual) => ({ ...actual, municipioId: valor, distritoSaludId: '' }))
  // Sin producción propia no puede enviar el 5C ni contar para la cobertura.
  const cambiarReportaProduccion = (marcado) =>
    setDatos((actual) => ({
      ...actual,
      reportaProduccion: marcado,
      ...(marcado ? {} : { reporta5c: false, soloCobertura: false }),
    }))

  useEffect(() => {
    if (guardado) navigate(volverA)
  }, [guardado, navigate, volverA])

  useEffect(() => {
    if (revisar > 0) formulario.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  useEffect(() => {
    if (error) avisoError.current?.scrollIntoView?.({ block: 'nearest' })
  }, [error])

  function reintentarCarga() {
    setErrorCarga(null)
    setIntentoCarga((n) => n + 1)
  }

  async function enviar(evento) {
    evento.preventDefault()
    setIntentado(true)
    if (deshabilitado) return
    if (Object.keys(errores).length > 0) {
      setRevisar((n) => n + 1)
      return
    }
    if (editando && !hayCambios) {
      toast.info('No hay cambios que guardar.')
      return
    }
    setEnviando(true)
    setError(null)
    try {
      const respuesta = editando
        ? await editarEstablecimiento(id, cambios)
        : await crearEstablecimiento(armarCuerpo(datos, externo))
      toast.success(`Establecimiento ${respuesta.codigo} ${editando ? 'actualizado' : 'registrado'}.`)
      setGuardado(true)
    } catch (err) {
      setError(mensajeDeError(err))
      setEnviando(false)
    }
  }

  const titulo = editando ? 'Editar establecimiento' : 'Registrar establecimiento'

  return (
    <section className="flex max-w-3xl flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Administración" titulo={titulo} volverA={volverA} />

      {errorCarga && (
        <AvisoError onReintentar={reintentarCarga}>
          No se pudieron cargar los datos del formulario: {errorCarga}
        </AvisoError>
      )}

      <form ref={formulario} onSubmit={enviar} noValidate className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Ubicación y tipo</CardTitle>
          </CardHeader>
          {editando ? (
            <CardContent>{base && <DatosFijos establecimiento={base} />}</CardContent>
          ) : (
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Seleccion
                id="tipo"
                etiqueta="Tipo"
                valor={datos.tipoEstablecimientoId}
                alCambiar={cambiar('tipoEstablecimientoId')}
                deshabilitado={deshabilitado}
                marcador="Elija un tipo"
                error={errorDe('tipoEstablecimientoId')}
              >
                {(catalogos?.tipos ?? []).map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.nombre}
                  </SelectItem>
                ))}
              </Seleccion>

              <Seleccion
                id="municipio"
                etiqueta="Municipio"
                valor={datos.municipioId}
                alCambiar={cambiarMunicipio}
                deshabilitado={deshabilitado}
                marcador="Elija un municipio"
                error={errorDe('municipioId')}
              >
                <SelectGroup>
                  <SelectLabel>Departamento sede</SelectLabel>
                  {municipiosSede.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {municipiosFuera.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Otros departamentos (externo)</SelectLabel>
                    {municipiosFuera.map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.nombre} ({m.departamentoNombre})
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </Seleccion>

              {externo ? (
                <p className="text-sm text-muted-foreground md:col-span-2">
                  Establecimiento externo: no lleva distrito de salud.
                </p>
              ) : (
                <Seleccion
                  id="distrito"
                  etiqueta="Distrito de salud"
                  valor={datos.distritoSaludId}
                  alCambiar={cambiar('distritoSaludId')}
                  deshabilitado={deshabilitado || !municipio}
                  marcador={municipio ? 'Elija un distrito' : 'Elija primero el municipio'}
                  error={errorDe('distritoSaludId')}
                >
                  {distritos.map((d) => (
                    <SelectItem key={d.id} value={String(d.id)}>
                      {d.codigo} · {d.nombre}
                    </SelectItem>
                  ))}
                </Seleccion>
              )}
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Datos del establecimiento</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="md:col-span-2">
              <CampoTexto
                id="nombre"
                etiqueta="Nombre"
                obligatorio
                {...texto('nombre')}
                maxLength={LARGOS.nombreEstablecimiento}
                ayuda={editando ? undefined : 'El código se genera al guardar.'}
              />
            </div>
            <div className="md:col-span-2">
              <CampoTexto id="direccion" etiqueta="Dirección" {...texto('direccion')} maxLength={LARGOS.direccion} />
            </div>
            <CampoTexto id="telefono" etiqueta="Teléfono" {...texto('telefono')} inputMode="tel" autoComplete="off" />
            <CampoTexto
              id="correo"
              etiqueta="Correo"
              {...texto('correo')}
              type="email"
              maxLength={LARGOS.correo}
              autoComplete="off"
            />
            <CampoTexto
              id="nombre-contacto"
              etiqueta="Persona de contacto"
              {...texto('nombreContacto')}
              maxLength={LARGOS.nombreContacto}
              autoComplete="off"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Marcas</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Marca
              id="reporta-produccion"
              etiqueta="Reporta producción"
              marcado={datos.reportaProduccion}
              alCambiar={cambiarReportaProduccion}
              deshabilitado={deshabilitado}
            />
            <Marca
              id="reporta-5c"
              etiqueta="Envía el 5C a la DDRISS"
              marcado={datos.reporta5c}
              alCambiar={cambiar('reporta5c')}
              deshabilitado={deshabilitado || !datos.reportaProduccion}
            />
            <Marca
              id="solo-cobertura"
              etiqueta="Su producción solo cuenta para la cobertura"
              marcado={datos.soloCobertura}
              alCambiar={cambiar('soloCobertura')}
              deshabilitado={deshabilitado || !datos.reportaProduccion}
            />
          </CardContent>
        </Card>

        {error && (
          <div ref={avisoError}>
            <AvisoError>{error}</AvisoError>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={deshabilitado}>
            {enviando ? 'Guardando…' : editando ? 'Guardar cambios' : 'Registrar establecimiento'}
          </Button>
          <Button type="button" variant="outline" onClick={() => navigate(volverA)} disabled={enviando}>
            Cancelar
          </Button>
        </div>
      </form>

      <AvisoCambiosSinGuardar
        bloqueo={bloqueo}
        descripcion="Si sale ahora, se pierden los cambios del establecimiento."
      />
    </section>
  )
}
