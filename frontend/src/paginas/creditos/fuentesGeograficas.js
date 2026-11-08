import { RUTA_CREDITOS } from '@/componentes/RutaProtegida.jsx'

// Copia de frontend/public/geo/FUENTES.md y del `metadatos` de san-marcos.geojson: un cambio de la fuente va en los tres.

export const LIMITES_MUNICIPALES = {
  titulo: 'Guatemala - Subnational Administrative Boundaries (COD-AB), versión v01',
  autor: 'Coordinadora Nacional para la Reducción de Desastres (CONRED)',
  publicadoPor: 'OCHA Field Information Services Section (FISS), en Humanitarian Data Exchange (HDX)',
  enlace: 'https://data.humdata.org/dataset/cod-ab-gtm',
  archivoOriginal: 'gtm_admin_boundaries.geojson.zip → gtm_admin2.geojson (342 municipios)',
  validoDesde: '2019-02-07',
  revisadoPorOcha: '2025-10-30',
  descargado: '2026-10-20',
  licencia: {
    nombre: 'Creative Commons Attribution 3.0 IGO (CC BY 3.0 IGO)',
    enlace: 'https://creativecommons.org/licenses/by/3.0/igo/',
    textoLegal: 'https://creativecommons.org/licenses/by/3.0/igo/legalcode',
  },
  cambios: [
    'Se conservaron solo los 30 municipios de San Marcos (adm1_pcode = GT12).',
    'Se reemplazaron los atributos por codigo_ine (adm2_pcode sin el prefijo GT) y nombre (adm2_name).',
    'Se simplificaron los contornos al 20 % de los vértices con mapshaper 0.6.121 (-simplify 20% keep-shapes), conservando los bordes compartidos entre municipios.',
    'Se redujeron las coordenadas a 5 decimales (precisión aproximada de 1 m).',
    'Se ordenaron los municipios por codigo_ine y se agregó el objeto metadatos con esta información al inicio del archivo.',
  ],
}

export const LEAFLET = {
  nombre: 'Leaflet',
  enlace: 'https://leafletjs.com',
  licencia: 'BSD-2-Clause',
  enlaceLicencia: 'https://github.com/Leaflet/Leaflet/blob/main/LICENSE',
}

// El crédito corto del control de atribución del mapa (HTML de Leaflet). «Más información» lleva
// data-enlace-interno para que el mapa navegue con el router en lugar de recargar la página.
const externo = (enlace, texto) => `<a href="${enlace}" target="_blank" rel="noopener noreferrer">${texto}</a>`

export const CREDITO_DEL_MAPA = [
  `Límites: ${externo(LIMITES_MUNICIPALES.enlace, 'CONRED / OCHA (HDX)')}`,
  externo(LIMITES_MUNICIPALES.licencia.enlace, 'CC BY 3.0 IGO'),
  'adaptado',
  `<a href="${RUTA_CREDITOS}" data-enlace-interno>Más información</a>`,
].join(' · ')
