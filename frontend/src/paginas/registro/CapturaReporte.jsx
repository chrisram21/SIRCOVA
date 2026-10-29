import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, Layers, Lock, Save } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { ESTADOS_REPORTE } from '@/componentes/InsigniaEstadoReporte.jsx'
import { armarFormulario } from '@/componentes/formulario/armarFormulario.js'
import FormularioCaptura, {
  CamposAdicionales,
  LetraTarjeta,
  leerCantidad,
  resumenDeCasillas,
} from '@/componentes/formulario/FormularioCaptura.jsx'
import TarjetaProcedencias, {
  cantidadesDeOtras,
  filasDeCeldas,
  llavesDeFila,
} from '@/componentes/formulario/TarjetaProcedencias.jsx'
import { contenidoDe } from '@/paginas/configuracion/EditorEsquema.jsx'
import { cn } from '@/lib/utils'
import { mensajeDeError } from '@/api/cliente.js'
import { guardarVacuna, obtenerFormulario } from '@/api/produccion.js'

// Con estos dos errores lo guardado ya no coincide con lo que se ve: solo queda volver a cargar.
const ERRORES_DE_RECARGA = ['REPORTE_DESACTUALIZADO', 'REPORTE_NO_EDITABLE']

const aDiaMesAnio = (fecha) => (fecha ? fecha.split('-').reverse().join('/') : null)

