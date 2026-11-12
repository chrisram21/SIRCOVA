import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { desactivarRed, listarRedes } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaRedes from './PaginaRedes.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarRedes: vi.fn(),
  desactivarRed: vi.fn(),
}))

const DDRISS = { id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos' }
const trazadora = (dosisId, vacuna, codigo) => ({
  dosisId,
  codigo,
  nombre: `Dosis ${codigo}`,
  activa: true,
  vacuna: { id: dosisId, codigo: vacuna, nombre: vacuna, activa: true },
})
const RED_1 = {
  id: 1,
  codigo: 'RED_01',
  nombre: 'Red No. 1',
  activo: true,
  ddriss: DDRISS,
  municipios: [
    { id: 7, codigoIne: '1207', nombre: 'Tacaná' },
    { id: 9, codigoIne: '1209', nombre: 'Tajumulco' },
  ],
  trazadoras: [trazadora(1, 'BCG', 'UNICA'), trazadora(4, 'HEXA', 'D3')],
}
const RED_2 = {
  id: 2,
  codigo: 'RED_02',
  nombre: 'Red No. 2',
  activo: false,
  ddriss: DDRISS,
  municipios: [],
  trazadoras: [trazadora(4, 'HEXA', 'D3')],
}

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'RED_CONSULTAR', 'RED_CREAR', 'RED_EDITAR']

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '4', exp })}.firma`,
    usuario: {
      id: 4,
      nombreUsuario: 'epidemiologia',
      rol: 'EPIDEMIOLOGIA',
      permisos,
      empleado: { nombres: 'Ana', apellidos: 'Méndez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  const { pathname, search, state } = useLocation()
  return (
    <output data-testid="ubicacion" data-estado={JSON.stringify(state ?? null)}>
      {pathname}
      {search}
    </output>
  )
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

async function abrir(ruta = '/administracion/redes', permisos = PERMISOS) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <Routes>
          <Route path="*" element={<PaginaRedes />} />
        </Routes>
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByLabelText('Cargando redes')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Redes' })
const nombres = () =>
  within(tabla())
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell')[0].textContent)
const filaDe = (nombre) => within(tabla()).getByRole('cell', { name: nombre }).closest('tr')

// Radix abre el menú con Enter sobre el disparador.
async function accion(red, nombre) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Acciones de ${red}` }), { key: 'Enter' })
  fireEvent.click(await screen.findByRole('menuitem', { name: nombre }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarRedes.mockResolvedValue([RED_1, RED_2])
})

test('muestra las redes activas con sus municipios, sus trazadoras y su estado', async () => {
  await abrir()

  expect(screen.getByRole('heading', { level: 1, name: 'Redes' })).toBeTruthy()
  expect(listarRedes).toHaveBeenCalledTimes(1)
  expect(nombres()).toEqual(['Red No. 1'])
  const celdas = within(filaDe('Red No. 1')).getAllByRole('cell').map((c) => c.textContent)
  expect(celdas.slice(0, 5)).toEqual(['Red No. 1', 'RED_01', 'TacanáTajumulco', '2 trazadoras', 'Activa'])
  expect(screen.getByRole('link', { name: 'Nueva red' }).getAttribute('href')).toBe('/administracion/redes/nueva')
})

test('«Mostrar inactivas» suma las inactivas y queda en la URL', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar inactivas' }))
  await waitFor(() => expect(nombres()).toEqual(['Red No. 1', 'Red No. 2']))
  expect(ubicacion()).toBe('/administracion/redes?inactivas=1')
  const celdas = within(filaDe('Red No. 2')).getAllByRole('cell').map((c) => c.textContent)
  expect(celdas.slice(2, 5)).toEqual(['Sin municipios', '1 trazadora', 'Inactiva'])

  fireEvent.click(screen.getByRole('checkbox', { name: 'Mostrar inactivas' }))
  await waitFor(() => expect(nombres()).toEqual(['Red No. 1']))
  expect(listarRedes).toHaveBeenCalledTimes(1)
})

test('sin redes activas avisa cómo ver las inactivas', async () => {
  listarRedes.mockResolvedValue([RED_2])
  await abrir()
  expect(screen.getByText('No hay redes activas. Marque «Mostrar inactivas» para verlas.')).toBeTruthy()
})

test('sin redes muestra el aviso con el enlace de alta', async () => {
  listarRedes.mockResolvedValue([])
  await abrir()

  const vacio = screen.getByText('Todavía no hay redes en la DDRISS.').parentElement
  expect(within(vacio).getByRole('link', { name: 'Nueva red' })).toBeTruthy()
})

test('sin RED_CREAR no hay «Nueva red»', async () => {
  await abrir(undefined, ['CONFIGURACION_CONSULTAR', 'RED_CONSULTAR', 'RED_EDITAR'])
  expect(screen.queryByRole('link', { name: 'Nueva red' })).toBeNull()
})

test('«Editar» abre la edición con los filtros para volver', async () => {
  await abrir()

  await accion('Red No. 1', 'Editar')
  expect(ubicacion()).toBe('/administracion/redes/1/editar')
  expect(JSON.parse(screen.getByTestId('ubicacion').dataset.estado)).toEqual({ volverA: '' })
})

test('una red inactiva solo ofrece «Reactivar», que abre la edición', async () => {
  await abrir('/administracion/redes?inactivas=1')

  fireEvent.keyDown(screen.getByRole('button', { name: 'Acciones de Red No. 2' }), { key: 'Enter' })
  const opciones = await screen.findAllByRole('menuitem')
  expect(opciones.map((o) => o.textContent)).toEqual(['Reactivar'])
  fireEvent.click(opciones[0])
  expect(ubicacion()).toBe('/administracion/redes/2/editar')
  expect(JSON.parse(screen.getByTestId('ubicacion').dataset.estado)).toEqual({ volverA: '?inactivas=1' })
})

test('«Desactivar» pide confirmación, avisa que libera los municipios y reemplaza la fila', async () => {
  desactivarRed.mockResolvedValue({ ...RED_1, activo: false, municipios: [] })
  await abrir()

  await accion('Red No. 1', 'Desactivar')
  const dialogo = within(await screen.findByRole('alertdialog'))
  expect(dialogo.getByText('¿Desactivar la Red No. 1?')).toBeTruthy()
  expect(dialogo.getByText(/Sus municipios quedan libres para otra red/)).toBeTruthy()

  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))
  await waitFor(() => expect(desactivarRed).toHaveBeenCalledWith(1))
  expect(toast.success).toHaveBeenCalledWith('Red No. 1 desactivada.')
  expect(await screen.findByText('No hay redes activas. Marque «Mostrar inactivas» para verlas.')).toBeTruthy()
})

test('un error al desactivar se muestra arriba de la lista', async () => {
  desactivarRed.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'La red no existe.'))
  await abrir()

  await accion('Red No. 1', 'Desactivar')
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }))
  expect(await screen.findByText('La red no existe.')).toBeTruthy()
})

test('un error al cargar ofrece reintentar', async () => {
  listarRedes.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Falló el servidor.'))
  await abrir()

  expect(screen.getByText(/No se pudieron cargar las redes/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(nombres()).toEqual(['Red No. 1']))
})
