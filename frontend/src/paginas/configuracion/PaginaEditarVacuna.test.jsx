import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  agregarDosis,
  desactivarDosis,
  editarDosis,
  editarVacuna,
  listarVacunas,
  obtenerVacuna,
} from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaVacunas from './PaginaVacunas.jsx'
import PaginaEditarVacuna from './PaginaEditarVacuna.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarDistritos: vi.fn(),
  listarEstablecimientos: vi.fn(),
  listarVacunas: vi.fn(),
  obtenerVacuna: vi.fn(),
  editarVacuna: vi.fn(),
  desactivarVacuna: vi.fn(),
  reactivarVacuna: vi.fn(),
  agregarDosis: vi.fn(),
  editarDosis: vi.fn(),
  desactivarDosis: vi.fn(),
  reactivarDosis: vi.fn(),
}))

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR', 'VACUNA_CREAR', 'VACUNA_EDITAR']

const dosis = (id, codigo, nombre, orden, extra = {}) => ({
  id,
  codigo,
  tipo: codigo === 'UNICA' ? 'UNICA' : codigo.startsWith('R') ? 'REFUERZO' : 'DOSIS',
  nombre,
  orden,
  completaEsquema: false,
  esTrazadora: false,
  activa: true,
  ...extra,
})

const HEXA = {
  id: 2,
  codigo: 'HEXA',
  nombre: 'Hexavalente',
  descripcion: null,
  ordenInforme: 4,
  activa: true,
  dosis: [
    dosis(2, 'D1', 'Primera dosis', 1),
    dosis(3, 'D2', 'Segunda dosis', 2, { completaEsquema: true, esTrazadora: true }),
    dosis(5, 'R1', 'Primer refuerzo', 3),
  ],
}

const BCG = {
  id: 1,
  codigo: 'BCG',
  nombre: 'BCG',
  descripcion: null,
  ordenInforme: 2,
  activa: true,
  dosis: [dosis(1, 'UNICA', 'Dosis única', 1, { completaEsquema: true, esTrazadora: true })],
}

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'mlopez',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

// El aviso de cambios sin guardar (useBlocker) necesita un data router.
function montar(entrada) {
  guardarSesion(crearSesion(PERMISOS))
  const router = createMemoryRouter(
    [
      {
        element: (
          <ProveedorSesion>
            <Outlet />
            <Ubicacion />
          </ProveedorSesion>
        ),
        children: [
          { path: '/administracion/vacunas', element: <PaginaVacunas /> },
          { path: '/administracion/vacunas/:id/editar', element: <PaginaEditarVacuna /> },
        ],
      },
    ],
    { initialEntries: [entrada] },
  )
  render(<RouterProvider router={router} />)
}

async function abrir(vacuna = HEXA) {
  obtenerVacuna.mockResolvedValue(vacuna)
  montar(`/administracion/vacunas/${vacuna.id}/editar`)
  await screen.findByRole('table', { name: 'Dosis' })
}

const tablaDosis = () => screen.getByRole('table', { name: 'Dosis' })
const filaDe = (codigo) => within(tablaDosis()).getByRole('cell', { name: codigo }).closest('tr')
const marcasDe = (codigo) => within(filaDe(codigo)).getAllByRole('cell')[3].textContent
const queCompleta = () =>
  within(tablaDosis())
    .getAllByRole('row')
    .slice(1)
    .filter((fila) => within(fila).queryByText('Completa el esquema'))
    .map((fila) => within(fila).getAllByRole('cell')[1].textContent)

