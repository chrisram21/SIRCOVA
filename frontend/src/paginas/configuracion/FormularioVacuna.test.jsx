import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { crearVacuna, listarVacunas } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'
import PaginaRegistrarVacuna from './PaginaRegistrarVacuna.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarDistritos: vi.fn(),
  listarEstablecimientos: vi.fn(),
  listarVacunas: vi.fn(),
  crearVacuna: vi.fn(),
}))

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR', 'VACUNA_CREAR']

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
function montar(ruta, permisos = PERMISOS) {
  guardarSesion(crearSesion(permisos))
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
          { path: '/configuracion', element: <PaginaConfiguracion /> },
          { path: '/configuracion/vacunas/nueva', element: <PaginaRegistrarVacuna /> },
        ],
      },
    ],
    { initialEntries: [ruta] },
  )
  render(<RouterProvider router={router} />)
}

// Con la lista vacía, el enlace también aparece junto al mensaje: cualquiera de los dos sirve.
const abrirDesdeLaPestana = async () =>
  fireEvent.click((await screen.findAllByRole('link', { name: 'Registrar vacuna' }))[0])

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const tiposNativos = () => [...document.querySelectorAll('select[name$="-tipo"]')]
const elegirTipo = (numero, tipo) => fireEvent.change(tiposNativos()[numero - 1], { target: { value: tipo } })
const nombreDeDosis = (numero) => screen.getByLabelText(`Nombre de la dosis ${numero}`)
const codigoDeDosis = (numero) => screen.getByLabelText(`Código de la dosis ${numero}`).textContent
const filasDeDosis = () => within(screen.getByRole('list', { name: 'Dosis de la vacuna' })).getAllByRole('listitem')
const queCompletan = () =>
  filasDeDosis()
    .map((fila, i) => (within(fila).queryByText('Completa el esquema') ? i + 1 : null))
    .filter(Boolean)
const agregarFila = () => fireEvent.click(screen.getByRole('button', { name: 'Agregar dosis' }))
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar vacuna' }))

// Tres filas: Dosis, Dosis y Refuerzo, con los nombres sugeridos.
function llenarTresDosis() {
  elegirTipo(1, 'DOSIS')
  agregarFila()
  elegirTipo(2, 'DOSIS')
  agregarFila()
  elegirTipo(3, 'REFUERZO')
}

function llenarVacuna() {
  escribir(/^Código\*?$/, 'mpox')
  escribir(/^Nombre\*?$/, 'Viruela símica (Mpox)')
  llenarTresDosis()
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarVacunas.mockResolvedValue([])
})

