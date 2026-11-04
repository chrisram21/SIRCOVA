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
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { crearIndicador, opcionesIndicadores, publicarVersionIndicador } from '@/api/configuracion.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { validarDescripcionIndicador, validarMotivoCambio, validarNombreIndicador } from '@/validaciones/campos.js'
import { InsigniasSemaforo, etiquetaTipo } from './presentacionIndicador.jsx'
import {
  DESCENDENTE,
  MENSAJES_TIPOS_INDICADOR as M,
  TIPOS_CREABLES,
  TIPOS_INDICADOR,
  aCortes,
  aUmbrales,
  camposDelTipo,
} from './tiposIndicador.js'

// Un Select de Radix no admite el valor vacío: «Todas las edades» es este.
const TODAS_LAS_EDADES = '__todas__'

const MENSAJES = {
  tipo: 'Elija el tipo de indicador.',
  vacuna: 'Elija la vacuna.',
  dosis: 'Elija la dosis.',
  dosisInicial: 'Elija la dosis inicial.',
  dosisFinal: 'Elija la dosis final.',
  clasificacionPoblacion: 'Elija el grupo de población.',
}

const PRORRATEOS = [
  { valor: 'NINGUNO', etiqueta: 'Población anual completa' },
  { valor: 'MENSUAL_LINEAL', etiqueta: 'Proporcional al mes: población ÷ 12 × número de mes' },
]

const texto = (numero) => (numero === null || numero === undefined ? '' : String(numero))

// Las dosis que se precargan: la que completa el esquema (o la última); en deserción, la primera y esa.
function dosisPorDefecto(dosis) {
  if (dosis.length === 0) return { dosis: '', dosisInicial: '', dosisFinal: '' }
  const final = dosis.find((d) => d.completaEsquema) ?? dosis.at(-1)
  const inicial = dosis[0].codigo === final.codigo ? '' : dosis[0].codigo
  return { dosis: final.codigo, dosisInicial: inicial, dosisFinal: final.codigo }
}

const formularioVacio = () => ({
  tipo: '',
  vacuna: '',
  nombre: '',
  descripcion: '',
  dosis: '',
  dosisInicial: '',
  dosisFinal: '',
  clasificacionPoblacion: '',
  grupoEdad: TODAS_LAS_EDADES,
  prorrateo: '',
  meta: '',
  corte1: '',
  corte2: '',
  umbralesProvisionales: false,
  esIndicadorMapa: false,
  motivo: '',
})

function formularioDeVersion(base) {
  const sentido = TIPOS_INDICADOR[base.tipoCalculo]?.semaforo
  const cortes = sentido ? aCortes(base.umbrales, sentido) : null
  return {
    ...formularioVacio(),
    tipo: base.tipoCalculo,
    vacuna: base.vacuna.codigo,
    nombre: base.nombre,
    descripcion: base.descripcion ?? '',
    dosis: base.dosis ?? '',
    dosisInicial: base.dosisInicial ?? '',
    dosisFinal: base.dosisFinal ?? '',
    clasificacionPoblacion: base.clasificacionPoblacion ?? '',
    grupoEdad: base.grupoEdad ?? TODAS_LAS_EDADES,
    prorrateo: base.denominador.prorrateo ?? '',
    meta: texto(base.meta?.valor),
    corte1: texto(cortes?.[0]),
    corte2: texto(cortes?.[1]),
    umbralesProvisionales: base.umbralesProvisionales,
    esIndicadorMapa: base.esIndicadorMapa,
  }
}

// Acepta la coma decimal; un texto que no es un número queda en NaN y falla la revisión.
function aNumero(valor) {
  const limpio = valor.trim().replace(',', '.')
  return /^\d+(\.\d+)?$/.test(limpio) ? Number(limpio) : Number.NaN
}

const conUnDecimal = (valor) => Math.abs(valor * 10 - Math.round(valor * 10)) < 1e-9
const entre = (valor, minimo, maximo) => valor >= minimo && valor <= maximo && conUnDecimal(valor)

function cortesDe(formulario) {
  const cortes = [aNumero(formulario.corte1), aNumero(formulario.corte2)]
  return cortes.every((c) => entre(c, 0, 100)) && cortes[0] < cortes[1] ? cortes : null
}

