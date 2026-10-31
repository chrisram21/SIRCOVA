import { useEffect, useRef, useState } from 'react'
import { Lock, MessageSquareWarning, Undo2 } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { mensajeDeError } from '@/api/cliente.js'
import { listarObservaciones, obtenerFormulario, obtenerReporte, obtenerValidacionGuardada } from '@/api/produccion.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import InsigniaEstadoReporte, { ESTADOS_REPORTE } from '@/componentes/InsigniaEstadoReporte.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import FormularioCaptura, { CamposAdicionales, LetraTarjeta } from '@/componentes/formulario/FormularioCaptura.jsx'
import TarjetaProcedencias, { cantidadesDeOtras, filasDeCeldas } from '@/componentes/formulario/TarjetaProcedencias.jsx'
import { nombreDelMes } from '@/lib/fechas.js'
import { cantidadesDe, formularioDe } from '@/paginas/registro/CapturaReporte.jsx'
import PanelValidacion from '@/paginas/registro/PanelValidacion.jsx'
import DialogoSolicitarCorreccion from './DialogoSolicitarCorreccion.jsx'

const LARGO_OBSERVACION = 1000 // observacion_revision.texto
const GENERAL = 'general'
// Con estos errores lo que se ve ya no es el reporte actual: se ofrece recargarlo sin perder lo escrito.
const ERRORES_DE_RECARGA = ['REPORTE_DESACTUALIZADO', 'TRANSICION_NO_PERMITIDA']
const SIN_OBSERVACIONES = 'Escriba al menos una observación para devolver el reporte.'
const nada = () => {}

const dosCifras = (numero) => String(numero).padStart(2, '0')
// En la hora local del navegador.
const aFechaHora = (iso) => {
  const fecha = new Date(iso)
  const dia = `${dosCifras(fecha.getDate())}/${dosCifras(fecha.getMonth() + 1)}/${fecha.getFullYear()}`
  return `${dia} ${dosCifras(fecha.getHours())}:${dosCifras(fecha.getMinutes())}`
}

// Las observaciones de una misma devolución comparten creadoEn (SPEC 36); llegan de la más reciente a la más antigua.
function porDevolucion(observaciones) {
  const grupos = []
  for (const observacion of observaciones) {
    const ultimo = grupos.at(-1)
    if (ultimo?.creadoEn === observacion.creadoEn) ultimo.observaciones.push(observacion)
    else grupos.push({ creadoEn: observacion.creadoEn, autor: observacion.autor, observaciones: [observacion] })
  }
  return grupos
}

function CampoObservacion({ id, etiqueta, valor, alCambiar, refCampo, invalido }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      <Textarea
        id={id}
        ref={refCampo}
        value={valor}
        maxLength={LARGO_OBSERVACION}
        aria-invalid={invalido || undefined}
        aria-describedby={`${id}-largo`}
        className="bg-card"
        onChange={(evento) => alCambiar(evento.target.value)}
      />
      <p id={`${id}-largo`} className="self-end font-mono text-xs text-muted-foreground">
        {valor.length}/{LARGO_OBSERVACION}
      </p>
    </div>
  )
}

