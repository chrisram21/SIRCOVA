import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, Info, Layers, Lock, Save, Send, Trash2 } from 'lucide-react'
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
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
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
  llaveProcedencia,
} from '@/componentes/formulario/TarjetaProcedencias.jsx'
import { contenidoDe } from '@/paginas/configuracion/EditorEsquema.jsx'
import { cn } from '@/lib/utils'
import { mensajeDeError } from '@/api/cliente.js'
import {
  agregarVacuna,
  guardarVacuna,
  obtenerFormulario,
  obtenerReporte,
  quitarVacuna,
  validarReporte,
} from '@/api/produccion.js'
import DialogoEnviarReporte from './DialogoEnviarReporte.jsx'
import PanelValidacion from './PanelValidacion.jsx'
import { AgregarVacuna, DialogoQuitarVacuna } from './VacunasDelReporte.jsx'

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

// Las casillas que señala la validación de una vacuna, por la llave de cada tarjeta; si una tiene un error y una
// advertencia, gana el error.
function marcasDe(resultados, vacunaId, municipioId) {
  const marcas = { propias: {}, otras: {} }
  for (const { severidad, vacuna, celdas } of resultados) {
    if (vacuna?.id !== vacunaId) continue
    for (const c of celdas) {
      const [porLlave, llave] =
        c.municipioId === municipioId
          ? [marcas.propias, `${c.dosis}|${c.claveCombinacion}`]
          : [marcas.otras, llaveProcedencia(c.dosis, c.municipioId, c.claveCombinacion)]
      if (porLlave[llave] !== 'ERROR') porLlave[llave] = severidad
    }
  }
  return marcas
}

