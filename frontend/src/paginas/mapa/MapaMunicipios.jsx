import { useCallback, useEffect, useMemo, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { GeoJSON, MapContainer, useMap } from 'react-leaflet'
import { useNavigate } from 'react-router-dom'
import { CREDITO_DEL_MAPA, LEAFLET } from '@/paginas/creditos/fuentesGeograficas.js'
import { COLOR_SIN_DATOS, lineasDelTooltip } from './mapaTerritorial.js'

// SPEC 50: los municipios sobre el fondo del tema, sin teselas ni otro servicio externo.

const PREFIJO_LEAFLET = `<a href="${LEAFLET.enlace}" target="_blank" rel="noopener noreferrer">${LEAFLET.nombre}</a>`

const escapar = (texto) =>
  String(texto).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function htmlDelTooltip(fila, modo, indicador) {
  const lineas = lineasDelTooltip(modo, fila, indicador)
    .map(([etiqueta, valor]) =>
      valor === ''
        ? `<div class="text-muted-foreground">${escapar(etiqueta)}</div>`
        : `<div class="flex justify-between gap-4"><span class="text-muted-foreground">${escapar(etiqueta)}</span>`
          + `<span class="font-mono font-medium">${escapar(valor)}</span></div>`,
    )
    .join('')
  return `<div class="flex flex-col gap-0.5 text-xs"><div class="mb-0.5 text-sm font-semibold">${escapar(fila.nombre)}</div>${lineas}</div>`
}

// Ajusta la vista a los límites, no deja alejarse ni salirse de ellos, y sigue los cambios de tamaño del contenedor
// (el menú lateral que se pliega). Con el contenedor en 0 px (oculto o sin medir) el zoom saldría infinito y Leaflet
// fallaría: el ajuste espera a que tenga tamaño. «Más información» de la atribución navega con el router: un <a>
// normal recargaría la página, y Leaflet no deja que el clic llegue al contenedor del mapa.
function AjustesDelMapa({ limites }) {
  const map = useMap()
  const navegar = useNavigate()

  useEffect(() => {
    const limitesDelMapa = L.geoJSON(limites).getBounds()
    let ajustado = false
    const ajustar = () => {
      map.invalidateSize()
      const { x, y } = map.getSize()
      if (ajustado || x === 0 || y === 0) return
      map.fitBounds(limitesDelMapa, { padding: [12, 12], animate: false })
      map.setMinZoom(map.getZoom())
      map.setMaxBounds(limitesDelMapa.pad(0.25))
      ajustado = true
    }
    ajustar()
    if (typeof ResizeObserver === 'undefined') return undefined
    const observador = new ResizeObserver(ajustar)
    observador.observe(map.getContainer())
    return () => observador.disconnect()
  }, [map, limites])

  useEffect(() => {
    const control = map.attributionControl
    if (!control) return undefined
    control.setPrefix(PREFIJO_LEAFLET)
    const elemento = control.getContainer()
    const alHacerClic = (evento) => {
      const enlace = evento.target.closest('a[data-enlace-interno]')
      if (!enlace) return
      evento.preventDefault()
      navegar(enlace.getAttribute('href'))
    }
    elemento.addEventListener('click', alHacerClic)
    return () => elemento.removeEventListener('click', alHacerClic)
  }, [map, navegar])

  return null
}

// filas: las de filasDelMapa (con su color ya calculado), unidas a cada polígono por codigoIne.
export default function MapaMunicipios({ limites, filas, modo, indicador, seleccionado, onElegir, className }) {
  const capa = useRef(null)
  const porCodigo = useMemo(() => new Map(filas.map((f) => [f.codigoIne, f])), [filas])
  const limitesIniciales = useMemo(() => L.geoJSON(limites).getBounds(), [limites])
  const actual = useRef({})
  actual.current = { porCodigo, onElegir, seleccionado, modo, indicador }

  const estilo = useCallback(
    (feature) => {
      const codigo = feature.properties.codigo_ine
      const elegido = codigo === seleccionado
      return {
        fillColor: porCodigo.get(codigo)?.color ?? COLOR_SIN_DATOS,
        fillOpacity: 1,
        color: elegido ? 'var(--foreground)' : 'var(--card)',
        weight: elegido ? 3 : 1,
      }
    },
    [porCodigo, seleccionado],
  )

  const alCrearPoligono = useCallback((feature, layer) => {
    const codigo = feature.properties.codigo_ine
    const filaDe = () => actual.current.porCodigo.get(codigo)
      ?? { nombre: feature.properties.nombre, codigoIne: codigo, sinDatos: 'Sin datos' }
    layer.bindTooltip(() => htmlDelTooltip(filaDe(), actual.current.modo, actual.current.indicador), {
      sticky: true,
      direction: 'top',
      offset: [0, -8],
      className: 'tooltip-municipio',
    })
    layer.on({
      click: () => actual.current.onElegir?.(filaDe()),
      mouseover: () => {
        if (codigo !== actual.current.seleccionado) layer.setStyle({ color: 'var(--ring)', weight: 2.5 })
        layer.bringToFront()
      },
      mouseout: () => {
        if (codigo !== actual.current.seleccionado) layer.setStyle({ color: 'var(--card)', weight: 1 })
        capa.current?.eachLayer((l) => l.feature.properties.codigo_ine === actual.current.seleccionado && l.bringToFront())
      },
    })
  }, [])

  // El elegido va al frente para que su borde no quede tapado por los vecinos.
  useEffect(() => {
    capa.current?.eachLayer((l) => {
      if (l.feature.properties.codigo_ine === seleccionado) l.bringToFront()
    })
  }, [seleccionado, estilo])

  return (
    <div
      role="region"
      aria-label="Mapa de los municipios. Para elegir un municipio con el teclado, use la pestaña «Clasificación»."
      className={className}
    >
      <MapContainer
        className="mapa-territorial size-full rounded-lg"
        zoomSnap={0.25}
        zoomDelta={0.5}
        maxBoundsViscosity={1}
        dragging={!L.Browser.mobile}
        bounds={limitesIniciales}
      >
        <AjustesDelMapa limites={limites} />
        <GeoJSON
          ref={capa}
          data={limites}
          style={estilo}
          onEachFeature={alCrearPoligono}
          attribution={CREDITO_DEL_MAPA}
        />
      </MapContainer>
    </div>
  )
}