// Un error por campo, para mostrarlos todos a la vez, con los mismos mensajes del backend.
function revisarFormulario(formulario, modo, dosisDeLaVacuna) {
  const errores = {}
  const { tipo } = formulario
  if (modo === 'nuevo' && !tipo) errores.tipo = MENSAJES.tipo
  if (modo === 'nuevo' && !formulario.vacuna) errores.vacuna = MENSAJES.vacuna
  for (const [campo, regla, valor] of [
    ['nombre', validarNombreIndicador, formulario.nombre],
    ['descripcion', validarDescripcionIndicador, formulario.descripcion],
    ['motivo', validarMotivoCambio, formulario.motivo],
  ]) {
    const { error } = regla(valor)
    if (error) errores[campo] = error
  }
  const campos = camposDelTipo(tipo)
  for (const campo of ['dosis', 'dosisInicial', 'dosisFinal', 'clasificacionPoblacion']) {
    if (campos.includes(campo) && !formulario[campo]) errores[campo] = MENSAJES[campo]
  }
  if (campos.includes('dosisInicial') && formulario.dosisInicial && formulario.dosisFinal) {
    const orden = (codigo) => dosisDeLaVacuna.find((d) => d.codigo === codigo)?.orden
    if (!(orden(formulario.dosisInicial) < orden(formulario.dosisFinal))) errores.dosisFinal = M.ordenDosis
  }
  if (campos.includes('prorrateo') && !formulario.prorrateo) errores.prorrateo = M.faltante('prorrateo')
  if (campos.includes('meta') && !entre(aNumero(formulario.meta), 1, 100)) errores.meta = M.meta
  if (campos.includes('cortes') && !cortesDe(formulario)) errores.corte1 = M.cortes
  return errores
}