test('agregar filas muestra D1, D2 y R1 con la marca en D2; subir R1 muestra el error de secuencia y no llama a la API', async () => {
  montar('/configuracion/vacunas/nueva')
  llenarVacuna()

  expect([1, 2, 3].map(codigoDeDosis)).toEqual(['D1', 'D2', 'R1'])
  expect(queCompletan()).toEqual([2])
  expect(screen.queryByText('Los refuerzos van después de las dosis.')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Subir la dosis 3' }))

  expect([1, 2, 3].map(codigoDeDosis)).toEqual(['D1', 'R1', 'D2'])
  expect(nombreDeDosis(2).value).toBe('Primer refuerzo')
  expect(screen.getByText('Los refuerzos van después de las dosis.')).toBeTruthy()
  guardar()
  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar vacuna' }).disabled).toBe(false))
  expect(crearVacuna).not.toHaveBeenCalled()
})

test('UNICA con DOSIS muestra su error de secuencia; con solo refuerzos marca el último', () => {
  montar('/configuracion/vacunas/nueva')

  elegirTipo(1, 'UNICA')
  agregarFila()
  elegirTipo(2, 'DOSIS')
  expect(screen.getByText('Una vacuna con dosis única no lleva otras dosis, solo refuerzos.')).toBeTruthy()

  elegirTipo(1, 'REFUERZO')
  elegirTipo(2, 'REFUERZO')
  expect([1, 2].map(codigoDeDosis)).toEqual(['R1', 'R2'])
  expect(queCompletan()).toEqual([2])
  expect(screen.queryByText('Una vacuna con dosis única no lleva otras dosis, solo refuerzos.')).toBeNull()
})

test('elegir el tipo llena el nombre sugerido sin pisar uno escrito a mano', () => {
  montar('/configuracion/vacunas/nueva')

  elegirTipo(1, 'UNICA')
  expect(nombreDeDosis(1).value).toBe('Dosis única')
  elegirTipo(1, 'DOSIS')
  expect(nombreDeDosis(1).value).toBe('Primera dosis')

  fireEvent.change(nombreDeDosis(1), { target: { value: 'Dosis a los 2 meses' } })
  elegirTipo(1, 'REFUERZO')
  expect(nombreDeDosis(1).value).toBe('Dosis a los 2 meses')
})

test('quitar una fila recalcula los códigos; la única fila no se puede quitar', () => {
  montar('/configuracion/vacunas/nueva')
  llenarTresDosis()

  fireEvent.click(screen.getByRole('button', { name: 'Quitar la dosis 1' }))

  expect([1, 2].map(codigoDeDosis)).toEqual(['D1', 'R1'])
  fireEvent.click(screen.getByRole('button', { name: 'Quitar la dosis 2' }))
  expect(screen.getByRole('button', { name: 'Quitar la dosis 1' }).disabled).toBe(true)
})

test('un código con "-" o un nombre de 2 caracteres muestran el error de la regla y no llaman a la API', async () => {
  montar('/configuracion/vacunas/nueva')
  llenarVacuna()
  escribir(/^Código\*?$/, 'MP-OX')
  escribir(/^Nombre\*?$/, 'Mp')
  fireEvent.change(nombreDeDosis(2), { target: { value: 'D2' } })

  guardar()

  expect(
    await screen.findByText(
      'El código de la vacuna debe empezar con una letra y solo puede tener letras sin tildes, números y guion bajo.',
    ),
  ).toBeTruthy()
  expect(screen.getByText('El nombre de la vacuna debe tener entre 3 y 120 caracteres.')).toBeTruthy()
  expect(screen.getByText('El nombre de la dosis debe tener entre 3 y 60 caracteres.')).toBeTruthy()
  expect(crearVacuna).not.toHaveBeenCalled()
})

test('una fila sin tipo avisa qué falta y no llama a la API', async () => {
  montar('/configuracion/vacunas/nueva')
  escribir(/^Código\*?$/, 'MPOX')
  escribir(/^Nombre\*?$/, 'Viruela símica (Mpox)')
  fireEvent.change(nombreDeDosis(1), { target: { value: 'Primera dosis' } })

  guardar()

  expect(await screen.findByText('Elija el tipo de la dosis.')).toBeTruthy()
  expect(crearVacuna).not.toHaveBeenCalled()
})

test('registrar envía tipo, nombre y esTrazadora de cada dosis, sin código ni orden, y vuelve sin pedir confirmación con el aviso del esquema', async () => {
  crearVacuna.mockResolvedValue({ id: 22, codigo: 'MPOX' })
  montar('/configuracion?pestana=vacunas&q=mp')
  await abrirDesdeLaPestana()
  llenarVacuna()
  escribir(/^Orden en el informe/, '23')
  fireEvent.click(screen.getByRole('checkbox', { name: 'Trazadora (dosis 2)' }))

  guardar()

  await waitFor(() => expect(ubicacion()).toBe('/configuracion?pestana=vacunas&q=mp'))
  expect(crearVacuna).toHaveBeenCalledWith({
    codigo: 'mpox',
    nombre: 'Viruela símica (Mpox)',
    ordenInforme: 23,
    dosis: [
      { tipo: 'DOSIS', nombre: 'Primera dosis', esTrazadora: false },
      { tipo: 'DOSIS', nombre: 'Segunda dosis', esTrazadora: true },
      { tipo: 'REFUERZO', nombre: 'Primer refuerzo', esTrazadora: false },
    ],
  })
  expect(toast.success).toHaveBeenCalledWith(
    'Vacuna MPOX registrada. Falta crear su esquema de captura para que aparezca en el formulario.',
  )
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect((await screen.findByRole('searchbox', { name: 'Buscar por código o nombre' })).value).toBe('mp')
})

test('un 409 se muestra junto a los botones y el formulario conserva lo escrito', async () => {
  crearVacuna.mockRejectedValue(new ErrorApi(409, 'VACUNA_DUPLICADA', 'Ya hay una vacuna con ese código.'))
  montar('/configuracion/vacunas/nueva')
  llenarVacuna()

  guardar()

  const aviso = (await screen.findByText('Ya hay una vacuna con ese código.')).closest('[role="alert"]')
  expect(aviso.parentElement.nextElementSibling.contains(screen.getByRole('button', { name: 'Registrar vacuna' }))).toBe(true)
  expect(screen.getByLabelText(/^Código\*?$/).value).toBe('mpox')
  expect(nombreDeDosis(3).value).toBe('Primer refuerzo')
  expect(ubicacion()).toBe('/configuracion/vacunas/nueva')
})

test('"Cancelar" vuelve a la pestaña con sus filtros sin guardar', async () => {
  montar('/configuracion?pestana=vacunas&estado=inactivas')
  await abrirDesdeLaPestana()

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

  await waitFor(() => expect(ubicacion()).toBe('/configuracion?pestana=vacunas&estado=inactivas'))
  expect(crearVacuna).not.toHaveBeenCalled()
})

test('sin VACUNA_CREAR no aparece el botón "Registrar vacuna"', async () => {
  montar('/configuracion?pestana=vacunas', ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR'])

  await waitFor(() => expect(screen.queryByLabelText('Cargando vacunas')).toBeNull())
  expect(screen.queryByRole('link', { name: 'Registrar vacuna' })).toBeNull()
})

test('al guardar con errores, el foco va al primer campo inválido', async () => {
  montar('/configuracion/vacunas/nueva')
  escribir(/^Nombre\*?$/, 'Viruela símica (Mpox)')

  guardar()

  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Código\*?$/)))
  expect(crearVacuna).not.toHaveBeenCalled()
})

describe('cambios sin guardar', () => {
  test('con algo escrito, "Cancelar" pide confirmación; "Seguir editando" conserva lo escrito', async () => {
    montar('/configuracion?pestana=vacunas&q=mp')
    await abrirDesdeLaPestana()
    escribir(/^Código\*?$/, 'mpox')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo.textContent).toContain('Si sale ahora, se pierden los datos de la vacuna.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(ubicacion()).toBe('/configuracion/vacunas/nueva')
    expect(screen.getByLabelText(/^Código\*?$/).value).toBe('mpox')

    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }))
    await waitFor(() => expect(ubicacion()).toBe('/configuracion?pestana=vacunas&q=mp'))
    expect(crearVacuna).not.toHaveBeenCalled()
  })

  test('agregar una dosis también cuenta como cambio', async () => {
    montar('/configuracion?pestana=vacunas')
    await abrirDesdeLaPestana()
    agregarFila()

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    expect(await screen.findByRole('alertdialog')).toBeTruthy()
  })
})
