import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { crearAnioPeriodos, listarPeriodos } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoFechaLimite from './DialogoFechaLimite.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'

const PRIMER_ANIO = 2020

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

// estado null: el mes no está abierto en la DDRISS del usuario.
const INSIGNIAS = {
  ABIERTO: { etiqueta: 'Abierto', variante: 'default' },
  EN_CIERRE: { etiqueta: 'En cierre', variante: 'secondary' },
  CERRADO: { etiqueta: 'Cerrado', variante: 'outline' },
}

// La API manda AAAA-MM-DD; se muestra sin pasar por Date para no correrla un día por la zona horaria.
const aDiaMesAnio = (fecha) => (fecha ? fecha.split('-').reverse().join('/') : '—')

// El mismo "hoy" que usa el backend.
const anioActual = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date()).slice(0, 4))

function InsigniaEstado({ estado }) {
  if (!estado) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Sin abrir
      </Badge>
    )
  }
  const { etiqueta, variante } = INSIGNIAS[estado]
  return <Badge variant={variante}>{etiqueta}</Badge>
}

// Años del rango (de 2020 al siguiente al actual) que todavía no tienen sus 12 meses, del más reciente al más antiguo.
function aniosPorCrear(periodos) {
  const mesesPorAnio = new Map()
  for (const p of periodos) mesesPorAnio.set(p.anio, (mesesPorAnio.get(p.anio) ?? 0) + 1)
  const anios = []
  for (let anio = anioActual() + 1; anio >= PRIMER_ANIO; anio--) {
    if ((mesesPorAnio.get(anio) ?? 0) < 12) anios.push(anio)
  }
  return anios
}

