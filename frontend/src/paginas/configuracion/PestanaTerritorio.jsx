import { useEffect, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, MoreHorizontal, Plus } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { listarDdriss, listarDistritos, listarMunicipios } from '@/api/catalogos.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoDistrito from './DialogoDistrito.jsx'

const MIGRANTES = '9999'
// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'
const ESTADOS = [
  { valor: TODOS, etiqueta: 'Todos los estados' },
  { valor: 'activos', etiqueta: 'Activos' },
  { valor: 'inactivos', etiqueta: 'Inactivos' },
]

function EstadoActivo({ activo }) {
  return activo ? <Badge variant="secondary">Activo</Badge> : <Badge variant="outline">Inactivo</Badge>
}

function Filtro({ nombre, etiqueta, valor, alCambiar, opciones }) {
  return (
    <Select name={nombre} value={valor} onValueChange={alCambiar}>
      <SelectTrigger aria-label={etiqueta} className="w-full bg-card sm:w-56">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opciones.map((opcion) => (
          <SelectItem key={opcion.valor} value={opcion.valor}>
            {opcion.etiqueta}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function CardCargando({ titulo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {[1, 2, 3].map((n) => (
          <Skeleton key={n} className="h-8 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

export default function PestanaTerritorio() {
  const { tienePermiso } = useSesion()
  const puedeCrear = tienePermiso('DISTRITO_CREAR')
  const puedeEditar = tienePermiso('DISTRITO_EDITAR')
  const [datos, setDatos] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [filtroMunicipio, setFiltroMunicipio] = useState(TODOS)
  const [filtroEstado, setFiltroEstado] = useState(TODOS)
  // null, { distrito: null } para registrar o { distrito } para renombrar.
  const [dialogo, setDialogo] = useState(null)
  const [aviso, setAviso] = useState(null)
  // Cada carga tiene su número; una respuesta que llega después de otra carga se descarta.
  const cargaActual = useRef(0)

  function cargar() {
    const carga = ++cargaActual.current
    setDatos(null)
    setErrorCarga(null)
    Promise.all([listarDdriss(), listarMunicipios({ alcance: 'procedencia', incluirInactivos: true }), listarDistritos()])
      .then(([ddriss, municipios, distritos]) => {
        if (carga === cargaActual.current) setDatos({ ddriss, municipios, distritos })
      })
      .catch((err) => {
        if (carga === cargaActual.current) setErrorCarga(err.mensaje)
      })
  }

  // La fila se agrega o se reemplaza con la respuesta, sin volver a pedir la lista.
  function alGuardar(guardado) {
    const nuevo = dialogo.distrito === null
    setDatos((actual) => ({
      ...actual,
      distritos: nuevo
        ? [...actual.distritos, guardado]
        : actual.distritos.map((d) => (d.id === guardado.id ? guardado : d)),
    }))
    setAviso(`Distrito ${guardado.codigo} ${nuevo ? 'registrado' : 'actualizado'}.`)
    setDialogo(null)
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [])

  if (errorCarga) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudo cargar el catálogo territorial: {errorCarga}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={cargar}>
          Reintentar
        </Button>
      </div>
    )
  }

  if (datos === null) {
    return (
      <div className="flex flex-col gap-6" aria-label="Cargando catálogo territorial">
        <CardCargando titulo="DDRISS" />
        <CardCargando titulo="Municipios" />
        <CardCargando titulo="Distritos de salud" />
      </div>
    )
  }

  const { ddriss, municipios, distritos } = datos
  const departamentosSede = new Set(ddriss.map((d) => d.departamentoId))
  const municipiosSede = municipios.filter((m) => departamentosSede.has(m.departamentoId))
  const distritosActivosDe = (municipioId) => distritos.filter((d) => d.activo && d.municipioId === municipioId).length

  const distritosFiltrados = distritos.filter(
    (d) =>
      (filtroMunicipio === TODOS || d.municipioId === Number(filtroMunicipio)) &&
      (filtroEstado === TODOS || d.activo === (filtroEstado === 'activos')),
  )

  return (
    <div className="flex flex-col gap-6">
      {aviso && (
        <Alert role="status" className="border-ring/40 bg-accent text-accent-foreground">
          <CircleCheck />
          <AlertDescription className="text-accent-foreground">{aviso}</AlertDescription>
        </Alert>
      )}

      {ddriss.map((d) => (
        <Card key={d.id}>
          <CardHeader>
            <CardTitle>
              {d.nombre} <span className="font-normal text-muted-foreground">· {d.codigo}</span>
            </CardTitle>
            <CardDescription>Departamento sede: {d.departamentoNombre}</CardDescription>
          </CardHeader>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle>Municipios</CardTitle>
          <CardDescription>Catálogo INE; solo consulta.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto rounded-lg border">
            <Table aria-label="Municipios">
              <TableHeader>
                <TableRow>
                  <TableHead>Código INE</TableHead>
                  <TableHead>Municipio</TableHead>
                  <TableHead>Departamento</TableHead>
                  <TableHead>Distritos activos</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {municipios.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell>{m.codigoIne}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium">{m.nombre}</span>
                        {m.codigoIne === MIGRANTES ? (
                          <Badge variant="secondary">Procedencia especial</Badge>
                        ) : (
                          !departamentosSede.has(m.departamentoId) && <Badge variant="outline">Fuera del departamento</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{m.departamentoNombre}</TableCell>
                    <TableCell>{distritosActivosDe(m.id)}</TableCell>
                    <TableCell>
                      <EstadoActivo activo={m.activo} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Distritos de salud</CardTitle>
          {puedeCrear && (
            <CardAction>
              <Button onClick={() => setDialogo({ distrito: null })}>
                <Plus />
                Registrar distrito
              </Button>
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
          <form className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
            <Filtro
              nombre="municipio"
              etiqueta="Filtrar por municipio"
              valor={filtroMunicipio}
              alCambiar={setFiltroMunicipio}
              opciones={[
                { valor: TODOS, etiqueta: 'Todos los municipios' },
                ...municipiosSede.map((m) => ({ valor: String(m.id), etiqueta: m.nombre })),
              ]}
            />
            <Filtro
              nombre="estado"
              etiqueta="Filtrar por estado"
              valor={filtroEstado}
              alCambiar={setFiltroEstado}
              opciones={ESTADOS}
            />
          </form>

          {distritos.length === 0 ? (
            <p className="text-muted-foreground">No hay distritos de salud registrados.</p>
          ) : distritosFiltrados.length === 0 ? (
            <p className="text-muted-foreground">No hay distritos que coincidan con los filtros.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table aria-label="Distritos de salud">
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Nombre</TableHead>
                    <TableHead>Municipio</TableHead>
                    <TableHead>Establecimientos activos</TableHead>
                    <TableHead>Estado</TableHead>
                    {puedeEditar && <TableHead className="text-right">Acciones</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {distritosFiltrados.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.codigo}</TableCell>
                      <TableCell className="font-medium">{d.nombre}</TableCell>
                      <TableCell>{d.municipioNombre}</TableCell>
                      <TableCell>{d.establecimientosActivos}</TableCell>
                      <TableCell>
                        <EstadoActivo activo={d.activo} />
                      </TableCell>
                      {puedeEditar && (
                        <TableCell className="text-right">
                          {/* No modal: así el diálogo que abre una opción no hereda el bloqueo del menú. */}
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label={`Acciones de ${d.codigo}`}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onSelect={() => setDialogo({ distrito: d })}>Renombrar</DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {dialogo && (
        <DialogoDistrito
          distrito={dialogo.distrito}
          municipios={municipiosSede.filter((m) => m.activo)}
          alGuardar={alGuardar}
          alCerrar={() => setDialogo(null)}
        />
      )}
    </div>
  )
}
