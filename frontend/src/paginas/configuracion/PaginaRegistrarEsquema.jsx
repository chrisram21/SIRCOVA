import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { CircleAlert, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { crearEsquema, listarEsquemas, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import EditorEsquema, { cargarReferencias, PESTANA_ESQUEMAS } from './EditorEsquema.jsx'
import { territorioDe } from './PestanaEsquemas.jsx'

const NO_SE_PUEDE = 'NO_SE_PUEDE'

// Un esquema vacío: todas las dosis activas marcadas, sin desagregación y con una sección por llenar.
function contenidoVacio(dosis) {
  return {
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
    dosis: dosis
      .filter((d) => d.activa)
      .sort((a, b) => a.orden - b.orden)
      .map((d) => ({ codigo: d.codigo, desagregacion: null })),
    desagregacion: [],
    secciones: [{ titulo: '', grupoEdad: null, dosis: [] }],
  }
}

// La copia del vigente sin lo que ya no está activo; quitados dice qué se quitó, para avisarlo.
function contenidoDeCopia(esquema, dosis, dimensiones) {
  const quitados = []
  const anotar = (texto) => !quitados.includes(texto) && quitados.push(texto)
  const dosisActivas = new Set(dosis.filter((d) => d.activa).map((d) => d.codigo))
  const filtrar = (desagregacion) =>
    desagregacion.flatMap(({ dimension, valores, etiqueta }) => {
      const catalogo = dimensiones.find((d) => d.codigo === dimension && d.activa)
      if (!catalogo) {
        anotar(`la dimensión ${dimension}`)
        return []
      }
      const activos = new Set(catalogo.valores.filter((v) => v.activo).map((v) => v.codigo))
      valores.filter((v) => !activos.has(v)).forEach((v) => anotar(`el valor ${v} de ${dimension}`))
      return [{ dimension, valores: valores.filter((v) => activos.has(v)), ...(etiqueta != null && { etiqueta }) }]
    })

  esquema.dosis.filter((d) => !dosisActivas.has(d.codigo)).forEach((d) => anotar(`la dosis ${d.codigo}`))
  const desagregacion = filtrar(esquema.desagregacion)
  const grupos = desagregacion.find((d) => d.dimension === 'grupo_edad')?.valores ?? []
  const contenido = {
    procedencia: esquema.procedencia,
    dosis: esquema.dosis
      .filter((d) => dosisActivas.has(d.codigo))
      .map((d) => ({ codigo: d.codigo, desagregacion: d.desagregacion === null ? null : filtrar(d.desagregacion) })),
    desagregacion,
    secciones: esquema.secciones.map((s) => ({
      titulo: s.titulo,
      grupoEdad: s.grupoEdad !== null && grupos.includes(s.grupoEdad) ? s.grupoEdad : null,
      dosis: s.dosis.filter((d) => dosisActivas.has(d)),
    })),
  }
  return { contenido, quitados }
}

export default function PaginaRegistrarEsquema() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const [parametros] = useSearchParams()
  const volverA = `/configuracion${state?.volverA || PESTANA_ESQUEMAS}`
  const vacunaId = /^\d+$/.test(parametros.get('vacuna') ?? '') ? Number(parametros.get('vacuna')) : null
  const origen = parametros.get('origen')

  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let vigente = true
    async function cargar() {
      if (vacunaId === null || !['copia', 'vacio'].includes(origen)) throw new Error(NO_SE_PUEDE)
      const [{ vacuna, dimensiones }, filas] = await Promise.all([cargarReferencias(vacunaId), listarEsquemas()])
      const fila = filas.find((f) => f.vacuna.id === vacunaId)
      // Una vacuna inactiva, con borrador ya, o una copia sin vigente: el backend respondería 422 o 409.
      if (!vacuna.activa || !fila || fila.borrador || (origen === 'copia' && !fila.vigente)) throw new Error(NO_SE_PUEDE)
      if (origen === 'vacio') {
        return { vacuna, dimensiones, inicial: contenidoVacio(vacuna.dosis), base: null, quitados: [] }
      }
      const base = await obtenerEsquema(fila.vigente.id)
      const { contenido, quitados } = contenidoDeCopia(base, vacuna.dosis, dimensiones)
      return { vacuna, dimensiones, inicial: contenido, base, quitados }
    }
    cargar()
      .then((cargados) => vigente && setDatos(cargados))
      .catch((err) => {
        if (!vigente) return
        const sinRemedio = err.message === NO_SE_PUEDE || (err instanceof ErrorApi && err.status === 404)
        setError(sinRemedio ? NO_SE_PUEDE : err.mensaje ?? 'Ocurrió un error inesperado. Intente de nuevo.')
      })
    return () => {
      vigente = false
    }
  }, [vacunaId, origen])

  async function guardar(contenido) {
    const creado = await crearEsquema({ vacunaId, copiaDe: datos.base?.id ?? null, ...contenido })
    navigate(volverA, { state: { aviso: `Borrador de ${datos.vacuna.nombre} guardado (versión ${creado.version}).` } })
  }

  const { base } = datos ?? {}
  const notaCopia = base
    ? 'Las reglas de validación y los campos adicionales se copian de la base: '
      + `${base.reglas.length} reglas y ${base.camposAdicionales.length} campos adicionales.`
    : null

  return (
    <section className="flex max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Nuevo borrador de esquema</h1>
        <Button type="button" variant="outline" onClick={() => navigate(volverA)}>
          Volver
        </Button>
      </div>

      {error === NO_SE_PUEDE && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>
            <span>
              No se puede crear el borrador de esta vacuna.{' '}
              <Link to={volverA} className="underline">
                Volver a los esquemas
              </Link>
            </span>
          </AlertDescription>
        </Alert>
      )}
      {error && error !== NO_SE_PUEDE && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudo preparar el borrador: {error}</AlertDescription>
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
        <>
          {datos.quitados.length > 0 && (
            <Alert className="border-ring/40 bg-accent text-accent-foreground">
              <TriangleAlert />
              <AlertDescription className="text-accent-foreground">
                Se quitaron de la copia: {datos.quitados.join(', ')}.
              </AlertDescription>
            </Alert>
          )}
          <EditorEsquema
            vacuna={datos.vacuna}
            origen={base ? `Copia de la versión ${base.version} · ${territorioDe(base.territorio)}` : 'Esquema nuevo'}
            notaCopia={notaCopia}
            dosisVacuna={datos.vacuna.dosis}
            dimensiones={datos.dimensiones}
            inicial={datos.inicial}
            onGuardar={guardar}
            volverA={volverA}
          />
        </>
      )}
    </section>
  )
}
