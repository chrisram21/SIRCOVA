import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { editarEsquema, listarEsquemas, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoPublicarEsquema, { avisoDePublicacion } from './DialogoPublicarEsquema.jsx'
import EditorEsquema, { cargarReferencias, contenidoDe, RUTA_ESQUEMAS } from './EditorEsquema.jsx'
import VistaPreviaEsquema from './VistaPreviaEsquema.jsx'

const NO_EXISTE = 'NO_EXISTE'
const NO_EDITABLE = 'NO_EDITABLE'

export default function PaginaEditarEsquema() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { state } = useLocation()
  const { tienePermiso } = useSesion()
  // El diálogo de publicar elige el mes en el calendario de periodos.
  const puedePublicar = tienePermiso('ESQUEMA_PUBLICAR') && tienePermiso('PERIODO_CONSULTAR')
  const volverA = `${RUTA_ESQUEMAS}${state?.volverA ?? ''}`
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  // La fila de la vacuna en GET /esquemas-captura (con su vigente que aplica), mientras el diálogo está abierto.
  const [porPublicar, setPorPublicar] = useState(null)
  // { contenido, problemas } del editor mientras la vista previa está abierta.
  const [vistaPrevia, setVistaPrevia] = useState(null)
  // Cada «Reintentar» sube este número y vuelve a cargar.
  const [intentoCarga, setIntentoCarga] = useState(0)
  // Lo informa el editor; tras guardar o publicar se sale en un efecto, cuando el aviso ya no bloquea.
  const [hayCambios, setHayCambios] = useState(false)
  const [terminado, setTerminado] = useState(false)
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios && !terminado)

  useEffect(() => {
    if (terminado) navigate(volverA)
  }, [terminado, navigate, volverA])

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
        else setError(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [id, intentoCarga])

  function reintentarCarga() {
    setError(null)
    setIntentoCarga((n) => n + 1)
  }

  async function guardar(contenido) {
    const guardado = await editarEsquema(id, contenido)
    toast.success(`Borrador de ${datos.vacuna.nombre} guardado (versión ${guardado.version}).`)
    setTerminado(true)
  }

  // Con cambios, primero los guarda: si falla, el editor muestra el error y el diálogo no se abre.
  async function prepararPublicacion(contenido) {
    if (contenido) await editarEsquema(id, contenido)
    const fila = (await listarEsquemas()).find((f) => f.vacuna.id === datos.esquema.vacuna.id)
    setPorPublicar(fila)
  }

  function alPublicar(publicado) {
    toast.success(avisoDePublicacion(publicado))
    setTerminado(true)
  }

  const esquema = datos?.esquema
  const notaCopia = esquema?.basadoEn
    ? `Basado en la versión ${esquema.basadoEn.version} nacional. Las reglas de validación `
      + `(${esquema.reglas.length}) y los campos adicionales (${esquema.camposAdicionales.length}) se copiaron de ella.`
    : null

  return (
    <section className="flex max-w-5xl flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Administración" titulo="Editar borrador de esquema" volverA={volverA} />

      {(error === NO_EXISTE || error === NO_EDITABLE) && (
        <AvisoError>
          <span>
            {error === NO_EXISTE ? 'El esquema no existe.' : 'Este esquema no se puede editar.'}{' '}
            <Link to={volverA} className="underline">
              Volver a los esquemas
            </Link>
          </span>
        </AvisoError>
      )}
      {error && error !== NO_EXISTE && error !== NO_EDITABLE && (
        <AvisoError onReintentar={reintentarCarga}>No se pudo cargar el esquema: {error}</AvisoError>
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
          onPublicar={puedePublicar ? prepararPublicacion : undefined}
          onVistaPrevia={(contenido, problemas) => setVistaPrevia({ contenido, problemas })}
          onCambios={setHayCambios}
          volverA={volverA}
        />
      )}

      {vistaPrevia && (
        <VistaPreviaEsquema
          abierta
          alCambiarAbierta={(abierta) => !abierta && setVistaPrevia(null)}
          esquema={esquema}
          contenido={vistaPrevia.contenido}
          vacuna={datos.vacuna}
          dimensiones={datos.dimensiones}
          problemas={vistaPrevia.problemas}
        />
      )}

      {porPublicar && (
        <DialogoPublicarEsquema
          vacuna={porPublicar.vacuna}
          borrador={{ id: esquema.id, version: esquema.version }}
          vigente={porPublicar.vigente}
          alPublicar={alPublicar}
          alCerrar={() => setPorPublicar(null)}
        />
      )}

      <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Si sale ahora, se pierden los cambios del borrador." />
    </section>
  )
}
