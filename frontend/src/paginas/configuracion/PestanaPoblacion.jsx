import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleAlert, CircleCheck, Pencil } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { consultarPoblacion, listarPeriodos } from '@/api/catalogos.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoPoblacion from './DialogoPoblacion.jsx'

const formatoCantidad = new Intl.NumberFormat('es-GT')

// Un grupo sin registrar no viene en la respuesta.
const cantidadDe = (municipio, codigo) => {
  const registro = municipio.poblacion[codigo]
  return registro ? formatoCantidad.format(registro.cantidad) : '—'
}

// El mismo "hoy" que usa el backend.
const anioActual = () =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Guatemala' }).format(new Date()).slice(0, 4))

// Sin año en la URL, o con uno que no está, se elige el actual si existe y si no el más reciente.
function elegirAnioVisible(anios, pedido) {
  if (anios.includes(pedido)) return pedido
  return anios.includes(anioActual()) ? anioActual() : anios[0]
}

function Cargando() {
  return (
    <Card aria-label="Cargando población">
      <CardHeader>
        <CardTitle>Población objetivo</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {[1, 2, 3, 4].map((n) => (
          <Skeleton key={n} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

export default function PestanaPoblacion() {
  const { tienePermiso } = useSesion()
  const puedeRegistrar = tienePermiso('POBLACION_REGISTRAR')
  const [parametros, setParametros] = useSearchParams()
  const [aviso, setAviso] = useState(null)
  // El municipio cuyo Dialog está abierto, o null.
  const [porEditar, setPorEditar] = useState(null)
  // Años con meses en el calendario, del más reciente al más antiguo.
  const [anios, setAnios] = useState(null)
  const [poblacion, setPoblacion] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    listarPeriodos()
      .then((periodos) => {
        if (vigente) setAnios([...new Set(periodos.map((p) => p.anio))].sort((a, b) => b - a))
      })
      .catch((err) => {
        if (vigente) setErrorCarga(err.mensaje)
      })
    return () => {
      vigente = false
    }
  }, [intento])

  const anio = anios ? elegirAnioVisible(anios, Number(parametros.get('anio'))) : undefined

  useEffect(() => {
    if (anio === undefined) return undefined
    let vigente = true
    consultarPoblacion(anio)
      .then((respuesta) => {
        if (vigente) setPoblacion(respuesta)
      })
      .catch((err) => {
        if (vigente) setErrorCarga(err.mensaje)
      })
    return () => {
      vigente = false
    }
  }, [anio, intento])

  function reintentar() {
    setErrorCarga(null)
    setAnios(null)
    setPoblacion(null)
    setIntento((actual) => actual + 1)
  }

  // La fila se reemplaza con la respuesta, sin volver a pedir la población del año.
  function alGuardar(guardado) {
    setPoblacion((actual) => ({
      ...actual,
      municipios: actual.municipios.map((m) => (m.id === guardado.id ? guardado : m)),
    }))
    setPorEditar(null)
    setAviso(`Población de ${guardado.nombre} guardada.`)
  }

  // El año va en la URL junto a la pestaña, para que siga elegido al recargar o volver.
  function elegirAnio(valor) {
    setAviso(null)
    setParametros(
      (actuales) => {
        const nuevos = new URLSearchParams(actuales)
        nuevos.set('anio', valor)
        return nuevos
      },
      { replace: true },
    )
  }

  if (errorCarga) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudo cargar la población: {errorCarga}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={reintentar}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (anios === null || (anio !== undefined && poblacion?.anio !== anio)) return <Cargando />

  return (
    <div className="flex flex-col gap-6">
      {aviso && (
        <Alert role="status" className="border-ring/40 bg-accent text-accent-foreground">
          <CircleCheck />
          <AlertDescription className="text-accent-foreground">{aviso}</AlertDescription>
        </Alert>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Población objetivo</CardTitle>
          <CardDescription>
            Población anual que envía el MSPAS por municipio y grupo de edad; es el denominador de la cobertura.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {anios.length === 0 ? (
            <p className="text-muted-foreground">No hay años en el calendario. Créelos en la pestaña Periodos.</p>
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
                <Table aria-label="Población">
                  <TableHeader>
                    <TableRow>
                      <TableHead>Municipio</TableHead>
                      {poblacion.grupos.map((grupo) => (
                        <TableHead key={grupo.codigo} className="text-right whitespace-normal">
                          {grupo.descripcion}
                        </TableHead>
                      ))}
                      {puedeRegistrar && <TableHead className="text-right">Acciones</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {poblacion.municipios.map((municipio) => (
                      <TableRow key={municipio.id}>
                        <TableCell className="font-medium">{municipio.nombre}</TableCell>
                        {poblacion.grupos.map(({ codigo }) => (
                          <TableCell key={codigo} className="text-right tabular-nums">
                            {cantidadDe(municipio, codigo)}
                          </TableCell>
                        ))}
                        {puedeRegistrar && (
                          <TableCell className="text-right">
                            <Button variant="outline" size="sm" onClick={() => setPorEditar(municipio)}>
                              <Pencil />
                              Editar
                            </Button>
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
        <DialogoPoblacion
          municipio={porEditar}
          anio={poblacion.anio}
          grupos={poblacion.grupos}
          alGuardar={alGuardar}
          alCerrar={() => setPorEditar(null)}
        />
      )}
    </div>
  )
}