const dosCifras = (numero) => String(numero).padStart(2, '0')
const aHoraMinuto = (fecha) => `${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
// En la hora local del navegador.
const aFechaHora = (fecha) =>
  `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${aHoraMinuto(fecha)}`

// 'grupo_edad=MENOR_1|sexo=F' → { grupo_edad: 'MENOR_1', sexo: 'F' }; '' → {}.
const dimensionesDeClave = (clave) => (clave === '' ? {} : Object.fromEntries(clave.split('|').map((par) => par.split('='))))

// Las celdas del municipio propio con la llave de FormularioCaptura ({dosis}|{clave}); un 0 se ve como «0».
const cantidadesDe = (vacuna, municipioId) =>
  Object.fromEntries(
    vacuna.celdas
      .filter((c) => c.municipioProcedenciaId === municipioId)
      .map((c) => [`${c.dosisCodigo}|${c.claveCombinacion}`, String(c.cantidad)]),
  )

// Una celda vacía no se manda: no tiene fila (vacía ≠ 0). Las de la tarjeta A llevan el municipio propio y su llave
// es {dosis}|{clave}; las de la B, {dosis}|{municipio}|{clave} (llaveProcedencia).
function celdasParaGuardar(cantidades, otras, municipioId) {
  const conValor = (porLlave) => Object.entries(porLlave).filter(([, texto]) => texto.trim() !== '')
  const celda = (dosisCodigo, municipioProcedenciaId, clave, texto) => ({
    dosisCodigo,
    municipioProcedenciaId,
    dimensiones: dimensionesDeClave(clave),
    cantidad: Number(texto.trim()),
  })
  return [
    ...conValor(cantidades).map(([llave, texto]) => {
      const [dosis, ...clave] = llave.split('|')
      return celda(dosis, municipioId, clave.join('|'), texto)
    }),
    ...conValor(otras).map(([llave, texto]) => {
      const [dosis, municipio, ...clave] = llave.split('|')
      return celda(dosis, Number(municipio), clave.join('|'), texto)
    }),
  ]
}

// Una dosis inactiva se oculta, salvo que el reporte ya tenga filas de ella (de cualquier procedencia).
function formularioDe(vacuna, captura) {
  if (!captura.esquema) return null
  const conFilas = new Set(captura.celdas.map((c) => c.dosisCodigo))
  return armarFormulario({
    contenido: contenidoDe(captura.esquema),
    vacuna: { nombre: vacuna.vacuna.nombre, dosis: vacuna.dosis.filter((d) => d.activa || conFilas.has(d.codigo)) },
    dimensiones: vacuna.dimensiones,
    deducirSecciones: true,
  })
}

// Un campo sin llenar va como null; los números llegan del Input como texto.
function datosParaGuardar(campos, valores) {
  return Object.fromEntries(
    campos.map(({ clave, tipo }) => {
      const valor = valores[clave]
      if (valor === undefined || valor === null || valor === '') return [clave, null]
      return [clave, (tipo === 'entero' || tipo === 'decimal') && typeof valor === 'string' ? Number(valor) : valor]
    }),
  )
}

// Lo que se mandaría, para saber si la vacuna cambió desde que se cargó o se guardó. Una fila vacía de la tarjeta B
// no manda nada, así que agregarla no es un cambio.
function firmaDe(cantidades, otras, datos, campos) {
  const conValor = (porLlave) =>
    Object.entries(porLlave)
      .filter(([, texto]) => texto.trim() !== '')
      .map(([llave, texto]) => [llave, texto.trim()])
      .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify({ celdas: conValor(cantidades), otras: conValor(otras), datos: datosParaGuardar(campos, datos) })
}

const hayInvalidas = (cantidades) => Object.values(cantidades).some((texto) => !leerCantidad(texto).valida)

const formatoCantidad = new Intl.NumberFormat('es-GT')

function Tecla({ children }) {
  return (
    <kbd className="rounded border border-b-2 bg-card px-1.5 py-0.5 font-mono text-[11px] text-foreground">{children}</kbd>
  )
}

// Cuántas casillas de la tarjeta A tienen dato, con su barra, y el total de dosis escritas.
function ProgresoCasillas({ resumen }) {
  const { total, llenas, dosis } = resumen
  const proporcion = total === 0 ? 0 : llenas / total
  return (
    <div className="flex w-full flex-col gap-1.5 sm:w-56">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">Casillas con dato</span>
        <span className="font-mono font-semibold">
          {llenas} de {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Casillas con dato"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={llenas}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full origin-left rounded-full transition-transform duration-500 ease-salida',
            proporcion === 1 ? 'bg-enlace' : 'bg-ring',
          )}
          style={{ transform: `scaleX(${proporcion})` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Dosis escritas: <span className="font-mono font-semibold text-foreground">{formatoCantidad.format(dosis)}</span>
      </p>
    </div>
  )
}

// Por qué no se puede editar: el estado del reporte si ya salió del Borrador; si no, el mes (cerrado, por ejemplo).
function motivoSoloLectura(estado) {
  const titulo = estado && estado !== 'BORRADOR' ? ESTADOS_REPORTE[estado]?.titulo : null
  return titulo
    ? `El reporte está en «${titulo}»: solo se puede consultar.`
    : 'Este reporte no se puede editar en su estado actual.'
}

function PestanaVacuna({
  vacuna,
  captura,
  formulario,
  municipio,
  municipios,
  cantidades,
  otras,
  datos,
  invalidas,
  soloLectura,
  alCambiarCantidad,
  alCambiarOtra,
  alAgregarFila,
  alQuitarFila,
  alCambiarDato,
}) {
  const { esquema } = captura

  if (!formulario) {
    return <p className="text-sm text-muted-foreground">No se encontró el formulario de esta vacuna.</p>
  }
  const vigencia = aDiaMesAnio(esquema.vigencia?.desde)
  return (
    <div className="flex flex-col gap-4">
      {invalidas && (
        <AvisoError>
          Hay cantidades de {vacuna.vacuna.nombre} que no son números enteros (0 en adelante); están marcadas en rojo.
        </AvisoError>
      )}
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <LetraTarjeta>A</LetraTarjeta>
              <div className="flex min-w-0 flex-col gap-1.5">
                <CardTitle className="text-base">Dosis aplicadas a residentes de {municipio}</CardTitle>
                <CardDescription>
                  Formulario generado por el esquema de captura: {vacuna.vacuna.nombre}, versión {esquema.version}
                  {vigencia && `, vigente desde ${vigencia}`}
                </CardDescription>
                <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
                  <Layers className="size-4" aria-hidden="true" />
                  <span>Dimensiones de este esquema:</span>
                  {['Dosis', ...vacuna.dimensiones.map((d) => d.etiqueta ?? d.nombre)].map((nombre) => (
                    <Badge key={nombre} variant="outline" className="bg-card font-semibold text-foreground">
                      {nombre}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
            <ProgresoCasillas resumen={resumenDeCasillas(formulario, cantidades)} />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!soloLectura && (
            <div className="flex flex-col gap-2 rounded-lg border border-ring/25 bg-accent/40 px-3.5 py-2.5 text-sm lg:flex-row lg:items-center lg:justify-between">
              <p className="flex items-start gap-2 text-accent-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Escriba en cada casilla las dosis aplicadas en el mes; si no hubo, escriba 0. Las casillas con rayas no
                aplican.
              </p>
              <p aria-hidden="true" className="hidden shrink-0 items-center gap-1.5 text-xs text-muted-foreground lg:flex">
                <Tecla>Enter</Tecla> baja
                <span className="mx-1">·</span>
                <Tecla>←</Tecla>
                <Tecla>→</Tecla> en la fila
                <span className="mx-1">·</span>
                <Tecla>Ctrl</Tecla>+<Tecla>S</Tecla> guarda
              </p>
            </div>
          )}
          <FormularioCaptura
            formulario={formulario}
            cantidades={cantidades}
            alCambiar={alCambiarCantidad}
            soloLectura={soloLectura}
          />
        </CardContent>
      </Card>
      <TarjetaProcedencias
        formulario={formulario}
        filas={otras.filas}
        cantidades={otras.cantidades}
        municipios={municipios}
        permitidas={captura.procedenciasPermitidas}
        modo={esquema.procedencia.modo}
        alAgregar={(fila) => alAgregarFila(fila)}
        alQuitar={(fila) => alQuitarFila(fila, llavesDeFila(formulario, fila))}
        alCambiar={alCambiarOtra}
        soloLectura={soloLectura}
      />
      {esquema.camposAdicionales.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <LetraTarjeta>C</LetraTarjeta>
              <CardTitle className="text-base">Datos adicionales</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <CamposAdicionales
              campos={esquema.camposAdicionales}
              valores={datos}
              alCambiar={alCambiarDato}
              soloLectura={soloLectura}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// reporte: GET /reportes/{id}, con las etiquetas de las dosis y de las dimensiones de cada vacuna. formularioPedido:
// la promesa de GET /reportes/{id}/formulario si ya se pidió (PaginaRegistro la pide junto con el detalle).
export default function CapturaReporte({ reporte, formularioPedido = null }) {
  // formulario: GET /reportes/{id}/formulario; cantidades, otras, datos y firmas van por vacunaId. otras es la
  // tarjeta B: { filas, cantidades }.
  const [formulario, setFormulario] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [cantidades, setCantidades] = useState({})
  const [otras, setOtras] = useState({})
  const [datos, setDatos] = useState({})
  const [firmas, setFirmas] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  // La hora del último PUT exitoso de esta visita; antes de guardar, la insignia usa actualizadoEn del reporte.
  const [guardadoEn, setGuardadoEn] = useState(null)
  const cargaActual = useRef(0)
  // El pedido que llegó como prop sirve solo para la primera carga; «Recargar» y «Reintentar» piden de nuevo.
  const pedidoPendiente = useRef(formularioPedido)

  // Las vacunas en el orden del reporte, cada una con lo que trae el formulario.
  const vacunas = formulario
    ? reporte.vacunas
        .map((vacuna) => ({ vacuna, captura: formulario.vacunas.find((c) => c.vacunaId === vacuna.vacuna.id) }))
        .filter(({ captura }) => captura)
    : []

  const camposDe = (captura) => captura.esquema?.camposAdicionales ?? []
  const otrasDe = (vacunaId) => otras[vacunaId] ?? { filas: [], cantidades: {} }
  const cambio = ({ captura }) =>
    firmaDe(
      cantidades[captura.vacunaId] ?? {},
      otrasDe(captura.vacunaId).cantidades,
      datos[captura.vacunaId] ?? {},
      camposDe(captura),
    ) !== firmas[captura.vacunaId]
  const conCambios = formulario?.editable ? vacunas.filter(cambio) : []
  // El formulario armado de cada vacuna (se arma de nuevo solo cuando cambia lo cargado o lo guardado).
  const armados = useMemo(
    () => new Map(vacunas.map(({ vacuna, captura }) => [vacuna.id, formularioDe(vacuna, captura)])),
    [formulario, reporte],
  )
  // Ctrl+S (⌘+S en Mac) guarda el borrador si se puede; la función se toma en cada render.
  const atajoGuardar = useRef(null)
  useEffect(() => {
    function alPresionar(evento) {
      if (!(evento.ctrlKey || evento.metaKey) || evento.key.toLowerCase() !== 's') return
      evento.preventDefault()
      atajoGuardar.current?.()
    }
    window.addEventListener('keydown', alPresionar)
    return () => window.removeEventListener('keydown', alPresionar)
  }, [])
  // Sigue activo mientras se guarda y después de un guardado que falló a la mitad.
  const bloqueo = useAvisoCambiosSinGuardar(conCambios.length > 0)

  // Las filas de la tarjeta B se arman de nuevo con lo guardado: las que quedaron vacías desaparecen.
  function tomarVacuna(captura, municipioId, municipios) {
    const campos = captura.esquema?.camposAdicionales ?? []
    const cantidadesVacuna = cantidadesDe(captura, municipioId)
    const vacuna = reporte.vacunas.find((v) => v.vacuna.id === captura.vacunaId)
    const armado = vacuna ? formularioDe(vacuna, captura) : null
    const otrasVacuna = armado
      ? {
          filas: filasDeCeldas(armado, captura.celdas, municipioId, municipios),
          cantidades: cantidadesDeOtras(armado, captura.celdas, municipioId),
        }
      : { filas: [], cantidades: {} }
    const datosVacuna = { ...(captura.datosAdicionales ?? {}) }
    setCantidades((previas) => ({ ...previas, [captura.vacunaId]: cantidadesVacuna }))
    setOtras((previas) => ({ ...previas, [captura.vacunaId]: otrasVacuna }))
    setDatos((previos) => ({ ...previos, [captura.vacunaId]: datosVacuna }))
    setFirmas((previas) => ({
      ...previas,
      [captura.vacunaId]: firmaDe(cantidadesVacuna, otrasVacuna.cantidades, datosVacuna, campos),
    }))
  }

  function cargar() {
    const carga = ++cargaActual.current
    setFormulario(null)
    setErrorCarga(null)
    setAviso(null)
    const pedido = pedidoPendiente.current ?? obtenerFormulario(reporte.id)
    pedidoPendiente.current = null
    pedido
      .then((recibido) => {
        if (carga !== cargaActual.current) return
        setCantidades({})
        setOtras({})
        setDatos({})
        setFirmas({})
        for (const captura of recibido.vacunas) tomarVacuna(captura, recibido.municipioPropio.id, recibido.municipios)
        setFormulario(recibido)
      })
      .catch((err) => carga === cargaActual.current && setErrorCarga(mensajeDeError(err)))
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [reporte.id])

  if (errorCarga) {
    return <AvisoError onReintentar={cargar}>No se pudo cargar el formulario: {errorCarga}</AvisoError>
  }
  if (!formulario) return <Skeleton aria-label="Cargando formulario" className="h-40 w-full" />
  if (vacunas.length === 0) return null

  const municipioId = formulario.municipioPropio.id
  const conInvalidas = new Set(
    vacunas
      .filter(
        ({ captura }) =>
          hayInvalidas(cantidades[captura.vacunaId] ?? {}) || hayInvalidas(otrasDe(captura.vacunaId).cantidades),
      )
      .map(({ vacuna }) => vacuna.id),
  )
  const invalidas = conInvalidas.size > 0
  const cambiarOtras = (vacunaId, cambiar) =>
    setOtras((previas) => ({ ...previas, [vacunaId]: cambiar(previas[vacunaId] ?? { filas: [], cantidades: {} }) }))

  // Un PUT por vacuna con cambios, uno tras otro: cada uno usa la versionFila que devolvió el anterior.
  async function guardar() {
    setGuardando(true)
    setAviso(null)
    let versionFila = formulario.versionFila
    for (const { vacuna, captura } of conCambios) {
      try {
        const respuesta = await guardarVacuna(reporte.id, captura.vacunaId, {
          versionFila,
          celdas: celdasParaGuardar(cantidades[captura.vacunaId] ?? {}, otrasDe(captura.vacunaId).cantidades, municipioId),
          ...(camposDe(captura).length > 0 && {
            datosAdicionales: datosParaGuardar(camposDe(captura), datos[captura.vacunaId] ?? {}),
          }),
        })
        versionFila = respuesta.versionFila
        const guardada = { ...respuesta.vacuna, esquema: captura.esquema }
        setFormulario((actual) => ({
          ...actual,
          versionFila,
          vacunas: actual.vacunas.map((c) => (c.vacunaId === guardada.vacunaId ? guardada : c)),
        }))
        tomarVacuna(guardada, municipioId, formulario.municipios)
        setGuardadoEn(new Date())
      } catch (err) {
        setAviso({
          mensaje: `No se guardó ${vacuna.vacuna.nombre}: ${mensajeDeError(err)}`,
          recargar: ERRORES_DE_RECARGA.includes(err.codigo),
        })
        setGuardando(false)
        return
      }
    }
    toast.success('Borrador guardado.')
    setGuardando(false)
  }

  const soloLectura = !formulario.editable
  const puedeGuardar = !soloLectura && !guardando && !invalidas && conCambios.length > 0
  atajoGuardar.current = puedeGuardar ? guardar : null
  const idsConCambios = new Set(conCambios.map(({ vacuna }) => vacuna.id))
  // Una vacuna está completa cuando todas las casillas de su tarjeta A tienen un dato.
  const completas = new Set(
    vacunas
      .filter(({ vacuna, captura }) => {
        const armado = armados.get(vacuna.id)
        if (!armado) return false
        const { total, llenas } = resumenDeCasillas(armado, cantidades[captura.vacunaId] ?? {})
        return total > 0 && llenas === total
      })
      .map(({ vacuna }) => vacuna.id),
  )
  let insignia = null
  if (conCambios.length > 0) insignia = 'Cambios sin guardar'
  else if (guardadoEn) insignia = `Guardado a las ${aHoraMinuto(guardadoEn)}`
  else if (reporte.actualizadoEn) insignia = `Último cambio: ${aFechaHora(new Date(reporte.actualizadoEn))}`
  const describirPestana = (id) =>
    [conInvalidas.has(id) && `invalidas-${id}`, idsConCambios.has(id) && `cambios-${id}`].filter(Boolean).join(' ') ||
    undefined
  return (
    <div className="flex flex-col gap-4">
      {soloLectura && (
        <Alert className="border-border bg-muted">
          <Lock />
          <AlertTitle>Solo consulta</AlertTitle>
          <AlertDescription>{motivoSoloLectura(reporte.estado)}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue={String(vacunas[0].vacuna.id)}>
        {/* Como en Registro.html: una píldora por vacuna. */}
        <TabsList aria-label="Vacunas" className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
          {vacunas.map(({ vacuna }) => (
            <TabsTrigger
              key={vacuna.id}
              value={String(vacuna.id)}
              aria-describedby={describirPestana(vacuna.id)}
              className="h-auto flex-none rounded-full border-border bg-card px-3.5 py-1.5 shadow-tarjeta transition-colors duration-200 hover:not-aria-selected:border-ring/50 hover:not-aria-selected:bg-accent/40 aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-elevada"
            >
              {completas.has(vacuna.id) && <CircleCheck aria-hidden="true" className="text-ring" />}
              {vacuna.vacuna.nombre}
              {/* Las marcas van en la descripción, no en el nombre: la pestaña se sigue llamando como la vacuna. */}
              {conInvalidas.has(vacuna.id) && (
                <>
                  <CircleAlert aria-hidden="true" className="rounded-full bg-card text-destructive" />
                  <span id={`invalidas-${vacuna.id}`} hidden>
                    (cantidades no válidas)
                  </span>
                </>
              )}
              {idsConCambios.has(vacuna.id) && (
                <>
                  <span aria-hidden="true" className="size-2 rounded-full bg-advertencia-foreground ring-2 ring-advertencia" />
                  <span id={`cambios-${vacuna.id}`} hidden>
                    (cambios sin guardar)
                  </span>
                </>
              )}
            </TabsTrigger>
          ))}
        </TabsList>
        {vacunas.map(({ vacuna, captura }) => (
          <TabsContent key={vacuna.id} value={String(vacuna.id)} className="pt-4">
            <PestanaVacuna
              vacuna={vacuna}
              captura={captura}
              formulario={armados.get(vacuna.id)}
              municipio={formulario.municipioPropio.nombre}
              municipios={formulario.municipios}
              cantidades={cantidades[captura.vacunaId] ?? {}}
              otras={otrasDe(captura.vacunaId)}
              datos={datos[captura.vacunaId] ?? {}}
              invalidas={conInvalidas.has(vacuna.id)}
              // Mientras se guarda no se escribe: lo guardado reemplaza las cantidades de cada vacuna.
              soloLectura={soloLectura || guardando}
              alCambiarCantidad={(llave, texto) =>
                setCantidades((previas) => ({ ...previas, [captura.vacunaId]: { ...previas[captura.vacunaId], [llave]: texto } }))
              }
              alCambiarOtra={(llave, texto) =>
                cambiarOtras(captura.vacunaId, (actual) => ({
                  ...actual,
                  cantidades: { ...actual.cantidades, [llave]: texto },
                }))
              }
              alAgregarFila={(fila) =>
                cambiarOtras(captura.vacunaId, (actual) => ({ ...actual, filas: [...actual.filas, fila] }))
              }
              // Las cantidades de una fila quitada se borran: no se mandan, así que al guardar se borran sus celdas.
              alQuitarFila={(fila, llaves) =>
                cambiarOtras(captura.vacunaId, (actual) => ({
                  filas: actual.filas.filter(
                    (f) => !(f.municipioId === fila.municipioId && f.dosis === fila.dosis && f.seccion === fila.seccion),
                  ),
                  cantidades: Object.fromEntries(
                    Object.entries(actual.cantidades).filter(([llave]) => !llaves.includes(llave)),
                  ),
                }))
              }
              alCambiarDato={(clave, valor) =>
                setDatos((previos) => ({ ...previos, [captura.vacunaId]: { ...previos[captura.vacunaId], [clave]: valor } }))
              }
            />
          </TabsContent>
        ))}
      </Tabs>

      {aviso && (
        <AvisoError onReintentar={aviso.recargar ? cargar : undefined} textoReintentar="Recargar reporte">
          {aviso.mensaje}
        </AvisoError>
      )}

      {!soloLectura && (
        <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-end gap-3 border-t bg-background/90 px-6 py-3 backdrop-blur-md">
          <p className="mr-auto flex items-center gap-2 text-sm text-muted-foreground">
            <CircleCheck className="size-4 text-ring" aria-hidden="true" />
            Vacunas con todas las casillas llenas:
            <span className="font-mono font-semibold text-foreground">
              {completas.size} de {vacunas.length}
            </span>
          </p>
          {invalidas && <p className="text-sm text-destructive">Corrija las cantidades marcadas para guardar.</p>}
          {insignia && (
            <Badge
              variant="outline"
              className={
                conCambios.length > 0
                  ? 'border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground'
                  : 'bg-accent text-accent-foreground'
              }
            >
              {insignia}
            </Badge>
          )}
          <Button onClick={guardar} disabled={!puedeGuardar} title="Ctrl + S">
            <Save />
            {guardando ? 'Guardando…' : 'Guardar borrador'}
          </Button>
        </div>
      )}

      <AvisoCambiosSinGuardar
        bloqueo={bloqueo}
        descripcion={`Si sale ahora, se pierden los cambios de ${conCambios
          .map(({ vacuna }) => vacuna.vacuna.nombre)
          .join(', ')}. Para conservarlos, quédese y use «Guardar borrador».`}
      />
    </div>
  )
}
