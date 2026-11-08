import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import { CREDITO_DEL_MAPA, LIMITES_MUNICIPALES } from './fuentesGeograficas.js'

const EMPLEADO = { nombres: 'Andrea', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null }

function crearSesion() {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'epidemiologia',
      rol: 'EPIDEMIOLOGIA',
      rolNombre: 'Epidemiología',
      permisos: ['MAPA_CONSULTAR'],
      empleado: EMPLEADO,
    },
  }
}

function abrir(ruta = '/creditos') {
  guardarSesion(crearSesion())
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const enlace = (nombre) => screen.getByRole('link', { name: nombre })

test('muestra la fuente completa de los límites, su licencia, los cambios y la nota de límites de referencia', async () => {
  abrir()

  expect(await screen.findByRole('heading', { level: 1, name: 'Créditos' })).toBeTruthy()
  expect(screen.getByRole('heading', { level: 2, name: 'Límites municipales' })).toBeTruthy()
  expect(screen.getByText(LIMITES_MUNICIPALES.titulo)).toBeTruthy()
  expect(screen.getByText(LIMITES_MUNICIPALES.autor)).toBeTruthy()
  expect(enlace(/data\.humdata\.org/).getAttribute('href')).toBe('https://data.humdata.org/dataset/cod-ab-gtm')
  expect(enlace(/CC BY 3\.0 IGO/).getAttribute('href')).toBe('https://creativecommons.org/licenses/by/3.0/igo/')
  expect(enlace(/Texto legal/).getAttribute('href')).toBe('https://creativecommons.org/licenses/by/3.0/igo/legalcode')
  expect(enlace(/data\.humdata\.org/).getAttribute('rel')).toBe('noopener noreferrer')
  expect(screen.getByText('07/02/2019')).toBeTruthy()

  const cambios = within(screen.getByRole('heading', { name: 'Cambios respecto al original' }).parentElement)
  expect(cambios.getAllByRole('listitem')).toHaveLength(LIMITES_MUNICIPALES.cambios.length)
  expect(screen.getByText(/Son límites de referencia: no constituyen límites legales oficiales\./)).toBeTruthy()
  expect(screen.getByText(/no respaldan este sistema ni su uso/)).toBeTruthy()
  expect(enlace(/^Leaflet/).getAttribute('href')).toBe('https://leafletjs.com')
  // Sin logos de CONRED, OCHA, HDX ni de las Naciones Unidas.
  expect(document.querySelectorAll('img, svg image')).toHaveLength(0)
  expect(document.title).toBe('Créditos · SIRCOVA')
})

test('«Créditos» del menú de la cuenta abre la pantalla', async () => {
  abrir('/inicio')

  fireEvent.keyDown(await screen.findByRole('button', { name: /^Cuenta de / }), { key: 'Enter' })
  fireEvent.click(await within(await screen.findByRole('menu')).findByRole('menuitem', { name: 'Créditos' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Créditos' })).toBeTruthy()
})

test('el crédito corto del mapa enlaza la fuente y la licencia, dice «adaptado» y lleva a la pantalla', () => {
  const contenedor = document.createElement('div')
  contenedor.innerHTML = CREDITO_DEL_MAPA
  const enlaces = [...contenedor.querySelectorAll('a')]

  expect(contenedor.textContent).toBe('Límites: CONRED / OCHA (HDX) · CC BY 3.0 IGO · adaptado · Más información')
  expect(enlaces.map((a) => a.getAttribute('href'))).toEqual([
    'https://data.humdata.org/dataset/cod-ab-gtm',
    'https://creativecommons.org/licenses/by/3.0/igo/',
    '/creditos',
  ])
  expect(enlaces[2].hasAttribute('data-enlace-interno')).toBe(true)
  expect(enlaces[0].getAttribute('target')).toBe('_blank')
})
