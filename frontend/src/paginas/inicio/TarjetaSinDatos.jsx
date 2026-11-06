import { Hourglass } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { seguirPuntero } from '@/componentes/efectos.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import { cn } from '@/lib/utils'
import { CLASES_TARJETA, TONOS } from './TarjetaResumen.jsx'

export default function TarjetaSinDatos({ titulo, tono = TONOS[0] }) {
  return (
    <Card onPointerMove={seguirPuntero} className={cn(CLASES_TARJETA, tono)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Hourglass className="size-4 opacity-60" aria-hidden="true" />
          Sin datos todavía
        </p>
      </CardContent>
    </Card>
  )
}

// tarjetas: [{ titulo, Datos, permisos, props }]. Una tarjeta con Datos los muestra si el usuario tiene sus permisos;
// sin Datos (todavía no hay endpoint) o sin permisos, queda «Sin datos todavía». props llega a Datos: así varias
// tarjetas comparten una misma consulta.
export function TarjetasDelInicio({ tarjetas }) {
  const { tienePermiso } = useSesion()
  return (
    // Con 3 tarjetas (Autoridad), 3 columnas para que ocupen todo el ancho.
    <div className={cn('escalonado grid gap-4 sm:grid-cols-2', tarjetas.length === 3 ? 'lg:grid-cols-3' : 'xl:grid-cols-4')}>
      {tarjetas.map(({ titulo, Datos, permisos = [], props }, indice) => {
        const tono = TONOS[indice % TONOS.length]
        return Datos && permisos.every(tienePermiso) ? (
          <Datos key={titulo} titulo={titulo} tono={tono} {...props} />
        ) : (
          <TarjetaSinDatos key={titulo} titulo={titulo} tono={tono} />
        )
      })}
    </div>
  )
}
