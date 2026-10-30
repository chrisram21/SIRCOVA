import { Badge } from '@/components/ui/badge'

// Lo que comparten la lista de reglas y su historial (aparte, para que no se importen entre sí).

export const territorioDeRegla = (territorio) =>
  territorio.nivel === 'NACIONAL' ? 'Nacional' : territorio.ddrissCodigo

export const vacunasDeRegla = (vacunas) => (vacunas[0] === '*' ? 'Todas' : vacunas.join(', '))

export function InsigniaSeveridad({ severidad }) {
  if (severidad === 'ERROR') return <Badge variant="destructive">Error</Badge>
  return <Badge className="bg-advertencia text-advertencia-foreground">Advertencia</Badge>
}
