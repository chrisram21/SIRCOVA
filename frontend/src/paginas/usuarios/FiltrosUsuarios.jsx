import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listarEstablecimientos } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { listarRoles } from '@/api/usuarios.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'

const ESPERA_BUSQUEDA = 300
// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'
const ESTADOS = [
  { valor: 'ACTIVA', etiqueta: 'Activas' },
  { valor: 'DESACTIVADA', etiqueta: 'Desactivadas' },
  { valor: 'BLOQUEADA', etiqueta: 'Bloqueadas' },
]

const limpiar = (texto) => texto.trim().replace(/\s+/g, ' ')

function Filtro({ nombre, etiqueta, valor, alCambiar, opciones, deshabilitado }) {
  return (
    <Select
      name={nombre}
      value={valor === undefined ? TODOS : String(valor)}
      onValueChange={(elegido) => alCambiar(elegido === TODOS ? undefined : elegido)}
      disabled={deshabilitado}
    >
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

export default function FiltrosUsuarios({ filtros, hayFiltros, alCambiar, alLimpiar }) {
  const { tienePermiso } = useSesion()
  const verRoles = tienePermiso('ROL_CONSULTAR')
  const verEstablecimientos = tienePermiso('ESTABLECIMIENTO_CONSULTAR')

  const [roles, setRoles] = useState([])
  const [establecimientos, setEstablecimientos] = useState([])
  const [fallaron, setFallaron] = useState({ roles: false, establecimientos: false })
  const [errorCatalogos, setErrorCatalogos] = useState(null)
  const [intentoCarga, setIntentoCarga] = useState(0)

  const [texto, setTexto] = useState(filtros.busqueda ?? '')
  // La última búsqueda que este componente escribió en la URL; sirve para no pisar lo que se sigue escribiendo.
  const enviada = useRef(filtros.busqueda ?? '')

  useEffect(() => {
    let vigente = true
    const fallo = (catalogo) => (err) => {
      if (!vigente) return
      setFallaron((actual) => ({ ...actual, [catalogo]: true }))
      setErrorCatalogos(mensajeDeError(err))
    }
    if (verRoles) {
      listarRoles()
        .then((lista) => vigente && setRoles(lista))
        .catch(fallo('roles'))
    }
    if (verEstablecimientos) {
      listarEstablecimientos()
        .then((lista) => vigente && setEstablecimientos(lista))
        .catch(fallo('establecimientos'))
    }
    return () => {
      vigente = false
    }
  }, [verRoles, verEstablecimientos, intentoCarga])

  function reintentarCarga() {
    setFallaron({ roles: false, establecimientos: false })
    setErrorCatalogos(null)
    setIntentoCarga((intento) => intento + 1)
  }

  useEffect(() => {
    const busqueda = limpiar(texto)
    if (busqueda === (filtros.busqueda ?? '')) return undefined
    const espera = setTimeout(() => {
      enviada.current = busqueda
      alCambiar({ busqueda: busqueda || undefined })
    }, ESPERA_BUSQUEDA)
    return () => clearTimeout(espera)
    // Solo al escribir: la URL cambia después, y alCambiar es nueva en cada render.
  }, [texto])

  // Si la búsqueda de la URL cambia por otra vía (Limpiar filtros, Atrás), el campo la sigue.
  useEffect(() => {
    const deLaUrl = filtros.busqueda ?? ''
    if (deLaUrl !== enviada.current) {
      enviada.current = deLaUrl
      setTexto(deLaUrl)
    }
  }, [filtros.busqueda])

  return (
    <div className="flex flex-col gap-3">
      {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
      <form role="search" className="flex flex-wrap items-center gap-3" onSubmit={(evento) => evento.preventDefault()}>
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="Buscar por nombre o usuario"
            placeholder="Buscar por nombre o usuario"
            maxLength={100}
            className="bg-card pl-8"
            value={texto}
            onChange={(evento) => setTexto(evento.target.value)}
          />
        </div>

        {verRoles && (
          <Filtro
            nombre="rolId"
            etiqueta="Filtrar por rol"
            valor={filtros.rolId}
            alCambiar={(rolId) => alCambiar({ rolId: rolId && Number(rolId) })}
            deshabilitado={fallaron.roles}
            opciones={[
              { valor: TODOS, etiqueta: 'Todos los roles' },
              ...roles.map((rol) => ({ valor: String(rol.id), etiqueta: rol.nombre })),
            ]}
          />
        )}

        {verEstablecimientos && (
          <Filtro
            nombre="establecimientoId"
            etiqueta="Filtrar por establecimiento"
            valor={filtros.establecimientoId}
            alCambiar={(id) => alCambiar({ establecimientoId: id === undefined || id === 'ninguno' ? id : Number(id) })}
            deshabilitado={fallaron.establecimientos}
            opciones={[
              { valor: TODOS, etiqueta: 'Todos los establecimientos' },
              { valor: 'ninguno', etiqueta: 'Sede de la DDRISS' },
              ...establecimientos.map((e) => ({
                valor: String(e.id),
                etiqueta: e.activo ? e.nombre : `${e.nombre} (inactivo)`,
              })),
            ]}
          />
        )}

        <Filtro
          nombre="estado"
          etiqueta="Filtrar por estado"
          valor={filtros.estado}
          alCambiar={(estado) => alCambiar({ estado })}
          opciones={[{ valor: TODOS, etiqueta: 'Todos los estados' }, ...ESTADOS]}
        />

        {hayFiltros && (
          <Button type="button" variant="ghost" onClick={alLimpiar}>
            Limpiar filtros
          </Button>
        )}
      </form>

      {errorCatalogos && (
        <AvisoError onReintentar={reintentarCarga}>No se pudieron cargar los filtros: {errorCatalogos}</AvisoError>
      )}
    </div>
  )
}
