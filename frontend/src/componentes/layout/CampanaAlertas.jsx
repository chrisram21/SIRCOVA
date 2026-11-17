import { useEffect, useState } from 'react'
import { Bell } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EVENTO_ALERTAS_CAMBIARON, listarAlertas } from '@/api/alertas.js'

const etiquetaDe = (activas) =>
  activas === null ? 'Alertas activas' : `Alertas: ${activas.total} ${activas.total === 1 ? 'activa' : 'activas'}`

// Cuenta las activas al montar, al cambiar de ruta y después de atender una. Si la consulta falla, se ve sin insignia.
export default function CampanaAlertas() {
  const { pathname } = useLocation()
  const [activas, setActivas] = useState(null)
  const [cambios, setCambios] = useState(0)

  useEffect(() => {
    const alCambiar = () => setCambios((n) => n + 1)
    window.addEventListener(EVENTO_ALERTAS_CAMBIARON, alCambiar)
    return () => window.removeEventListener(EVENTO_ALERTAS_CAMBIARON, alCambiar)
  }, [])

  useEffect(() => {
    let vigente = true
    listarAlertas({ porPagina: 1 })
      .then((respuesta) => vigente && setActivas(respuesta.activas))
      .catch(() => vigente && setActivas(null))
    return () => {
      vigente = false
    }
  }, [pathname, cambios])

  const total = activas?.total ?? 0
  return (
    <Button variant="ghost" size="icon" className="relative" asChild>
      <Link to="/alertas" aria-label={etiquetaDe(activas)}>
        <Bell aria-hidden="true" />
        {total > 0 && (
          <Badge
            aria-hidden="true"
            variant={activas.porSeveridad.CRITICA > 0 ? 'destructive' : 'secondary'}
            className="absolute -top-1 -right-1 h-4 min-w-4 px-1 text-[0.625rem] tabular-nums"
          >
            {total > 99 ? '99+' : total}
          </Badge>
        )}
      </Link>
    </Button>
  )
}
