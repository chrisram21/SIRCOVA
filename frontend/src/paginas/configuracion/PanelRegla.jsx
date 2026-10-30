import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { listarVacunas } from '@/api/catalogos.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { crearRegla, publicarVersionRegla } from '@/api/configuracion.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import {
  validarDescripcionRegla,
  validarMensajeRegla,
  validarMotivoCambio,
  validarNombreRegla,
} from '@/validaciones/campos.js'
import { MENSAJES_TIPOS, TIPOS_CREABLES, TIPOS_REGLA, marcadoresDesconocidos } from './tiposRegla.js'

const SEVERIDADES = [
  { valor: 'ERROR', etiqueta: 'Error: impide enviar' },
  { valor: 'ADVERTENCIA', etiqueta: 'Advertencia: solo avisa' },
]
const MENSAJE_TIPO = 'Elija el tipo de regla.'
const MENSAJE_VACUNAS = 'Elija al menos una vacuna, o «Todas».'

// Los parámetros enteros viven como texto en los Input; los booleanos, como booleano.
const aCampos = (parametros) =>
  Object.fromEntries(
    Object.entries(parametros).map(([clave, valor]) => [clave, typeof valor === 'boolean' ? valor : String(valor)]),
  )

function parametrosDeEjemplo(tipo) {
  return Object.fromEntries(
    TIPOS_REGLA[tipo].parametros.map((p) => [p.clave, p.tipo === 'booleano' ? false : String(p.minimo)]),
  )
}

const formularioVacio = () => ({
  tipo: '',
  nombre: '',
  descripcion: '',
  severidad: 'ADVERTENCIA',
  todas: true,
  vacunas: [],
  parametros: {},
  mensaje: '',
  motivo: '',
})

function formularioDeVersion(base) {
  const todas = base.vacunas[0] === '*'
  return {
    tipo: base.tipo,
    nombre: base.nombre,
    descripcion: base.descripcion ?? '',
    severidad: base.severidad,
    todas,
    vacunas: todas ? [] : [...base.vacunas],
    parametros: aCampos(base.parametros),
    mensaje: base.mensaje,
    motivo: '',
  }
}

// El texto de un Input entero pasa a número solo si son dígitos; si no, revisarParametros da su mensaje.
const aNumero = (texto) => (/^\d+$/.test(texto.trim()) ? Number(texto.trim()) : texto)

function leerParametros(formulario) {
  return Object.fromEntries(
    Object.entries(formulario.parametros).map(([clave, valor]) => [
      clave,
      typeof valor === 'string' ? aNumero(valor) : valor,
    ]),
  )
}

// Un error por parámetro, para mostrarlos todos a la vez (revisarParametros da solo el primero), con sus mismos
// mensajes. El mínimo del máximo de RANGO es el mínimo elegido + 1, si es válido.
function erroresDeParametros(tipo, parametros) {
  const errores = {}
  const valido = (p, valor) => Number.isInteger(valor) && valor >= p.minimo && valor <= p.maximo
  for (const p of TIPOS_REGLA[tipo].parametros) {
    const valor = parametros[p.clave]
    if (p.tipo === 'booleano') {
      if (typeof valor !== 'boolean') errores[p.clave] = MENSAJES_TIPOS.parametroBooleano(p.clave)
      continue
    }
    const otro = TIPOS_REGLA[tipo].parametros.find((q) => q.clave === p.mayorQue)
    const minimo = otro && valido(otro, parametros[otro.clave]) ? parametros[otro.clave] + 1 : p.minimo
    if (!Number.isInteger(valor) || valor < minimo || valor > p.maximo) {
      errores[p.clave] = MENSAJES_TIPOS.parametroEntero(p.clave, minimo, p.maximo)
    }
  }
  return errores
}

