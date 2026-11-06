import { useSearchParams } from 'react-router-dom'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { listarDdriss } from '@/api/catalogos.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { cargarIndicadoresDelInicio } from '../indicadoresDelInicio.js'
import {
  LineaDeCorte,
  TarjetaIndicadoresClave,
  TarjetaProyeccion,
  TarjetaRanking,
  enlaceAIndicadores,
} from '../ResumenIndicadores.jsx'
import { useConsulta } from '../TarjetaResumen.jsx'
import { TarjetasDelInicio } from '../TarjetaSinDatos.jsx'

const SIN_INDICADORES = { cargando: false, error: null, datos: { indicadores: null }, reintentar: () => {} }

// La Autoridad nacional (sin DDRISS) elige la DDRISS en la URL (?ddriss=); por defecto, la primera activa.
function useDdrissDelResumen(nacional) {
  const [parametros, setParametros] = useSearchParams()
  const lista = useConsulta(listarDdriss, { activa: nacional })
  const activas = (lista.datos ?? []).filter((d) => d.activo !== false)
  const pedida = Number(parametros.get('ddriss'))
  const elegida = activas.find((d) => d.id === pedida) ?? activas[0] ?? null
  function elegir(id) {
    const siguientes = new URLSearchParams(parametros)
    siguientes.set('ddriss', id)
    setParametros(siguientes, { replace: true })
  }
  return { lista, activas, elegida, elegir }
}

export default function InicioAutoridad() {
  const { sesion, tienePermiso } = useSesion()
  const { usuario } = sesion
  const nacional = usuario.rol === 'AUTORIDAD' && (usuario.empleado?.ddrissId ?? null) === null
  const ddriss = useDdrissDelResumen(nacional)
  const ddrissId = nacional ? ddriss.elegida?.id : undefined

  const indicadores = useConsulta(async () => ({ indicadores: await cargarIndicadoresDelInicio({ ddrissId }) }), {
    activa: tienePermiso('INDICADOR_CONSULTAR') && (!nacional || ddrissId !== undefined),
    clave: ddrissId,
  })
  // La nacional depende primero de la lista de DDRISS: su error o su lista vacía se ven en las tarjetas.
  let consulta = indicadores
  if (nacional && (ddriss.lista.cargando || ddriss.lista.error)) consulta = ddriss.lista
  else if (nacional && !ddriss.elegida) consulta = SIN_INDICADORES
  const props = { consulta, enlace: enlaceAIndicadores(indicadores, ddrissId) }

  const tarjetas = [
    { titulo: 'Indicadores clave', Datos: TarjetaIndicadoresClave, permisos: ['INDICADOR_CONSULTAR'], props },
    { titulo: 'Avance y proyección', Datos: TarjetaProyeccion, permisos: ['INDICADOR_CONSULTAR'], props },
    { titulo: 'Ranking de municipios', Datos: TarjetaRanking, permisos: ['INDICADOR_CONSULTAR'], props },
  ]

  return (
    <>
      <LineaDeCorte consulta={indicadores}>
        {nacional && ddriss.activas.length === 1 && ddriss.elegida.nombre}
      </LineaDeCorte>
      {nacional && ddriss.activas.length > 1 && (
        // Dentro de un form, Radix agrega el <select> nativo del Select.
        <form className="flex" onSubmit={(evento) => evento.preventDefault()}>
          <Select name="ddriss" value={String(ddriss.elegida.id)} onValueChange={ddriss.elegir}>
            <SelectTrigger aria-label="DDRISS" className="w-full bg-card sm:w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ddriss.activas.map((d) => (
                <SelectItem key={d.id} value={String(d.id)}>
                  {d.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </form>
      )}
      <TarjetasDelInicio tarjetas={tarjetas} />
    </>
  )
}
