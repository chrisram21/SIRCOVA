import { TriangleAlert } from 'lucide-react'
import { cn } from '@/lib/utils'

// SPEC 52 (HU-44): una cobertura mayor al 100 % (mayorACien, calculado por la API) pide revisar la población
// (denominador) o los registros. La marca y el aviso usan estos textos en «Indicadores» y en el mapa.

export const TEXTO_MAYOR_A_CIEN = 'Mayor al 100 %: revise la población (denominador) o los registros.'

const nombreDe = (r) => (r.municipio === null ? 'Total de la DDRISS' : r.municipio.nombre)

export function MarcaMayorACien({ className }) {
  return (
    <TriangleAlert
      role="img"
      aria-label={TEXTO_MAYOR_A_CIEN}
      className={cn('inline size-4 shrink-0 align-text-bottom text-advertencia-foreground', className)}
    >
      <title>{TEXTO_MAYOR_A_CIEN}</title>
    </TriangleAlert>
  )
}

// El texto del aviso, o null si ninguna fila está marcada. Nombra la DDRISS primero y luego los municipios.
export function textoDelAviso(resultados) {
  const marcadas = resultados.filter((r) => r.mayorACien)
  if (marcadas.length === 0) return null
  const ordenadas = [
    ...marcadas.filter((r) => r.municipio === null),
    ...marcadas.filter((r) => r.municipio !== null).sort((a, b) => nombreDe(a).localeCompare(nombreDe(b), 'es')),
  ]
  const cuantos = marcadas.filter((r) => r.municipio !== null).length
  const sujeto = cuantos === marcadas.length
    ? `${cuantos} ${cuantos === 1 ? 'municipio' : 'municipios'} con cobertura mayor al 100 %`
    : 'Cobertura mayor al 100 %'
  return `${sujeto}: ${ordenadas.map(nombreDe).join(', ')}. Revise la población (denominador) o los registros.`
}

export function AvisoMayorACien({ resultados }) {
  const texto = textoDelAviso(resultados)
  if (!texto) return null
  return (
    <p role="status" className="flex items-start gap-2 rounded-md bg-advertencia px-3 py-2 text-sm text-advertencia-foreground">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {texto}
    </p>
  )
}