// Lo que capturó el establecimiento, sin poder cambiarlo.
function VacunaEnRevision({ vacuna, captura, formulario }) {
  if (!captura?.esquema) return <p className="text-sm text-muted-foreground">No se encontró el formulario de esta vacuna.</p>
  const armado = formularioDe(vacuna, captura)
  if (!armado) return <p className="text-sm text-muted-foreground">No se encontró el formulario de esta vacuna.</p>
  const municipioId = formulario.municipioPropio.id
  const { esquema } = captura
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <LetraTarjeta>A</LetraTarjeta>
            <div className="flex flex-col gap-1.5">
              <CardTitle className="text-base">Dosis aplicadas a residentes de {formulario.municipioPropio.nombre}</CardTitle>
              <CardDescription>
                Esquema de captura: {vacuna.vacuna.nombre}, versión {esquema.version}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FormularioCaptura formulario={armado} cantidades={cantidadesDe(captura, municipioId)} alCambiar={nada} soloLectura />
        </CardContent>
      </Card>
      <TarjetaProcedencias
        formulario={armado}
        filas={filasDeCeldas(armado, captura.celdas, municipioId, formulario.municipios)}
        cantidades={cantidadesDeOtras(armado, captura.celdas, municipioId)}
        municipios={formulario.municipios}
        permitidas={captura.procedenciasPermitidas}
        modo={esquema.procedencia.modo}
        alAgregar={nada}
        alQuitar={nada}
        alCambiar={nada}
        soloLectura
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
              valores={captura.datosAdicionales ?? {}}
              alCambiar={nada}
              soloLectura
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function ObservacionesAnteriores({ observaciones }) {
  if (observaciones.length === 0) return null
  return (
    <Card aria-labelledby="titulo-observaciones-anteriores">
      <CardHeader>
        <CardTitle id="titulo-observaciones-anteriores">Observaciones anteriores</CardTitle>
        <CardDescription>Lo que se pidió corregir en cada devolución.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {porDevolucion(observaciones).map((grupo) => (
          <section key={grupo.creadoEn} aria-label={`Devolución del ${aFechaHora(grupo.creadoEn)}`} className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {aFechaHora(grupo.creadoEn)} · {grupo.autor.nombre}
            </p>
            <ul className="flex flex-col gap-2 text-sm">
              {grupo.observaciones.map((o) => (
                <li key={o.id} className="rounded-md border bg-muted/40 px-3 py-2">
                  <p className="font-medium">{o.vacuna?.nombre ?? 'General'}</p>
                  <p className="whitespace-pre-line text-muted-foreground">{o.texto}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  )
}

export default function PaginaRevisarReporte() {
  const { id } = useParams()
  const { state } = useLocation()
  const navegar = useNavigate()
  const sesion = useSesion()
  const usuarioId = sesion?.sesion?.usuario?.id ?? null
  const puedeSolicitar = sesion?.tienePermiso('REPORTE_SOLICITAR_CORRECCION') ?? false
  const volverA = `/revision${typeof state?.volverA === 'string' ? state.volverA : ''}`

  // { reporte, formulario, validacion, observaciones } de la última carga.
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  // Los textos por vacunaId, y GENERAL para la observación general; sobreviven a «Recargar».
  const [textos, setTextos] = useState({})
  const [pestana, setPestana] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [dialogo, setDialogo] = useState(null)
  const [devuelto, setDevuelto] = useState(false)
  const campoGeneral = useRef(null)

  useEffect(() => {
    let vigente = true
    setErrorCarga(null)
    Promise.all([obtenerReporte(id), obtenerFormulario(id), obtenerValidacionGuardada(id), listarObservaciones(id)])
      .then(([reporte, formulario, validacion, observaciones]) => {
        if (vigente) setDatos({ reporte, formulario, validacion, observaciones })
      })
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [id, intento])

  const escritas = Object.values(textos).some((texto) => texto.trim() !== '')
  const bloqueo = useAvisoCambiosSinGuardar(escritas && !devuelto)

  // Después de vaciar lo escrito, para que el aviso de cambios sin guardar no bloquee la vuelta a la bandeja.
  useEffect(() => {
    if (devuelto) navegar(volverA)
  }, [devuelto])

  function recargar() {
    setAviso(null)
    setIntento((n) => n + 1)
  }

  const encabezado = (
    <EncabezadoPagina
      antetitulo={datos ? `Revisión y cierre · ${datos.reporte.establecimiento.nombre}` : 'Revisión y cierre'}
      titulo={datos ? `Reporte de ${nombreDelMes(datos.reporte.periodo)}` : 'Revisar reporte'}
      volverA={volverA}
      textoVolver="Volver a la bandeja"
      acciones={
        datos && (
          <>
            <InsigniaEstadoReporte estado={datos.reporte.estado} />
            <span className="text-sm text-muted-foreground">
              Revisor: {datos.reporte.revisor ? datos.reporte.revisor.nombre : 'sin asignar'}
              {datos.reporte.revisor?.id === usuarioId && ' (usted)'}
            </span>
          </>
        )
      }
    />
  )

  if (errorCarga) {
    return (
      <section className="flex flex-col gap-6 p-6">
        {encabezado}
        <AvisoError onReintentar={() => setIntento((n) => n + 1)}>No se pudo cargar el reporte: {errorCarga}</AvisoError>
      </section>
    )
  }
  if (!datos) {
    return (
      <section className="flex flex-col gap-6 p-6">
        {encabezado}
        <Skeleton aria-label="Cargando reporte" className="h-40 w-full" />
      </section>
    )
  }

  const { reporte, formulario, validacion, observaciones } = datos
  const puedeDevolver = puedeSolicitar && reporte.estado === 'EN_REVISION' && reporte.revisor?.id === usuarioId
  const vacunas = reporte.vacunas.map((vacuna) => ({
    vacuna,
    captura: formulario.vacunas.find((c) => c.vacunaId === vacuna.vacuna.id),
  }))
  const pestanaActiva = vacunas.some(({ vacuna }) => String(vacuna.id) === pestana)
    ? pestana
    : vacunas[0] && String(vacunas[0].vacuna.id)
  const escribir = (clave) => (texto) => {
    setTextos((previos) => ({ ...previos, [clave]: texto }))
    if (aviso?.vacias && texto.trim()) setAviso(null)
  }
  const textoDe = (clave) => textos[clave] ?? ''

  // La general primero y luego en el orden de las vacunas; las vacías no se mandan.
  function porEnviar() {
    const general = textoDe(GENERAL).trim()
    return [
      ...(general ? [{ vacunaId: null, nombre: null, texto: general }] : []),
      ...vacunas
        .map(({ vacuna }) => ({ vacunaId: vacuna.vacuna.id, nombre: vacuna.vacuna.nombre, texto: textoDe(vacuna.vacuna.id).trim() }))
        .filter((o) => o.texto),
    ]
  }

  function solicitar() {
    const lista = porEnviar()
    if (lista.length === 0) {
      setAviso({ mensaje: SIN_OBSERVACIONES, vacias: true })
      campoGeneral.current?.focus()
      return
    }
    setAviso(null)
    setDialogo(lista)
  }

  function hecho() {
    setDialogo(null)
    setTextos({})
    toast.success('Reporte devuelto al establecimiento.')
    setDevuelto(true)
  }

  function fallo(err) {
    setDialogo(null)
    setAviso({ mensaje: mensajeDeError(err), recargar: ERRORES_DE_RECARGA.includes(err.codigo) })
  }

  return (
    <section className="flex flex-col gap-6 p-6">
      {encabezado}

      {!puedeDevolver && (
        <Alert className="border-border bg-muted">
          <Lock />
          <AlertTitle>Solo consulta</AlertTitle>
          <AlertDescription>
            {reporte.estado !== 'EN_REVISION'
              ? `El reporte está en «${ESTADOS_REPORTE[reporte.estado]?.titulo ?? reporte.estado}».`
              : 'Solo el revisor asignado puede devolver este reporte.'}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
        <div className="flex min-w-0 flex-col gap-4">
          {puedeDevolver && (
            <CampoObservacion
              id="observacion-general"
              etiqueta="Observación general"
              valor={textoDe(GENERAL)}
              alCambiar={escribir(GENERAL)}
              refCampo={campoGeneral}
              invalido={aviso?.vacias}
            />
          )}

          {vacunas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este reporte no tiene vacunas.</p>
          ) : (
            <Tabs value={pestanaActiva} onValueChange={setPestana}>
              <TabsList aria-label="Vacunas" className="h-auto flex-wrap justify-start gap-2 bg-transparent p-0 group-data-horizontal/tabs:h-auto">
                {vacunas.map(({ vacuna }) => (
                  <TabsTrigger
                    key={vacuna.id}
                    value={String(vacuna.id)}
                    className="h-auto flex-none rounded-full border-border bg-card px-3.5 py-1.5 shadow-tarjeta transition-colors duration-200 hover:not-aria-selected:border-ring/50 hover:not-aria-selected:bg-accent/40 aria-selected:border-primary aria-selected:bg-primary aria-selected:text-primary-foreground aria-selected:shadow-elevada"
                  >
                    {vacuna.vacuna.nombre}
                    {textoDe(vacuna.vacuna.id).trim() && (
                      <MessageSquareWarning aria-label="con observación" className="text-estado-correccion-foreground" />
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
              {vacunas.map(({ vacuna, captura }) => (
                <TabsContent key={vacuna.id} value={String(vacuna.id)} className="flex flex-col gap-4 pt-4">
                  {puedeDevolver && (
                    <CampoObservacion
                      id={`observacion-${vacuna.vacuna.id}`}
                      etiqueta={`Observación sobre ${vacuna.vacuna.nombre}`}
                      valor={textoDe(vacuna.vacuna.id)}
                      alCambiar={escribir(vacuna.vacuna.id)}
                    />
                  )}
                  <VacunaEnRevision vacuna={vacuna} captura={captura} formulario={formulario} />
                </TabsContent>
              ))}
            </Tabs>
          )}
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-4">
          <PanelValidacion validacion={validacion} soloLectura />
          <ObservacionesAnteriores observaciones={observaciones} />
        </div>
      </div>

      {aviso && (
        <AvisoError onReintentar={aviso.recargar ? recargar : undefined} textoReintentar="Recargar">
          {aviso.mensaje}
        </AvisoError>
      )}

      {puedeDevolver && (
        <div className="sticky bottom-0 z-10 -mx-6 flex flex-wrap items-center justify-end gap-3 border-t bg-background/90 px-6 py-3 backdrop-blur-md">
          <p className="mr-auto text-sm text-muted-foreground">Cada acción queda en la bitácora de revisión.</p>
          <Button
            variant="outline"
            className="border-estado-correccion-foreground/40 text-estado-correccion-foreground hover:bg-estado-correccion hover:text-estado-correccion-foreground"
            onClick={solicitar}
            disabled={dialogo !== null}
          >
            <Undo2 />
            Solicitar corrección
          </Button>
        </div>
      )}

      {dialogo && (
        <DialogoSolicitarCorreccion
          reporteId={reporte.id}
          versionFila={reporte.versionFila}
          observaciones={dialogo}
          alHecho={hecho}
          alFallar={fallo}
          alCerrar={() => setDialogo(null)}
        />
      )}

      <AvisoCambiosSinGuardar
        bloqueo={bloqueo}
        descripcion="Si sale ahora, se pierden las observaciones que escribió y el reporte sigue en revisión."
      />
    </section>
  )
}
