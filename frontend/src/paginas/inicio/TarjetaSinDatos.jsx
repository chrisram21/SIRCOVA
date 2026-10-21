import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function TarjetaSinDatos({ titulo }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">Sin datos todavía</p>
      </CardContent>
    </Card>
  )
}

export function TarjetasSinDatos({ titulos }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {titulos.map((titulo) => (
        <TarjetaSinDatos key={titulo} titulo={titulo} />
      ))}
    </div>
  )
}
