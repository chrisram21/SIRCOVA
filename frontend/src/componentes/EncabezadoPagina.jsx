import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'

// Una pantalla que abre otra fuera de su flujo puede pedir que «Volver» regrese a ella: manda en el state del Link
// `regresarA: { ruta, texto, estado }` (estado es el state que recupera al regresar). Sin regresarA, o con una ruta
// que no empieza con "/", vale el destino de siempre de la pantalla.
export function destinoDeVolver(state, ruta, texto) {
  const regresarA = state?.regresarA
  if (typeof regresarA?.ruta !== 'string' || !regresarA.ruta.startsWith('/')) return { ruta, texto, estado: undefined }
  return {
    ruta: regresarA.ruta,
    texto: typeof regresarA.texto === 'string' && regresarA.texto ? regresarA.texto : texto,
    estado: regresarA.estado ?? undefined,
  }
}

// El encabezado común de las pantallas: «Volver» (opcional), antetítulo, título, descripción y acciones a la derecha.
// volverA es el `to` de Link (texto o { pathname, search }); estadoVolver, su `state`.
export default function EncabezadoPagina({
  antetitulo,
  titulo,
  descripcion,
  acciones,
  volverA,
  textoVolver = 'Volver',
  estadoVolver,
}) {
  return (
    <div className="flex flex-col gap-3">
      {volverA && (
        <Button asChild variant="link" className="h-auto self-start p-0 text-enlace">
          <Link to={volverA} state={estadoVolver}>
            <ArrowLeft />
            {textoVolver}
          </Link>
        </Button>
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-1">
          {antetitulo && (
            <p className="flex items-center gap-2 text-xs font-semibold tracking-wider text-enlace uppercase">
              <span aria-hidden="true" className="h-0.5 w-5 rounded-full bg-ring" />
              {antetitulo}
            </p>
          )}
          <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.75rem]">{titulo}</h1>
          {descripcion && <p className="text-sm text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones && <div className="flex flex-wrap items-center gap-2 max-sm:w-full">{acciones}</div>}
      </div>
    </div>
  )
}
