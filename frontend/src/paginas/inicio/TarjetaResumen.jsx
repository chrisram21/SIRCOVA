import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { mensajeDeError } from '@/api/cliente.js'
import { seguirPuntero, useCifraAnimada } from '@/componentes/efectos.js'
import { cn } from '@/lib/utils'

// Pide los datos de una tarjeta al montarla; `reintentar` vuelve a pedirlos.
export function useConsulta(consultar) {
  const [estado, setEstado] = useState({ cargando: true, datos: null, error: null })
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    setEstado({ cargando: true, datos: null, error: null })
    consultar()
      .then((datos) => vigente && setEstado({ cargando: false, datos, error: null }))
      .catch((err) => vigente && setEstado({ cargando: false, datos: null, error: mensajeDeError(err) }))
    return () => {
      vigente = false
    }
  }, [intento])

  return { ...estado, reintentar: () => setIntento((n) => n + 1) }
}

// Las tarjetas de resumen alternan celeste muy claro y gris azulado, como en Main.html.
export const TONOS = ['bg-accent/50', 'bg-secondary']

export const CLASES_TARJETA =
  'foco-luz gap-3 shadow-tarjeta transition-[translate,box-shadow] duration-300 ease-salida hover:-translate-y-0.5 hover:shadow-elevada'

// consulta: lo que devuelve useConsulta; children recibe los datos. enlace: { a, texto }.
export default function TarjetaResumen({ titulo, consulta, enlace, tono = TONOS[0], className, children }) {
  return (
    <Card onPointerMove={seguirPuntero} className={cn(CLASES_TARJETA, tono, className)}>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-muted-foreground">{titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        {consulta.cargando && (
          <div aria-label={`Cargando ${titulo.toLowerCase()}`} className="flex flex-col gap-2">
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}
        {consulta.error && (
          <div className="flex flex-col items-start gap-1 text-sm">
            <p className="text-destructive">{consulta.error}</p>
            <Button variant="link" className="h-auto p-0 text-enlace" onClick={consulta.reintentar}>
              Reintentar
            </Button>
          </div>
        )}
        {consulta.datos !== null && !consulta.error && children(consulta.datos)}
        {enlace && consulta.datos !== null && (
          <Link
            to={enlace.a}
            className="group/enlace mt-auto inline-flex items-center gap-1 self-start text-sm font-medium text-enlace hover:underline"
          >
            {enlace.texto}
            <ArrowRight className="size-4 transition-transform duration-200 group-hover/enlace:translate-x-0.5" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

// La cifra grande de una tarjeta, en IBM Plex Mono, con su contexto al lado.
export function Cifra({ valor, de, children }) {
  const mostrado = useCifraAnimada(valor)
  return (
    <div className="flex flex-col gap-1">
      <p className="font-mono text-3xl font-medium tracking-tight">
        {mostrado}
        {de !== undefined && <span className="font-sans text-base font-normal text-muted-foreground"> de {de}</span>}
      </p>
      {children && <p className="text-sm text-muted-foreground">{children}</p>}
    </div>
  )
}
