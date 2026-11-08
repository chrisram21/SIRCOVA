import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { formatoEntero, porcentaje } from '@/paginas/indicadores/TarjetaGrafica.jsx'
import { COLOR_ESTADO, TITULO_ESTADO, cifraDelModo, estadoMasAtrasado } from './mapaTerritorial.js'

const dosis = (n) => (n === null || n === undefined ? '—' : formatoEntero.format(n))

function Dato({ etiqueta, children }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b py-2 text-sm last:border-b-0">
      <dt className="text-muted-foreground">{etiqueta}</dt>
      <dd className="text-right font-mono font-medium">{children}</dd>
    </div>
  )
}

function Muestra({ color, children }) {
  return (
    <span className="inline-flex items-center gap-1.5 font-sans text-sm font-normal text-muted-foreground">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full ring-1 ring-foreground/10"
        style={{ backgroundColor: color }}
      />
      {children}
    </span>
  )
}

// El avance contra la meta: la barra llega al valor y la marca está en la meta, sobre una escala que incluye las dos.
function BarraDeAvance({ valor, meta, color }) {
  const escala = Math.max(100, meta ?? 0, valor)
  return (
    <div className="flex flex-col gap-1">
      <div className="relative h-2.5 rounded-full bg-muted" aria-hidden="true">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${(valor / escala) * 100}%`, backgroundColor: color }}
        />
        {meta !== null && (
          <span className="absolute -inset-y-1 border-l-2 border-foreground" style={{ left: `${(meta / escala) * 100}%` }} />
        )}
      </div>
      {meta !== null && <p className="text-xs text-muted-foreground">Meta: {porcentaje(meta)}</p>}
    </div>
  )
}

// SPEC 50: el municipio elegido (o el total de la DDRISS) con la cifra del modo y los datos de la vacuna.
// fila: la de filasDelMapa o filaDeLaDdriss; cobertura, brecha y desercion: las filas de esos indicadores. Las dosis
// aplicadas, la meta y las que faltan salen todas del indicador que pinta el mapa, para que cuadren; la brecha del
// indicador BRECHA (contra la meta anual) va aparte (decidido en el paso 10).
export default function PanelMunicipio({
  fila,
  esDdriss,
  modo,
  franja,
  cobertura,
  brecha,
  nombreBrecha,
  desercion,
  mesNombre,
  enlaceIndicadores,
}) {
  const avance = fila.avance
  const listos = avance ? (avance.conteos.APROBADO ?? 0) + (avance.conteos.CERRADO ?? 0) : 0
  const atrasado = estadoMasAtrasado(avance?.conteos)
  const conBarra = modo === 'cobertura' && !fila.sinDatos && fila.resultado?.valor !== null
  const cifraEnNumeros = !fila.sinDatos && modo !== 'estado'

  return (
    <div className="flex flex-col gap-4">
      <div>
        <p className="text-xs text-muted-foreground">{esDdriss ? 'Sin municipio elegido' : 'Municipio seleccionado'}</p>
        <h2 className="text-xl font-semibold tracking-tight">{fila.nombre}</h2>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {modo === 'estado' && !fila.sinDatos && (
            <span aria-hidden="true" className="size-3 shrink-0 self-center rounded-full" style={{ backgroundColor: fila.color }} />
          )}
          <span
            className={
              fila.sinDatos
                ? 'text-lg text-muted-foreground'
                : cifraEnNumeros
                  ? 'font-mono text-3xl font-semibold'
                  : 'text-2xl font-semibold tracking-tight'
            }
          >
            {cifraDelModo(modo, fila)}
          </span>
          {cifraEnNumeros && franja && <Muestra color={fila.color}>{franja}</Muestra>}
        </div>
        {conBarra && <BarraDeAvance valor={fila.resultado.valor} meta={fila.resultado.meta} color={fila.color} />}
      </div>

      <dl className="flex flex-col">
        {cobertura && (
          <>
            <Dato etiqueta="Dosis aplicadas">{dosis(cobertura.numerador)}</Dato>
            <Dato etiqueta="Meta en dosis">{dosis(cobertura.metaDosis)}</Dato>
            <Dato etiqueta="Dosis por aplicar">{dosis(cobertura.brechaDosis)}</Dato>
          </>
        )}
        {brecha && (
          <Dato etiqueta={<span title={nombreBrecha ?? undefined}>Brecha a la meta anual</span>}>{dosis(brecha.brechaDosis)}</Dato>
        )}
        {desercion && (
          <Dato etiqueta="Deserción">{desercion.calculable ? porcentaje(desercion.valor) : 'Sin primeras dosis'}</Dato>
        )}
        {avance && (
          <Dato etiqueta={`Reportes de ${mesNombre}`}>
            <span className="flex flex-col items-end gap-0.5">
              <span>
                {formatoEntero.format(listos)} de {formatoEntero.format(avance.esperados)}
              </span>
              <span className="font-sans text-xs font-normal text-muted-foreground">aprobados o cerrados</span>
              {atrasado && atrasado !== 'CERRADO' && modo !== 'estado' && (
                <Muestra color={COLOR_ESTADO[atrasado]}>Más atrasado: {TITULO_ESTADO[atrasado].toLowerCase()}</Muestra>
              )}
            </span>
          </Dato>
        )}
      </dl>

      {enlaceIndicadores && (
        <Button asChild variant="outline" className="self-start">
          <Link to={enlaceIndicadores}>
            Ver en Indicadores
            <ArrowRight />
          </Link>
        </Button>
      )}
    </div>
  )
}
