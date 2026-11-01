import { useEffect, useMemo, useRef, useState } from 'react'
import { Info } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { listarPeriodos } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { listarReportes, obtenerFormulario, obtenerReporte } from '@/api/produccion.js'
import { listarRectificaciones, solicitarRectificacion } from '@/api/rectificaciones.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import FormularioCaptura, { LetraTarjeta } from '@/componentes/formulario/FormularioCaptura.jsx'
import TarjetaProcedencias, {
  cantidadesDeOtras,
  filasDeCeldas,
  llaveProcedencia,
  llavesDeFila,
} from '@/componentes/formulario/TarjetaProcedencias.jsx'
import { cantidadesDe, formularioDe } from '@/paginas/registro/CapturaReporte.jsx'
import PaginacionUsuarios, { FILAS_POR_PAGINA } from '@/paginas/usuarios/PaginacionUsuarios.jsx'
import { TablaCambios } from './PaginaDetalleRectificacion.jsx'
import { mesDe } from './formato.js'

const LARGO_MOTIVO = 1000 // solicitud_rectificacion.motivo
const POR_PAGINA = 20
const TODOS = 'todos'
const GRUPO_EDAD = 'grupo_edad'
const ENTERO = /^\d+$/
// Con estos errores lo que se ve ya no es el reporte de la base: solo queda volver a cargar.
const ERRORES_DE_RECARGA = ['REPORTE_DESACTUALIZADO', 'RECTIFICACION_PENDIENTE', 'REPORTE_NO_CERRADO']
const VACIADA = 'Escriba 0 para dejarla en cero.'
const NO_ENTERA = 'Escriba un número entero, de 0 en adelante.'

const entero = (texto, minimo = 1) => (/^\d+$/.test(texto ?? '') && Number(texto) >= minimo ? Number(texto) : undefined)

// 'grupo_edad=MENOR_1|sexo=F' → { grupo_edad: 'MENOR_1', sexo: 'F' }; '' → {}.
const dimensionesDeClave = (clave) => (clave === '' ? {} : Object.fromEntries(clave.split('|').map((par) => par.split('='))))

// Las celdas de una tarjeta cuyo texto cambió. Una vacía que estaba vacía, o un 0 donde no había nada, no es un
// cambio: la rectificación no guarda una celda sin diferencia. aCelda(llave) da la dosis, la procedencia y la clave.
function compararTarjeta(original, actual, aCelda) {
  const resultado = []
  for (const llave of new Set([...Object.keys(original), ...Object.keys(actual)])) {
    const antes = (original[llave] ?? '').trim()
    const ahora = (actual[llave] ?? '').trim()
    if (antes === ahora) continue
    const celda = { ...aCelda(llave), llave }
    if (ahora === '') {
      if (antes !== '') resultado.push({ ...celda, error: VACIADA })
      continue
    }
    if (!ENTERO.test(ahora)) {
      resultado.push({ ...celda, error: NO_ENTERA })
      continue
    }
    const anterior = antes === '' ? 0 : Number(antes)
    if (anterior === Number(ahora)) continue
    resultado.push({ ...celda, celdaNueva: antes === '', cantidadAnterior: anterior, cantidadNueva: Number(ahora) })
  }
  return resultado
}

// Las dimensiones con sus etiquetas, como las devuelve la API: el grupo de edad primero y las demás por código.
function dimensionesConEtiqueta(clave, dimensiones) {
  return Object.entries(dimensionesDeClave(clave))
    .sort(([a], [b]) => (b === GRUPO_EDAD) - (a === GRUPO_EDAD) || a.localeCompare(b))
    .map(([codigo, valor]) => {
      const dimension = dimensiones.find((d) => d.codigo === codigo)
      return {
        codigo,
        nombre: dimension?.nombre ?? codigo,
        valor,
        etiqueta: dimension?.valores.find((v) => v.codigo === valor)?.etiqueta ?? valor,
      }
    })
}