// Quien lo abre lo monta de nuevo en cada apertura, así empieza con el primer año disponible.
function DialogoCrearAnio({ anios, alGuardar, alCerrar }) {
  const [anio, setAnio] = useState(String(anios[0]))
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(evento) {
    evento.preventDefault()
    setGuardando(true)
    setErrorApi(null)
    try {
      alGuardar(Number(anio), await crearAnioPeriodos(Number(anio)))
    } catch (err) {
      // El Dialog sigue abierto para elegir otro año o volver a intentar.
      setErrorApi(mensajeDeError(err))
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !guardando && alCerrar()}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>Crear año</DialogTitle>
            <DialogDescription>
              Agrega al calendario los meses que falten del año. No abre ninguno: cada mes se abre aparte.
            </DialogDescription>
          </DialogHeader>

          {errorApi && <AvisoError>{errorApi}</AvisoError>}

          <div className="flex flex-col gap-2">
            <Label htmlFor="periodo-anio-nuevo" className="font-semibold">
              Año
            </Label>
            <Select name="anioNuevo" value={anio} onValueChange={setAnio} disabled={guardando}>
              <SelectTrigger id="periodo-anio-nuevo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {anios.map((opcion) => (
                  <SelectItem key={opcion} value={String(opcion)}>
                    {opcion}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Creando…' : 'Crear año'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ContenidoPeriodos() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('PERIODO_CREAR')
  const puedeEditar = tienePermiso('PERIODO_EDITAR')
  const [parametros, setParametros] = useSearchParams()
  const [periodos, setPeriodos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [creandoAnio, setCreandoAnio] = useState(false)
  // El mes cuyo Dialog de fecha límite está abierto, o null.
  const [porEditar, setPorEditar] = useState(null)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setPeriodos(null)
    setErrorCarga(null)
    listarPeriodos()
      .then((lista) => {
        if (carga === cargaActual.current) setPeriodos(lista)
      })
      .catch((err) => {
        if (carga === cargaActual.current) setErrorCarga(mensajeDeError(err))
      })
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [])

  // El año va en la URL, para que siga elegido al recargar o volver.
  function elegirAnio(anio) {
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        nuevos.set('anio', anio)
        return nuevos
      },
      { replace: true },
    )
  }

  // Los meses del año se reemplazan con la respuesta, sin volver a pedir la lista, y el año queda elegido.
  function alCrearAnio(anio, delAnio) {
    setPeriodos((actuales) => [...actuales.filter((p) => p.anio !== anio), ...delAnio])
    elegirAnio(String(anio))
    setCreandoAnio(false)
    toast.success(`Año ${anio} agregado al calendario. Abra cada mes cuando corresponda.`)
  }

  // La fila se reemplaza con la respuesta, que trae el estado nuevo (un mes en cierre puede volver a Abierto).
  function alGuardarFecha(actualizado) {
    const mes = `${MESES[actualizado.mes - 1]} ${actualizado.anio}`
    const fecha = aDiaMesAnio(actualizado.fechaLimiteEnvio)
    setPeriodos((actuales) => actuales.map((p) => (p.id === actualizado.id ? actualizado : p)))
    toast.success(
      porEditar.estado === null
        ? `${mes} abierto; fecha límite ${fecha}.`
        : `Fecha límite de ${mes} cambiada al ${fecha}.${
            porEditar.estado === 'EN_CIERRE' && actualizado.estado === 'ABIERTO' ? ' El mes volvió a Abierto.' : ''
          }`,
    )
    setPorEditar(null)
  }

  if (errorCarga) {
    return <AvisoError onReintentar={cargar}>No se pudieron cargar los periodos: {errorCarga}</AvisoError>
  }

  if (periodos === null) {
    return (
      <Card aria-label="Cargando periodos">
        <CardHeader>
          <CardTitle>Periodos de reporte</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {[1, 2, 3, 4].map((n) => (
            <Skeleton key={n} className="h-8 w-full" />
          ))}
        </CardContent>
      </Card>
    )
  }

  // Del más reciente al más antiguo. Sin año en la URL, o con uno que no está, se elige el actual si existe y si no
  // el más reciente.
  const anios = [...new Set(periodos.map((p) => p.anio))].sort((a, b) => b - a)
  const pedido = Number(parametros.get('anio'))
  const anio = anios.includes(pedido) ? pedido : anios.includes(anioActual()) ? anioActual() : anios[0]
  const delAnio = periodos.filter((p) => p.anio === anio)
  const porCrear = aniosPorCrear(periodos)

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Periodos de reporte</CardTitle>
          <CardDescription>El calendario es común; el estado y la fecha límite son de su DDRISS.</CardDescription>
          {puedeCrear && (
            <CardAction>
              <Button
                onClick={() => setCreandoAnio(true)}
                disabled={porCrear.length === 0}
                title={porCrear.length === 0 ? 'Todos los años del rango ya están en el calendario' : undefined}
              >
                <Plus />
                Crear año
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {anios.length === 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-muted-foreground">No hay años en el calendario.</p>
              {puedeCrear && (
                <Button variant="outline" onClick={() => setCreandoAnio(true)}>
                  <Plus />
                  Crear año
                </Button>
              )}
            </div>
          ) : (
            <>
              {/* Dentro de un form, Radix agrega el <select> nativo del Select. */}
              <form className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
                <Select name="anio" value={String(anio)} onValueChange={elegirAnio}>
                  <SelectTrigger aria-label="Año" className="w-full bg-card sm:w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {anios.map((opcion) => (
                      <SelectItem key={opcion} value={String(opcion)}>
                        {opcion}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </form>

              <div className="overflow-x-auto rounded-lg border">
                <Table aria-label="Periodos">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mes</TableHead>
                      <TableHead>Del – al</TableHead>
                      <TableHead>Fecha límite de envío</TableHead>
                      <TableHead>Estado</TableHead>
                      {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {delAnio.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{MESES[p.mes - 1]}</TableCell>
                        <TableCell>
                          {aDiaMesAnio(p.fechaInicio)} – {aDiaMesAnio(p.fechaFin)}
                        </TableCell>
                        <TableCell>{aDiaMesAnio(p.fechaLimiteEnvio)}</TableCell>
                        <TableCell>
                          <InsigniaEstado estado={p.estado} />
                        </TableCell>
                        {puedeEditar && (
                          <TableCell className="text-right">
                            {/* Un mes cerrado no tiene acciones: solo admite rectificaciones. */}
                            {p.estado !== 'CERRADO' && (
                              <Button variant="outline" size="sm" onClick={() => setPorEditar(p)}>
                                {p.estado === null ? 'Abrir' : 'Cambiar fecha límite'}
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {porEditar && (
        <DialogoFechaLimite
          periodo={porEditar}
          nombreMes={MESES[porEditar.mes - 1]}
          alGuardar={alGuardarFecha}
          alCerrar={() => setPorEditar(null)}
        />
      )}
      {creandoAnio && (
        <DialogoCrearAnio anios={porCrear} alGuardar={alCrearAnio} alCerrar={() => setCreandoAnio(false)} />
      )}
    </div>
  )
}

export default function PaginaPeriodos() {
  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Administración" titulo="Periodos" />
      <ContenidoPeriodos />
    </section>
  )
}
