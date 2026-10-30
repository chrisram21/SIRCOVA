import { useEffect, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import EditorEsquema, { cargarReferencias, contenidoDe, RUTA_ESQUEMAS } from './EditorEsquema.jsx'
import { ESTADOS, textoPublicacion, textoVigencia } from './PaginaHistorialEsquemas.jsx'
import { territorioDe } from './PaginaEsquemas.jsx'
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
  const { state } = useLocation()
  const { tienePermiso } = useSesion()
  // Los filtros de la lista de esquemas, que viajan al historial y de vuelta.
  const filtros = state?.volverA ?? ''
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [vistaPrevia, setVistaPrevia] = useState(false)
  // Cada «Reintentar» sube este número y vuelve a cargar.
  const [intentoCarga, setIntentoCarga] = useState(0)

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
        setError(err instanceof ErrorApi && err.status === 404 ? NO_EXISTE : mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [id, intentoCarga])

  function reintentarCarga() {
    setError(null)
    setIntentoCarga((n) => n + 1)
  }

  const esquema = datos?.esquema
  const historial = esquema ? `/administracion/esquemas/historial/${esquema.vacuna.id}` : `${RUTA_ESQUEMAS}${filtros}`
  const editable =
    esquema?.estado === 'BORRADOR' && esquema.territorio.nivel === 'DDRISS' && tienePermiso('ESQUEMA_EDITAR')
  const origen = esquema?.basadoEn ? `Basado en la versión ${esquema.basadoEn.version} nacional` : 'Esquema nuevo'

  return (
    <section className="flex max-w-5xl flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Administración"
        titulo={esquema ? `${esquema.vacuna.nombre} · versión ${esquema.version}` : 'Versión del esquema'}
        volverA={historial}
        estadoVolver={{ volverA: filtros }}
        textoVolver={esquema ? 'Volver al historial' : 'Volver'}
        acciones={
          editable && (
            <Button asChild>
              <Link to={`/administracion/esquemas/${esquema.id}/editar`} state={{ volverA: filtros }}>
                Editar borrador
              </Link>
            </Button>
          )
        }
      />

      {error === NO_EXISTE && (
        <AvisoError>
          <span>
            El esquema no existe.{' '}
            <Link to={`${RUTA_ESQUEMAS}${filtros}`} className="underline">
              Volver a los esquemas
            </Link>
          </span>
        </AvisoError>
      )}
      {error && error !== NO_EXISTE && (
        <AvisoError onReintentar={reintentarCarga}>No se pudo cargar el esquema: {error}</AvisoError>
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
