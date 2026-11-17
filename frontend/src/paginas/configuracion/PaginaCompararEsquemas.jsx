import { Fragment, useEffect, useRef, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { historialEsquemas, listarDimensiones, obtenerEsquema } from '@/api/configuracion.js'
import { ErrorApi, mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { GRUPOS, compararEsquemas, versionAnterior } from './compararEsquemas.js'
import { RUTA_ESQUEMAS } from './EditorEsquema.jsx'
import { ESTADOS, textoPublicacion, textoVigencia } from './PaginaHistorialEsquemas.jsx'
import { territorioDe } from './PaginaEsquemas.jsx'

const NO_EXISTE = 'NO_EXISTE'

const TIPOS = {
  agregado: { etiqueta: 'Agregado', clase: 'border-transparent bg-exito text-exito-foreground' },
  quitado: { etiqueta: 'Quitado', variante: 'destructive' },
  cambiado: { etiqueta: 'Cambiado', clase: 'border-transparent bg-advertencia text-advertencia-foreground' },
}

const textoVersion = (v) => `v${v.version} · ${territorioDe(v.territorio)} · ${ESTADOS[v.estado].etiqueta}`

// Qué versiones se comparan: las de la URL o, si faltan, la más reciente y su anterior.
function elegidas(versiones, parametros) {
  const b = parametros.get('b') ?? versiones[0]?.id ?? null
  const a = parametros.get('a') ?? (b ? versionAnterior(versiones, b)?.id ?? null : null)
  return { a, b }
}

function SelectorVersion({ nombre, etiqueta, valor, versiones, excluida, alCambiar }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <Label htmlFor={`version-${nombre}`}>{etiqueta}</Label>
      <Select name={nombre} value={valor ?? ''} onValueChange={alCambiar}>
        <SelectTrigger id={`version-${nombre}`} aria-label={etiqueta} className="w-full bg-card">
          <SelectValue placeholder="Elija una versión" />
        </SelectTrigger>
        <SelectContent>
          {versiones
            .filter((v) => v.id !== excluida)
            .map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {textoVersion(v)}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function DatosVersion({ titulo, version }) {
  const filas = [
    ['Versión', version.version],
    ['Territorio', territorioDe(version.territorio)],
    ['Estado', <Badge variant={ESTADOS[version.estado].variante}>{ESTADOS[version.estado].etiqueta}</Badge>],
    ['Vigencia', textoVigencia(version.vigencia)],
    ['Publicada', textoPublicacion(version)],
    ['Motivo', version.motivoCambio ?? '—'],
  ]
  return (
    <Card role="region" className="min-w-0 flex-1" aria-label={titulo}>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          {filas.map(([nombre, valor]) => (
            <Fragment key={nombre}>
              <dt className="text-muted-foreground">{nombre}</dt>
              <dd className="min-w-0 break-words">{valor}</dd>
            </Fragment>
          ))}
        </dl>
      </CardContent>
    </Card>
  )
}

function ListaDiferencias({ diferencias }) {
  if (diferencias.length === 0) return <p className="text-muted-foreground">Las dos versiones capturan lo mismo.</p>
  return (
    <div className="flex flex-col gap-6">
      {GRUPOS.filter((g) => diferencias.some((d) => d.grupo === g.codigo)).map((grupo) => (
        <section key={grupo.codigo} aria-labelledby={`grupo-${grupo.codigo}`} className="flex flex-col gap-2">
          <h3 id={`grupo-${grupo.codigo}`} className="font-heading text-sm font-semibold">
            {grupo.titulo}
          </h3>
          <ul className="flex flex-col divide-y rounded-lg border">
            {diferencias
              .filter((d) => d.grupo === grupo.codigo)
              .map((d) => {
                const tipo = TIPOS[d.tipo]
                return (
                  <li key={`${d.tipo}-${d.etiqueta}`} className="flex flex-col gap-1.5 p-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex shrink-0 items-center gap-2 sm:w-64">
                      <Badge variant={tipo.variante} className={tipo.clase}>
                        {tipo.etiqueta}
                      </Badge>
                      <span className="min-w-0 font-medium break-words">{d.etiqueta}</span>
                    </div>
                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm">
                      {d.antes !== undefined && <span className="break-words text-muted-foreground">{d.antes}</span>}
                      {d.antes !== undefined && d.despues !== undefined && (
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-label="a" />
                      )}
                      {d.despues !== undefined && <span className="break-words">{d.despues}</span>}
                    </div>
                  </li>
                )
              })}
          </ul>
        </section>
      ))}
    </div>
  )
}

export default function PaginaCompararEsquemas() {
  const { vacunaId } = useParams()
  const { state } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  // Los filtros de la lista de esquemas: el historial los necesita para su propio «Volver».
  const filtros = state?.volverA ?? ''
  const rutaHistorial = `${RUTA_ESQUEMAS}/historial/${vacunaId}`
  const [base, setBase] = useState(null)
  const [errorBase, setErrorBase] = useState(null)
  const [par, setPar] = useState(null)
  const [errorPar, setErrorPar] = useState(null)
  const cargaBase = useRef(0)
  const cargaPar = useRef(0)

  function cargar() {
    const carga = ++cargaBase.current
    setBase(null)
    setErrorBase(null)
    Promise.all([historialEsquemas(vacunaId), listarDimensiones()])
      .then(([historial, dimensiones]) => {
        if (carga === cargaBase.current) setBase({ historial, dimensiones })
      })
      .catch((err) => {
        if (carga !== cargaBase.current) return
        setErrorBase(err instanceof ErrorApi && err.status === 404 ? NO_EXISTE : mensajeDeError(err))
      })
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaBase.current += 1
    }
  }, [vacunaId])

  const versiones = base?.historial.versiones ?? []
  const { a, b } = elegidas(versiones, parametros)
  const ajenas = base && [a, b].some((id) => id && !versiones.some((v) => v.id === id))
  const listas = base && !ajenas && a && b && a !== b

  function cargarPar() {
    const carga = ++cargaPar.current
    setPar(null)
    setErrorPar(null)
    Promise.all([obtenerEsquema(a), obtenerEsquema(b)])
      .then(([desde, hasta]) => {
        if (carga === cargaPar.current) setPar({ desde, hasta })
      })
      .catch((err) => {
        if (carga === cargaPar.current) setErrorPar(mensajeDeError(err))
      })
  }

  useEffect(() => {
    if (!listas) return undefined
    cargarPar()
    return () => {
      cargaPar.current += 1
    }
  }, [listas, a, b])

  function elegir(nombre, id) {
    const siguientes = new URLSearchParams(parametros)
    siguientes.set('a', nombre === 'a' ? id : a ?? '')
    siguientes.set('b', nombre === 'b' ? id : b ?? '')
    if (!siguientes.get('a')) siguientes.delete('a')
    setParametros(siguientes, { replace: true, state })
  }

  const vacuna = base?.historial.vacuna

  return (
    <section className="flex max-w-6xl flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Administración"
        titulo="Comparar versiones"
        descripcion={vacuna && `Esquema de captura de ${vacuna.nombre}`}
        volverA={rutaHistorial}
        textoVolver="Volver al historial"
        estadoVolver={{ volverA: filtros }}
      />

      {errorBase === NO_EXISTE && (
        <AvisoError>
          <span>
            La vacuna no existe.{' '}
            <Link to={`${RUTA_ESQUEMAS}${filtros}`} className="underline">
              Volver a los esquemas
            </Link>
          </span>
        </AvisoError>
      )}
      {errorBase && errorBase !== NO_EXISTE && (
        <AvisoError onReintentar={cargar}>No se pudieron cargar las versiones: {errorBase}</AvisoError>
      )}

      {!errorBase && base === null && (
        <div aria-label="Cargando versiones" className="flex flex-col gap-2">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      )}

      {base && (
        <>
          <form className="flex flex-col gap-4 sm:flex-row" onSubmit={(evento) => evento.preventDefault()}>
            <SelectorVersion
              nombre="a"
              etiqueta="Desde"
              valor={ajenas ? null : a}
              versiones={versiones}
              excluida={b}
              alCambiar={(id) => elegir('a', id)}
            />
            <SelectorVersion
              nombre="b"
              etiqueta="Hasta"
              valor={ajenas ? null : b}
              versiones={versiones}
              excluida={a}
              alCambiar={(id) => elegir('b', id)}
            />
          </form>

          {ajenas && <AvisoError>La versión elegida no es de esta vacuna.</AvisoError>}
          {!ajenas && versiones.length < 2 && (
            <p className="text-muted-foreground">Esta vacuna tiene una sola versión: no hay con qué compararla.</p>
          )}
          {!ajenas && versiones.length >= 2 && (!a || !b || a === b) && (
            <p className="text-muted-foreground">Elija dos versiones distintas para compararlas.</p>
          )}

          {listas && errorPar && (
            <AvisoError onReintentar={cargarPar}>No se pudieron cargar las versiones: {errorPar}</AvisoError>
          )}
          {listas && !errorPar && par === null && (
            <div aria-label="Cargando comparación" className="flex flex-col gap-2">
              {[1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-10 w-full" />
              ))}
            </div>
          )}
          {listas && par && (
            <>
              <div className="flex flex-col gap-4 md:flex-row">
                <DatosVersion titulo="Desde" version={par.desde} />
                <DatosVersion titulo="Hasta" version={par.hasta} />
              </div>
              <Card>
                <CardHeader>
                  <CardTitle>Diferencias en la captura</CardTitle>
                  <CardDescription>
                    Lo que cambia en el formulario al pasar de la versión {par.desde.version} a la{' '}
                    {par.hasta.version}.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ListaDiferencias diferencias={compararEsquemas(par.desde, par.hasta, base.dimensiones)} />
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}
    </section>
  )
}
