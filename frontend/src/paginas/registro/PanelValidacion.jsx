import { CircleAlert, RotateCw, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { AvisoError, AvisoExito } from '@/componentes/Avisos.jsx'
import { cn } from '@/lib/utils'

const formatoHora = new Intl.DateTimeFormat('es-GT', { timeZone: 'America/Guatemala', hour: '2-digit', minute: '2-digit' })

const SEVERIDADES = {
  ERROR: {
    titulo: 'Error · impide enviar',
    Icono: CircleAlert,
    clases: 'border-destructive/20 bg-destructive/10 text-destructive',
  },
  ADVERTENCIA: {
    titulo: 'Advertencia',
    Icono: TriangleAlert,
    clases: 'border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground',
  },
}

// Un resultado lleva a su pestaña y a su primera casilla (o campo adicional), si tiene alguna.
export const llevaACasilla = (resultado) =>
  resultado.vacuna !== null && (resultado.celdas.length > 0 || resultado.campos.length > 0)

function Resultado({ resultado, alElegir }) {
  const { titulo, Icono, clases } = SEVERIDADES[resultado.severidad]
  const ubicacion = [resultado.vacuna?.nombre, resultado.dosis?.etiqueta].filter(Boolean).join(' · ')
  const { regla } = resultado
  const contenido = (
    <Alert className={cn(clases, llevaACasilla(resultado) && 'transition-colors hover:brightness-95')}>
      <Icono />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription className="text-current">
        <p>{resultado.mensaje}</p>
        {ubicacion && <p className="font-medium">{ubicacion}</p>}
        <p className="text-xs opacity-80">
          Regla {regla.nombre} · {regla.codigo} v{regla.version}
        </p>
      </AlertDescription>
    </Alert>
  )
  if (!llevaACasilla(resultado)) return <li>{contenido}</li>
  return (
    <li>
      <button
        type="button"
        className="w-full rounded-lg text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        onClick={() => alElegir(resultado)}
      >
        {contenido}
      </button>
    </li>
  )
}

// validacion: la respuesta de POST /reportes/{id}/validar, o null mientras el Personal no ha validado: la primera
// validación la pide él con el botón.
export default function PanelValidacion({ validacion, validando, error, conCambios, alValidar, alElegir, className }) {
  const errores = validacion?.resultados.filter((r) => r.severidad === 'ERROR') ?? []
  const advertencias = validacion?.resultados.filter((r) => r.severidad === 'ADVERTENCIA') ?? []

  return (
    <Card className={className} aria-labelledby="titulo-validacion">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle id="titulo-validacion">Validación automática</CardTitle>
          {validacion && (
            <p className="text-xs text-muted-foreground">
              Validada a las {formatoHora.format(new Date(validacion.validadoEn))}
            </p>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={alValidar} disabled={validando}>
          <RotateCw className={cn(validando && 'animate-spin motion-reduce:animate-none')} />
          {validando ? 'Validando…' : validacion ? 'Validar de nuevo' : 'Validar reporte'}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {conCambios && validacion && (
          <p className="rounded-md border border-advertencia-foreground/20 bg-advertencia px-3 py-2 text-sm text-advertencia-foreground">
            Los resultados son de lo guardado. Guarde el borrador para validar los cambios.
          </p>
        )}

        {error && <AvisoError onReintentar={alValidar}>{error}</AvisoError>}

        {!validacion && !error && validando && (
          <div className="flex flex-col gap-2" aria-label="Cargando la validación">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {!validacion && !error && !validando && (
          <p className="text-sm text-muted-foreground">
            Cuando termine de capturar, guarde el borrador y use «Validar reporte» para revisar lo guardado con las
            reglas de la DDRISS.
          </p>
        )}

        {validacion && (
          <>
            {errores.length === 0 && <AvisoExito tono="verde">Sin errores</AvisoExito>}
            {validacion.resultados.length > 0 && (
              <ul className="flex flex-col gap-2" aria-label="Resultados de la validación">
                {[...errores, ...advertencias].map((resultado) => (
                  <Resultado key={resultado.id} resultado={resultado} alElegir={alElegir} />
                ))}
              </ul>
            )}
            {validacion.corregidos > 0 && (
              <p className="text-sm text-muted-foreground">
                {validacion.corregidos} resultados corregidos desde la última validación.
              </p>
            )}
          </>
        )}

        <p className="text-xs text-muted-foreground">
          Corrija los errores para poder enviar. Las advertencias no bloquean el envío.
        </p>
      </CardContent>
    </Card>
  )
}