// Las celdas que cambian en una vacuna, con la forma de los cambios de GET /rectificaciones/{id} (para la tabla) y su
// llave y tarjeta (para marcarlas). Las que tienen error llevan `error` en lugar de cantidades.
export function cambiosDeVacuna({ vacuna, municipioPropio, municipios, original, actual }) {
  const nombreMunicipio = (id) =>
    id === municipioPropio.id ? municipioPropio.nombre : (municipios.find((m) => m.id === id)?.nombre ?? `Municipio ${id}`)
  const propias = compararTarjeta(original.propias, actual.propias, (llave) => {
    const [dosis, ...clave] = llave.split('|')
    return { tarjeta: 'propias', dosisCodigo: dosis, municipioId: municipioPropio.id, clave: clave.join('|') }
  })
  const otras = compararTarjeta(original.otras, actual.otras, (llave) => {
    const [dosis, municipio, ...clave] = llave.split('|')
    return { tarjeta: 'otras', dosisCodigo: dosis, municipioId: Number(municipio), clave: clave.join('|') }
  })
  const ordenDosis = (codigo) => vacuna.dosis.find((d) => d.codigo === codigo)?.orden ?? Number.MAX_SAFE_INTEGER
  return [...propias, ...otras]
    .sort(
      (a, b) =>
        ordenDosis(a.dosisCodigo) - ordenDosis(b.dosisCodigo) || a.municipioId - b.municipioId || a.clave.localeCompare(b.clave),
    )
    .map((c) => ({
      ...c,
      vacuna: vacuna.vacuna,
      dosis: { codigo: c.dosisCodigo, nombre: vacuna.dosis.find((d) => d.codigo === c.dosisCodigo)?.nombre ?? c.dosisCodigo },
      municipioProcedencia: { id: c.municipioId, nombre: nombreMunicipio(c.municipioId) },
      dimensiones: dimensionesConEtiqueta(c.clave, vacuna.dimensiones),
      claveCombinacion: c.clave,
    }))
}

// Lo que se manda a la API: solo las celdas que cambian.
export const cuerpoDeCambio = (c) => ({
  vacunaId: c.vacuna.id,
  dosisCodigo: c.dosisCodigo,
  municipioProcedenciaId: c.municipioId,
  dimensiones: dimensionesDeClave(c.claveCombinacion),
  cantidadNueva: c.cantidadNueva,
})

const nombreDeCambio = (c) =>
  [c.vacuna.nombre, c.dosis.nombre, c.municipioProcedencia.nombre, ...c.dimensiones.map((d) => d.etiqueta)].join(' · ')

