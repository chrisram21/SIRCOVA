import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { historialIndicador } from '@/api/configuracion.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import {
  InsigniasSemaforo,
  poblacionYEdad,
  territorioDeIndicador,
  textoMeta,
  textoProrrateo,
  vacunaYDosis,
} from './presentacionIndicador.jsx'

const FECHA_HORA = new Intl.DateTimeFormat('es-GT', {
  timeZone: 'America/Guatemala',
  dateStyle: 'short',
  timeStyle: 'short',
})
const fechaHora = (iso) => FECHA_HORA.format(new Date(iso))

function Version({ version }) {
  const { desactivacion } = version
  const edad = poblacionYEdad(version)
  return (
    <li className="flex flex-col gap-2 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold">Versión {version.version}</span>
        <span className="text-sm text-muted-foreground">· {territorioDeIndicador(version.territorio)}</span>
        <Badge variant={version.estado === 'VIGENTE' ? 'secondary' : 'outline'}>
          {version.estado === 'VIGENTE' ? 'Vigente' : 'Histórica'}
        </Badge>
      </div>
      <p className="font-medium">{version.nombre}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Vacuna y dosis</dt>
        <dd>{vacunaYDosis(version)}</dd>
        {edad && (
          <div className="contents">
            <dt className="text-muted-foreground">Población</dt>
            <dd>{edad}</dd>
          </div>
        )}
        {version.denominador.prorrateo && (
          <div className="contents">
            <dt className="text-muted-foreground">Prorrateo</dt>
            <dd>{textoProrrateo(version.denominador.prorrateo)}</dd>
          </div>
        )}
        <dt className="text-muted-foreground">Meta</dt>
        <dd>{textoMeta(version)}</dd>
        <dt className="text-muted-foreground">Semáforo</dt>
        <dd>
          <InsigniasSemaforo indicador={version} />
        </dd>
        <dt className="text-muted-foreground">Vigencia</dt>
        <dd>
          Desde {fechaHora(version.vigencia.desde)}
          {version.vigencia.hasta && ` hasta ${fechaHora(version.vigencia.hasta)}`}
        </dd>
        <dt className="text-muted-foreground">Publicada por</dt>
        <dd>{version.publicadoPor?.nombreUsuario ?? '—'}</dd>
        <dt className="text-muted-foreground">Motivo</dt>
        <dd>{version.motivoCambio ?? '—'}</dd>
      </dl>
      {desactivacion && (
        <p className="text-sm text-muted-foreground">
          Desactivada el {fechaHora(desactivacion.en)} por {desactivacion.por?.nombreUsuario ?? 'un usuario'}:{' '}
          {desactivacion.motivo}
        </p>
      )}
    </li>
  )
}

export default function PanelHistorialIndicador({ codigo, nombre, alCerrar }) {
  const [versiones, setVersiones] = useState(null)
  const [error, setError] = useState(null)
  const [intento, setIntento] = useState(0)

  useEffect(() => {
    let vigente = true
    historialIndicador(codigo)
      .then((lista) => {
        if (vigente) setVersiones(lista)
      })
      .catch((err) => {
        if (vigente) setError(mensajeDeError(err))
      })
    return () => {
      vigente = false
    }
  }, [codigo, intento])

  function reintentar() {
    setError(null)
    setVersiones(null)
    setIntento((n) => n + 1)
  }

  return (
    <Sheet open onOpenChange={(abierto) => !abierto && alCerrar()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Historial de {nombre}</SheetTitle>
          <SheetDescription>
            {codigo}: las versiones nacionales y las de su DDRISS, de la más reciente a la más antigua.
          </SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-4">
          {error ? (
            <AvisoError onReintentar={reintentar}>No se pudo cargar el historial: {error}</AvisoError>
          ) : versiones === null ? (
            <div aria-label="Cargando historial" className="flex flex-col gap-2">
              {[1, 2].map((n) => (
                <Skeleton key={n} className="h-32 w-full" />
              ))}
            </div>
          ) : (
            <ol aria-label="Versiones" className="flex flex-col gap-3">
              {versiones.map((version) => (
                <Version key={version.id} version={version} />
              ))}
            </ol>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
