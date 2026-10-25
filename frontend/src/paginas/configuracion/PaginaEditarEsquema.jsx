import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { CircleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { editarEsquema, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import EditorEsquema, { cargarReferencias, PESTANA_ESQUEMAS } from './EditorEsquema.jsx'

const NO_EXISTE = 'NO_EXISTE'
const NO_EDITABLE = 'NO_EDITABLE'

// El contenido que arma el editor, como lo guarda el PUT. Lo inactivo se queda: el editor lo marca como problema.
const contenidoDe = (esquema) => ({
  procedencia: esquema.procedencia,
  dosis: esquema.dosis.map(({ codigo, desagregacion }) => ({ codigo, desagregacion })),
  desagregacion: esquema.desagregacion,
  secciones: esquema.secciones.map(({ titulo, grupoEdad, dosis }) => ({ titulo, grupoEdad, dosis })),
})

export default function PaginaEditarEsquema() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const volverA = `/configuracion${state?.volverA || PESTANA_ESQUEMAS}`
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    async function cargar() {
      const esquema = await obtenerEsquema(id)
      // GET solo devuelve los nacionales y los de la DDRISS del usuario: un borrador DDRISS es de la suya.
      if (esquema.estado !== 'BORRADOR' || esquema.territorio.nivel === 'NACIONAL') throw new Error(NO_EDITABLE)
      return { esquema, ...(await cargarReferencias(esquema.vacuna.id)) }
    }
    cargar()
      .then((cargados) => vigente && setDatos(cargados))
      .catch((err) => {
        if (!vigente) return
        if (err.message === NO_EDITABLE) setError(NO_EDITABLE)
        else if (err instanceof ErrorApi && err.status === 404) setError(NO_EXISTE)
        else setError(err.mensaje ?? 'Ocurrió un error inesperado. Intente de nuevo.')
      })
    return () => {
      vigente = false
    }
  }, [id])

  async function guardar(contenido) {
    const guardado = await editarEsquema(id, contenido)
    navigate(volverA, { state: { aviso: `Borrador de ${datos.vacuna.nombre} guardado (versión ${guardado.version}).` } })
  }

  const esquema = datos?.esquema
  const notaCopia = esquema?.basadoEn
    ? `Basado en la versión ${esquema.basadoEn.version} nacional. Las reglas de validación `
      + `(${esquema.reglas.length}) y los campos adicionales (${esquema.camposAdicionales.length}) se copiaron de ella.`
    : null

  return (
    <section className="flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Editar borrador de esquema</h1>
        <Button type="button" variant="outline" onClick={() => navigate(volverA)}>
          Volver
        </Button>
      </div>

      {(error === NO_EXISTE || error === NO_EDITABLE) && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>
            <span>
              {error === NO_EXISTE ? 'El esquema no existe.' : 'Este esquema no se puede editar.'}{' '}
              <Link to={volverA} className="underline">
                Volver a los esquemas
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      {error && error !== NO_EXISTE && error !== NO_EDITABLE && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudo cargar el esquema: {error}</AlertDescription>
        </Alert>
      )}

      {!datos && !error && (
        <Card aria-label="Cargando borrador">
          <CardContent className="flex flex-col gap-2">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
      )}

      {datos && (
        <EditorEsquema
          vacuna={datos.vacuna}
          origen={`Borrador versión ${esquema.version} · ${esquema.territorio.ddrissCodigo}`}
          notaCopia={notaCopia}
          dosisVacuna={datos.vacuna.dosis}
          dimensiones={datos.dimensiones}
          inicial={contenidoDe(esquema)}
          onGuardar={guardar}
          volverA={volverA}
        />
      )}
    </section>
  )
}
