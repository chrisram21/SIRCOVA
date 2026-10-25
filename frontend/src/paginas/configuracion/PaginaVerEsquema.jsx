import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import EditorEsquema, { cargarReferencias, contenidoDe, PESTANA_ESQUEMAS } from './EditorEsquema.jsx'
import { ESTADOS, textoPublicacion, textoVigencia } from './PaginaHistorialEsquemas.jsx'
import { territorioDe } from './PestanaEsquemas.jsx'
import VistaPreviaEsquema from './VistaPreviaEsquema.jsx'

const NO_EXISTE = 'NO_EXISTE'

function Dato({ etiqueta, children }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  )
}

// Cualquier versión visible (nacional o de la DDRISS, en cualquier estado), con el editor en solo lectura.
export default function PaginaVerEsquema() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const { tienePermiso } = useSesion()
  const pestana = state?.volverA || PESTANA_ESQUEMAS
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [vistaPrevia, setVistaPrevia] = useState(false)

  useEffect(() => {
    let vigente = true
    async function cargar() {
      const esquema = await obtenerEsquema(id)
      return { esquema, ...(await cargarReferencias(esquema.vacuna.id, { todasLasDimensiones: true })) }
    }
    cargar()
      .then((cargados) => vigente && setDatos(cargados))
      .catch((err) => {
        if (!vigente) return
        setError(err instanceof ErrorApi && err.status === 404 ? NO_EXISTE : (err.mensaje ?? 'Ocurrió un error inesperado.'))
      })
    return () => {
      vigente = false
    }
  }, [id])

  const esquema = datos?.esquema
  const historial = esquema ? `/configuracion/esquemas/historial/${esquema.vacuna.id}` : `/configuracion${pestana}`
  const editable =
    esquema?.estado === 'BORRADOR' && esquema.territorio.nivel === 'DDRISS' && tienePermiso('ESQUEMA_EDITAR')
  const origen = esquema?.basadoEn ? `Basado en la versión ${esquema.basadoEn.version} nacional` : 'Esquema nuevo'

  return (
    <section className="flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">
          {esquema ? `${esquema.vacuna.nombre} · versión ${esquema.version}` : 'Versión del esquema'}
        </h1>
        <div className="flex flex-wrap gap-2">
          {editable && (
            <Button asChild>
              <Link to={`/configuracion/esquemas/${esquema.id}/editar`} state={{ volverA: pestana }}>
                Editar borrador
              </Link>
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => navigate(historial, { state: { volverA: pestana } })}>
            Volver al historial
          </Button>
        </div>
      </div>

      {error === NO_EXISTE && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>
            <span>
              El esquema no existe.{' '}
              <Link to={`/configuracion${pestana}`} className="underline">
                Volver a los esquemas
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      {error && error !== NO_EXISTE && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudo cargar el esquema: {error}</AlertDescription>
        </Alert>
      )}

      {!datos && !error && (
        <Card aria-label="Cargando esquema">
          <CardContent className="flex flex-col gap-2">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {datos && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Versión {esquema.version}</CardTitle>
              <CardDescription>Una versión publicada no se edita: para cambiarla se publica una nueva.</CardDescription>
              <CardAction>
                <Button type="button" variant="outline" onClick={() => setVistaPrevia(true)}>
                  Vista previa
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <Dato etiqueta="Estado">
                  <Badge variant={ESTADOS[esquema.estado].variante}>{ESTADOS[esquema.estado].etiqueta}</Badge>
                </Dato>
                <Dato etiqueta="Territorio">{territorioDe(esquema.territorio)}</Dato>
                <Dato etiqueta="Vigencia">{textoVigencia(esquema.vigencia)}</Dato>
                <Dato etiqueta="Publicada">{textoPublicacion(esquema)}</Dato>
                <Dato etiqueta="Motivo del cambio">{esquema.motivoCambio ?? '—'}</Dato>
                <Dato etiqueta="Origen">{origen}</Dato>
              </dl>
            </CardContent>
          </Card>

          <EditorEsquema
            vacuna={datos.vacuna}
            origen={`Versión ${esquema.version} · ${territorioDe(esquema.territorio)}`}
            dosisVacuna={datos.vacuna.dosis}
            dimensiones={datos.dimensiones}
            inicial={contenidoDe(esquema)}
            volverA={historial}
            soloLectura
          />

          {vistaPrevia && (
            <VistaPreviaEsquema
              abierta
              alCambiarAbierta={setVistaPrevia}
              esquema={esquema}
              contenido={contenidoDe(esquema)}
              vacuna={datos.vacuna}
              dimensiones={datos.dimensiones}
            />
          )}
        </>
      )}
    </section>
  )
}