// Paso 1: los reportes cerrados del ámbito, con su solicitud pendiente si la tienen.
function ElegirReporte() {
  const { pathname } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const anio = entero(parametros.get('anio'), 2000)
  const pagina = entero(parametros.get('pagina')) ?? 1
  const pedidas = Number(parametros.get('porPagina'))
  const porPagina = FILAS_POR_PAGINA.includes(pedidas) ? pedidas : POR_PAGINA

  const [anios, setAnios] = useState([])
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)

  function consultaDe(cambios) {
    const valores = { anio, pagina, porPagina, ...cambios }
    const consulta = new URLSearchParams()
    if (valores.anio) consulta.set('anio', String(valores.anio))
    if (valores.pagina > 1) consulta.set('pagina', String(valores.pagina))
    if (valores.porPagina !== POR_PAGINA) consulta.set('porPagina', String(valores.porPagina))
    return consulta.toString()
  }

  useEffect(() => {
    let vigente = true
    listarPeriodos()
      .then((periodos) => vigente && setAnios([...new Set(periodos.map((p) => p.anio))].sort((a, b) => b - a)))
      .catch(() => {})
    return () => {
      vigente = false
    }
  }, [])

  useEffect(() => {
    let vigente = true
    setErrorCarga(null)
    Promise.all([
      listarReportes({ estado: 'CERRADO', anio, pagina, porPagina }),
      listarRectificaciones({ estado: 'PENDIENTE', porPagina: 100 }),
    ])
      .then(([reportes, pendientes]) => {
        if (!vigente) return
        const porReporte = new Map(pendientes.elementos.map((s) => [s.reporte.id, s.id]))
        setDatos({ reportes, porReporte })
      })
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [anio, pagina, porPagina, intento])

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Rectificaciones"
        titulo="Nueva solicitud de rectificación"
        descripcion="Elija el reporte cerrado que quiere corregir."
        volverA="/rectificaciones"
        textoVolver="Volver a las solicitudes"
      />

      <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
        <Select
          name="anio"
          value={anio ? String(anio) : TODOS}
          onValueChange={(elegido) =>
            setParametros(new URLSearchParams(consultaDe({ anio: elegido === TODOS ? undefined : Number(elegido), pagina: 1 })))
          }
        >
          <SelectTrigger aria-label="Filtrar por año" className="w-full bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los años</SelectItem>
            {[...new Set([...anios, ...(anio ? [anio] : [])])]
              .sort((a, b) => b - a)
              .map((valor) => (
                <SelectItem key={valor} value={String(valor)}>
                  {valor}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </form>

      {errorCarga ? (
        <AvisoError onReintentar={() => setIntento((n) => n + 1)}>
          No se pudieron cargar los reportes cerrados: {errorCarga}
        </AvisoError>
      ) : datos === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando reportes">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : datos.reportes.elementos.length === 0 ? (
        <p className="text-muted-foreground">No hay reportes cerrados{anio ? ` en ${anio}` : ''}.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mes</TableHead>
                  <TableHead>Establecimiento</TableHead>
                  <TableHead className="text-right">
                    <span className="sr-only">Acciones</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {datos.reportes.elementos.map((reporte) => {
                  const pendiente = datos.porReporte.get(reporte.id)
                  const nombre = `${mesDe(reporte.periodo)}, ${reporte.establecimiento.nombre}`
                  return (
                    <TableRow key={reporte.id}>
                      <TableCell className="font-medium">{mesDe(reporte.periodo)}</TableCell>
                      <TableCell>{reporte.establecimiento.nombre}</TableCell>
                      <TableCell className="text-right">
                        {pendiente ? (
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/rectificaciones/${pendiente}`} aria-label={`Ver la solicitud pendiente de ${nombre}`}>
                              Ver solicitud
                            </Link>
                          </Button>
                        ) : (
                          <Button size="sm" asChild>
                            <Link
                              to={`/rectificaciones/nueva?reporte=${reporte.id}`}
                              aria-label={`Solicitar la rectificación de ${nombre}`}
                            >
                              Solicitar
                            </Link>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
          <PaginacionUsuarios
            total={datos.reportes.total}
            pagina={datos.reportes.pagina}
            porPagina={datos.reportes.porPagina}
            hrefDe={(n) => (consultaDe({ pagina: n }) ? `${pathname}?${consultaDe({ pagina: n })}` : pathname)}
            alCambiarPagina={(n) => setParametros(new URLSearchParams(consultaDe({ pagina: n })))}
            alCambiarPorPagina={(n) => setParametros(new URLSearchParams(consultaDe({ porPagina: n, pagina: 1 })))}
          />
        </div>
      )}
    </section>
  )
}

// Las tarjetas A y B de una vacuna, con las cantidades editables y las casillas cambiadas marcadas.
function VacunaRectificable({ entrada, municipioPropio, municipios, edicion, marcas, alCambiar }) {
  const { vacuna, captura, armado } = entrada
  if (!armado) return <p className="text-sm text-muted-foreground">No se encontró el formulario de esta vacuna.</p>
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-start gap-3">
            <LetraTarjeta>A</LetraTarjeta>
            <div className="flex flex-col gap-1.5">
              <CardTitle className="text-base">Dosis aplicadas a residentes de {municipioPropio.nombre}</CardTitle>
              <CardDescription>
                Esquema de captura: {vacuna.vacuna.nombre}, versión {captura.esquema.version}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FormularioCaptura
            formulario={armado}
            cantidades={edicion.propias}
            alCambiar={(llave, texto) => alCambiar((e) => ({ ...e, propias: { ...e.propias, [llave]: texto } }))}
            marcas={marcas.propias}
          />
        </CardContent>
      </Card>
      <TarjetaProcedencias
        formulario={armado}
        filas={edicion.filas}
        cantidades={edicion.otras}
        municipios={municipios}
        permitidas={captura.procedenciasPermitidas}
        modo={captura.esquema.procedencia.modo}
        alAgregar={(fila) => alCambiar((e) => ({ ...e, filas: [...e.filas, fila] }))}
        alQuitar={(fila) => {
          const llaves = new Set(llavesDeFila(armado, fila))
          alCambiar((e) => ({
            ...e,
            filas: e.filas.filter((f) => f !== fila),
            otras: Object.fromEntries(Object.entries(e.otras).filter(([llave]) => !llaves.has(llave))),
          }))
        }}
        alCambiar={(llave, texto) => alCambiar((e) => ({ ...e, otras: { ...e.otras, [llave]: texto } }))}
        marcas={marcas.otras}
      />
    </div>
  )
}

// Paso 2: la justificación y las cantidades del reporte cerrado.
function SolicitudDelReporte({ reporteId }) {
  const navegar = useNavigate()
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [edicion, setEdicion] = useState({})
  const [pestana, setPestana] = useState(null)
  const [motivo, setMotivo] = useState('')
  const [errores, setErrores] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [enviando, setEnviando] = useState(false)
  // { mensaje, recargar }
  const [errorApi, setErrorApi] = useState(null)
  const [enviada, setEnviada] = useState(null)
  const [enfocar, setEnfocar] = useState(null)
  const refMotivo = useRef(null)
  const refErrores = useRef(null)

  useEffect(() => {
    let vigente = true
    setDatos(null)
    setErrorCarga(null)
    Promise.all([obtenerReporte(reporteId), obtenerFormulario(reporteId)])
      .then(([reporte, formulario]) => {
        if (!vigente) return
        const municipioId = formulario.municipioPropio.id
        const entradas = reporte.vacunas.flatMap((vacuna) => {
          const captura = formulario.vacunas.find((c) => c.vacunaId === vacuna.vacuna.id)
          if (!captura) return []
          const armado = formularioDe(vacuna, captura)
          const original = {
            propias: cantidadesDe(captura, municipioId),
            otras: armado ? cantidadesDeOtras(armado, captura.celdas, municipioId) : {},
          }
          const filas = armado ? filasDeCeldas(armado, captura.celdas, municipioId, formulario.municipios) : []
          return [{ vacuna, captura, armado, original, filas }]
        })
        setDatos({ reporte, formulario, entradas })
        setEdicion(
          Object.fromEntries(
            entradas.map((e) => [e.vacuna.vacuna.id, { propias: e.original.propias, otras: e.original.otras, filas: e.filas }]),
          ),
        )
        setPestana(entradas[0] ? String(entradas[0].vacuna.vacuna.id) : null)
        setMotivo('')
        setErrores(null)
      })
      .catch((err) => vigente && setErrorCarga(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [reporteId, intento])

  const porVacuna = useMemo(() => {
    if (!datos) return new Map()
    const { formulario } = datos
    return new Map(
      datos.entradas.map((entrada) => [
        entrada.vacuna.vacuna.id,
        cambiosDeVacuna({
          vacuna: entrada.vacuna,
          municipioPropio: formulario.municipioPropio,
          municipios: formulario.municipios,
          original: entrada.original,
          actual: edicion[entrada.vacuna.vacuna.id] ?? entrada.original,
        }),
      ]),
    )
  }, [datos, edicion])
  const todos = [...porVacuna.values()].flat()
  const cambios = todos.filter((c) => !c.error)
  const conError = todos.filter((c) => c.error)

  const bloqueo = useAvisoCambiosSinGuardar(enviada === null && (motivo.trim() !== '' || todos.length > 0))

  // Se navega cuando ya no hay cambios pendientes, así el aviso no se interpone.
  useEffect(() => {
    if (enviada !== null) navegar(`/rectificaciones/${enviada}`)
  }, [enviada, navegar])

  useEffect(() => {
    if (!enfocar) return
    if (enfocar === 'motivo') refMotivo.current?.focus()
    else if (enfocar === 'errores') refErrores.current?.focus()
    else document.querySelector(`[data-celda="${enfocar}"]`)?.focus()
    setEnfocar(null)
  }, [enfocar])

  function revisar() {
    const nuevos = {
      motivo: motivo.trim() === '' ? 'Escriba la justificación.' : null,
      cambios: todos.length === 0 ? 'Cambie al menos una cantidad.' : null,
      celdas: conError,
    }
    const hay = nuevos.motivo || nuevos.cambios || nuevos.celdas.length > 0
    setErrores(hay ? nuevos : null)
    if (!hay) {
      setErrorApi(null)
      setConfirmando(true)
      return
    }
    if (nuevos.motivo) setEnfocar('motivo')
    else if (nuevos.celdas.length > 0) {
      setPestana(String(nuevos.celdas[0].vacuna.id))
      setEnfocar(nuevos.celdas[0].llave)
    } else setEnfocar('errores')
  }

  async function enviar(evento) {
    evento.preventDefault()
    if (enviando) return
    setEnviando(true)
    setErrorApi(null)
    try {
      const solicitud = await solicitarRectificacion(reporteId, {
        motivo: motivo.trim(),
        versionFila: datos.formulario.versionFila,
        cambios: cambios.map(cuerpoDeCambio),
      })
      toast.success('Solicitud de rectificación enviada.')
      setEnviada(solicitud.id)
    } catch (err) {
      setErrorApi({ mensaje: mensajeDeError(err), recargar: ERRORES_DE_RECARGA.includes(err.codigo) })
      setEnviando(false)
    }
  }

  function recargar() {
    setConfirmando(false)
    setEnviando(false)
    setErrorApi(null)
    setIntento((n) => n + 1)
  }

  const reporte = datos?.reporte
  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Rectificaciones"
        titulo="Nueva solicitud de rectificación"
        descripcion={reporte && `${reporte.establecimiento.nombre} · ${mesDe(reporte.periodo)}`}
        volverA="/rectificaciones/nueva"
        textoVolver="Elegir otro reporte"
      />

      {errorCarga ? (
        <AvisoError onReintentar={() => setIntento((n) => n + 1)}>No se pudo cargar el reporte: {errorCarga}</AvisoError>
      ) : datos === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando reporte">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : reporte.estado !== 'CERRADO' ? (
        <p className="text-muted-foreground">Este reporte no está cerrado: solo se rectifican reportes cerrados.</p>
      ) : (
        <>
          <p className="flex items-start gap-2 rounded-lg border border-ring/25 bg-accent/40 px-3.5 py-2.5 text-sm text-accent-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Cambie las cantidades que están mal; las casillas cambiadas se resaltan. El reporte sigue cerrado y sin cambios
            hasta que la DDRISS autorice la rectificación.
          </p>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="motivo-rectificacion">Justificación</Label>
            <Textarea
              id="motivo-rectificacion"
              ref={refMotivo}
              value={motivo}
              maxLength={LARGO_MOTIVO}
              aria-invalid={Boolean(errores?.motivo) || undefined}
              aria-describedby="motivo-rectificacion-largo"
              placeholder="Qué está mal y de dónde salen los datos correctos."
              className="bg-card"
              onChange={(evento) => setMotivo(evento.target.value)}
            />
            <div className="flex justify-between gap-3">
              <p className="text-sm text-destructive">{errores?.motivo}</p>
              <p id="motivo-rectificacion-largo" className="font-mono text-xs text-muted-foreground">
                {motivo.length}/{LARGO_MOTIVO}
              </p>
            </div>
          </div>

          {datos.entradas.length === 0 ? (
            <p className="text-muted-foreground">El reporte no tiene vacunas.</p>
          ) : (
            <Tabs value={pestana ?? undefined} onValueChange={setPestana}>
              <TabsList className="flex-wrap">
                {datos.entradas.map(({ vacuna }) => {
                  const n = porVacuna.get(vacuna.vacuna.id)?.length ?? 0
                  return (
                    <TabsTrigger key={vacuna.vacuna.id} value={String(vacuna.vacuna.id)}>
                      {vacuna.vacuna.nombre}
                      {n > 0 && (
                        <Badge className="bg-advertencia text-advertencia-foreground" aria-label={`${n} cambiadas`}>
                          {n}
                        </Badge>
                      )}
                    </TabsTrigger>
                  )
                })}
              </TabsList>
              {datos.entradas.map((entrada) => {
                const id = entrada.vacuna.vacuna.id
                const marcas = { propias: {}, otras: {} }
                for (const c of porVacuna.get(id) ?? []) marcas[c.tarjeta][c.llave] = c.error ? 'ERROR' : 'CAMBIADA'
                return (
                  <TabsContent key={id} value={String(id)} className="pt-2">
                    <VacunaRectificable
                      entrada={entrada}
                      municipioPropio={datos.formulario.municipioPropio}
                      municipios={datos.formulario.municipios}
                      edicion={edicion[id]}
                      marcas={marcas}
                      alCambiar={(cambiar) => setEdicion((previa) => ({ ...previa, [id]: cambiar(previa[id]) }))}
                    />
                  </TabsContent>
                )
              })}
            </Tabs>
          )}

          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">Cambios ({cambios.length})</h2>
            {cambios.length === 0 ? (
              <p className="text-sm text-muted-foreground">Todavía no cambió ninguna cantidad.</p>
            ) : (
              <TablaCambios cambios={cambios} />
            )}
          </div>

          {errores && (errores.cambios || errores.celdas.length > 0) && (
            <div ref={refErrores} tabIndex={-1} role="alert" className="flex flex-col gap-1 text-sm text-destructive outline-none">
              {errores.cambios && <p>{errores.cambios}</p>}
              {errores.celdas.map((c) => (
                <p key={`${c.vacuna.id}|${c.tarjeta}|${c.llave}`}>
                  {nombreDeCambio(c)}: {c.error}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="outline" asChild>
              <Link to="/rectificaciones">Cancelar</Link>
            </Button>
            <Button type="button" onClick={revisar}>
              Enviar solicitud
            </Button>
          </div>

          <AlertDialog open={confirmando} onOpenChange={(abierto) => !abierto && !enviando && setConfirmando(false)}>
            <AlertDialogContent className="max-h-[90vh] overflow-y-auto data-[size=default]:sm:max-w-3xl">
              <AlertDialogHeader>
                <AlertDialogTitle>¿Enviar la solicitud de rectificación?</AlertDialogTitle>
                <AlertDialogDescription>
                  {cambios.length === 1 ? 'Se pide cambiar 1 celda' : `Se pide cambiar ${cambios.length} celdas`} del reporte de{' '}
                  {reporte.establecimiento.nombre}. La DDRISS la revisa antes de aplicarla.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <TablaCambios cambios={cambios} etiqueta="Cambios por enviar" />
              {errorApi && (
                <AvisoError onReintentar={errorApi.recargar ? recargar : undefined} textoReintentar="Recargar">
                  {errorApi.mensaje}
                </AvisoError>
              )}
              <AlertDialogFooter>
                <AlertDialogCancel disabled={enviando}>Cancelar</AlertDialogCancel>
                <AlertDialogAction disabled={enviando} onClick={enviar}>
                  {enviando ? 'Enviando…' : 'Enviar'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}

      <AvisoCambiosSinGuardar
        bloqueo={bloqueo}
        descripcion="Si sale ahora, se pierden la justificación y las cantidades que cambió."
      />
    </section>
  )
}

export default function PaginaNuevaRectificacion() {
  const [parametros] = useSearchParams()
  const reporteId = entero(parametros.get('reporte'))
  return reporteId ? <SolicitudDelReporte key={reporteId} reporteId={reporteId} /> : <ElegirReporte />
}