// La casilla o el campo adicional al que lleva un resultado del panel.
function selectorDe(resultado, municipioId) {
  const [c] = resultado.celdas
  if (!c) return `#campo-${resultado.campos[0]}`
  const llave =
    c.municipioId === municipioId ? `${c.dosis}|${c.claveCombinacion}` : llaveProcedencia(c.dosis, c.municipioId, c.claveCombinacion)
  return `[data-celda="${llave}"]`
}

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
  marcas,
  soloLectura,
  alCambiarCantidad,
  alCambiarOtra,
  alAgregarFila,
  alQuitarFila,
  alCambiarDato,
  alQuitar,
  quitarDeshabilitado,
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
            <div className="flex flex-col items-end gap-3">
              {/* Solo en una vacuna que no es base, con el reporte editable (SPEC 31). */}
              {alQuitar && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  disabled={quitarDeshabilitado}
                  onClick={alQuitar}
                >
                  <Trash2 />
                  Quitar vacuna
                </Button>
              )}
              <ProgresoCasillas resumen={resumenDeCasillas(formulario, cantidades)} />
            </div>
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
            marcas={marcas.propias}
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
        marcas={marcas.otras}
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
// alEnviar: avisa a la página el reporte ya enviado, para que muestre su estado nuevo.
export default function CapturaReporte({ reporte, formularioPedido = null, alEnviar }) {
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
  // Las vacunas del detalle (GET /reportes/{id}); cambian al agregar o quitar una (SPEC 31).
  const [vacunasReporte, setVacunasReporte] = useState(reporte.vacunas)
  const [pestana, setPestana] = useState(null)
  // { vacuna, captura } mientras se confirma «Quitar vacuna».
  const [porQuitar, setPorQuitar] = useState(null)
  const [ocupado, setOcupado] = useState(false)
  const cargaActual = useRef(0)
  // La primera carga usa el detalle que llegó como prop; «Recargar» lo pide de nuevo, porque las vacunas pudieron cambiar.
  const primeraCarga = useRef(true)
  // El pedido que llegó como prop sirve solo para la primera carga; «Recargar» y «Reintentar» piden de nuevo.
  const pedidoPendiente = useRef(formularioPedido)
  // SPEC 33: la última respuesta de POST /reportes/{id}/validar. Sin ProveedorSesion (las pruebas que montan la
  // captura sola) no se valida.
  const sesion = useSesion()
  const puedeValidar = sesion?.tienePermiso('REPORTE_VALIDAR') ?? false
  // SPEC 34: el estado que dice el detalle de la última carga; cambia al enviar y recargar.
  const [estado, setEstado] = useState(reporte.estado)
  const [dialogoEnvio, setDialogoEnvio] = useState(false)
  const [validacion, setValidacion] = useState(null)
  const [validando, setValidando] = useState(false)
  const [errorValidacion, setErrorValidacion] = useState(null)
  const validacionActual = useRef(0)
  // { selector } de la casilla que hay que enfocar cuando su pestaña ya está dibujada.
  const [enfoque, setEnfoque] = useState(null)

  // Radix dibuja el contenido de la pestaña nueva después de este render: se reintenta unas veces hasta que aparece.
  useEffect(() => {
    if (!enfoque) return
    let intentos = 0
    let temporizador
    const buscar = () => {
      const destino = document.querySelector(enfoque.selector)
      if (destino) {
        destino.focus()
        setEnfoque(null)
      } else if (++intentos < 10) {
        temporizador = setTimeout(buscar, 30)
      } else {
        setEnfoque(null)
      }
    }
    buscar()
    return () => clearTimeout(temporizador)
  }, [enfoque])

  // Siempre sobre lo guardado; si llegan dos respuestas, gana la del último pedido.
  async function validar() {
    const pedido = ++validacionActual.current
    setValidando(true)
    try {
      const recibida = await validarReporte(reporte.id)
      if (pedido !== validacionActual.current) return
      setValidacion(recibida)
      setErrorValidacion(null)
    } catch (err) {
      if (pedido === validacionActual.current) setErrorValidacion(mensajeDeError(err))
    } finally {
      if (pedido === validacionActual.current) setValidando(false)
    }
  }

  // Las vacunas en el orden del reporte, cada una con lo que trae el formulario.
  const vacunas = formulario
    ? vacunasReporte
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
    [formulario, vacunasReporte],
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
  function tomarVacuna(captura, municipioId, municipios, lista = vacunasReporte) {
    const campos = captura.esquema?.camposAdicionales ?? []
    const cantidadesVacuna = cantidadesDe(captura, municipioId)
    const vacuna = lista.find((v) => v.vacuna.id === captura.vacunaId)
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
    setValidacion(null)
    setErrorValidacion(null)
    const pedido = pedidoPendiente.current ?? obtenerFormulario(reporte.id)
    pedidoPendiente.current = null
    const detalle = primeraCarga.current ? Promise.resolve(reporte) : obtenerReporte(reporte.id)
    primeraCarga.current = false
    Promise.all([pedido, detalle])
      .then(([recibido, recibidoDetalle]) => {
        if (carga !== cargaActual.current) return
        setCantidades({})
        setOtras({})
        setDatos({})
        setFirmas({})
        setVacunasReporte(recibidoDetalle.vacunas)
        setEstado(recibidoDetalle.estado)
        for (const captura of recibido.vacunas) {
          tomarVacuna(captura, recibido.municipioPropio.id, recibido.municipios, recibidoDetalle.vacunas)
        }
        setFormulario(recibido)
        if (recibido.editable && puedeValidar) validar()
      })
      .catch((err) => carga === cargaActual.current && setErrorCarga(mensajeDeError(err)))
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
      validacionActual.current += 1
    }
  }, [reporte.id])

  if (errorCarga) {
    return <AvisoError onReintentar={cargar}>No se pudo cargar el formulario: {errorCarga}</AvisoError>
  }
  if (!formulario) return <Skeleton aria-label="Cargando formulario" className="h-40 w-full" />

  const municipioId = formulario.municipioPropio.id
  const soloLectura = !formulario.editable

  // SPEC 31. La vacuna nueva se une a las demás con lo que responde el POST, sin recargar: lo que no se ha guardado en
  // las otras pestañas se conserva, y la versionFila nueva es la del siguiente guardado.
  async function agregar(disponible) {
    setOcupado(true)
    try {
      const respuesta = await agregarVacuna(reporte.id, { vacunaId: disponible.vacunaId, versionFila: formulario.versionFila })
      const posicion = (id) => respuesta.orden.indexOf(id)
      const lista = [...vacunasReporte, respuesta.vacuna].sort((a, b) => posicion(a.vacuna.id) - posicion(b.vacuna.id))
      setVacunasReporte(lista)
      setFormulario((actual) => ({
        ...actual,
        versionFila: respuesta.versionFila,
        vacunas: [...actual.vacunas, respuesta.formulario],
      }))
      tomarVacuna(respuesta.formulario, municipioId, formulario.municipios, lista)
      // Las pestañas usan el id de reporte_vacuna, como el resto de la pantalla.
      setPestana(String(respuesta.vacuna.id))
      toast.success(`${respuesta.vacuna.vacuna.nombre} agregada al reporte.`)
      if (puedeValidar) validar()
    } finally {
      setOcupado(false)
    }
  }

  async function quitar() {
    const { vacuna, captura } = porQuitar
    setOcupado(true)
    try {
      const respuesta = await quitarVacuna(reporte.id, captura.vacunaId, formulario.versionFila)
      const sinLaVacuna = (porVacuna) => Object.fromEntries(Object.entries(porVacuna).filter(([id]) => Number(id) !== captura.vacunaId))
      // Queda seleccionada la de al lado.
      const indice = vacunas.findIndex((v) => v.vacuna.id === vacuna.id)
      const vecina = vacunas[indice + 1] ?? vacunas[indice - 1]
      setVacunasReporte((actuales) => actuales.filter((v) => v.vacuna.id !== vacuna.vacuna.id))
      setFormulario((actual) => ({
        ...actual,
        versionFila: respuesta.versionFila,
        vacunas: actual.vacunas.filter((c) => c.vacunaId !== captura.vacunaId),
      }))
      setCantidades(sinLaVacuna)
      setOtras(sinLaVacuna)
      setDatos(sinLaVacuna)
      setFirmas(sinLaVacuna)
      setPestana(vecina ? String(vecina.vacuna.id) : null)
      setPorQuitar(null)
      toast.success(`${vacuna.vacuna.nombre} se quitó del reporte.`)
      if (puedeValidar) validar()
    } finally {
      setOcupado(false)
    }
  }

  // El envío valida lo guardado en el backend: un 422 trae la validación de esa corrida y reemplaza la del panel.
  function enviado(recibido) {
    setDialogoEnvio(false)
    toast.success('Reporte enviado a revisión.')
    alEnviar?.(recibido)
    cargar()
  }

  function envioFallido(err) {
    setDialogoEnvio(false)
    if (err.codigo === 'REPORTE_CON_ERRORES' && err.datos?.validacion) {
      validacionActual.current += 1
      setValidacion(err.datos.validacion)
      setErrorValidacion(null)
      setValidando(false)
      setAviso({ mensaje: mensajeDeError(err), recargar: false })
      return
    }
    setAviso({ mensaje: mensajeDeError(err), recargar: true })
  }

  const recargarDesdeDialogo = () => {
    setPorQuitar(null)
    cargar()
  }
  const botonAgregar = !soloLectura && (
    <AgregarVacuna reporteId={reporte.id} deshabilitado={guardando || ocupado} alAgregar={agregar} alRecargar={cargar} />
  )

  if (vacunas.length === 0) {
    return soloLectura ? (
      <p className="text-sm text-muted-foreground">Este reporte no tiene vacunas.</p>
    ) : (
      <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card px-4 py-6">
        <p className="text-sm text-muted-foreground">
          Este reporte todavía no tiene vacunas. Agregue las que aplicó el establecimiento.
        </p>
        {botonAgregar}
      </div>
    )
  }

  const conInvalidas = new Set(
    vacunas
      .filter(
        ({ captura }) =>
          hayInvalidas(cantidades[captura.vacunaId] ?? {}) || hayInvalidas(otrasDe(captura.vacunaId).cantidades),
      )
      .map(({ vacuna }) => vacuna.id),
  )
  const invalidas = conInvalidas.size > 0
  const conTexto = (porLlave) => Object.values(porLlave ?? {}).some((valor) => valor !== null && String(valor).trim() !== '')
  const tieneCantidades = (captura) =>
    captura.celdas.length > 0 ||
    captura.datosAdicionales !== null ||
    conTexto(cantidades[captura.vacunaId]) ||
    conTexto(otrasDe(captura.vacunaId).cantidades) ||
    conTexto(datos[captura.vacunaId])
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
    if (puedeValidar) validar()
  }

  const puedeGuardar = !soloLectura && !guardando && !ocupado && !invalidas && conCambios.length > 0
  const muestraEnviar = !soloLectura && (sesion?.tienePermiso('REPORTE_ENVIAR') ?? false)
  let motivoSinEnviar = null
  if (conCambios.length > 0) motivoSinEnviar = 'Guarde los cambios antes de enviar.'
  else if (validacion?.errores > 0) motivoSinEnviar = 'Corrija los errores para poder enviar.'
  const puedeEnviar =
    muestraEnviar && !motivoSinEnviar && validacion !== null && !validando && !guardando && !ocupado && !dialogoEnvio
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
  const resultados = validacion?.resultados ?? []
  const conErrores = new Set(
    vacunas
      .filter(({ captura }) => resultados.some((r) => r.severidad === 'ERROR' && r.vacuna?.id === captura.vacunaId))
      .map(({ vacuna }) => vacuna.id),
  )
  const describirPestana = (id) =>
    [
      conInvalidas.has(id) && `invalidas-${id}`,
      conErrores.has(id) && `errores-${id}`,
      idsConCambios.has(id) && `cambios-${id}`,
    ]
      .filter(Boolean)
      .join(' ') || undefined
  const mostrarPanel = puedeValidar && !soloLectura
  // Las pestañas usan el id de reporte_vacuna; el resultado trae el de la vacuna.
  function elegirResultado(resultado) {
    const destino = vacunas.find(({ captura }) => captura.vacunaId === resultado.vacuna.id)
    if (!destino) return
    setPestana(String(destino.vacuna.id))
    setEnfoque({ selector: selectorDe(resultado, municipioId) })
  }
  return (
    <div className="flex flex-col gap-4">
      {soloLectura && (
        <Alert className="border-border bg-muted">
          <Lock />
          <AlertTitle>Solo consulta</AlertTitle>
          <AlertDescription>{motivoSoloLectura(estado)}</AlertDescription>
        </Alert>
      )}

      {/* Con el panel de validación: a la derecha en pantallas anchas, debajo en las angostas. */}
      <div className={cn('flex flex-col gap-4', mostrarPanel && 'xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start')}>
        <Tabs
          className="min-w-0"
          value={vacunas.some(({ vacuna }) => String(vacuna.id) === pestana) ? pestana : String(vacunas[0].vacuna.id)}
          onValueChange={setPestana}
        >
          <div className="flex flex-wrap items-center gap-2">
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
                  {conErrores.has(vacuna.id) && (
                    <>
                      <span aria-hidden="true" className="size-2 rounded-full bg-destructive ring-2 ring-card" />
                      <span id={`errores-${vacuna.id}`} hidden>
                        (con errores de validación)
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
            {botonAgregar}
          </div>
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
                marcas={marcasDe(resultados, captura.vacunaId, municipioId)}
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
                alQuitar={soloLectura || captura.base !== false ? null : () => setPorQuitar({ vacuna, captura })}
                quitarDeshabilitado={guardando || ocupado}
              />
            </TabsContent>
          ))}
        </Tabs>
        {mostrarPanel && (
          <PanelValidacion
            className="xl:sticky xl:top-4"
            validacion={validacion}
            validando={validando}
            error={errorValidacion}
            conCambios={conCambios.length > 0}
            alValidar={validar}
            alElegir={elegirResultado}
          />
        )}
      </div>

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
          {muestraEnviar && motivoSinEnviar && (
            <p id="motivo-sin-enviar" className="text-sm text-muted-foreground">
              {motivoSinEnviar}
            </p>
          )}
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
          <Button variant={muestraEnviar ? 'outline' : 'default'} onClick={guardar} disabled={!puedeGuardar} title="Ctrl + S">
            <Save />
            {guardando ? 'Guardando…' : 'Guardar borrador'}
          </Button>
          {muestraEnviar && (
            <Button
              onClick={() => {
                setAviso(null)
                setDialogoEnvio(true)
              }}
              disabled={!puedeEnviar}
              aria-describedby={motivoSinEnviar ? 'motivo-sin-enviar' : undefined}
            >
              <Send />
              Enviar a revisión
            </Button>
          )}
        </div>
      )}

      {porQuitar && (
        <DialogoQuitarVacuna
          vacuna={porQuitar.vacuna}
          conCantidades={tieneCantidades(porQuitar.captura)}
          alConfirmar={quitar}
          alCerrar={() => setPorQuitar(null)}
          alRecargar={recargarDesdeDialogo}
        />
      )}

      {dialogoEnvio && (
        <DialogoEnviarReporte
          reporteId={reporte.id}
          versionFila={formulario.versionFila}
          advertencias={validacion?.advertencias ?? 0}
          alEnviar={enviado}
          alFallar={envioFallido}
          alCerrar={() => setDialogoEnvio(false)}
        />
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