function cuerpoDe(formulario, modo, base) {
  const campos = camposDelTipo(formulario.tipo)
  const valores = {
    dosis: formulario.dosis,
    dosisInicial: formulario.dosisInicial,
    dosisFinal: formulario.dosisFinal,
    clasificacionPoblacion: formulario.clasificacionPoblacion,
    grupoEdad: formulario.grupoEdad === TODAS_LAS_EDADES ? null : formulario.grupoEdad,
    prorrateo: formulario.prorrateo,
    meta: aNumero(formulario.meta),
    cortes: cortesDe(formulario),
    umbralesProvisionales: formulario.umbralesProvisionales,
    esIndicadorMapa: formulario.esIndicadorMapa,
  }
  const cuerpo = {
    nombre: formulario.nombre,
    descripcion: formulario.descripcion,
    ...Object.fromEntries(campos.map((campo) => [campo, valores[campo]])),
    motivoCambio: formulario.motivo,
  }
  return modo === 'nuevo'
    ? { tipoCalculo: formulario.tipo, vacuna: formulario.vacuna, ...cuerpo }
    : { versionBase: base.version, ...cuerpo }
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

function Aviso({ children }) {
  return (
    <Alert className="border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground">
      <AlertDescription className="text-advertencia-foreground">{children}</AlertDescription>
    </Alert>
  )
}

// Un Select de Radix dentro del formulario (así las pruebas lo cambian con su <select> nativo).
function Seleccion({ id, nombre, valor, alCambiar, opciones, error, deshabilitado, marcador }) {
  return (
    <Select name={nombre} value={valor} onValueChange={alCambiar} disabled={deshabilitado}>
      <SelectTrigger id={id} className="w-full" {...invalido(id, error)}>
        <SelectValue placeholder={marcador} />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

// Crea un indicador (modo 'nuevo') o publica una versión nueva de la DDRISS desde la versión base de la fila (modo
// 'version'). Quien lo abre lo monta de nuevo en cada apertura.
export default function PanelIndicador({ modo, fila, alGuardar, alRecargar, alCerrar }) {
  const base = modo === 'version' ? (fila.aplica ?? fila.ultimaDdriss) : null
  const [inicial] = useState(() => (base ? formularioDeVersion(base) : formularioVacio()))
  const [formulario, setFormulario] = useState(inicial)
  const [opciones, setOpciones] = useState(null)
  const [errorOpciones, setErrorOpciones] = useState(null)
  const [intentoOpciones, setIntentoOpciones] = useState(0)
  // Avisos de lo que la versión base usa y ya no está activo.
  const [avisos, setAvisos] = useState([])
  const [intentado, setIntentado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // { mensaje, desactualizado }: un 409 INDICADOR_DESACTUALIZADO ofrece «Recargar».
  const [errorApi, setErrorApi] = useState(null)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const [revisar, setRevisar] = useState(0)
  const formularioRef = useRef(null)

  useEffect(() => {
    let vigente = true
    opcionesIndicadores()
      .then((datos) => {
        if (!vigente) return
        setOpciones(datos)
        if (!base) return
        // La dosis o el grupo de edad de la base que ya no están activos se dejan vacíos, con su aviso.
        const dosisActivas = datos.vacunas.find((v) => v.codigo === base.vacuna.codigo)?.dosis ?? []
        const edades = new Set(datos.gruposEdad.map((g) => g.codigo))
        const limpio = {}
        const nuevosAvisos = []
        for (const campo of ['dosis', 'dosisInicial', 'dosisFinal']) {
          const codigo = base[campo]
          if (codigo && camposDelTipo(base.tipoCalculo).includes(campo)
            && !dosisActivas.some((d) => d.codigo === codigo)) {
            limpio[campo] = ''
            nuevosAvisos.push(`La dosis ${codigo} ya no está activa; elija otra.`)
          }
        }
        if (base.grupoEdad && camposDelTipo(base.tipoCalculo).includes('grupoEdad') && !edades.has(base.grupoEdad)) {
          limpio.grupoEdad = TODAS_LAS_EDADES
          nuevosAvisos.push(`El grupo de edad ${base.grupoEdad} ya no está activo; elija otro.`)
        }
        if (nuevosAvisos.length > 0) {
          setAvisos(nuevosAvisos)
          setFormulario((actual) => ({ ...actual, ...limpio }))
        }
      })
      .catch((err) => {
        if (vigente) setErrorOpciones(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [base, intentoOpciones])

  useEffect(() => {
    if (revisar > 0) formularioRef.current?.querySelector('[aria-invalid="true"]')?.focus()
  }, [revisar])

  const dosisDeLaVacuna = useMemo(
    () => opciones?.vacunas.find((v) => v.codigo === formulario.vacuna)?.dosis ?? [],
    [opciones, formulario.vacuna],
  )
  const hayCambios = useMemo(() => JSON.stringify(formulario) !== JSON.stringify(inicial), [formulario, inicial])
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !enviando)
  const errores = intentado ? revisarFormulario(formulario, modo, dosisDeLaVacuna) : {}
  const definicion = TIPOS_INDICADOR[formulario.tipo]
  const campos = camposDelTipo(formulario.tipo)
  const tiene = (campo) => campos.includes(campo)
  const cortesBase = base && definicion?.semaforo ? aCortes(base.umbrales, definicion.semaforo) : null
  const cortesValidos = cortesDe(formulario)

  const cambiar = (cambios) => setFormulario((actual) => ({ ...actual, ...cambios }))

  function elegirTipo(tipo) {
    const d = TIPOS_INDICADOR[tipo]
    setFormulario((actual) => ({
      ...actual,
      tipo,
      prorrateo: d.prorrateo?.editable ? d.prorrateo.porDefecto : '',
      meta: d.meta?.editable ? texto(d.meta.porDefecto) : '',
      corte1: texto(d.cortesPorDefecto?.[0]),
      corte2: texto(d.cortesPorDefecto?.[1]),
      esIndicadorMapa: false,
    }))
  }

  function elegirVacuna(vacuna) {
    const dosis = opciones.vacunas.find((v) => v.codigo === vacuna)?.dosis ?? []
    cambiar({ vacuna, ...dosisPorDefecto(dosis) })
  }

  function elegirPoblacion(clasificacionPoblacion) {
    const mismoGrupo = opciones.gruposEdad.some((g) => g.codigo === clasificacionPoblacion)
    cambiar({ clasificacionPoblacion, ...(mismoGrupo ? { grupoEdad: clasificacionPoblacion } : {}) })
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
    if (Object.keys(revisarFormulario(formulario, modo, dosisDeLaVacuna)).length > 0 || opciones === null) {
      setRevisar((n) => n + 1)
      return
    }
    setEnviando(true)
    setErrorApi(null)
    try {
      const cuerpo = cuerpoDe(formulario, modo, base)
      alGuardar(modo === 'nuevo' ? await crearIndicador(cuerpo) : await publicarVersionIndicador(fila.codigo, cuerpo))
    } catch (err) {
      const desactualizado = err instanceof ErrorApi && err.codigo === 'INDICADOR_DESACTUALIZADO'
      setErrorApi({ mensaje: mensajeDeError(err), desactualizado })
      setEnviando(false)
    }
  }

  const opcionesDosis = dosisDeLaVacuna.map((d) => ({ valor: d.codigo, etiqueta: `${d.codigo} · ${d.nombre}` }))
  const etiquetasCortes = definicion?.semaforo === DESCENDENTE
    ? ['Verde hasta (%)', 'Amarillo hasta (%)']
    : ['Amarillo desde (%)', 'Verde desde (%)']

  function cuerpoDelFormulario() {
    if (errorOpciones) {
      return (
        <AvisoError
          onReintentar={() => {
            setErrorOpciones(null)
            setIntentoOpciones((n) => n + 1)
          }}
        >
          No se pudieron cargar las vacunas y los grupos: {errorOpciones}
        </AvisoError>
      )
    }
    if (opciones === null) {
      return (
        <div aria-label="Cargando opciones" className="flex flex-col gap-3">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )
    }
    return (
      <>
        {base?.territorio.nivel === 'NACIONAL' && (
          <Aviso>Esta versión reemplazará a la versión {base.version} nacional solo en su DDRISS.</Aviso>
        )}
        {avisos.map((aviso) => (
          <Aviso key={aviso}>{aviso}</Aviso>
        ))}
        {base && definicion?.semaforo && !cortesBase && (
          <Aviso>
            La versión base tiene un semáforo de {base.umbrales.length} franjas; indique los dos cortes.
          </Aviso>
        )}

        {modo === 'nuevo' && (
          <>
            <Campo id="indicador-tipo" etiqueta="Tipo" error={errores.tipo}>
              <Seleccion
                id="indicador-tipo"
                nombre="tipo"
                valor={formulario.tipo}
                alCambiar={elegirTipo}
                opciones={TIPOS_CREABLES.map((t) => ({ valor: t, etiqueta: TIPOS_INDICADOR[t].etiqueta }))}
                error={errores.tipo}
                deshabilitado={enviando}
                marcador="Elija el tipo"
              />
            </Campo>
            <Campo id="indicador-vacuna" etiqueta="Vacuna" error={errores.vacuna}>
              <Seleccion
                id="indicador-vacuna"
                nombre="vacuna"
                valor={formulario.vacuna}
                alCambiar={elegirVacuna}
                opciones={opciones.vacunas.map((v) => ({ valor: v.codigo, etiqueta: v.nombre }))}
                error={errores.vacuna}
                deshabilitado={enviando}
                marcador="Elija la vacuna"
              />
            </Campo>
          </>
        )}

        <Campo id="indicador-nombre" etiqueta="Nombre" error={errores.nombre}>
          <Input
            id="indicador-nombre"
            value={formulario.nombre}
            onChange={(e) => cambiar({ nombre: e.target.value })}
            disabled={enviando}
            {...invalido('indicador-nombre', errores.nombre)}
          />
        </Campo>

        <Campo id="indicador-descripcion" etiqueta="Descripción (opcional)" error={errores.descripcion}>
          <Textarea
            id="indicador-descripcion"
            value={formulario.descripcion}
            onChange={(e) => cambiar({ descripcion: e.target.value })}
            disabled={enviando}
            {...invalido('indicador-descripcion', errores.descripcion)}
          />
        </Campo>

        {tiene('dosis') && (
          <Campo id="indicador-dosis" etiqueta="Dosis que cuenta" error={errores.dosis}>
            <Seleccion
              id="indicador-dosis"
              nombre="dosis"
              valor={formulario.dosis}
              alCambiar={(dosis) => cambiar({ dosis })}
              opciones={opcionesDosis}
              error={errores.dosis}
              deshabilitado={enviando || !formulario.vacuna}
              marcador="Elija la dosis"
            />
          </Campo>
        )}
        {tiene('dosisInicial') && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Campo id="indicador-dosis-inicial" etiqueta="Dosis inicial" error={errores.dosisInicial}>
              <Seleccion
                id="indicador-dosis-inicial"
                nombre="dosisInicial"
                valor={formulario.dosisInicial}
                alCambiar={(dosisInicial) => cambiar({ dosisInicial })}
                opciones={opcionesDosis}
                error={errores.dosisInicial}
                deshabilitado={enviando || !formulario.vacuna}
                marcador="Elija la dosis"
              />
            </Campo>
            <Campo id="indicador-dosis-final" etiqueta="Dosis final" error={errores.dosisFinal}>
              <Seleccion
                id="indicador-dosis-final"
                nombre="dosisFinal"
                valor={formulario.dosisFinal}
                alCambiar={(dosisFinal) => cambiar({ dosisFinal })}
                opciones={opcionesDosis}
                error={errores.dosisFinal}
                deshabilitado={enviando || !formulario.vacuna}
                marcador="Elija la dosis"
              />
            </Campo>
          </div>
        )}

        {tiene('clasificacionPoblacion') && (
          <Campo id="indicador-poblacion" etiqueta="Grupo de población" error={errores.clasificacionPoblacion}>
            <Seleccion
              id="indicador-poblacion"
              nombre="clasificacionPoblacion"
              valor={formulario.clasificacionPoblacion}
              alCambiar={elegirPoblacion}
              opciones={opciones.clasificaciones.map((c) => ({ valor: c.codigo, etiqueta: c.descripcion }))}
              error={errores.clasificacionPoblacion}
              deshabilitado={enviando}
              marcador="Elija el grupo"
            />
          </Campo>
        )}

        {tiene('grupoEdad') && (
          <Campo
            id="indicador-edad"
            etiqueta="Grupo de edad que cuenta"
            ayuda="Solo se cuentan las dosis aplicadas en ese grupo de edad."
          >
            <Seleccion
              id="indicador-edad"
              nombre="grupoEdad"
              valor={formulario.grupoEdad}
              alCambiar={(grupoEdad) => cambiar({ grupoEdad })}
              opciones={[
                { valor: TODAS_LAS_EDADES, etiqueta: 'Todas las edades' },
                ...opciones.gruposEdad.map((g) => ({ valor: g.codigo, etiqueta: g.etiqueta })),
              ]}
              deshabilitado={enviando}
            />
          </Campo>
        )}

        {tiene('prorrateo') && (
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-semibold">Prorrateo</legend>
            <RadioGroup
              aria-label="Prorrateo"
              value={formulario.prorrateo}
              onValueChange={(prorrateo) => cambiar({ prorrateo })}
              disabled={enviando}
            >
              {PRORRATEOS.map((p) => (
                <div key={p.valor} className="flex items-center gap-2">
                  <RadioGroupItem id={`prorrateo-${p.valor}`} value={p.valor} />
                  <Label htmlFor={`prorrateo-${p.valor}`} className="font-normal">
                    {p.etiqueta}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {errores.prorrateo && <p className="text-sm text-destructive">{errores.prorrateo}</p>}
          </fieldset>
        )}

        {tiene('meta') && (
          <Campo id="indicador-meta" etiqueta="Meta (%)" error={errores.meta} ayuda="De 1 a 100, con un decimal.">
            <Input
              id="indicador-meta"
              inputMode="decimal"
              value={formulario.meta}
              onChange={(e) => cambiar({ meta: e.target.value })}
              disabled={enviando}
              className="max-w-40"
              {...invalido('indicador-meta', errores.meta)}
            />
          </Campo>
        )}
        {formulario.tipo === 'AVANCE_META_MES' && (
          <p className="text-sm text-muted-foreground">
            La meta del mes vale 100 %: población ÷ 12 × número de mes.
          </p>
        )}

        {tiene('cortes') && (
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-2 text-sm font-semibold">Semáforo</legend>
            <div className="grid grid-cols-2 gap-4">
              {['corte1', 'corte2'].map((campo, i) => (
                <div key={campo} className="flex flex-col gap-2">
                  <Label htmlFor={`indicador-${campo}`} className="font-normal">
                    {etiquetasCortes[i]}
                  </Label>
                  <Input
                    id={`indicador-${campo}`}
                    inputMode="decimal"
                    value={formulario[campo]}
                    onChange={(e) => cambiar({ [campo]: e.target.value })}
                    disabled={enviando}
                    {...invalido('indicador-corte1', errores.corte1)}
                  />
                </div>
              ))}
            </div>
            {errores.corte1 && (
              <p id="indicador-corte1-error" className="text-sm text-destructive">
                {errores.corte1}
              </p>
            )}
            {cortesValidos && (
              <div aria-label="Vista previa del semáforo">
                <InsigniasSemaforo
                  indicador={{
                    tipoCalculo: formulario.tipo,
                    umbrales: aUmbrales(cortesValidos, definicion.semaforo),
                    umbralesProvisionales: false,
                  }}
                />
              </div>
            )}
            <div className="flex items-center gap-2">
              <Checkbox
                id="indicador-provisionales"
                checked={formulario.umbralesProvisionales}
                onCheckedChange={(marcado) => cambiar({ umbralesProvisionales: marcado === true })}
                disabled={enviando}
              />
              <Label htmlFor="indicador-provisionales" className="font-normal">
                Rangos provisionales
              </Label>
            </div>
          </fieldset>
        )}

        {tiene('esIndicadorMapa') && (
          <div className="flex items-center gap-3">
            <Switch
              id="indicador-mapa"
              checked={formulario.esIndicadorMapa}
              onCheckedChange={(esIndicadorMapa) => cambiar({ esIndicadorMapa })}
              disabled={enviando}
            />
            <Label htmlFor="indicador-mapa" className="font-normal">
              Indicador del mapa
            </Label>
          </div>
        )}

        <Campo id="indicador-motivo" etiqueta="Motivo del cambio" error={errores.motivo}>
          <Textarea
            id="indicador-motivo"
            value={formulario.motivo}
            onChange={(e) => cambiar({ motivo: e.target.value })}
            disabled={enviando}
            {...invalido('indicador-motivo', errores.motivo)}
          />
        </Campo>

        {errorApi && (
          <AvisoError onReintentar={errorApi.desactualizado ? alRecargar : undefined} textoReintentar="Recargar">
            {errorApi.mensaje}
          </AvisoError>
        )}
      </>
    )
  }

  return (
    <>
      <Sheet open onOpenChange={(abierto) => !abierto && pedirCierre()}>
        <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-xl">
          <form ref={formularioRef} className="flex flex-col gap-5" onSubmit={guardar} noValidate>
            <SheetHeader>
              <SheetTitle>{modo === 'nuevo' ? 'Nuevo indicador' : `Nueva versión de ${fila.codigo}`}</SheetTitle>
              <SheetDescription>
                {modo === 'nuevo'
                  ? 'El indicador se publica al guardar y aplica solo a su DDRISS.'
                  : `${etiquetaTipo(base.tipoCalculo)} de ${base.vacuna.nombre}. La versión se publica al guardar y `
                    + 'reemplaza a la que aplica en su DDRISS.'}
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-col gap-5 px-4">{cuerpoDelFormulario()}</div>

            <SheetFooter className="flex-row justify-end">
              <Button type="button" variant="outline" onClick={pedirCierre} disabled={enviando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={enviando}>
                {enviando ? 'Publicando…' : modo === 'nuevo' ? 'Crear indicador' : 'Publicar versión'}
              </Button>
            </SheetFooter>
          </form>
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>Lo que escribió en el indicador se perderá.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Seguir editando</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={alCerrar}>
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="El indicador que está editando no se ha publicado." />
    </>
  )
}