// Radix abre el menú con Enter sobre el botón; su contenido va en un portal, fuera de la fila.
async function abrirMenu(codigo) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Acciones de ${codigo}` }), { key: 'Enter' })
  return screen.findByRole('menu')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarVacunas.mockResolvedValue([HEXA])
})

test('muestra el código como texto y la tabla de dosis con sus marcas', async () => {
  await abrir()

  expect(obtenerVacuna).toHaveBeenCalledWith('2')
  expect(screen.getByText('HEXA')).toBeTruthy()
  expect(screen.queryByLabelText(/^Código/)).toBeNull()
  expect(marcasDe('D2')).toBe('Completa el esquemaTrazadora')
  expect(marcasDe('D1')).toBe('')
  expect(screen.getByLabelText(/^Nombre/).value).toBe('Hexavalente')
  expect(screen.getByLabelText(/^Orden en el informe/).value).toBe('4')
})

test('"Guardar cambios" envía solo los campos que cambiaron y vuelve a la pestaña con el aviso, sin pedir confirmación', async () => {
  editarVacuna.mockResolvedValue({ ...HEXA, nombre: 'Hexavalente acelular' })
  await abrir()

  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: '  Hexavalente acelular ' } })
  fireEvent.change(screen.getByLabelText(/^Descripción/), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  await waitFor(() => expect(ubicacion()).toBe('/administracion/vacunas'))
  expect(editarVacuna).toHaveBeenCalledWith(2, { nombre: 'Hexavalente acelular' })
  expect(toast.success).toHaveBeenCalledWith('Vacuna HEXA actualizada.')
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('sin cambios, "Guardar cambios" avisa que no hay nada que guardar y no llama a la API', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  expect(toast.info).toHaveBeenCalledWith('No hay cambios que guardar.')
  expect(editarVacuna).not.toHaveBeenCalled()
})

test('cambiar el orden en el informe lo envía como número; vacío muestra el error y no llama a la API', async () => {
  editarVacuna.mockResolvedValue({ ...HEXA, ordenInforme: 7 })
  await abrir()

  fireEvent.change(screen.getByLabelText(/^Orden en el informe/), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  expect(
    await screen.findByText('El orden en el informe debe ser un número entero entre 0 y 65535.'),
  ).toBeTruthy()
  // El foco va al campo con el error.
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Orden en el informe/)))
  expect(editarVacuna).not.toHaveBeenCalled()

  fireEvent.change(screen.getByLabelText(/^Orden en el informe/), { target: { value: '7' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))
  await waitFor(() => expect(editarVacuna).toHaveBeenCalledWith(2, { ordenInforme: 7 }))
})

test('agregar una dosis llama a agregarDosis y la tabla muestra la marca que trae la respuesta', async () => {
  agregarDosis.mockResolvedValue({
    ...HEXA,
    dosis: [
      ...HEXA.dosis.map((d) => ({ ...d, completaEsquema: false })),
      dosis(9, 'D3', 'Tercera dosis', 4, { completaEsquema: true }),
    ],
  })
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Agregar dosis' }))
  const dialogo = await screen.findByRole('dialog')
  fireEvent.change(document.querySelector('select[name="dosis-tipo"]'), { target: { value: 'DOSIS' } })
  expect(within(dialogo).getByLabelText('Código de la dosis').textContent).toBe('D3')
  expect(within(dialogo).getByLabelText('Nombre').value).toBe('Tercera dosis')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Dosis D3 agregada.'))
  expect(agregarDosis).toHaveBeenCalledWith(2, { tipo: 'DOSIS', nombre: 'Tercera dosis', esTrazadora: false })
  expect(queCompleta()).toEqual(['D3'])
  expect(screen.queryByRole('dialog')).toBeNull()
})

test('en una vacuna con UNICA, el Dialog no ofrece el tipo "Dosis"', async () => {
  await abrir(BCG)

  fireEvent.click(screen.getByRole('button', { name: 'Agregar dosis' }))
  await screen.findByRole('dialog')

  const opciones = [...document.querySelectorAll('select[name="dosis-tipo"] option')].map((o) => o.textContent)
  expect(opciones).toEqual(['', 'Refuerzo'])
})

test('editar una dosis envía solo lo que cambió y reemplaza la tabla con la respuesta', async () => {
  editarDosis.mockResolvedValue({
    ...HEXA,
    dosis: HEXA.dosis.map((d) => (d.codigo === 'D1' ? { ...d, esTrazadora: true } : d)),
  })
  await abrir()

  const menu = await abrirMenu('D1')
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }))
  const dialogo = await screen.findByRole('dialog')
  expect(within(dialogo).getByLabelText('Nombre').value).toBe('Primera dosis')
  fireEvent.click(within(dialogo).getByRole('checkbox', { name: 'Trazadora' }))
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Dosis D1 actualizada.'))
  expect(editarDosis).toHaveBeenCalledWith(2, 2, { esTrazadora: true })
  expect(marcasDe('D1')).toBe('Trazadora')
})

test('"Desactivar" está deshabilitado en la única dosis activa', async () => {
  await abrir(BCG)

  const menu = await abrirMenu('UNICA')
  const desactivar = within(menu).getByRole('menuitem', { name: /Desactivar/ })
  expect(desactivar.getAttribute('aria-disabled')).toBe('true')
  expect(within(desactivar).getByText('Es la única dosis activa')).toBeTruthy()
})

test('un 409 al desactivar se muestra en un Alert y la tabla no cambia', async () => {
  desactivarDosis.mockRejectedValue(
    new ErrorApi(
      409,
      'VACUNA_SIN_DOSIS_ACTIVAS',
      'La vacuna debe conservar al menos una dosis activa; desactive la vacuna si ya no se aplica.',
    ),
  )
  await abrir()

  const menu = await abrirMenu('D2')
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Desactivar' }))
  const confirmacion = await screen.findByRole('alertdialog')
  expect(within(confirmacion).getByText('¿Desactivar la dosis D2 · Segunda dosis?')).toBeTruthy()
  fireEvent.click(within(confirmacion).getByRole('button', { name: 'Desactivar' }))

  expect(
    await screen.findByText('La vacuna debe conservar al menos una dosis activa; desactive la vacuna si ya no se aplica.'),
  ).toBeTruthy()
  expect(desactivarDosis).toHaveBeenCalledWith(2, 3)
  expect(within(filaDe('D2')).getAllByRole('cell')[4].textContent).toBe('Activa')
  expect(queCompleta()).toEqual(['D2'])
})

test('desactivar una dosis muestra la marca recalculada que trae la respuesta', async () => {
  desactivarDosis.mockResolvedValue({
    ...HEXA,
    dosis: HEXA.dosis.map((d) =>
      d.codigo === 'D2' ? { ...d, activa: false, completaEsquema: false } : { ...d, completaEsquema: d.codigo === 'D1' },
    ),
  })
  await abrir()

  const menu = await abrirMenu('D2')
  fireEvent.click(within(menu).getByRole('menuitem', { name: 'Desactivar' }))
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Dosis D2 desactivada.'))
  expect(queCompleta()).toEqual(['D1'])
  expect(within(filaDe('D2')).getAllByRole('cell')[4].textContent).toBe('Inactiva')
})

test('"Volver" regresa a la pestaña con los filtros que traía', async () => {
  obtenerVacuna.mockResolvedValue(HEXA)
  montar({ pathname: '/administracion/vacunas/2/editar', state: { volverA: '?q=hexa' } })
  await screen.findByRole('table', { name: 'Dosis' })

  fireEvent.click(screen.getByRole('link', { name: 'Volver' }))

  await waitFor(() => expect(ubicacion()).toBe('/administracion/vacunas?q=hexa'))
})

test('si falla la carga muestra el aviso, y "Reintentar" vuelve a pedir la vacuna', async () => {
  obtenerVacuna.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  obtenerVacuna.mockResolvedValue(HEXA)
  montar('/administracion/vacunas/2/editar')

  expect(await screen.findByText('No se pudo cargar la vacuna: No se pudo conectar con el servidor.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  expect(await screen.findByRole('table', { name: 'Dosis' })).toBeTruthy()
  expect(obtenerVacuna).toHaveBeenCalledTimes(2)
})

test('un error al guardar se muestra junto al botón y conserva lo escrito', async () => {
  editarVacuna.mockRejectedValue(new ErrorApi(409, 'VACUNA_DUPLICADA', 'Ya hay una vacuna con ese nombre.'))
  await abrir()

  fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Hexavalente acelular' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  const aviso = (await screen.findByText('Ya hay una vacuna con ese nombre.')).closest('[role="alert"]')
  expect(aviso.parentElement.nextElementSibling.contains(screen.getByRole('button', { name: 'Guardar cambios' }))).toBe(true)
  expect(screen.getByLabelText(/^Nombre/).value).toBe('Hexavalente acelular')
})

describe('cambios sin guardar', () => {
  test('con un cambio, "Volver" pide confirmación; "Seguir editando" se queda', async () => {
    await abrir()
    fireEvent.change(screen.getByLabelText(/^Nombre/), { target: { value: 'Hexavalente acelular' } })

    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo.textContent).toContain('Si sale ahora, se pierden los cambios de la vacuna.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(ubicacion()).toBe('/administracion/vacunas/2/editar')
    expect(screen.getByLabelText(/^Nombre/).value).toBe('Hexavalente acelular')
  })

  test('los cambios de las dosis se guardan al confirmarlos: no cuentan como cambios sin guardar', async () => {
    editarDosis.mockResolvedValue({
      ...HEXA,
      dosis: HEXA.dosis.map((d) => (d.codigo === 'D1' ? { ...d, esTrazadora: true } : d)),
    })
    await abrir()
    const menu = await abrirMenu('D1')
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Editar' }))
    const dialogo = await screen.findByRole('dialog')
    fireEvent.click(within(dialogo).getByRole('checkbox', { name: 'Trazadora' }))
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))

    await waitFor(() => expect(ubicacion()).toBe('/administracion/vacunas'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

test('en el Dialog de agregar dosis, sin tipo avisa qué falta y le lleva el foco', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Agregar dosis' }))
  const dialogo = await screen.findByRole('dialog')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

  expect(within(dialogo).getByText('Elija el tipo de la dosis.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(within(dialogo).getByRole('combobox', { name: 'Tipo' })))
  expect(agregarDosis).not.toHaveBeenCalled()
})
