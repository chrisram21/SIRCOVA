import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import SelectorConBusqueda from '@/componentes/SelectorConBusqueda.jsx'
import { cn } from '@/lib/utils'
import {
  ETIQUETAS_MODULO,
  chipsDe,
  etiquetaAccion,
  etiquetaEntidad,
  etiquetaModulo,
} from './auditoria.js'

// Radix Select no acepta '' como valor de una opción; "todos" equivale a no filtrar.
const TODOS = 'todos'

const borradorDe = (filtros) => ({
  desde: filtros.desde ?? '',
  hasta: filtros.hasta ?? '',
  usuario: filtros.usuario ? String(filtros.usuario) : TODOS,
  modulo: filtros.modulo ?? TODOS,
  accion: filtros.accion ?? TODOS,
  entidad: filtros.entidad ?? TODOS,
  entidadId: filtros.entidadId ?? '',
})

const sinTodos = (valor) => (valor === TODOS || valor === '' ? undefined : valor)

// La lista de opciones más el valor elegido, si no está (un valor antiguo, o varias entidades desde el Inicio).
const conElegido = (lista, elegido) =>
  elegido && elegido !== TODOS && !lista.includes(elegido) ? [...lista, elegido] : lista

// Las listas largas (acciones y elementos) van por su nombre en español, no por el código.
const porTexto = (opciones) => [...opciones].sort((a, b) => a.texto.localeCompare(b.texto, 'es'))

function Campo({ id, texto, children }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {texto}
      </label>
      {children}
    </div>
  )
}