function revisarFormulario(formulario, modo) {
  const errores = {}
  const tipo = formulario.tipo
  if (modo === 'nueva' && !tipo) errores.tipo = MENSAJE_TIPO
  for (const [campo, regla, valor] of [
    ['nombre', validarNombreRegla, formulario.nombre],
    ['descripcion', validarDescripcionRegla, formulario.descripcion],
    ['motivo', validarMotivoCambio, formulario.motivo],
  ]) {
    const { error } = regla(valor)
    if (error) errores[campo] = error
  }
  if (!formulario.todas && formulario.vacunas.length === 0) errores.vacunas = MENSAJE_VACUNAS
  if (tipo) {
    for (const [clave, error] of Object.entries(erroresDeParametros(tipo, leerParametros(formulario)))) {
      errores[`parametro-${clave}`] = error
    }
    const mensaje = validarMensajeRegla(formulario.mensaje)
    const [desconocido] = mensaje.error ? [] : marcadoresDesconocidos(tipo, mensaje.valor)
    if (mensaje.error) errores.mensaje = mensaje.error
    else if (desconocido !== undefined) errores.mensaje = MENSAJES_TIPOS.marcador(desconocido, tipo)
  }
  return errores
}

function cuerpoDe(formulario, modo, base, vacunasActivas) {
  const cuerpo = {
    nombre: formulario.nombre,
    descripcion: formulario.descripcion,
    severidad: formulario.severidad,
    // En el orden del catálogo de vacunas.
    vacunas: formulario.todas
      ? ['*']
      : vacunasActivas.map((v) => v.codigo).filter((c) => formulario.vacunas.includes(c)),
    parametros: leerParametros(formulario),
    mensaje: formulario.mensaje,
    motivoCambio: formulario.motivo,
  }
  return modo === 'nueva' ? { tipo: formulario.tipo, ...cuerpo } : { versionBase: base.version, ...cuerpo }
}

function Campo({ id, etiqueta, error, children, ayuda }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id} className="font-semibold">
        {etiqueta}
      </Label>
      {children}
      {ayuda && <p className="text-xs text-muted-foreground">{ayuda}</p>}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

const invalido = (id, error) => ({
  'aria-invalid': error ? true : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
})

