import { ExternalLink, Info, Map as IconoMapa } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { aDiaMesAnio } from '@/lib/fechas.js'
import { LEAFLET, LIMITES_MUNICIPALES } from './fuentesGeograficas.js'

function EnlaceExterno({ href, children }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 font-medium break-all text-enlace underline-offset-4 hover:underline"
    >
      {children}
      <ExternalLink className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="sr-only">(se abre en otra pestaña)</span>
    </a>
  )
}

function Dato({ etiqueta, children }) {
  return (
    <div className="grid gap-0.5 sm:grid-cols-[12rem_1fr] sm:gap-4">
      <dt className="text-sm text-muted-foreground">{etiqueta}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  )
}

export default function PaginaCreditos() {
  const fuente = LIMITES_MUNICIPALES
  return (
    <section className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-4 sm:p-6">
      <EncabezadoPagina
        antetitulo="Acerca de"
        titulo="Créditos"
        descripcion="Las fuentes de datos y las bibliotecas de terceros que usa SIRCOVA, con su licencia."
      />

      <Card>
        <CardHeader>
          <CardTitle>
            <h2>Límites municipales</h2>
          </CardTitle>
          <CardDescription>Los contornos de los municipios que dibuja el mapa territorial.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <dl className="flex flex-col gap-3">
            <Dato etiqueta="Conjunto de datos">{fuente.titulo}</Dato>
            <Dato etiqueta="Autor de los datos">{fuente.autor}</Dato>
            <Dato etiqueta="Publicado por">{fuente.publicadoPor}</Dato>
            <Dato etiqueta="Fuente">
              <EnlaceExterno href={fuente.enlace}>{fuente.enlace}</EnlaceExterno>
            </Dato>
            <Dato etiqueta="Archivo original">
              <span className="font-mono text-xs">{fuente.archivoOriginal}</span>
            </Dato>
            <Dato etiqueta="Válido desde">{aDiaMesAnio(fuente.validoDesde)}</Dato>
            <Dato etiqueta="Última revisión de OCHA">{aDiaMesAnio(fuente.revisadoPorOcha)}</Dato>
            <Dato etiqueta="Descargado">{aDiaMesAnio(fuente.descargado)}</Dato>
            <Dato etiqueta="Licencia">
              <span className="flex flex-col gap-1">
                <EnlaceExterno href={fuente.licencia.enlace}>{fuente.licencia.nombre}</EnlaceExterno>
                <EnlaceExterno href={fuente.licencia.textoLegal}>Texto legal de la licencia</EnlaceExterno>
              </span>
            </Dato>
          </dl>

          <section aria-labelledby="titulo-cambios" className="flex flex-col gap-2">
            <h3 id="titulo-cambios" className="text-sm font-semibold">
              Cambios respecto al original
            </h3>
            <p className="text-sm text-muted-foreground">Los datos que usa SIRCOVA son una adaptación:</p>
            <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm">
              {fuente.cambios.map((cambio) => (
                <li key={cambio}>{cambio}</li>
              ))}
            </ol>
          </section>

          <div className="flex items-start gap-2.5 rounded-lg bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <div className="flex flex-col gap-1">
              <p>
                Son límites de referencia: no constituyen límites legales oficiales. Los datos se entregan «tal cual»,
                sin garantía.
              </p>
              <p>
                La CONRED, OCHA, HDX y las Naciones Unidas no respaldan este sistema ni su uso.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            <h2 className="flex items-center gap-2">
              <IconoMapa className="size-4 text-accent-foreground" aria-hidden="true" />
              Mapa
            </h2>
          </CardTitle>
          <CardDescription>La biblioteca que dibuja el mapa territorial.</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="flex flex-col gap-3">
            <Dato etiqueta="Biblioteca">
              <EnlaceExterno href={LEAFLET.enlace}>{LEAFLET.nombre}</EnlaceExterno>
            </Dato>
            <Dato etiqueta="Licencia">
              <EnlaceExterno href={LEAFLET.enlaceLicencia}>{LEAFLET.licencia}</EnlaceExterno>
            </Dato>
          </dl>
        </CardContent>
      </Card>
    </section>
  )
}