function SelectorSimple({ id, nombre, valor, alCambiar, todos, opciones }) {
  return (
    <Select name={nombre} value={valor} onValueChange={alCambiar}>
      <SelectTrigger id={id} className="w-full bg-card">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{todos}</SelectItem>
        {opciones.map((o) => (
          <SelectItem key={o.valor} value={o.valor}>
            {o.texto}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/**
 * Los filtros se editan en un borrador y solo «Aplicar» los pasa a la URL (alAplicar). Los chips, los accesos rápidos
 * y «Limpiar» cambian la URL directamente. opciones: las de GET /auditoria/bitacora/opciones, o null mientras cargan.
 */
export default function BarraFiltrosAuditoria({ filtros, opciones, alAplicar, alLimpiar, accesosRapidos }) {
  const [borrador, setBorrador] = useState(() => borradorDe(filtros))
  const [errorFechas, setErrorFechas] = useState(null)
  const clave = JSON.stringify(borradorDe(filtros))

  // Al cambiar la URL (aplicar, un chip, un acceso rápido o «Volver»), el borrador vuelve a ser lo aplicado.
  useEffect(() => {
    setBorrador(JSON.parse(clave))
    setErrorFechas(null)
  }, [clave])

  const cambiar = (cambios) => setBorrador((actual) => ({ ...actual, ...cambios }))

  function aplicar(evento) {
    evento.preventDefault()
    if (borrador.desde && borrador.hasta && borrador.desde > borrador.hasta) {
      setErrorFechas('La fecha desde no puede ser posterior a la fecha hasta.')
      return
    }
    alAplicar({
      desde: borrador.desde || undefined,
      hasta: borrador.hasta || undefined,
      usuario: sinTodos(borrador.usuario) && Number(borrador.usuario),
      modulo: sinTodos(borrador.modulo),
      accion: sinTodos(borrador.accion),
      entidad: sinTodos(borrador.entidad),
      entidadId: borrador.entidadId.trim() || undefined,
    })
  }

  const usuarios = opciones?.usuarios ?? []
  const opcionesUsuario = [
    { valor: TODOS, texto: 'Todos los usuarios', fija: true },
    ...usuarios.map((u) => ({
      valor: String(u.id),
      texto: u.activo ? u.nombre : `${u.nombre} (inactivo)`,
      detalle: `${u.nombreUsuario} · ${u.rol.nombre}`,
    })),
  ]
  const modulos = opciones?.modulos ?? Object.keys(ETIQUETAS_MODULO)
  const acciones = conElegido(opciones?.acciones ?? [], borrador.accion)
  const entidades = conElegido(opciones?.entidades ?? [], borrador.entidad)
  const chips = chipsDe(filtros, usuarios)

  return (
    <div className="flex flex-col gap-4 rounded-lg border bg-card p-4">
      {/* Dentro de un form, Radix agrega el <select> nativo de cada Select. */}
      <form role="search" aria-label="Filtros de la bitácora" className="flex flex-col gap-4" onSubmit={aplicar}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Campo id="filtro-desde" texto="Desde">
            <Input
              id="filtro-desde"
              type="date"
              className="bg-card"
              value={borrador.desde}
              aria-invalid={Boolean(errorFechas) || undefined}
              onChange={(evento) => cambiar({ desde: evento.target.value })}
            />
          </Campo>
          <Campo id="filtro-hasta" texto="Hasta">
            <Input
              id="filtro-hasta"
              type="date"
              className="bg-card"
              value={borrador.hasta}
              aria-invalid={Boolean(errorFechas) || undefined}
              onChange={(evento) => cambiar({ hasta: evento.target.value })}
            />
          </Campo>
          <Campo id="filtro-usuario" texto="Usuario">
            <SelectorConBusqueda
              id="filtro-usuario"
              etiqueta="Usuario"
              valor={borrador.usuario}
              alCambiar={(usuario) => cambiar({ usuario })}
              opciones={opcionesUsuario}
              textoBuscar="Buscar por nombre o usuario…"
              textoVacio="Ningún usuario coincide."
            />
          </Campo>
          <Campo id="filtro-modulo" texto="Módulo">
            <SelectorSimple
              id="filtro-modulo"
              nombre="modulo"
              valor={borrador.modulo}
              alCambiar={(modulo) => cambiar({ modulo })}
              todos="Todos los módulos"
              opciones={modulos.map((m) => ({ valor: m, texto: etiquetaModulo(m) }))}
            />
          </Campo>
          <Campo id="filtro-accion" texto="Tipo de acción">
            <SelectorSimple
              id="filtro-accion"
              nombre="accion"
              valor={borrador.accion}
              alCambiar={(accion) => cambiar({ accion })}
              todos="Todas las acciones"
              opciones={porTexto(acciones.map((a) => ({ valor: a, texto: etiquetaAccion(a) })))}
            />
          </Campo>
          <Campo id="filtro-entidad" texto="Elemento afectado">
            <SelectorSimple
              id="filtro-entidad"
              nombre="entidad"
              valor={borrador.entidad}
              alCambiar={(entidad) => cambiar({ entidad })}
              todos="Todos los elementos"
              opciones={porTexto(
                entidades.map((e) => ({ valor: e, texto: e.split(',').map(etiquetaEntidad).join(', ') })),
              )}
            />
          </Campo>
          <Campo id="filtro-entidad-id" texto="Id del elemento">
            <Input
              id="filtro-entidad-id"
              className="bg-card"
              maxLength={40}
              placeholder="Por ejemplo, 255"
              value={borrador.entidadId}
              onChange={(evento) => cambiar({ entidadId: evento.target.value })}
            />
          </Campo>
          <div className="flex items-end gap-2">
            <Button type="submit">Aplicar</Button>
            <Button type="button" variant="outline" onClick={alLimpiar}>
              Limpiar
            </Button>
          </div>
        </div>
        {errorFechas && (
          <p role="alert" className="text-sm text-destructive">
            {errorFechas}
          </p>
        )}
      </form>

      <div className="flex flex-col gap-3 border-t pt-3 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Filtros activos:</span>
          {chips.length === 0 ? (
            <span>Ninguno (todo el historial)</span>
          ) : (
            chips.map((chip) => (
              <span
                key={chip.clave}
                className={cn(
                  'inline-flex min-h-7 items-center gap-1 rounded-2xl bg-accent py-0.5 pr-1 pl-3',
                  'text-accent-foreground',
                )}
              >
                <span>{chip.texto}</span>
                <button
                  type="button"
                  className="inline-flex size-5 items-center justify-center rounded-full hover:bg-background/60"
                  aria-label={`Quitar ${chip.texto}`}
                  onClick={() => alAplicar({ ...filtros, ...chip.quitar })}
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Accesos rápidos:</span>
          {accesosRapidos.map((acceso) => (
            <Button key={acceso.texto} type="button" variant="outline" size="sm" onClick={acceso.alElegir}>
              {acceso.texto}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