// Crea una regla (modo 'nueva') o publica una versión nueva de la DDRISS desde la versión base de la fila (modo
// 'version'). Quien lo abre lo monta de nuevo en cada apertura.
export default function PanelRegla({ modo, fila, alGuardar, alRecargar, alCerrar }) {
  const base = modo === 'version' ? (fila.aplica ?? fila.ultimaDdriss) : null
  const [inicial] = useState(() => (base ? formularioDeVersion(base) : formularioVacio()))
  const [formulario, setFormulario] = useState(inicial)
  const [vacunas, setVacunas] = useState(null)
  const [errorVacunas, setErrorVacunas] = useState(null)
  const [quitadas, setQuitadas] = useState([])
  const [intentado, setIntentado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // { mensaje, desactualizada }: un 409 ofrece «Recargar», porque la regla cambió mientras se editaba.
  const [errorApi, setErrorApi] = useState(null)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [revisar, setRevisar] = useState(0)
  const [intentoVacunas, setIntentoVacunas] = useState(0)
  const formularioRef = useRef(null)

  useEffect(() => {
    let vigente = true
    listarVacunas({ activa: true })
      .then((lista) => {
        if (!vigente) return
        setVacunas(lista)
        // Una vacuna de la base que ya no está activa no se puede volver a publicar: se quita con su aviso.
        const activas = new Set(lista.map((v) => v.codigo))
        const fuera = inicial.vacunas.filter((c) => !activas.has(c))
        if (fuera.length > 0) {
          setQuitadas(fuera)
          setFormulario((actual) => ({ ...actual, vacunas: actual.vacunas.filter((c) => activas.has(c)) }))
        }
      })
      .catch((err) => {
        if (vigente) setErrorVacunas(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [inicial, intentoVacunas])

  useEffect(() => {
    if (revisar > 0) formularioRef.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  const hayCambios = useMemo(() => JSON.stringify(formulario) !== JSON.stringify(inicial), [formulario, inicial])
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !enviando)
  const errores = intentado ? revisarFormulario(formulario, modo) : {}
  const definicion = TIPOS_REGLA[formulario.tipo]

  const cambiar = (cambios) => setFormulario((actual) => ({ ...actual, ...cambios }))
  const cambiarParametro = (clave, valor) =>
    setFormulario((actual) => ({ ...actual, parametros: { ...actual.parametros, [clave]: valor } }))

  function elegirTipo(tipo) {
    cambiar({ tipo, parametros: parametrosDeEjemplo(tipo), mensaje: TIPOS_REGLA[tipo].mensajeEjemplo })
  }

  function marcarVacuna(codigo, marcada) {
    setFormulario((actual) => ({
      ...actual,
      vacunas: marcada ? [...actual.vacunas, codigo] : actual.vacunas.filter((c) => c !== codigo),
    }))
  }

  function pedirCierre() {
    if (enviando) return
    if (hayCambios) setConfirmarCierre(true)
    else alCerrar()
  }

  async function guardar(evento) {
    evento.preventDefault()
    if (enviando) return
    setIntentado(true)
    if (Object.keys(revisarFormulario(formulario, modo)).length > 0 || vacunas === null) {
      setRevisar((n) => n + 1)
      return
    }
    setEnviando(true)
    setErrorApi(null)
    try {
      const cuerpo = cuerpoDe(formulario, modo, base, vacunas)
      alGuardar(modo === 'nueva' ? await crearRegla(cuerpo) : await publicarVersionRegla(fila.codigo, cuerpo))
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), desactualizada: err instanceof ErrorApi && err.status === 409 })
      setEnviando(false)
    }
  }

  return (
    <>
      <Sheet open onOpenChange={(abierto) => !abierto && pedirCierre()}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <form ref={formularioRef} className="flex flex-col gap-5" onSubmit={guardar} noValidate>
            <SheetHeader>
              <SheetTitle>
                {modo === 'nueva' ? 'Nueva regla de validación' : `Nueva versión de ${fila.codigo}`}
              </SheetTitle>
              <SheetDescription>
                {modo === 'nueva'
                  ? 'La regla se publica al guardar y aplica solo a su DDRISS.'
                  : `${definicion?.etiqueta ?? formulario.tipo}. La versión se publica al guardar y reemplaza `
                    + 'a la que aplica en su DDRISS.'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4">
              {base?.territorio.nivel === 'NACIONAL' && (
                <Alert className="border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground">
                  <AlertDescription className="text-advertencia-foreground">
                    Esta versión reemplazará a la versión {base.version} nacional solo en su DDRISS.
                  </AlertDescription>
                </Alert>
              )}
              {quitadas.length > 0 && (
                <Alert className="border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground">
                  <AlertDescription className="text-advertencia-foreground">
                    Se quitaron vacunas inactivas: {quitadas.join(', ')}.
                  </AlertDescription>
                </Alert>
              )}

              {modo === 'nueva' && (
                <Campo id="regla-tipo" etiqueta="Tipo" error={errores.tipo}>
                  <Select name="tipo" value={formulario.tipo} onValueChange={elegirTipo} disabled={enviando}>
                    <SelectTrigger id="regla-tipo" className="w-full" {...invalido('regla-tipo', errores.tipo)}>
                      <SelectValue placeholder="Elija el tipo" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIPOS_CREABLES.map((tipo) => (
                        <SelectItem key={tipo} value={tipo}>
                          {TIPOS_REGLA[tipo].etiqueta}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Campo>
              )}

              <Campo id="regla-nombre" etiqueta="Nombre" error={errores.nombre}>
                <Input
                  id="regla-nombre"
                  value={formulario.nombre}
                  onChange={(e) => cambiar({ nombre: e.target.value })}
                  disabled={enviando}
                  {...invalido('regla-nombre', errores.nombre)}
                />
              </Campo>

              <Campo id="regla-descripcion" etiqueta="Descripción (opcional)" error={errores.descripcion}>
                <Textarea
                  id="regla-descripcion"
                  value={formulario.descripcion}
                  onChange={(e) => cambiar({ descripcion: e.target.value })}
                  disabled={enviando}
                  {...invalido('regla-descripcion', errores.descripcion)}
                />
              </Campo>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">Severidad</legend>
                <RadioGroup
                  aria-label="Severidad"
                  value={formulario.severidad}
                  onValueChange={(severidad) => cambiar({ severidad })}
                  disabled={enviando}
                >
                  {SEVERIDADES.map((s) => (
                    <div key={s.valor} className="flex items-center gap-2">
                      <RadioGroupItem id={`severidad-${s.valor}`} value={s.valor} />
                      <Label htmlFor={`severidad-${s.valor}`} className="font-normal">
                        {s.etiqueta}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </fieldset>

              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-semibold">Vacunas</legend>
                <RadioGroup
                  aria-label="Vacunas"
                  value={formulario.todas ? 'todas' : 'elegir'}
                  onValueChange={(valor) => cambiar({ todas: valor === 'todas' })}
                  disabled={enviando}
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem id="vacunas-todas" value="todas" />
                    <Label htmlFor="vacunas-todas" className="font-normal">
                      Todas
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem
                      id="vacunas-elegir"
                      value="elegir"
                      {...invalido('regla-vacunas', errores.vacunas)}
                    />
                    <Label htmlFor="vacunas-elegir" className="font-normal">
                      Elegir
                    </Label>
                  </div>
                </RadioGroup>
                {!formulario.todas &&
                  (errorVacunas ? (
                    <AvisoError
                      onReintentar={() => {
                        setErrorVacunas(null)
                        setIntentoVacunas((n) => n + 1)
                      }}
                    >
                      No se pudieron cargar las vacunas: {errorVacunas}
                    </AvisoError>
                  ) : vacunas === null ? (
                    <Skeleton aria-label="Cargando vacunas" className="h-16 w-full" />
                  ) : (
                    <div className="grid grid-cols-1 gap-2 rounded-lg border p-3 sm:grid-cols-2">
                      {vacunas.map((v) => (
                        <div key={v.codigo} className="flex items-center gap-2">
                          <Checkbox
                            id={`vacuna-${v.codigo}`}
                            checked={formulario.vacunas.includes(v.codigo)}
                            onCheckedChange={(marcada) => marcarVacuna(v.codigo, marcada === true)}
                            disabled={enviando}
                          />
                          <Label htmlFor={`vacuna-${v.codigo}`} className="font-normal">
                            {v.nombre}
                          </Label>
                        </div>
                      ))}
                    </div>
                  ))}
                {errores.vacunas && (
                  <p id="regla-vacunas-error" className="text-sm text-destructive">
                    {errores.vacunas}
                  </p>
                )}
              </fieldset>

              {definicion?.parametros.map((p) => {
                const id = `parametro-${p.clave}`
                const error = errores[id]
                return p.tipo === 'booleano' ? (
                  <div key={p.clave} className="flex items-center gap-3">
                    <Switch
                      id={id}
                      checked={formulario.parametros[p.clave] === true}
                      onCheckedChange={(valor) => cambiarParametro(p.clave, valor)}
                      disabled={enviando}
                    />
                    <Label htmlFor={id} className="font-normal">
                      {p.etiqueta}
                    </Label>
                  </div>
                ) : (
                  <Campo
                    key={p.clave}
                    id={id}
                    etiqueta={p.etiqueta}
                    error={error}
                    ayuda={p.mayorQue ? `Mayor que el mínimo, hasta ${p.maximo}.` : `De ${p.minimo} a ${p.maximo}.`}
                  >
                    <Input
                      id={id}
                      inputMode="numeric"
                      value={formulario.parametros[p.clave] ?? ''}
                      onChange={(e) => cambiarParametro(p.clave, e.target.value)}
                      disabled={enviando}
                      className="max-w-40"
                      {...invalido(id, error)}
                    />
                  </Campo>
                )
              })}

              {definicion && (
                <Campo
                  id="regla-mensaje"
                  etiqueta="Mensaje"
                  error={errores.mensaje}
                  ayuda={`Marcadores: ${definicion.marcadores.map((m) => `{${m}}`).join(', ')}.`}
                >
                  <Textarea
                    id="regla-mensaje"
                    value={formulario.mensaje}
                    onChange={(e) => cambiar({ mensaje: e.target.value })}
                    disabled={enviando}
                    {...invalido('regla-mensaje', errores.mensaje)}
                  />
                </Campo>
              )}

              <Campo id="regla-motivo" etiqueta="Motivo del cambio" error={errores.motivo}>
                <Textarea
                  id="regla-motivo"
                  value={formulario.motivo}
                  onChange={(e) => cambiar({ motivo: e.target.value })}
                  disabled={enviando}
                  {...invalido('regla-motivo', errores.motivo)}
                />
              </Campo>

              {errorApi && (
                <AvisoError onReintentar={errorApi.desactualizada ? alRecargar : undefined} textoReintentar="Recargar">
                  {errorApi.mensaje}
                </AvisoError>
              )}
            </div>

            <SheetFooter className="flex-row justify-end">
              <Button type="button" variant="outline" onClick={pedirCierre} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Publicando…' : modo === 'nueva' ? 'Crear regla' : 'Publicar versión'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>Lo que escribió en la regla se perderá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={alCerrar}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="La regla que está editando no se ha publicado." />
    </>
  )
}
