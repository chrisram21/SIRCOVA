import { ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { MESES } from '@/lib/fechas.js'
import { MAXIMO_PERIODOS, claveDelMes } from './comparacionPeriodos.js'

// SPEC 51: los años (o los meses de cada año) con corrida vigente, de 2 a 5. Con cinco elegidos, el resto se
// deshabilita.

const conMayuscula = (texto) => texto[0].toUpperCase() + texto.slice(1)

function Opcion({ marcado, lleno, alCambiar, children }) {
  return (
    <DropdownMenuCheckboxItem
      checked={marcado}
      disabled={!marcado && lleno}
      onCheckedChange={alCambiar}
      // El menú queda abierto para marcar varios.
      onSelect={(evento) => evento.preventDefault()}
    >
      {children}
    </DropdownMenuCheckboxItem>
  )
}

export default function SelectorPeriodos({ modo, calculados, anios, meses, alCambiarAnios, alCambiarMeses }) {
  const elegidos = modo === 'anio' ? anios.length : meses.length
  const lleno = elegidos >= MAXIMO_PERIODOS
  const texto = `${elegidos} ${modo === 'anio' ? (elegidos === 1 ? 'año' : 'años') : (elegidos === 1 ? 'mes' : 'meses')}`
  const claves = new Set(meses.map(claveDelMes))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" aria-label="Periodos a comparar" className="w-full justify-between bg-card font-normal sm:w-44">
          <span className="truncate">{texto}</span>
          <ChevronDown className="opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-80 w-56 overflow-y-auto">
        {modo === 'anio'
          ? calculados.map(({ anio }) => (
            <Opcion
              key={anio}
              marcado={anios.includes(anio)}
              lleno={lleno}
              alCambiar={(marcado) => alCambiarAnios(marcado ? [...anios, anio] : anios.filter((a) => a !== anio))}
            >
              {anio}
            </Opcion>
          ))
          : calculados.map(({ anio, meses: delAnio }, i) => (
            <div key={anio} role="group" aria-label={String(anio)}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{anio}</DropdownMenuLabel>
              {delAnio.map((mes) => {
                const periodo = { anio, mes }
                const marcado = claves.has(claveDelMes(periodo))
                return (
                  <Opcion
                    key={mes}
                    marcado={marcado}
                    lleno={lleno}
                    alCambiar={(marcar) => alCambiarMeses(marcar
                      ? [...meses, periodo]
                      : meses.filter((p) => claveDelMes(p) !== claveDelMes(periodo)))}
                  >
                    {conMayuscula(MESES[mes - 1])} {anio}
                  </Opcion>
                )
              })}
            </div>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
